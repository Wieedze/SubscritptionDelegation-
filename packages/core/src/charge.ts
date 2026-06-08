import {
  encodeFunctionData,
  erc20Abi,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import {
  createExecution,
  ExecutionMode,
  type SmartAccountsEnvironment,
} from "@metamask/smart-accounts-kit";
import { DelegationManager } from "@metamask/smart-accounts-kit/contracts";
import { getErc20PeriodTransferEnforcerAvailableAmount } from "@metamask/smart-accounts-kit/actions";
import type { SubscriptionRecord } from "./types.js";

/**
 * How much the organization can pull from this subscription right now.
 * `availableAmount` resets to the full period amount at each new period.
 */
export async function getAvailableAmount(params: {
  client: PublicClient;
  environment: SmartAccountsEnvironment;
  record: SubscriptionRecord;
}): Promise<{ availableAmount: bigint; isNewPeriod: boolean; currentPeriod: bigint }> {
  return getErc20PeriodTransferEnforcerAvailableAmount(
    params.client,
    params.environment,
    { delegation: params.record.delegation },
  );
}

/**
 * Pull one period's worth of tokens from the subscriber's smart account to the
 * organization. The org EOA (the delegate) sends a plain transaction to the
 * DelegationManager; the period caveat caps the amount and resets each period.
 * Throws if the period's allowance is already exhausted.
 */
export async function chargeSubscription(params: {
  orgWallet: WalletClient;
  environment: SmartAccountsEnvironment;
  record: SubscriptionRecord;
  /** Override the recipient; defaults to the agreed organization recipient. */
  recipient?: Address;
}): Promise<Hex> {
  const { record, environment } = params;
  const amount = BigInt(record.terms.amountPerPeriodRaw);
  const recipient = params.recipient ?? record.terms.organization.recipient;

  const transferCalldata = encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [recipient, amount],
  });

  const execution = createExecution({
    target: record.terms.token.address,
    callData: transferCalldata,
  });

  const redeemCalldata = DelegationManager.encode.redeemDelegations({
    delegations: [[record.delegation]],
    modes: [ExecutionMode.SingleDefault],
    executions: [[execution]],
  });

  const account = params.orgWallet.account;
  if (!account) throw new Error("Organization wallet client has no account.");

  return params.orgWallet.sendTransaction({
    account,
    chain: params.orgWallet.chain,
    to: environment.DelegationManager,
    data: redeemCalldata,
  });
}
