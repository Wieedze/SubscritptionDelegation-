import { useCallback, useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect, usePublicClient, useWalletClient } from "wagmi";
import { sepolia } from "wagmi/chains";
import { getAddress, parseUnits, type Address } from "viem";
import {
  createSmartAccountFromWallet,
  createSubscription,
  deploySmartAccount,
  getEnvironment,
  offlinePinner,
  pinataPinner,
  revokeSubscription,
  type SubscriptionRecord,
} from "@safe-subscriptions/core";
import { localStore } from "./store.js";
import { BUNDLER_URL, MINTABLE_ABI, PINATA_JWT, readToken, shortAddr } from "./lib.js";
import { CreateForm, type CreateFormValues } from "./CreateForm.js";
import { SubscriptionList } from "./SubscriptionList.js";

export function App() {
  const { address, isConnected, chainId } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [records, setRecords] = useState<SubscriptionRecord[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRecords(await localStore.all());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onCreate = useCallback(
    async (values: CreateFormValues) => {
      setError(null);
      if (!publicClient || !walletClient) {
        setError("Wallet not ready.");
        return;
      }
      try {
        const smartAccount = await createSmartAccountFromWallet({
          client: publicClient,
          walletClient,
        });
        const token = await readToken(publicClient, getAddress(values.tokenAddress) as Address);

        // 1. Deploy the smart account if needed (the connected wallet pays gas).
        const deployTx = await deploySmartAccount(smartAccount, walletClient);
        if (deployTx) {
          setBusy("Deploying your smart account — confirm tx 1/3…");
          await publicClient.waitForTransactionReceipt({ hash: deployTx });
        }

        // 2. Fund the smart account so it can be charged (3 periods of headroom).
        const prefundRaw = parseUnits(
          (Number(values.amount) * 3).toString(),
          token.decimals,
        );
        setBusy("Funding your smart account with test tokens — confirm tx 2/3…");
        const mintTx = await walletClient.writeContract({
          account: walletClient.account,
          chain: walletClient.chain,
          address: token.address,
          abi: MINTABLE_ABI,
          functionName: "mint",
          args: [smartAccount.address, prefundRaw],
        });
        await publicClient.waitForTransactionReceipt({ hash: mintTx });

        // 3. Sign the delegation (signature, not a tx).
        setBusy("Sign the subscription delegation — confirm 3/3…");
        const record = await createSubscription({
          environment: getEnvironment(),
          chainId: sepolia.id,
          subscriberSmartAccount: smartAccount,
          organization: {
            name: values.orgName || "Organization",
            delegate: getAddress(values.delegate) as Address,
            recipient: getAddress(values.recipient || values.delegate) as Address,
          },
          subscriberLabel: "web subscriber",
          token,
          amountPerPeriod: values.amount,
          periodSeconds: Math.round(Number(values.periodDays) * 86400),
          pin: PINATA_JWT ? pinataPinner(PINATA_JWT) : offlinePinner(),
        });
        await localStore.save(record);
        await refresh();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(null);
      }
    },
    [publicClient, walletClient, refresh],
  );

  const onRevoke = useCallback(
    async (record: SubscriptionRecord) => {
      setError(null);
      if (!publicClient || !walletClient) return;
      if (!BUNDLER_URL) {
        setError("Set VITE_BUNDLER_URL to enable on-chain revocation.");
        return;
      }
      setBusy("Revoking — confirm the user operation in your wallet…");
      try {
        const smartAccount = await createSmartAccountFromWallet({
          client: publicClient,
          walletClient,
        });
        await revokeSubscription({
          client: publicClient,
          subscriberSmartAccount: smartAccount,
          environment: getEnvironment(),
          bundlerUrl: BUNDLER_URL,
          record,
        });
        await localStore.remove(record.id);
        await refresh();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(null);
      }
    },
    [publicClient, walletClient, refresh],
  );

  const wrongChain = isConnected && chainId !== sepolia.id;

  return (
    <main className="app">
      <header className="app__header">
        <h1>safe-subscriptions</h1>
        <p className="muted">
          Recurring ERC20 subscriptions via MetaMask Delegation Toolkit · Sepolia
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
            <span>Connect a wallet to create a subscription.</span>
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

      {busy && <p className="busy">{busy}</p>}
      {error && <p className="error">{error}</p>}

      {isConnected && !wrongChain && (
        <section className="card">
          <h2>New subscription</h2>
          <CreateForm onSubmit={onCreate} disabled={busy != null} />
        </section>
      )}

      <section className="card">
        <h2>Subscriptions</h2>
        <SubscriptionList records={records} onRevoke={onRevoke} canRevoke={Boolean(BUNDLER_URL)} />
      </section>
    </main>
  );
}
