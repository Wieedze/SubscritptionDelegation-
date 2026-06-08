# safe-subscriptions

Recurring crypto subscriptions on **Sepolia** using the **MetaMask Delegation
Toolkit** (ERC-7710 / ERC-4337).

A subscriber's **smart account** (Hybrid DeleGator, controlled by an EOA) signs a
single **delegation** that lets an **organization** pull a fixed ERC20 amount each
period. The recurring cap is enforced on-chain by the **`erc20PeriodTransfer`**
caveat (max amount per period, auto-reset). The human-readable **terms** are pinned
to **IPFS**, and `keccak256(terms)` is used as the delegation salt, so the
subscriber's signature commits on-chain to the exact pinned terms.

> See [KICKOFF.md](./KICKOFF.md) for the concept .

## Layout

| Path | What |
|---|---|
| [packages/core](./packages/core) | Runtime-agnostic TS: smart account, terms, IPFS, create/charge/revoke, storage |
| [contracts](./contracts) | Foundry `MockERC20` (open-mint test token) + deploy script |
| [scripts](./scripts) | CLI demo: `create.ts` (subscriber), `charge.ts` (org cron), `revoke.ts` |
| [packages/web](./packages/web) | React + wagmi UI |

## Prerequisites

- Node ≥ 20 and [bun](https://bun.sh)
- [Foundry](https://book.getfoundry.sh) (`forge`)
- A Sepolia RPC URL and some Sepolia ETH (faucet) on the org + subscriber EOAs
- *(optional)* A [Pinata](https://pinata.cloud) JWT to pin terms to real IPFS
- *(optional)* An ERC-4337 bundler URL for revocation

## Setup

```bash
bun install
cp .env.example .env   # then fill it in
```

Key `.env` vars (see [.env.example](./.env.example)):

| Var | Meaning |
|---|---|
| `RPC_URL` | Sepolia RPC |
| `SUBSCRIBER_PRIVATE_KEY` | EOA that owns the subscriber's smart account |
| `ORG_PRIVATE_KEY` | EOA that redeems (the delegate) |
| `ORG_RECIPIENT` | Where pulled tokens land (defaults to the org EOA) |
| `TOKEN_ADDRESS` | MockERC20 address (filled after deploy) |
| `PINATA_JWT` | *(optional)* real IPFS pinning; falls back to an offline pinner |
| `BUNDLER_URL` | *(optional)* required only for `revoke.ts` |

> ⚠️ Never commit real keys. The `.env` is gitignored.

## 1. Deploy the test token

```bash
cd contracts
forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$RPC_URL" --broadcast --private-key "$ORG_PRIVATE_KEY"
```

Copy the deployed `MockERC20` address into `TOKEN_ADDRESS` in `.env`.

## 2. Create a subscription (subscriber side)

```bash
bun scripts/create.ts 10        # 10 tokens / 30-day period
```

This deploys the subscriber's smart account (direct factory call), mints test
tokens to it, builds + pins the agreement, then creates and signs the
`erc20PeriodTransfer` delegation, and stores the record in `data/subscriptions.json`.

## 3. Charge due subscriptions (organization "cron")

```bash
bun scripts/charge.ts           # sweep all; or: bun scripts/charge.ts <id>
```

The org EOA sends a plain tx to the DelegationManager and pulls the period amount.
Running it again within the same period is a **no-op** — the caveat refuses a
second pull until the next period.

## 4. Revoke (subscriber side)

```bash
BUNDLER_URL=... bun scripts/revoke.ts <id>
```

Sends `disableDelegation` as a user operation from the smart account (needs a
bundler + a little ETH in the smart account). Afterwards any `charge` reverts with
`CannotUseADisabledDelegation`.

## Web UI

```bash
bun run --filter @safe-subscriptions/web dev
```

## How the on-chain binding works

- The subscription cap is the **`erc20PeriodTransfer`** caveat synthesized from the
  delegation `scope` (`tokenAddress`, `periodAmount`, `periodDuration`, `startDate`).
- An optional **`timestamp`** caveat enforces an end date when set.
- The delegation **salt** is `keccak256(terms)`. Since the EIP-712 signature covers
  the salt, the subscriber's signature is bound to the exact terms pinned on IPFS —
  tampering with the terms changes the hash and invalidates the link.

## Notes / limits (POC)

- Single chain: Sepolia. ERC20 only (native tokens aren't pullable via allowance).
- Storage is a local JSON file (CLI) / localStorage (web) — no backend.
- Revocation requires a bundler; charging does not.
- `MockERC20` is open-mint and **not** production-safe.
