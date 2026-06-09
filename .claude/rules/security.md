# Security rules

Load for every task that touches a contract, an admin-callable function, or handling of value. This POC moves real ERC20 value under delegated authority — it must obey production-grade security discipline.

## Threat model checklist

Walk through each item for every contract change. Document the result (clean pass or mitigation) in `contracts/SECURITY_REVIEW.md`.

### Reentrancy
- List every external call in the change.
- For each: confirm checks-effects-interactions order, or document why reentrancy is structurally impossible (no external calls, no callbacks).

### Access control
- Every state-changing function: who can call it? Is the restriction enforced explicitly (modifier, require, custom error)?
- Owner functions: is ownership transferable? Renounceable? Is the choice deliberate?
- Permissionless functions: is `msg.sender` the right binding for whatever identity matters?

### Integer arithmetic
- Solidity 0.8+ reverts on over/underflow — confirm we're not using `unchecked` blocks unless necessary and documented.
- Division by zero: where can it occur?
- Loss of precision: is there a division before multiplication anywhere?

### Input validation
- Every external function validates every input parameter. No "trusted caller" assumptions.
- String length bounds are explicit.
- Address parameters are checked for zero address where zero would be invalid.

### Front-running / MEV
- Is the order of transactions observable + exploitable? A subscription charge is bounded by the `erc20PeriodTransfer` caveat (a fixed cap per period), so reordering charges cannot extract more than the cap.
- Any auction-like mechanic must be reviewed against the global `secure-workflow-guide` MEV section.

### Signature replay
- This project **does** use signatures: the subscription is an EIP-712 delegation signed by the subscriber. Replay protection comes from the Delegation Framework's EIP-712 domain (chainId + the `DelegationManager` as verifying contract) plus the delegation `salt`/nonce. The salt is `keccak256(terms)`, binding the signature to the exact pinned agreement.
- Any new signed payload must include chainId + verifying contract + a nonce or unique salt. Never reuse a delegation signature across chains or across distinct terms.

### Oracles / external data
- The MVP does not depend on oracles. If a future task introduces one, document the failure mode if the oracle is stale or wrong.

### DoS via unbounded loops
- Any loop in the contract has a constant bound or a documented external invariant.
- View functions returning dynamic arrays document the off-chain consumer cost.

### Upgradeability
- The MVP is not upgradeable. Confirm no proxy patterns, no `delegatecall` to user-controlled targets.

### Events
- Every state change emits an event. Confirm no silent writes by grepping for state mutations and pairing each with an `emit`.

## Skills to invoke

When the threat model identifies something non-trivial, escalate to the matching Trail of Bits skill:

| Concern | Skill |
|---|---|
| Initial overview before changes | `secure-workflow-guide` (global) |
| Best-practice patterns | `guidelines-advisor` (global) |
| Final scorecard before deployment | `code-maturity-assessor` (global) |
| If a token integration appears | `token-integration-analyzer` (global) |
| Pre-audit prep at end of milestone | `audit-prep-assistant` (global) |

The `contract-reviewer` agent (in `.claude/agents/`) orchestrates these for you on contract changes.

## Operational security

- Never commit `.env`, private keys, or RPC URLs containing API keys.
- Deployment secrets live in the user's local `.env`, never in the repo.
- The `Deployer` script reads from env and fails loudly if a required key is missing — no silent fallbacks.

## Deployment posture

- Deployment targets: the **CLI / `packages/core` flows run on Sepolia**; the **web app runs on Base Sepolia**. Both are L2/testnets — never assume one chain for everything (see `chain.ts` for CLI/core, `wagmi.ts` for web).
- Mainnet deployment of any kind requires explicit user confirmation per session and is out of scope for this POC.
- The only deployable contract is `MockERC20`; paste its address into `TOKEN_ADDRESS` in `.env` after `forge script Deploy`. There is no `deployments/` registry.
- `.env.example` documents the required RPC URLs, keys, and `TOKEN_ADDRESS`. Update it whenever a new env var is introduced.
