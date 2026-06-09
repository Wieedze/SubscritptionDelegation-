# Production architecture — recurring subscriptions across account types

This document captures the architecture for a **production** subscription product,
derived from what we verified building the POC. The central finding:

> **There is no single "subscription manager" that works identically for every
> account type.** EOAs, MetaMask smart accounts, and Safes each need a different
> integration rail. Production = a manager with **per-account-type adapters** behind
> one interface.

## The constraint that drives everything

A subscription = "let an org pull at most X per period, bounded on-chain, with one
user approval." To pull from an account, that account must be a **smart contract
account** (an EOA can't enforce caveats or be redeemed against). How an account
becomes "smart" — and how the pull is authorized — differs by account type.

### What we verified

- **EOA → Hybrid smart account works in any browser.** The EOA controls a deployed
  Hybrid DeleGator; it signs delegations as **EIP-712 typed data**, which production
  MetaMask signs without issue. **1Shot accepts Hybrid (non-7702) delegators.** ✅
- **EOA → EIP-7702 does NOT work from the browser.** `viem`'s `signAuthorization`
  rejects JSON-RPC (MetaMask) accounts, and MetaMask doesn't expose programmatic
  7702 authorization signing. The 7702 path only works with a **local private key**
  (backend/CLI) or via **MetaMask Flask + ERC-7715** — and **Flask is not for
  production** (it warns against real funds).
- **A Safe cannot be 7702-upgraded** (7702 only applies to EOAs — accounts with no
  code; a Safe already has code) and **cannot be a delegator** in the MetaMask
  framework (it doesn't implement the DeleGator execution interface, even with
  ERC-1271). A Safe integrates via a **Safe module**.

## The rails (one per account type)

| Subscriber account | "Make it smart" | Authorize the pull | Gasless execution |
|---|---|---|---|
| **EOA** (MetaMask, Privy, …) | Deploy a **Hybrid DeleGator** (one tx) | EOA signs an `erc20PeriodTransfer` **delegation** (EIP-712) | **1Shot relayer** (fee in USDC) |
| **MetaMask Smart Account** | already smart (or EIP-7702 via MetaMask) | **ERC-7715** `erc20-token-periodic` permission, or native delegation | 1Shot relayer |
| **Safe** (safe.global) | already smart | Install a **Safe module** (allowance / custom subscription module); owners sign once (ERC-1271) | A **keeper** calls the module's pull each period |

The first two share the **delegation rail** (DeleGator + caveat enforcer +
relayer). The Safe uses a **module rail** (native Safe extensibility + keeper). They
are genuinely different mechanisms — don't try to force a Safe into the delegation
framework.

## Target architecture

```
                       ┌─────────────────────────┐
   App / API  ───────▶ │   SubscriptionManager    │   one interface:
                       │  create / charge / revoke │   { createSubscription, charge, revoke, status }
                       └───────────┬──────────────┘
                                   │ routes by account type
                 ┌─────────────────┼──────────────────┐
                 ▼                                     ▼
       ┌───────────────────┐                 ┌────────────────────┐
       │ DelegationAdapter  │                 │  SafeModuleAdapter  │
       │ (EOA + MM accounts)│                 │  (Safe accounts)    │
       ├───────────────────┤                 ├────────────────────┤
       │ • deploy Hybrid or │                 │ • enable module     │
       │   ERC-7715 grant   │                 │ • setAllowance      │
       │ • erc20PeriodXfer   │                 │ • executeAllowance  │
       │   caveat (on-chain) │                 │   Transfer (keeper) │
       │ • redeem via 1Shot  │                 │                     │
       └─────────┬──────────┘                 └─────────┬──────────┘
                 ▼                                       ▼
          1Shot relayer                         Keeper / cron (or 1Shot,
          (gasless, USDC fee)                   if the module call is relayed)
```

**Common interface** (sketch):

```ts
interface SubscriptionAdapter {
  // returns what the user must sign/do to start the subscription
  createSubscription(p: SubscriptionParams): Promise<SubscriptionRecord>;
  // pull one period; idempotent within a period (caveat / allowance reset)
  charge(record: SubscriptionRecord): Promise<ChargeResult>;
  revoke(record: SubscriptionRecord): Promise<void>;
}
```

The `SubscriptionManager` detects the subscriber's account type (EOA vs Safe vs MM
smart account) and dispatches to the matching adapter. The **terms** (human-readable
contract, pinned to IPFS, hash bound into the authorization) are adapter-agnostic
and live at the manager level.

## On gasless execution

- **Delegation rail**: the org never needs ETH — 1Shot redeems the delegation and
  takes its fee in USDC. The subscriber's smart account holds the USDC; the org
  receives the subscription amount. (On Sepolia the fee is gas-priced in USDC and
  spikes; on mainnet/L2 it's cents.)
- **Safe-module rail**: `executeAllowanceTransfer` is a normal tx — a keeper pays
  gas, or it too can be relayed. The Safe Allowance Module is audited and native.

## What the POC implements vs. what production adds

| | POC (this repo) | Production additions |
|---|---|---|
| EOA delegation rail | ✅ Hybrid deploy + 1Shot gasless charge | recurring charge scheduler, retries, dunning |
| ERC-7715 rail | ✅ (Flask) | wait for production MetaMask 7715 GA |
| Safe-module rail | ❌ (pivoted away for the hackathon) | `SafeModuleAdapter` using the Allowance Module + keeper |
| Manager + adapters | single delegation path | the dispatcher + the two adapters above |
| Terms / IPFS | ✅ pinned, hash bound to salt | versioning, dispute reference |
| Storage | local JSON / localStorage | backend, indexer, webhook receiver (1Shot Ed25519) |

## Recommended roadmap

1. **Ship the delegation rail** (EOA → Hybrid → 1Shot) — done in the POC, the
   broadest reach, no Flask. This is the default for mainstream users.
2. **Add ERC-7715** as the premium MetaMask path once 7715 is GA in production
   MetaMask (drops the deploy step — MetaMask manages the smart account).
3. **Add the `SafeModuleAdapter`** for orgs/treasuries on Safe (the KICKOFF's
   original Allowance-Module design — it was the right rail for Safes all along).
4. **Wrap both in `SubscriptionManager`** with account-type detection + a keeper for
   the module rail and the relayer for the delegation rail.
