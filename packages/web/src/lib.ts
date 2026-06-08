import { erc20Abi, type Address, type PublicClient } from "viem";

export const BUNDLER_URL = import.meta.env.VITE_BUNDLER_URL || "";

export interface TokenInfo {
  address: Address;
  symbol: string;
  decimals: number;
}

/** Read on-chain decimals + symbol for an ERC20. */
export async function readToken(
  client: PublicClient,
  address: Address,
): Promise<TokenInfo> {
  const [decimals, symbol] = await Promise.all([
    client.readContract({ address, abi: erc20Abi, functionName: "decimals" }),
    client.readContract({ address, abi: erc20Abi, functionName: "symbol" }),
  ]);
  return { address, symbol, decimals };
}

export function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
