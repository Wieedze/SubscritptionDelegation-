import type { Address } from "viem";
import {
  createDelegation,
  ScopeType,
  type Delegation,
  type MetaMaskSmartAccount,
  type SmartAccountsEnvironment,
} from "@metamask/smart-accounts-kit";
import { createCaveatBuilder } from "@metamask/smart-accounts-kit/utils";
import { buildAgreementDocument, buildTerms, MONTHLY_SECONDS } from "./terms.js";
import type { Pinner } from "./ipfs.js";
import type { SubscriptionRecord } from "./types.js";

export interface CreateSubscriptionParams {
  environment: SmartAccountsEnvironment;
  chainId: number;
  /** The subscriber's DeleGator smart account (delegator). */
  subscriberSmartAccount: MetaMaskSmartAccount;
  /** The EOA that owns/controls the smart account and signs for it. */
  subscriberOwner: Address;
  organization: { name: string; delegate: Address; recipient: Address };
  subscriberLabel: string;
  token: { address: Address; symbol: string; decimals: number };
  /** Human amount per period, e.g. "10". */
  amountPerPeriod: string;
  periodSeconds?: number;
  startDate?: number;
  /** Unix seconds after which the subscription auto-expires (adds a timestamp caveat). */
  endDate?: number | null;
  cancellation?: string;
  pin: Pinner;
}

/**
 * Build the agreement, pin it to IPFS, then create and sign the ERC-7710
 * delegation carrying the `erc20PeriodTransfer` caveat. The delegation salt is
 * set to keccak256(terms) so the subscriber's signature commits, on-chain, to
 * the exact pinned terms.
 */
export async function createSubscription(
  params: CreateSubscriptionParams,
): Promise<SubscriptionRecord> {
  const periodSeconds = params.periodSeconds ?? MONTHLY_SECONDS;
  const startDate = params.startDate ?? Math.floor(Date.now() / 1000);
  const smartAccount = params.subscriberSmartAccount;

  const terms = buildTerms({
    organization: params.organization,
    subscriber: {
      label: params.subscriberLabel,
      smartAccount: smartAccount.address,
      owner: params.subscriberOwner,
    },
    token: params.token,
    amountPerPeriod: params.amountPerPeriod,
    periodSeconds,
    startDate,
    endDate: params.endDate ?? null,
    cancellation: params.cancellation,
  });

  const id = `sub_${startDate}_${smartAccount.address.slice(2, 10).toLowerCase()}`;
  const agreement = buildAgreementDocument({ id, chainId: params.chainId, terms });
  const pinned = await params.pin(agreement);

  // Optional expiry: enforce on-chain via a timestamp caveat (in addition to the
  // period-transfer caveat synthesized from `scope`).
  const extraCaveats =
    params.endDate != null
      ? createCaveatBuilder(params.environment)
          .addCaveat("timestamp", {
            afterThreshold: startDate,
            beforeThreshold: params.endDate,
          })
          .build()
      : undefined;

  const unsigned: Delegation = createDelegation({
    environment: params.environment,
    from: smartAccount.address,
    to: params.organization.delegate,
    // Bind the signature to the exact terms.
    salt: agreement.termsHash,
    scope: {
      type: ScopeType.Erc20PeriodTransfer,
      tokenAddress: params.token.address,
      periodAmount: BigInt(terms.amountPerPeriodRaw),
      periodDuration: periodSeconds,
      startDate,
    },
    ...(extraCaveats ? { caveats: extraCaveats } : {}),
  });

  const signature = await smartAccount.signDelegation({ delegation: unsigned });
  const delegation: Delegation = { ...unsigned, signature };

  return {
    id,
    createdAt: agreement.createdAt,
    chainId: params.chainId,
    terms,
    agreement: {
      cid: pinned.cid,
      uri: pinned.uri,
      termsHash: agreement.termsHash,
    },
    delegation,
  };
}
