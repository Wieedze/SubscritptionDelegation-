import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { SubscriptionRecord } from "./types.js";
import type { SubscriptionStore } from "./storage.js";

/**
 * File-backed store for node scripts. SubscriptionRecord is plain JSON
 * (delegation fields are all hex strings), so no special serialization needed.
 */
export class FileSubscriptionStore implements SubscriptionStore {
  constructor(private readonly path: string) {}

  async all(): Promise<SubscriptionRecord[]> {
    try {
      const raw = await readFile(this.path, "utf8");
      return JSON.parse(raw) as SubscriptionRecord[];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
  }

  async get(id: string): Promise<SubscriptionRecord | undefined> {
    return (await this.all()).find((r) => r.id === id);
  }

  async save(record: SubscriptionRecord): Promise<void> {
    const records = await this.all();
    const idx = records.findIndex((r) => r.id === record.id);
    if (idx >= 0) records[idx] = record;
    else records.push(record);
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, JSON.stringify(records, null, 2), "utf8");
  }

  async remove(id: string): Promise<void> {
    const records = (await this.all()).filter((r) => r.id !== id);
    await writeFile(this.path, JSON.stringify(records, null, 2), "utf8");
  }
}
