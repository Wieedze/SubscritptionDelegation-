import {
  erc20Abi,
  parseUnits,
  type Account,
  type Address,
  type Hex,
  type Chain,
  type PublicClient,
  type Transport,
  type WalletClient,
} from "viem";
import {
  chargeViaRelayer,
  createSmartAccountFromWallet,
  deploySmartAccount,
  getCapabilities,
  pollRelayerUntilDone,
  relayerUrlForChain,
  signRelayerSubscriptionDelegation,
  MONTHLY_SECONDS,
} from "@safe-subscriptions/core";
import { buildAndPinAgreement } from "./agreement.js";

/**
 * Production no-Flask flow. The connected EOA controls a **Hybrid DeleGator**
 * smart account (a deployed contract — no EIP-7702, no signAuthorization):
 *  1. Activate: deploy the smart account (one tx, gas from the EOA).
 *  2. Fund: move enough USDC from the EOA into the smart account.
 *  3. Sign the period delegation as EIP-712 (works with any MetaMask).
 *  4. Charge gaslessly via 1Shot (paid in USDC).
 *
 * Verified: 1Shot accepts Hybrid (non-7702) delegators.
 */
export async function subscribeHybridViaRelayer(params: {
  walletClient: WalletClient<Transport, Chain, Account>;
  publicClient: PublicClient;
  chainId: number;
  amount: string;
  recipient: Address;
  periodDays: number;
  onStatus?: (message: string) => void;
}): Promise<{
  taskId: string;
  txHash?: string;
  smartAccount: Address;
  agreement: { cid: string; uri: string; termsHash: Hex };
}> {
  const { onStatus = () => {}, publicClient, walletClient } = params;
  const relayerUrl = relayerUrlForChain(params.chainId);

  const caps = await getCapabilities(relayerUrl, params.chainId);
  const usdc = caps.tokens.find((t) => t.symbol === "USDC") ?? caps.tokens[0];
  if (!usdc) throw new Error("1Shot relayer reports no accepted tokens on this chain.");
  const token = {
    address: usdc.address as Address,
    symbol: usdc.symbol ?? "USDC",
    decimals: Number(usdc.decimals),
  };

  const workAmount = parseUnits(params.amount, token.decimals);
  // Headroom for the USDC-priced relayer fee. On an L2 (Base) the fee is a
  // fraction of a cent, so a small buffer is plenty.
  const periodAmount = workAmount + parseUnits("3", token.decimals);
  const needed = workAmount + parseUnits("2", token.decimals);

  const smartAccount = await createSmartAccountFromWallet({ client: publicClient, walletClient });

  // 1. Activate (deploy) the smart account if needed.
  if (!(await smartAccount.isDeployed())) {
    onStatus("Activate your subscription account — confirm the deploy tx…");
    const tx = await deploySmartAccount(smartAccount, walletClient);
    if (tx) await publicClient.waitForTransactionReceipt({ hash: tx });
  }

  // 2. Fund the smart account from the EOA if it doesn't hold enough USDC.
  const balance = await publicClient.readContract({
    address: token.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [smartAccount.address],
  });
  if (balance < needed) {
    onStatus("Fund the subscription account — confirm the USDC transfer…");
    const tx = await walletClient.writeContract({
      account: walletClient.account,
      chain: walletClient.chain,
      address: token.address,
      abi: erc20Abi,
      functionName: "transfer",
      args: [smartAccount.address, needed - balance],
    });
    await publicClient.waitForTransactionReceipt({ hash: tx });
  }

  // 3. Build + pin the human-readable contract, then sign the delegation with
  //    salt = keccak256(terms) so the signature commits to the exact terms.
  const startDate = Math.floor(Date.now() / 1000);
  const periodSeconds = Math.round(params.periodDays * 86400) || MONTHLY_SECONDS;
  onStatus("Pinning the subscription contract to IPFS…");
  const { pinned, salt } = await buildAndPinAgreement({
    chainId: params.chainId,
    smartAccount: smartAccount.address,
    owner: walletClient.account.address,
    recipient: params.recipient,
    relayerTarget: caps.targetAddress,
    token,
    amount: params.amount,
    periodSeconds,
    startDate,
  });

  onStatus("Sign the recurring subscription delegation in MetaMask…");
  const signedDelegation = await signRelayerSubscriptionDelegation({
    smartAccount,
    targetAddress: caps.targetAddress,
    token,
    periodAmount,
    periodSeconds,
    startDate,
    salt,
  });

  // 4. Charge the first period gaslessly via 1Shot.
  onStatus("Charging the first period via 1Shot (gasless)…");
  const taskId = await chargeViaRelayer({
    relayerUrl,
    chainId: params.chainId,
    capabilities: caps,
    signedDelegation,
    token,
    workAmount,
    recipient: params.recipient,
    client: publicClient,
  });

  const agreement = { cid: pinned.cid, uri: pinned.uri, termsHash: salt };

  onStatus("Waiting for the relayer to confirm on-chain…");
  try {
    const status = await pollRelayerUntilDone(relayerUrl, taskId, { timeoutMs: 60_000 });
    if (status.status === 400 || status.status === 500) {
      throw new Error(`Relayer rejected the task (${status.status}): ${status.message ?? ""}`);
    }
    return {
      taskId,
      txHash: status.receipt?.transactionHash ?? status.hash,
      smartAccount: smartAccount.address,
      agreement,
    };
  } catch (err) {
    if (/Timeout/.test((err as Error).message)) {
      return { taskId, smartAccount: smartAccount.address, agreement };
    }
    throw err;
  }
}
