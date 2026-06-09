import {
  parseEther,
  type Account,
  type Chain,
  type PublicClient,
  type Transport,
  type WalletClient,
} from "viem";
import {
  createSmartAccountFromWallet,
  revokeDelegation,
  type Delegation,
} from "@safe-subscriptions/core";

const BUNDLER_URL = import.meta.env.VITE_BUNDLER_URL || "";

export const canRevoke = Boolean(BUNDLER_URL);

/**
 * Revoke a subscription on-chain: the subscriber's smart account calls
 * `disableDelegation` via an ERC-4337 user operation. After this the org can no
 * longer charge (redemptions revert with `CannotUseADisabledDelegation`).
 * Tops up a little native gas in the smart account for the user op (negligible
 * on an L2). Returns the transaction hash.
 */
export async function revokeSubscriptionOnChain(params: {
  walletClient: WalletClient<Transport, Chain, Account>;
  publicClient: PublicClient;
  delegation: Delegation;
  onStatus?: (message: string) => void;
}): Promise<string> {
  const { onStatus = () => {}, publicClient, walletClient } = params;
  if (!BUNDLER_URL) {
    throw new Error("Set VITE_BUNDLER_URL (an ERC-4337 bundler) to revoke on-chain.");
  }

  const smartAccount = await createSmartAccountFromWallet({ client: publicClient, walletClient });

  // The user op pays its own gas — ensure the smart account holds a little.
  const balance = await publicClient.getBalance({ address: smartAccount.address });
  if (balance < parseEther("0.0005")) {
    onStatus("Top up gas for the revoke — confirm the transfer…");
    const tx = await walletClient.sendTransaction({
      account: walletClient.account,
      chain: walletClient.chain,
      to: smartAccount.address,
      value: parseEther("0.001"),
    });
    await publicClient.waitForTransactionReceipt({ hash: tx });
  }

  onStatus("Revoking on-chain (disableDelegation) — confirm the user operation…");
  return revokeDelegation({
    client: publicClient,
    subscriberSmartAccount: smartAccount,
    environment: smartAccount.environment,
    bundlerUrl: BUNDLER_URL,
    delegation: params.delegation,
  });
}
