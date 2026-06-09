import { http, type Hex, type PublicClient } from "viem";
import { createBundlerClient } from "viem/account-abstraction";
import type {
  Delegation,
  MetaMaskSmartAccount,
  SmartAccountsEnvironment,
} from "@metamask/smart-accounts-kit";
import { DelegationManager } from "@metamask/smart-accounts-kit/contracts";
import type { SubscriptionRecord } from "./types.js";

/**
 * Revoke a delegation on-chain. `disableDelegation` must be called BY the
 * delegator (the smart account), so this is sent as an ERC-4337 user operation
 * through a bundler. The smart account must be deployed and hold a little native
 * gas to pay for the user operation (negligible on an L2). After this, any
 * redemption of the delegation reverts with `CannotUseADisabledDelegation`.
 *
 * Returns the transaction hash that included the user operation.
 */
export async function revokeDelegation(params: {
  client: PublicClient;
  subscriberSmartAccount: MetaMaskSmartAccount;
  environment: SmartAccountsEnvironment;
  bundlerUrl: string;
  delegation: Delegation;
}): Promise<Hex> {
  const disableCalldata = DelegationManager.encode.disableDelegation({
    delegation: params.delegation,
  });

  const bundler = createBundlerClient({
    client: params.client,
    account: params.subscriberSmartAccount,
    transport: http(params.bundlerUrl),
  });

  // Bundlers (e.g. Pimlico) enforce their own min gas price; viem's default
  // (chain priority fee) is too low. Fetch the bundler's recommended price.
  const fees = await getBundlerGasPrice(params.bundlerUrl);

  const userOpHash = await bundler.sendUserOperation({
    calls: [{ to: params.environment.DelegationManager, data: disableCalldata }],
    ...fees,
  });

  const receipt = await bundler.waitForUserOperationReceipt({ hash: userOpHash });
  return receipt.receipt.transactionHash;
}

/** Convenience wrapper for the CLI {@link SubscriptionRecord}. */
export async function revokeSubscription(params: {
  client: PublicClient;
  subscriberSmartAccount: MetaMaskSmartAccount;
  environment: SmartAccountsEnvironment;
  bundlerUrl: string;
  record: SubscriptionRecord;
}): Promise<Hex> {
  return revokeDelegation({ ...params, delegation: params.record.delegation });
}

/**
 * Ask the bundler for its recommended user-operation gas price. Supports the
 * Pimlico `pimlico_getUserOperationGasPrice` extension; falls back to undefined
 * fees (viem default) on any other bundler.
 */
async function getBundlerGasPrice(
  bundlerUrl: string,
): Promise<{ maxFeePerGas?: bigint; maxPriorityFeePerGas?: bigint }> {
  try {
    const res = await fetch(bundlerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "pimlico_getUserOperationGasPrice",
        params: [],
      }),
    });
    const json = (await res.json()) as {
      result?: { fast?: { maxFeePerGas: string; maxPriorityFeePerGas: string } };
    };
    const fast = json.result?.fast;
    if (!fast) return {};
    return {
      maxFeePerGas: BigInt(fast.maxFeePerGas),
      maxPriorityFeePerGas: BigInt(fast.maxPriorityFeePerGas),
    };
  } catch {
    return {};
  }
}
