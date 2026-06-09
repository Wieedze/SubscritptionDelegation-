import {
  bytesToHex,
  encodeFunctionData,
  erc20Abi,
  type Account,
  type Address,
  type Chain,
  type Hex,
  type LocalAccount,
  type PublicClient,
  type Transport,
  type WalletClient,
} from "viem";
import {
  createDelegation,
  Implementation,
  ScopeType,
  toMetaMaskSmartAccount,
  type Delegation,
  type MetaMaskSmartAccount,
  type SmartAccountsEnvironment,
} from "@metamask/smart-accounts-kit";

/**
 * Minimal client for the 1Shot public relayer (gas-abstracted ERC-7710
 * execution). The relayer redeems a delegation signed to its `targetAddress`
 * and takes its fee as an ERC-20 transfer to `feeCollector` — so no ETH is
 * needed anywhere. See the `public-relayer` skill for the full protocol.
 */

/** Pick the relayer endpoint for a chain (testnets use the .dev host). */
export function relayerUrlForChain(chainId: number): string {
  return chainId === 11155111 || chainId === 84532
    ? "https://relayer.1shotapi.dev/relayers"
    : "https://relayer.1shotapi.com/relayers";
}

type JsonRpc<T> =
  | { jsonrpc: "2.0"; id: number | string; result: T }
  | { jsonrpc: "2.0"; id: number | string; error: { code: number; message: string; data?: unknown } };

/** The relayer occasionally returns a transient internal error; retry those. */
function isTransientRelayerError(err: { code: number; message: string; data?: unknown }): boolean {
  const code = (err.data as { errorCode?: string } | undefined)?.errorCode;
  return code === "ERR_ONESHOT" || /Not Found/i.test(err.message);
}

async function rpc<T>(url: string, method: string, params: unknown, id = 1): Promise<T> {
  let lastError: { code: number; message: string; data?: unknown } | undefined;
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 2000 * attempt));
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    });
    const json = (await res.json()) as JsonRpc<T>;
    if (!("error" in json)) return json.result;
    lastError = json.error;
    if (!isTransientRelayerError(json.error)) break;
  }
  throw new Error(`relayer [${lastError?.code}] ${lastError?.message}`);
}

/** Convert delegation bigints / Uint8Arrays into JSON-safe shapes for the relayer. */
export function toRelayerJson(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "bigint") return `0x${value.toString(16)}`;
  if (value instanceof Uint8Array) return bytesToHex(value);
  if (Array.isArray(value)) return value.map(toRelayerJson);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = toRelayerJson(v);
    return out;
  }
  return value;
}

export interface RelayerToken {
  address: Address;
  symbol?: string;
  decimals: number | string;
}
export interface ChainCapabilities {
  feeCollector: Address;
  targetAddress: Address;
  tokens: RelayerToken[];
}

export async function getCapabilities(
  url: string,
  chainId: number,
): Promise<ChainCapabilities> {
  const caps = await rpc<Record<string, ChainCapabilities>>(url, "relayer_getCapabilities", [
    String(chainId),
  ]);
  const chainCaps = caps[String(chainId)];
  if (!chainCaps) throw new Error(`1Shot relayer does not support chain ${chainId}`);
  return chainCaps;
}

interface Estimate7710Result {
  success: boolean;
  requiredPaymentAmount?: string;
  context?: string;
  gasUsed?: Record<string, string>;
  error?: string;
}

/** A random 32-byte salt, runtime-agnostic (node 20+ / browser). */
export function randomSalt(): Hex {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
}

/**
 * Build the subscriber's EIP-7702 smart account. With 7702 the smart account
 * address IS the EOA address — no separate deployment.
 */
export async function createStateless7702SmartAccount(params: {
  client: PublicClient;
  account: Account;
}): Promise<MetaMaskSmartAccount> {
  return toMetaMaskSmartAccount({
    client: params.client,
    implementation: Implementation.Stateless7702,
    address: params.account.address,
    signer: { account: params.account },
  });
}

