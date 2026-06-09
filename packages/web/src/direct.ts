import { parseUnits, type Account, type Address, type Chain, type PublicClient, type Transport, type WalletClient } from "viem";
import {
  build7702AuthorizationFromWallet,
  chargeViaRelayer,
  createStateless7702FromWallet,
  getCapabilities,
  getEnvironment,
  pollRelayerUntilDone,
  relayerUrlForChain,
  signRelayerSubscriptionDelegation,
  MONTHLY_SECONDS,
} from "@safe-subscriptions/core";

/**
 * No-Flask subscription flow: the connected wallet signs the period delegation
 * directly (EIP-712), and the first period is charged gaslessly via 1Shot.
 * Works with any MetaMask — no ERC-7715 required.
 */
export async function subscribeDirectViaRelayer(params: {
  walletClient: WalletClient<Transport, Chain, Account>;
  publicClient: PublicClient;
  chainId: number;
  amount: string;
  recipient: Address;
  periodDays: number;
  onStatus?: (message: string) => void;
}): Promise<{ taskId: string; txHash?: string }> {
  const { onStatus = () => {}, publicClient, walletClient } = params;
  const relayerUrl = relayerUrlForChain(params.chainId);

  onStatus("Reading 1Shot relayer capabilities…");
  const caps = await getCapabilities(relayerUrl, params.chainId);
  const usdc = caps.tokens.find((t) => t.symbol === "USDC") ?? caps.tokens[0];
  if (!usdc) throw new Error("1Shot relayer reports no accepted tokens on this chain.");
  const token = { address: usdc.address as Address, decimals: Number(usdc.decimals) };

  const workAmount = parseUnits(params.amount, token.decimals);
  const periodAmount = workAmount + parseUnits("15", token.decimals); // headroom for the USDC-priced fee

  const smartAccount = await createStateless7702FromWallet({ client: publicClient, walletClient });

  // Upgrade the EOA to a 7702 smart account on first use (signed by the wallet).
  const code = await publicClient.getCode({ address: walletClient.account.address });
  let authorization: unknown;
  if (!code) {
    onStatus("Approve the one-time account upgrade (EIP-7702) in MetaMask…");
    authorization = await build7702AuthorizationFromWallet({ walletClient, environment: getEnvironment() });
  }

  onStatus("Sign the recurring subscription delegation in MetaMask…");
  const signedDelegation = await signRelayerSubscriptionDelegation({
    smartAccount,
    targetAddress: caps.targetAddress,
    token,
    periodAmount,
    periodSeconds: Math.round(params.periodDays * 86400) || MONTHLY_SECONDS,
    startDate: Math.floor(Date.now() / 1000),
  });

  onStatus("Charging the first period via 1Shot (gasless)…");
  const taskId = await chargeViaRelayer({
    relayerUrl,
    chainId: params.chainId,
    capabilities: caps,
    signedDelegation,
    token,
    workAmount,
    recipient: params.recipient,
    authorization,
  });

  onStatus("Waiting for the relayer to confirm on-chain…");
  try {
    const status = await pollRelayerUntilDone(relayerUrl, taskId, { timeoutMs: 60_000 });
    if (status.status === 400 || status.status === 500) {
      throw new Error(`Relayer rejected the task (${status.status}): ${status.message ?? ""}`);
    }
    return { taskId, txHash: status.receipt?.transactionHash ?? status.hash };
  } catch (err) {
    if (/Timeout/.test((err as Error).message)) return { taskId };
    throw err;
  }
}
