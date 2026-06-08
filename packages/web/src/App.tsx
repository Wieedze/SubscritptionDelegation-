import { useCallback, useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { sepolia } from "wagmi/chains";
import { Subscribe } from "./Subscribe.js";
import { listSubscriptions, removeSubscription, type RelayedSubscription } from "./store.js";
import { shortAddr } from "./lib.js";

export function App() {
  const { address, isConnected, chainId } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [subs, setSubs] = useState<RelayedSubscription[]>([]);

  const refresh = useCallback(() => setSubs(listSubscriptions()), []);
  useEffect(refresh, [refresh]);

  const wrongChain = isConnected && chainId !== sepolia.id;

  return (
    <main className="app">
      <header className="app__header">
        <h1>safe-subscriptions</h1>
        <p className="muted">
          Gasless recurring USDC subscriptions · MetaMask Smart Accounts (ERC-7715) + 1Shot · Sepolia
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
        {wrongChain && <p className="warn">Switch your wallet to Sepolia (chainId {sepolia.id}).</p>}
      </section>

      {isConnected && !wrongChain && <Subscribe onCreated={refresh} />}

      <section className="card">
        <h2>Subscriptions</h2>
        {subs.length === 0 ? (
          <p className="muted">No subscriptions yet.</p>
        ) : (
          <ul className="list">
            {subs.map((s) => (
              <li key={s.id} className="list__item">
                <div className="list__main">
                  <strong>
                    {s.amount} USDC
                  </strong>{" "}
                  every {s.periodDays} days
                  <div className="muted small">to {shortAddr(s.recipient)}</div>
                  {s.txHash && (
                    <div className="muted small">
                      first charge:{" "}
                      <a
                        href={`https://sepolia.etherscan.io/tx/${s.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {shortAddr(s.txHash)}
                      </a>{" "}
                      <span title="paid in USDC by 1Shot — no ETH">· gasless</span>
                    </div>
                  )}
                </div>
                <button
                  className="danger"
                  onClick={() => {
                    removeSubscription(s.id);
                    refresh();
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
