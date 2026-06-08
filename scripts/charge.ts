/**
 * Organization side ("cron"): charge every subscription whose current period
 * still has an available amount to pull.
 *
 *   bun scripts/charge.ts [subscriptionId]
 *
 * With an id, charges only that subscription. Without, sweeps the whole store.
 * The org EOA (the delegate) sends a plain tx to the DelegationManager; the
 * period caveat caps the amount and refuses a second pull within the same period.
 */
import { formatUnits } from "viem";
import {
  chargeSubscription,
  getAvailableAmount,
  type SubscriptionRecord,
} from "@safe-subscriptions/core";
import { environment, loadConfig, orgWallet, publicClient } from "./_shared.js";

async function chargeOne(
  record: SubscriptionRecord,
  ctx: ReturnType<typeof buildCtx>,
): Promise<void> {
  const { client, env, wallet } = ctx;
  const decimals = record.terms.token.decimals;
  const symbol = record.terms.token.symbol;

  const { availableAmount, isNewPeriod, currentPeriod } = await getAvailableAmount({
    client,
    environment: env,
    record,
  });
  const due = BigInt(record.terms.amountPerPeriodRaw);

  console.log(`\n• ${record.id}`);
  console.log(`  period #${currentPeriod} ${isNewPeriod ? "(new)" : ""}`);
  console.log(`  available: ${formatUnits(availableAmount, decimals)} ${symbol}`);

  if (availableAmount < due) {
    console.log("  ↳ skip: period already charged (or insufficient allowance).");
    return;
  }

  const tx = await chargeSubscription({ orgWallet: wallet, environment: env, record });
  console.log(`  ↳ charged ${record.terms.amountPerPeriod} ${symbol}: ${tx}`);
}

function buildCtx() {
  const config = loadConfig();
  return {
    config,
    client: publicClient(config),
    env: environment(),
    wallet: orgWallet(config),
  };
}

async function main() {
  const ctx = buildCtx();
  const onlyId = process.argv[2];
  const records = await ctx.config.store.all();
  const targets = onlyId ? records.filter((r) => r.id === onlyId) : records;

  if (targets.length === 0) {
    console.log(onlyId ? `No subscription with id ${onlyId}.` : "No subscriptions to charge.");
    return;
  }

  for (const record of targets) {
    try {
      await chargeOne(record, ctx);
    } catch (err) {
      console.error(`  ↳ error charging ${record.id}:`, (err as Error).message);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
