import type { Address, Hex } from "viem";
import type { Delegation } from "@metamask/smart-accounts-kit";

/** Frozen, human-readable terms of the agreement between org and subscriber. */
export interface SubscriptionTerms {
  organization: {
    name: string;
    /** Delegate EOA that redeems the delegation each period. */
    delegate: Address;
    /** Address that receives the pulled tokens. */
    recipient: Address;
  };
  subscriber: {
    label: string;
    /** The DeleGator smart account (delegator). */
    smartAccount: Address;
    /** EOA owner that controls / signs for the smart account. */
    owner: Address;
  };
  token: {
    address: Address;
    symbol: string;
    decimals: number;
  };
  /** Human amount per period, e.g. "10.00". */
  amountPerPeriod: string;
  /** Amount per period in base units (stringified bigint). */
  amountPerPeriodRaw: string;
  /** Period length in seconds (2592000 = 30 days). */
  periodSeconds: number;
  /** Unix seconds when the first period starts. */
  startDate: number;
  /** Unix seconds after which the delegation expires, or null for open-ended. */
  endDate: number | null;
  cancellation: string;
}

/** The document pinned to IPFS. Carries the terms and their hash. */
export interface AgreementDocument {
  schema: "safe-subscriptions/agreement@1";
  id: string;
  createdAt: string;
  chainId: number;
  /** keccak256 of the canonicalized `terms` block. */
  termsHash: Hex;
  terms: SubscriptionTerms;
}

/** Everything we persist for one subscription. */
export interface SubscriptionRecord {
  id: string;
  createdAt: string;
  chainId: number;
  terms: SubscriptionTerms;
  agreement: {
    /** IPFS CID of the pinned AgreementDocument. */
    cid: string;
    /** ipfs://<cid> */
    uri: string;
    /** keccak256(terms) — also used as the delegation salt to bind the signature to the terms. */
    termsHash: Hex;
  };
  /** The signed ERC-7710 delegation carrying the erc20PeriodTransfer caveat. */
  delegation: Delegation;
}
