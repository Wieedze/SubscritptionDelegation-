import {
  erc20Abi,
  getAddress,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  getEnvironment,
  publicClientFromRpc,
  walletClientFromKey,
  pinataPinner,
  offlinePinner,
  type Pinner,
} from "@safe-subscriptions/core";
import { FileSubscriptionStore } from "@safe-subscriptions/core/node";

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.startsWith("0x...") || value === "") {
    throw new Error(`Missing env var ${name} (set it in .env — see .env.example).`);
  }
  return value;
}

export function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && !value.startsWith("0x...") ? value : undefined;
}

export interface AppConfig {
  rpcUrl: string;
  subscriberKey: Hex;
  orgKey: Hex;
  orgRecipient: Address;
  tokenAddress: Address;
  bundlerUrl?: string;
  store: FileSubscriptionStore;
  pin: Pinner;
}

export function loadConfig(): AppConfig {
  const rpcUrl = requireEnv("RPC_URL");
  const orgKey = requireEnv("ORG_PRIVATE_KEY") as Hex;
  const orgAccount = privateKeyToAccount(orgKey);

  const pinataJwt = optionalEnv("PINATA_JWT");
  if (!pinataJwt) {
    console.warn("⚠️  PINATA_JWT not set — using offline pinner (terms not pinned to real IPFS).");
  }

  return {
    rpcUrl,
    subscriberKey: requireEnv("SUBSCRIBER_PRIVATE_KEY") as Hex,
    orgKey,
    orgRecipient: getAddress(optionalEnv("ORG_RECIPIENT") ?? orgAccount.address),
    tokenAddress: getAddress(requireEnv("TOKEN_ADDRESS")),
    bundlerUrl: optionalEnv("BUNDLER_URL"),
    store: new FileSubscriptionStore(
      new URL("../data/subscriptions.json", import.meta.url).pathname,
    ),
    pin: pinataJwt ? pinataPinner(pinataJwt) : offlinePinner(),
  };
}

export function publicClient(config: AppConfig): PublicClient {
  return publicClientFromRpc(config.rpcUrl);
}

export function orgWallet(config: AppConfig): WalletClient {
  return walletClientFromKey(config.rpcUrl, config.orgKey);
}

export function environment() {
  return getEnvironment();
}

/** Read on-chain decimals + symbol for a token. */
export async function readToken(
  client: PublicClient,
  address: Address,
): Promise<{ address: Address; symbol: string; decimals: number }> {
  const [decimals, symbol] = await Promise.all([
    client.readContract({ address, abi: erc20Abi, functionName: "decimals" }),
    client.readContract({ address, abi: erc20Abi, functionName: "symbol" }),
  ]);
  return { address, symbol, decimals };
}
