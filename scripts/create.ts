/**
 * Subscriber side: prepare the smart account and create a subscription.
 *
 *   bun scripts/create.ts [amountPerPeriod] [mintAmount]
 *
 * Steps:
 *   1. Derive the subscriber's Hybrid DeleGator smart account from SUBSCRIBER_PRIVATE_KEY.
 *   2. Deploy it on-chain (direct factory call) if not already deployed.
 *   3. Mint `mintAmount` test tokens to the smart account (MockERC20 open mint).
 *   4. Build + pin the agreement, create + sign the erc20PeriodTransfer delegation.
 *   5. Persist the signed subscription record.
 */
import { formatUnits, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  createSubscriberSmartAccount,
  deploySmartAccount,
  createSubscription,
  walletClientFromKey,
  MONTHLY_SECONDS,
} from "@safe-subscriptions/core";
import {
  environment,
  loadConfig,
  publicClient,
  readToken,
} from "./_shared.js";

const MINTABLE_ABI = [
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

async function main() {
  const amountPerPeriod = process.argv[2] ?? "10";
  const config = loadConfig();
  const client = publicClient(config);
  const env = environment();

  const subscriberWallet = walletClientFromKey(config.rpcUrl, config.subscriberKey);
  const subscriberAccount = privateKeyToAccount(config.subscriberKey);
  const orgAccount = privateKeyToAccount(config.orgKey);

  const smartAccount = await createSubscriberSmartAccount({
    client,
    ownerPrivateKey: config.subscriberKey,
  });
  console.log("Subscriber EOA       :", subscriberAccount.address);
  console.log("Subscriber smart acc :", smartAccount.address);

  // 2. Deploy the smart account if needed (the EOA owner pays gas).
  const deployTx = await deploySmartAccount(smartAccount, subscriberWallet);
  console.log(deployTx ? `Deployed smart account: ${deployTx}` : "Smart account already deployed.");

  const token = await readToken(client, config.tokenAddress);
  const mintAmount = process.argv[3] ?? (Number(amountPerPeriod) * 3).toString();
  const mintRaw = parseUnits(mintAmount, token.decimals);

  // 3. Fund the smart account with test tokens.
  const mintTx = await subscriberWallet.writeContract({
    account: subscriberAccount,
    chain: subscriberWallet.chain,
    address: token.address,
    abi: MINTABLE_ABI,
    functionName: "mint",
    args: [smartAccount.address, mintRaw],
  });
  console.log(`Minted ${mintAmount} ${token.symbol} to smart account: ${mintTx}`);

  // 4 + 5. Build, pin, sign, persist.
  const record = await createSubscription({
    environment: env,
    chainId: client.chain!.id,
    subscriberSmartAccount: smartAccount,
    organization: {
      name: "ACME Org",
      delegate: orgAccount.address,
      recipient: config.orgRecipient,
    },
    subscriberLabel: "POC subscriber",
    token,
    amountPerPeriod,
    periodSeconds: MONTHLY_SECONDS,
    pin: config.pin,
  });
  await config.store.save(record);

  console.log("\n✅ Subscription created");
  console.log("  id        :", record.id);
  console.log("  amount    :", record.terms.amountPerPeriod, token.symbol, "/ period");
  console.log("  period    :", record.terms.periodSeconds, "s");
  console.log("  delegate  :", record.terms.organization.delegate);
  console.log("  agreement :", record.agreement.uri);
  console.log("  termsHash :", record.agreement.termsHash, "(= delegation salt)");
  console.log(
    "  funded    :",
    formatUnits(mintRaw, token.decimals),
    token.symbol,
    "on",
    smartAccount.address,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
