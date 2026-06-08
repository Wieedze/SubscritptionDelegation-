import type { SubscriptionRecord } from "./types.js";

/**
 * Storage interface — implemented by a JSON file (node, see `./node`) or by
 * localStorage in the browser. This module is browser-safe (no node imports).
 */
export interface SubscriptionStore {
  all(): Promise<SubscriptionRecord[]>;
  get(id: string): Promise<SubscriptionRecord | undefined>;
  save(record: SubscriptionRecord): Promise<void>;
  remove(id: string): Promise<void>;
}
