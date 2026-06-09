import { useState, type FormEvent } from "react";
import { usePublicClient, useWalletClient } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import {
  getAddress,
  type Account,
  type Address,
  type Chain,
  type PublicClient,
  type Transport,
  type WalletClient,
} from "viem";
import { grantAndChargeViaRelayer } from "./erc7715.js";
import { subscribeHybridViaRelayer } from "./hybrid.js";
import { saveSubscription } from "./store.js";

type Method = "hybrid" | "erc7715";

/**
 * The single subscription flow, charged gaslessly via 1Shot.
 *  - "hybrid": deploy a Hybrid smart account + sign the delegation (EIP-712).
 *    Works with any MetaMask — the production path, no Flask.
 *  - "erc7715": MetaMask Advanced Permissions (ERC-7715) — needs Flask / MM ≥13.23.
 */
export function Subscribe(props: { onCreated: () => void }) {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const [amount, setAmount] = useState("0.1");
  const [recipient, setRecipient] = useState("");
  const [periodDays, setPeriodDays] = useState("30");
  const [method, setMethod] = useState<Method>("hybrid");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!walletClient || !publicClient) {
      setError("Wallet not ready.");
      return;
    }
    try {
      const resolvedRecipient = getAddress(recipient || walletClient.account.address) as Address;
      // wagmi resolves viem from its own peer-dedupe copy; the clients are
      // structurally identical to ours, so re-type them at this boundary.
      const wc = walletClient as unknown as WalletClient<Transport, Chain, Account>;
      const pc = publicClient as unknown as PublicClient;
      const common = {
        walletClient: wc,
        chainId: baseSepolia.id,
        amount,
        recipient: resolvedRecipient,
        periodDays: Number(periodDays),
        onStatus: setStatus,
      };
      const { taskId, txHash } =
        method === "hybrid"
          ? await subscribeHybridViaRelayer({ ...common, publicClient: pc })
          : await grantAndChargeViaRelayer({ ...common, publicClient: pc });

      saveSubscription({
        id: taskId,
        createdAt: new Date().toISOString(),
        amount,
        periodDays: Number(periodDays),
        recipient: resolvedRecipient,
        taskId,
        txHash,
      });
      setStatus(null);
      props.onCreated();
    } catch (err) {
      setError((err as Error).message);
      setStatus(null);
    }
  }

  return (
    <section className="card">
      <h2>New subscription</h2>
      <p className="muted small">
        Recurring USDC subscription. You approve it once; the first charge is relayed
        gaslessly by 1Shot — no ETH needed.
      </p>
      <form className="form" onSubmit={submit}>
        <div className="form__row">
          <label>
            Amount / period (USDC)
            <input value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label>
            Period (days)
            <input value={periodDays} onChange={(e) => setPeriodDays(e.target.value)} />
          </label>
        </div>
        <label>
          Recipient (defaults to you)
          <input placeholder="0x…" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
        </label>
        <label>
          Authorization method
          <select value={method} onChange={(e) => setMethod(e.target.value as Method)}>
            <option value="hybrid">Smart account (any MetaMask)</option>
            <option value="erc7715">Advanced Permissions · ERC-7715 (Flask)</option>
          </select>
        </label>
        <button type="submit" disabled={status != null}>
          Subscribe (gasless via 1Shot)
        </button>
      </form>
      {status && <p className="busy">{status}</p>}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
