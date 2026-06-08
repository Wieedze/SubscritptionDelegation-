import { keccak256, parseUnits, toBytes, type Address, type Hex } from "viem";
import type { AgreementDocument, SubscriptionTerms } from "./types.js";

/** 30 days in seconds — the default monthly billing period. */
export const MONTHLY_SECONDS = 2_592_000;

/** Deterministic JSON: object keys sorted recursively, no whitespace. */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, sortDeep((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

/** keccak256 of the canonicalized terms — freezes the accepted conditions. */
export function hashTerms(terms: SubscriptionTerms): Hex {
  return keccak256(toBytes(canonicalize(terms)));
}

export interface BuildTermsParams {
  organization: { name: string; delegate: Address; recipient: Address };
  subscriber: { label: string; smartAccount: Address; owner: Address };
  token: { address: Address; symbol: string; decimals: number };
  /** Human amount per period, e.g. "10" or "10.50". */
  amountPerPeriod: string;
  periodSeconds?: number;
  startDate?: number;
  endDate?: number | null;
  cancellation?: string;
}

export function buildTerms(params: BuildTermsParams): SubscriptionTerms {
  const periodSeconds = params.periodSeconds ?? MONTHLY_SECONDS;
  const startDate = params.startDate ?? Math.floor(Date.now() / 1000);
  const amountPerPeriodRaw = parseUnits(
    params.amountPerPeriod,
    params.token.decimals,
  ).toString();

  return {
    organization: params.organization,
    subscriber: params.subscriber,
    token: params.token,
    amountPerPeriod: params.amountPerPeriod,
    amountPerPeriodRaw,
    periodSeconds,
    startDate,
    endDate: params.endDate ?? null,
    cancellation:
      params.cancellation ??
      "Annulable à tout moment par le subscriber via disableDelegation.",
  };
}

export function buildAgreementDocument(params: {
  id: string;
  chainId: number;
  terms: SubscriptionTerms;
  createdAt?: string;
}): AgreementDocument {
  return {
    schema: "safe-subscriptions/agreement@1",
    id: params.id,
    createdAt: params.createdAt ?? new Date().toISOString(),
    chainId: params.chainId,
    termsHash: hashTerms(params.terms),
    terms: params.terms,
  };
}
