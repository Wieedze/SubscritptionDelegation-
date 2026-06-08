/**
 * Subscriber side: revoke a subscription on-chain via disableDelegation.
 *
 *   bun scripts/revoke.ts <subscriptionId>
 *
 * Requires BUNDLER_URL (the smart account sends the user operation) and the
 * smart account to hold a little Sepolia ETH for gas. After this, any further
 * charge for this subscription reverts (CannotUseADisabledDelegation).
 */
import { createSubscriberSmartAccount, revokeSubscription } from "@safe-subscriptions/core";
import { environment, loadConfig, publicClient } from "./_shared.js";

async function main() {
  const id = process.argv[2];
  if (!id) throw new Error("Usage: bun scripts/revoke.ts <subscriptionId>");

  const config = loadConfig();
  if (!config.bundlerUrl) {
    throw new Error("BUNDLER_URL is required to revoke (the smart account sends a user op).");
  }
  const client = publicClient(config);
  const record = await config.store.get(id);
  if (!record) throw new Error(`No subscription with id ${id}.`);

  const smartAccount = await createSubscriberSmartAccount({
    client,
    ownerPrivateKey: config.subscriberKey,
  });

  console.log(`Revoking ${id} via ${smartAccount.address} …`);
  const tx = await revokeSubscription({
    client,
    subscriberSmartAccount: smartAccount,
    environment: environment(),
    bundlerUrl: config.bundlerUrl,
    record,
  });
  console.log(`✅ Revoked. tx: ${tx}`);

  await config.store.remove(id);
  console.log("Removed from local store.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
