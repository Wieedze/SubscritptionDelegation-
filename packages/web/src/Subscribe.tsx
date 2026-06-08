import { useState, type FormEvent } from "react";
import { useWalletClient } from "wagmi";
import { sepolia } from "wagmi/chains";
import { getAddress, type Address } from "viem";
import { grantAndChargeViaRelayer } from "./erc7715.js";
import { saveSubscription } from "./store.js";

/**
 * The single subscription flow: grant a recurring USDC permission (ERC-7715)
 * in MetaMask, then charge period one gaslessly through the 1Shot relayer.
 * No smart-account deploy, no ETH, no bundler.
 */
export function Subscribe(props: { onCreated: () => void }) {
  const { data: walletClient } = useWalletClient();
  const [amount, setAmount] = useState("0.1");
  const [recipient, setRecipient] = useState("");
  const [periodDays, setPeriodDays] = useState("30");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!walletClient) {
      setError("Wallet not ready.");
      return;
    }
    try {
      const resolvedRecipient = getAddress(recipient || walletClient.account.address) as Address;
      const { taskId, txHash } = await grantAndChargeViaRelayer({
        walletClient,
        chainId: sepolia.id,
        amount,
        recipient: resolvedRecipient,
        periodDays: Number(periodDays),
        onStatus: setStatus,
      });
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
        Recurring USDC subscription. You approve a periodic permission in MetaMask
        (ERC-7715); the first charge is relayed gaslessly by 1Shot — no ETH needed.
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
          Subscribe (gasless via 1Shot)
        </button>
      </form>
      {status && <p className="busy">{status}</p>}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