/**
 * Sign one long-lived period delegation to the relayer's targetAddress, scoped
 * to the fee token (USDC). The single period cap covers both the subscription
 * pull and the relayer fee. Sign once; reuse every period.
 */
export async function signRelayerSubscriptionDelegation(params: {
  smartAccount: MetaMaskSmartAccount;
  targetAddress: Address;
  token: { address: Address; decimals: number };
  /** Max token atoms transferable per period (subscription amount + fee headroom). */
  periodAmount: bigint;
  periodSeconds: number;
  startDate: number;
}): Promise<Delegation> {
  const unsigned = createDelegation({
    to: params.targetAddress,
    from: params.smartAccount.address,
    environment: params.smartAccount.environment,
    salt: randomSalt(),
    scope: {
      type: ScopeType.Erc20PeriodTransfer,
      tokenAddress: params.token.address,
      periodAmount: params.periodAmount,
      periodDuration: params.periodSeconds,
      startDate: params.startDate,
    },
  });
  const signature = await params.smartAccount.signDelegation({ delegation: unsigned });
  return { ...unsigned, signature };
}

/**
 * Browser variant: build the subscriber's EIP-7702 smart account using the
 * connected wallet as signer. `signDelegation` then prompts the wallet to sign
 * the delegation as EIP-712 typed data — no ERC-7715, works with any MetaMask.
 */
export async function createStateless7702FromWallet(params: {
  client: PublicClient;
  walletClient: WalletClient<Transport, Chain | undefined, Account>;
}): Promise<MetaMaskSmartAccount> {
  return toMetaMaskSmartAccount({
    client: params.client,
    implementation: Implementation.Stateless7702,
    address: params.walletClient.account.address,
    signer: { walletClient: params.walletClient },
  });
}

/** Browser variant of the EIP-7702 authorization, signed by the connected wallet. */
export async function build7702AuthorizationFromWallet(params: {
  walletClient: WalletClient<Transport, Chain | undefined, Account>;
  environment: SmartAccountsEnvironment;
}): Promise<unknown> {
  const impl = params.environment.implementations.EIP7702StatelessDeleGatorImpl as Address;
  // Sponsored flow: 1Shot's targetAddress executes the tx, so omit `executor`
  // (viem then uses the EOA's current nonce, not current+1).
  const auth = await params.walletClient.signAuthorization({
    account: params.walletClient.account,
    contractAddress: impl,
  });
  return {
    address: auth.address,
    chainId: auth.chainId,
    nonce: auth.nonce,
    r: auth.r,
    s: auth.s,
    yParity: auth.yParity ?? 0,
  };
}

/** EIP-7702 authorization entry upgrading the EOA to the stateless delegator. */
export async function build7702Authorization(params: {
  account: LocalAccount;
  client: PublicClient;
  environment: SmartAccountsEnvironment;
  chainId: number;
}): Promise<unknown> {
  if (!params.account.signAuthorization) {
    throw new Error("Account cannot sign EIP-7702 authorizations.");
  }
  const nonce = await params.client.getTransactionCount({
    address: params.account.address,
    blockTag: "pending",
  });
  const impl = params.environment.implementations.EIP7702StatelessDeleGatorImpl as Address;
  const auth = await params.account.signAuthorization({
    chainId: params.chainId,
    contractAddress: impl,
    nonce,
  });
  return {
    address: auth.address,
    chainId: auth.chainId,
    nonce: auth.nonce,
    r: auth.r,
    s: auth.s,
    yParity: auth.yParity ?? 0,
  };
}

export interface ChargeBundleParams {
  relayerUrl: string;
  chainId: number;
  capabilities: ChainCapabilities;
  /** Already JSON-safe delegations (from `toRelayerJson` or `decodeDelegations` + `toRelayerJson`). */
  permissionContext: unknown[];
  token: { address: Address; decimals: number };
  /** Subscription amount to send to the org (token atoms). */
  workAmount: bigint;
  recipient: Address;
  /** Optional EIP-7702 authorization (first use only, before the EOA is upgraded). */
  authorization?: unknown;
}

