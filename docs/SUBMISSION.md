# safe-subscriptions — Hackathon submission

**MetaMask Smart Accounts Kit × 1Shot API × Venice AI Dev Cook-Off**

## One-liner

Recurring crypto subscriptions where the subscriber signs **once** and is charged
every period **gaslessly** — no ETH, no bundler, no paymaster — via MetaMask Smart
Accounts, ERC-7715 Advanced Permissions, and the 1Shot permissionless relayer.

## The problem

Crypto has no clean recurring-payment primitive. Card subscriptions rely on a
trusted processor pulling funds; on-chain, you either pre-pay, hold a session key,
or sign every charge. Subscribers also need native gas to transact, which is a
non-starter for mainstream users.

`safe-subscriptions` solves both:

- **One signature, bounded forever.** The subscriber grants a *periodic* permission
  (`erc20-token-periodic`): "at most X USDC per N days." The cap and reset are
  enforced **on-chain** by the `ERC20PeriodTransferEnforcer` — the org can never
  pull more than agreed, and can't double-charge a period.
- **No ETH, ever.** Charges are relayed by 1Shot and paid in **USDC**. The
  subscriber never holds or spends native gas.

## How it uses each track

### MetaMask Smart Accounts Kit (qualifying)
`@metamask/smart-accounts-kit@1.6.0` is the spine of the app:
- **Smart Accounts**: Hybrid DeleGator (local-signer flow) and **EIP-7702**
  stateless delegator (relayed flow).
- **Delegations (ERC-7710)**: the subscription is an `erc20PeriodTransfer`-scoped
  delegation; the on-chain caveat is the recurring cap.
- It's in the **main flow** — creating/charging a subscription *is* the kit.

### ERC-7715 Advanced Permissions
The web app's primary flow: the user approves a recurring `erc20-token-periodic`
permission **directly in MetaMask** via `requestExecutionPermissions`. No custom
smart-account deploy — MetaMask owns the permission UX.

### 1Shot API (gas abstraction)
Every charge is a `[fee → feeCollector, amount → org]` bundle submitted to the
**1Shot permissionless relayer** (`relayer_estimate7710Transaction` /
`relayer_send7710Transaction`). 1Shot redeems the delegation on-chain and is paid
in **USDC** — the subscriber spends **0 ETH**. EOAs are upgraded to smart accounts
via **EIP-7702** inline, in the same bundle.

### Venice AI (optional / future)
Not used in this submission. Natural extension: an agent that monitors and manages
a user's subscriptions (cancel unused, summarize spend) within the same bounded
delegation.

## Architecture

```
Subscriber EOA ──(EIP-7702)──▶ Smart Account (delegator)
   │  signs ONE periodic permission (ERC-7715) / delegation (ERC-7710)
   │  scope: erc20PeriodTransfer(USDC, periodAmount, periodDuration)  → to 1Shot targetAddress
   ▼
Each period: app submits [fee→feeCollector, amount→org] to the 1Shot relayer
   ▼
1Shot redeems on-chain (pays ETH gas) and takes its fee in USDC
   ▼
Org receives the subscription amount · subscriber spends 0 ETH
```

- `packages/core` — runtime-agnostic TS (smart accounts, delegations, terms+IPFS, relayer client).
- `packages/web` — React + wagmi; single ERC-7715 + 1Shot gasless flow.
- `scripts/relayed.ts` — CLI demo of the gasless charge.
- `contracts` — Foundry `MockERC20` (for the non-USDC reference flow).

## Demo video script (~2 min)

1. **Hook (10s)** — "Recurring crypto subscriptions, one signature, and the user
   never needs ETH." Show the app.
2. **Connect (10s)** — Connect MetaMask (Sepolia).
3. **Subscribe (40s)** — Enter `0.1 USDC / 30 days` + recipient. Click *Subscribe*.
   MetaMask shows the **ERC-7715 periodic permission** prompt — approve it.
   Narrate: "This is the only signature. It's bounded: max 0.1 USDC per 30 days,
   enforced on-chain."
4. **Gasless charge (30s)** — The app charges period one via **1Shot**. Show the
   result: subscription listed, **"gasless"** badge, Etherscan tx link.
5. **Proof (20s)** — Open Etherscan: USDC moved to the org, **subscriber's ETH
   balance unchanged** (1Shot paid the gas). EOA shows the `0xef0100…` 7702 code.
6. **Close (10s)** — "MetaMask Smart Accounts for the permission, ERC-7715 for the
   UX, 1Shot for gasless execution. One signature, recurring, no ETH."

> CLI fallback (no Flask needed): `bun scripts/relayed.ts <recipient>`.

## On-chain proof (Sepolia)

- **Subscriber smart account (EIP-7702)**: `0xECB6a332E3cd8fc1eC9EAFF1d3e08F4e7807b003`
  — upgraded to `7702StatelessDelegator` (`0xef0100…` code).
  https://sepolia.etherscan.io/address/0xECB6a332E3cd8fc1eC9EAFF1d3e08F4e7807b003
- **Gasless charges verified**: USDC fee paid to 1Shot's feeCollector, subscription
  amount delivered, **subscriber ETH balance unchanged across charges**.
- **1Shot relayer (Sepolia)**: `https://relayer.1shotapi.dev/relayers`,
  targetAddress `0x02c9979a75fbdbc3a77485024ab8b6474308591e`, fee token USDC
  `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`.

## Run it

```bash
bun install
cp .env.example .env          # RPC + a test key
# Fund the test EOA with Sepolia USDC: https://faucet.circle.com
bun scripts/relayed.ts        # gasless charge via 1Shot
# or the web app (needs MetaMask Flask for ERC-7715):
bun run --filter @safe-subscriptions/web dev
```

## Tech stack

TypeScript · `@metamask/smart-accounts-kit` 1.6 · `viem` 2.52 · React + wagmi ·
Foundry · 1Shot public relayer · Pinata (IPFS terms). Sepolia.
