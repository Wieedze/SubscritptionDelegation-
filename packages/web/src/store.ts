import type { SubscriptionRecord, SubscriptionStore } from "@safe-subscriptions/core";

const KEY = "safe-subscriptions/records";

function read(): SubscriptionRecord[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as SubscriptionRecord[];
  } catch {
    return [];
  }
}

function write(records: SubscriptionRecord[]): void {
  localStorage.setItem(KEY, JSON.stringify(records));
}

/** localStorage-backed subscription store for the browser. */
export const localStore: SubscriptionStore = {
  async all() {
    return read();
  },
  async get(id) {
    return read().find((r) => r.id === id);
  },
  async save(record) {
    const records = read();
    const idx = records.findIndex((r) => r.id === record.id);
    if (idx >= 0) records[idx] = record;
    else records.push(record);
    write(records);
  },
  async remove(id) {
    write(read().filter((r) => r.id !== id));
  },
};
