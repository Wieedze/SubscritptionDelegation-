import {
  createPublicClient,
  createWalletClient,
  http,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import {
  getSmartAccountsEnvironment,
  type SmartAccountsEnvironment,
} from "@metamask/smart-accounts-kit";

/** The single chain this POC targets. */
export const CHAIN = sepolia;

/** Delegation Framework addresses (DelegationManager, EntryPoint, enforcers, …) on Sepolia. */
export function getEnvironment(): SmartAccountsEnvironment {
  return getSmartAccountsEnvironment(sepolia.id);
}

export function publicClientFromRpc(rpcUrl: string): PublicClient {
  return createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
}

/** Wallet client bound to an EOA private key (used by the org to redeem, by the deployer, …). */
export function walletClientFromKey(rpcUrl: string, privateKey: Hex): WalletClient {
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({ account, chain: sepolia, transport: http(rpcUrl) });
}
