/**
 * Gas-abstracted subscription charge via the 1Shot public relayer.
 *
 *   bun scripts/relayed.ts
 *
 * The subscriber is an EIP-7702 smart account (its address IS the EOA). It signs
 * one period delegation (USDC) to the relayer's targetAddress. Each period, we
 * submit a bundle [fee → feeCollector, amount → org] to 1Shot, which redeems it
 * on-chain and is paid in USDC — so NO ETH is spent by anyone.
 *
 * Requirements: the subscriber EOA holds a little Sepolia USDC (Circle faucet:
 * https://faucet.circle.com). No bundler, no paymaster, no ETH.
 */
import { formatUnits, getAddress, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  build7702Authorization,
  chargeViaRelayer,
  createStateless7702SmartAccount,
  getCapabilities,
  pollRelayerUntilDone,
  relayerUrlForChain,
  signRelayerSubscriptionDelegation,
  MONTHLY_SECONDS,
  getEnvironment,
} from "@safe-subscriptions/core";
import { loadConfig, publicClient } from "./_shared.js";

const CHAIN_ID = 11155111;
const ERC20_BALANCE_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "a", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

async function main() {
  const config = loadConfig();
  const client = publicClient(config);
  const env = getEnvironment();
  const relayerUrl = relayerUrlForChain(CHAIN_ID);

  const subscriber = privateKeyToAccount(config.subscriberKey);
  // Recipient (the "org") — pass an address as the first arg, else ORG_RECIPIENT.
  const recipient = process.argv[2] ? getAddress(process.argv[2]) : config.orgRecipient;

  // 1. Relayer capabilities: accepted fee token (USDC), targetAddress, feeCollector.
  const caps = await getCapabilities(relayerUrl, CHAIN_ID);
  const usdc = caps.tokens.find((t) => t.symbol === "USDC") ?? caps.tokens[0];
  if (!usdc) throw new Error("1Shot relayer reports no accepted tokens on this chain.");
  const token = { address: getAddress(usdc.address), decimals: Number(usdc.decimals) };

  console.log("Relayer            :", relayerUrl);
  console.log("Fee token (USDC)   :", token.address);
  console.log("targetAddress      :", caps.targetAddress);
  console.log("Subscriber (7702)  :", subscriber.address);

  // 2. Ensure the subscriber holds USDC for the work + fee.
  const usdcBalance = await client.readContract({
    address: token.address,
    abi: ERC20_BALANCE_ABI,
    functionName: "balanceOf",
    args: [subscriber.address],
  });
  const workAmount = parseUnits("0.1", token.decimals); // 0.1 USDC / period
  // Cap = subscription amount + generous fee headroom. On Sepolia the relayer fee
  // is gas-priced in USDC and can spike to several USDC, plus the one-time 7702
  // upgrade on the first charge — keep the cap well above that.
  const periodAmount = parseUnits("15", token.decimals);
  const ethBefore = await client.getBalance({ address: subscriber.address });
  console.log("USDC balance       :", formatUnits(usdcBalance, token.decimals), "USDC");
  if (usdcBalance < parseUnits("7", token.decimals)) {
    throw new Error(
      `Subscriber needs Sepolia USDC. Fund ${subscriber.address} via https://faucet.circle.com`,
    );
  }

  // 3. EIP-7702 smart account + (first-use) authorization.
  const smartAccount = await createStateless7702SmartAccount({ client, account: subscriber });
  const code = await client.getCode({ address: subscriber.address });
  const authorization = code
    ? undefined
    : await build7702Authorization({ account: subscriber, client, environment: env, chainId: CHAIN_ID });
  console.log(code ? "EOA already upgraded to 7702." : "Including EIP-7702 upgrade in this bundle.");

  // 4. Sign one period delegation (USDC) to the relayer's targetAddress.
  const signedDelegation = await signRelayerSubscriptionDelegation({
    smartAccount,
    targetAddress: caps.targetAddress,
    token,
    periodAmount,
    periodSeconds: MONTHLY_SECONDS,
    startDate: Math.floor(Date.now() / 1000),
  });
  console.log("Signed period delegation (USDC) to relayer.");

  // 5. Charge via the relayer (estimate → send), then poll to completion.
  const taskId = await chargeViaRelayer({
    relayerUrl,
    chainId: CHAIN_ID,
    capabilities: caps,
    signedDelegation,
    token,
    workAmount,
    recipient,
    authorization,
    client,
  });
  console.log("Submitted to relayer. taskId:", taskId);

  // 6. Confirm. The relayer status API can lag on testnet, so fall back to the
  //    on-chain effect (USDC spent on fee) as the source of truth.
  let txHash: string | undefined;
  try {
    const status = await pollRelayerUntilDone(relayerUrl, taskId, { timeoutMs: 60_000 });
    if (status.status === 200) txHash = status.receipt?.transactionHash ?? status.hash;
    else if (status.status === 400 || status.status === 500) {
      throw new Error(`Relayer rejected the task (${status.status}): ${status.message ?? JSON.stringify(status.data)}`);
    }
  } catch (err) {
    if (!/Timeout/.test((err as Error).message)) throw err;
    console.log("Relayer status API is lagging — confirming on-chain instead…");
  }

  const usdcAfter = await client.readContract({
    address: token.address,
    abi: ERC20_BALANCE_ABI,
    functionName: "balanceOf",
    args: [subscriber.address],
  });
  const ethAfter = await client.getBalance({ address: subscriber.address });
  const usdcSpent = usdcBalance - usdcAfter;

  if (usdcSpent <= 0n) {
    console.error("\n✗ Charge not yet visible on-chain. Re-check the task shortly.");
    process.exit(1);
  }

  console.log(`\n✅ Charged via 1Shot — gas-abstracted, no ETH spent.`);
  console.log(
    "  fee paid (USDC)  :",
    formatUnits(usdcSpent, token.decimals),
    authorization ? "(relayer gas + one-time 7702 upgrade, priced in USDC)" : "(relayer gas, priced in USDC)",
  );
  console.log("  ETH spent        :", formatUnits(ethBefore - ethAfter, 18), "(0 = relayer paid the gas)");
  if (txHash) console.log("  tx               :", txHash);
  console.log("  explorer         : https://sepolia.etherscan.io/address/" + subscriber.address);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
