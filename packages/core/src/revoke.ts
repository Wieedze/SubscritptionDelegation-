import { http, type Hex, type PublicClient } from "viem";
import { createBundlerClient } from "viem/account-abstraction";
import type {
  MetaMaskSmartAccount,
  SmartAccountsEnvironment,
} from "@metamask/smart-accounts-kit";
import { DelegationManager } from "@metamask/smart-accounts-kit/contracts";
import type { SubscriptionRecord } from "./types.js";

/**
 * Revoke a subscription on-chain. `disableDelegation` must be called BY the
 * delegator (the smart account), so this is sent as an ERC-4337 user operation
 * through a bundler. The smart account must be deployed and hold a little ETH to
 * pay for the user operation (or use a paymaster — out of scope for this POC).
 *
 * Returns the transaction hash that included the user operation.
 */
export async function revokeSubscription(params: {
  client: PublicClient;
  subscriberSmartAccount: MetaMaskSmartAccount;
  environment: SmartAccountsEnvironment;
  bundlerUrl: string;
  record: SubscriptionRecord;
}): Promise<Hex> {
  const disableCalldata = DelegationManager.encode.disableDelegation({
    delegation: params.record.delegation,
  });

  const bundler = createBundlerClient({
    client: params.client,
    account: params.subscriberSmartAccount,
    transport: http(params.bundlerUrl),
  });

  const userOpHash = await bundler.sendUserOperation({
    calls: [{ to: params.environment.DelegationManager, data: disableCalldata }],
  });

  const receipt = await bundler.waitForUserOperationReceipt({ hash: userOpHash });
  return receipt.receipt.transactionHash;
}
