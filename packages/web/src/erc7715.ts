import { parseUnits, type Account, type Address, type Chain, type Transport, type WalletClient } from "viem";
import { erc7715ProviderActions } from "@metamask/smart-accounts-kit/actions";
import { decodeDelegations } from "@metamask/smart-accounts-kit/utils";
import {
  chargeBundleViaRelayer,
  getCapabilities,
  pollRelayerUntilDone,
  relayerUrlForChain,
  toRelayerJson,
} from "@safe-subscriptions/core";

/**
 * The fully-MetaMask-native subscription flow:
 *  1. Request an ERC-7715 `erc20-token-periodic` permission from the user's
 *     wallet (granted to the 1Shot relayer's targetAddress).
 *  2. Charge one period through the 1Shot relayer — gas paid in USDC, no ETH.
 *
 * Combines both hackathon sponsor primitives (Advanced Permissions + 1Shot)
 * in a single user action.
 */
export async function grantAndChargeViaRelayer(params: {
  walletClient: WalletClient<Transport, Chain, Account>;
  chainId: number;
  /** Human subscription amount per period, e.g. "0.1". */
  amount: string;
  recipient: Address;
  periodDays: number;
  onStatus?: (message: string) => void;
}): Promise<{ taskId: string; txHash?: string }> {
  const { onStatus = () => {} } = params;
  const relayerUrl = relayerUrlForChain(params.chainId);

  onStatus("Reading 1Shot relayer capabilities…");
  const caps = await getCapabilities(relayerUrl, params.chainId);
  const usdc = caps.tokens.find((t) => t.symbol === "USDC") ?? caps.tokens[0];
  if (!usdc) throw new Error("1Shot relayer reports no accepted tokens on this chain.");
  const token = { address: usdc.address as Address, decimals: Number(usdc.decimals) };

  const workAmount = parseUnits(params.amount, token.decimals);
  // Period cap must cover the subscription amount plus the relayer fee.
  const periodAmount = workAmount + parseUnits("0.5", token.decimals);
  const periodDuration = Math.round(params.periodDays * 86400);

  onStatus("Approve the recurring permission in MetaMask…");
  const wallet7715 = params.walletClient.extend(erc7715ProviderActions());
  const granted = await wallet7715.requestExecutionPermissions([
    {
      chainId: params.chainId,
      to: caps.targetAddress,
      expiry: Math.floor(Date.now() / 1000) + 30 * 86400,
      permission: {
        type: "erc20-token-periodic",
        data: {
          tokenAddress: token.address,
          periodAmount,
          periodDuration,
          justification: `Subscription: up to ${params.amount} USDC every ${params.periodDays} day(s)`,
        },
        isAdjustmentAllowed: true,
      },
    },
  ]);

  const context = granted[0]?.context;
  if (!context) throw new Error("Wallet returned no permission context.");
  const permissionContext = decodeDelegations(context).map((d) => toRelayerJson(d));

  onStatus("Charging the first period via the 1Shot relayer (gasless)…");
  const taskId = await chargeBundleViaRelayer({
    relayerUrl,
    chainId: params.chainId,
    capabilities: caps,
    permissionContext,
    token,
    workAmount,
    recipient: params.recipient,
  });

  onStatus("Waiting for the relayer to confirm on-chain…");
  const status = await pollRelayerUntilDone(relayerUrl, taskId);
  if (status.status !== 200) {
    throw new Error(`Relayer task ${taskId} ended with status ${status.status}: ${status.message ?? ""}`);
  }
  return { taskId, txHash: status.receipt?.transactionHash ?? status.hash };
}
