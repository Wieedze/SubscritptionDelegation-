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
  const recipient = config.orgRecipient;

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
  const periodAmount = parseUnits("0.5", token.decimals); // cap: amount + fee headroom
  console.log("USDC balance       :", formatUnits(usdcBalance, token.decimals), "USDC");
  if (usdcBalance < workAmount + parseUnits("0.05", token.decimals)) {
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
  });
  console.log("Submitted to relayer. taskId:", taskId);

  const status = await pollRelayerUntilDone(relayerUrl, taskId);
  if (status.status === 200) {
    console.log(`\n✅ Charged 0.1 USDC via 1Shot (gas-abstracted, no ETH spent).`);
    console.log("  tx:", status.receipt?.transactionHash ?? status.hash);
  } else {
    console.error(`\n✗ Relayer task ended with status ${status.status}:`, status.message ?? status.data);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
