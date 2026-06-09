import { useCallback, useEffect, useState } from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  usePublicClient,
  useWalletClient,
} from "wagmi";
import { baseSepolia } from "wagmi/chains";
import {
  type Account,
  type Chain,
  type PublicClient,
  type Transport,
  type WalletClient,
} from "viem";
import { ipfsToHttp } from "@safe-subscriptions/core";
import { Subscribe } from "./Subscribe.js";
import { listSubscriptions, removeSubscription, type RelayedSubscription } from "./store.js";
import { canRevoke, revokeSubscriptionOnChain } from "./revoke.js";
import { shortAddr } from "./lib.js";

export function App() {
  const { address, isConnected, chainId } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const [subs, setSubs] = useState<RelayedSubscription[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => setSubs(listSubscriptions()), []);
  useEffect(refresh, [refresh]);

  const wrongChain = isConnected && chainId !== baseSepolia.id;

  async function revoke(s: RelayedSubscription) {
    setError(null);
    if (!s.delegation) return;
    if (!walletClient || !publicClient) {
      setError("Wallet not ready.");
      return;
    }
    setBusyId(s.id);
    try {
      const wc = walletClient as unknown as WalletClient<Transport, Chain, Account>;
      const pc = publicClient as unknown as PublicClient;
      const txHash = await revokeSubscriptionOnChain({
        walletClient: wc,
        publicClient: pc,
        delegation: s.delegation,
        onStatus: setStatus,
      });
      console.info("revoked, tx:", txHash);
      removeSubscription(s.id);
      refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
      setStatus(null);
    }
  }

  return (
    <main className="app">
      <header className="app__header">
        <h1>safe-subscriptions</h1>
        <p className="muted">
          Gasless recurring USDC subscriptions · MetaMask Smart Accounts (ERC-7715) + 1Shot · Base Sepolia
        </p>
      </header>

      <section className="card">
        {isConnected ? (
          <div className="row">
            <span>
              Connected <strong>{shortAddr(address!)}</strong>
            </span>
            <button onClick={() => disconnect()}>Disconnect</button>
          </div>
        ) : (
          <div className="row">
            <span>Connect a wallet to subscribe.</span>
            <div className="connectors">
              {connectors.map((c) => (
                <button key={c.uid} onClick={() => connect({ connector: c })} disabled={isPending}>
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {wrongChain && <p className="warn">Switch your wallet to Base Sepolia (chainId {baseSepolia.id}).</p>}
      </section>

      {isConnected && !wrongChain && <Subscribe onCreated={refresh} />}

      <section className="card">
        <h2>Subscriptions</h2>
        {status && <p className="busy">{status}</p>}
        {error && <p className="error">{error}</p>}
        {subs.length === 0 ? (
          <p className="muted">No subscriptions yet.</p>
        ) : (
          <ul className="list">
            {subs.map((s) => (
              <li key={s.id} className="list__item">
                <div className="list__main">
                  <strong>{s.amount} USDC</strong> every {s.periodDays} days
                  <div className="muted small">
                    to {shortAddr(s.recipient)}
                    {s.smartAccount && <> · from {shortAddr(s.smartAccount)}</>}
                  </div>
                  {s.agreement && (
                    <div className="muted small">
                      contract:{" "}
                      {s.agreement.uri.startsWith("ipfs://local-") ? (
                        <span title={s.agreement.termsHash}>offline ({s.agreement.cid})</span>
                      ) : (
                        <a
                          href={ipfsToHttp(s.agreement.uri)}
                          target="_blank"
                          rel="noreferrer"
                          title={`terms hash ${s.agreement.termsHash}`}
                        >
                          {s.agreement.uri}
                        </a>
                      )}
                    </div>
                  )}
                  {s.txHash && (
                    <div className="muted small">
                      first charge:{" "}
                      <a
                        href={`https://sepolia.basescan.org/tx/${s.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {shortAddr(s.txHash)}
                      </a>{" "}
                      <span title="paid in USDC by 1Shot — no ETH">· gasless</span>
                    </div>
                  )}
                </div>
                {s.delegation && canRevoke ? (
                  <button
                    className="danger"
                    disabled={busyId != null}
                    title="Disable the delegation on-chain — the org can no longer charge"
                    onClick={() => revoke(s)}
                  >
                    {busyId === s.id ? "Revoking…" : "Revoke"}
                  </button>
                ) : (
                  <button
                    className="danger"
                    disabled={busyId != null}
                    title="Remove from this list (no on-chain effect)"
                    onClick={() => {
                      removeSubscription(s.id);
                      refresh();
                    }}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
