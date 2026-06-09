import type { Delegation } from "@safe-subscriptions/core";

/** A subscription created through the gasless 1Shot flow (stored locally). */
export interface RelayedSubscription {
  id: string;
  createdAt: string;
  amount: string; // human USDC per period
  periodDays: number;
  recipient: string;
  taskId: string;
  txHash?: string;
  /** Human-readable contract pinned to IPFS, hash bound to the signature. */
  agreement?: { cid: string; uri: string; termsHash: string };
  /** The subscriber's smart account (delegator) — needed to revoke. */
  smartAccount?: string;
  /** The signed delegation — needed to revoke on-chain (disableDelegation). */
  delegation?: Delegation;
}

const KEY = "safe-subscriptions/relayed";

export function listSubscriptions(): RelayedSubscription[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as RelayedSubscription[];
  } catch {
    return [];
  }
}

export function saveSubscription(sub: RelayedSubscription): void {
  const all = listSubscriptions();
  all.unshift(sub);
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function removeSubscription(id: string): void {
  localStorage.setItem(KEY, JSON.stringify(listSubscriptions().filter((s) => s.id !== id)));
}
