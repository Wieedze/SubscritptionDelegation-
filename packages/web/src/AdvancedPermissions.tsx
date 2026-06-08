import { useState, type FormEvent } from "react";
import { usePublicClient, useWalletClient } from "wagmi";
import { sepolia } from "wagmi/chains";
import { getAddress, type Address } from "viem";
import { grantAndChargeViaRelayer } from "./erc7715.js";

/**
 * ERC-7715 Advanced Permissions + 1Shot relayer flow. The user grants a
 * recurring `erc20-token-periodic` permission via MetaMask, and the first
 * period is charged gaslessly through the 1Shot relayer (paid in USDC).
 *
 * Requires a wallet that supports ERC-7715 (MetaMask ≥13.23 or Flask ≥13.5).
 */
export function AdvancedPermissions() {
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const [amount, setAmount] = useState("0.1");
  const [recipient, setRecipient] = useState("");
  const [periodDays, setPeriodDays] = useState("30");
  const [status, setStatus] = useState<string | null>(null);
  const [result, setResult] = useState<{ taskId: string; txHash?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!walletClient || !publicClient) {
      setError("Wallet not ready.");
      return;
    }
    try {
      const out = await grantAndChargeViaRelayer({
        walletClient,
        chainId: sepolia.id,
        amount,
        recipient: getAddress(recipient || walletClient.account.address) as Address,
        periodDays: Number(periodDays),
        onStatus: setStatus,
      });
      setResult(out);
      setStatus(null);
    } catch (err) {
      setError((err as Error).message);
      setStatus(null);
    }
  }

  return (
    <section className="card">
      <h2>Advanced Permissions (ERC-7715) + 1Shot</h2>
      <p className="muted small">
        Grant a recurring USDC permission directly in MetaMask, then charge period one
        gaslessly via the 1Shot relayer. No smart-account deploy, no ETH.
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
        <button type="submit" disabled={status != null}>
          Grant &amp; charge via 1Shot
        </button>
      </form>
      {status && <p className="busy">{status}</p>}
      {error && <p className="error">{error}</p>}
      {result && (
        <p className="muted small">
          ✅ Charged gaslessly. task {result.taskId}
          {result.txHash && (
            <>
              {" · "}
              <a href={`https://sepolia.etherscan.io/tx/${result.txHash}`} target="_blank" rel="noreferrer">
                view tx
              </a>
            </>
          )}
        </p>
      )}
    </section>
  );
}