/**
 * Charge one period via the 1Shot relayer: estimate the fee, then submit a
 * bundle of [fee transfer → feeCollector, subscription transfer → recipient].
 * No ETH spent by anyone — the relayer is paid in the fee token. Returns the
 * relayer task id. Works with both local-signer delegations and ERC-7715
 * wallet-granted permission contexts.
 */
export async function chargeBundleViaRelayer(params: ChargeBundleParams): Promise<string> {
  const { capabilities: caps, token } = params;

  const buildBundle = (feeAmount: bigint) => ({
    chainId: String(params.chainId),
    ...(params.authorization ? { authorizationList: [params.authorization] } : {}),
    transactions: [
      {
        permissionContext: params.permissionContext,
        executions: [
          {
            target: token.address,
            value: "0",
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "transfer",
              args: [caps.feeCollector, feeAmount],
            }),
          },
          {
            target: token.address,
            value: "0",
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "transfer",
              args: [params.recipient, params.workAmount],
            }),
          },
        ],
      },
    ],
  });

  // 1. Estimate with a mock fee to discover the required payment.
  const mockFee = 10_000n; // 0.01 USDC (6 decimals)
  const first = await rpc<Estimate7710Result>(
    params.relayerUrl,
    "relayer_estimate7710Transaction",
    buildBundle(mockFee),
  );
  if (!first.success) throw new Error(`1Shot estimate failed: ${first.error}`);

  const requiredFee = BigInt(first.requiredPaymentAmount ?? mockFee.toString());
  // 2. Pay with a small buffer (3% + 5000 atoms) to absorb gas-price drift between
  //    estimate and execution, then re-estimate so the price-lock context matches.
  const feeToPay = requiredFee + (requiredFee * 3n) / 100n + 5_000n;
  const second = await rpc<Estimate7710Result>(
    params.relayerUrl,
    "relayer_estimate7710Transaction",
    buildBundle(feeToPay),
  );
  if (!second.success) throw new Error(`1Shot re-estimate failed: ${second.error}`);

  // 3. Send with the buffered fee and the matching price-lock context.
  return rpc<string>(params.relayerUrl, "relayer_send7710Transaction", {
    ...buildBundle(feeToPay),
    context: second.context,
  });
}

export interface ChargeViaRelayerParams {
  relayerUrl: string;
  chainId: number;
  capabilities: ChainCapabilities;
  signedDelegation: Delegation;
  token: { address: Address; decimals: number };
  workAmount: bigint;
  recipient: Address;
  authorization?: unknown;
}

/** Local-signer convenience wrapper around {@link chargeBundleViaRelayer}. */
export async function chargeViaRelayer(params: ChargeViaRelayerParams): Promise<string> {
  return chargeBundleViaRelayer({
    ...params,
    permissionContext: [toRelayerJson(params.signedDelegation)],
  });
}

export interface RelayerStatus {
  status: 100 | 110 | 200 | 400 | 500;
  hash?: Hex;
  receipt?: { transactionHash?: Hex };
  message?: string;
  data?: unknown;
}

export async function getRelayerStatus(url: string, taskId: string): Promise<RelayerStatus> {
  return rpc<RelayerStatus>(url, "relayer_getStatus", { id: taskId, logs: false });
}

/** Poll the relayer until the task reaches a terminal status. */
export async function pollRelayerUntilDone(
  url: string,
  taskId: string,
  opts: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<RelayerStatus> {
  const intervalMs = opts.intervalMs ?? 3000;
  const deadline = Date.now() + (opts.timeoutMs ?? 120_000);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const status = await getRelayerStatus(url, taskId);
    if (status.status === 200 || status.status === 400 || status.status === 500) return status;
    if (Date.now() > deadline) throw new Error(`Timeout waiting for relayer task ${taskId}`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
