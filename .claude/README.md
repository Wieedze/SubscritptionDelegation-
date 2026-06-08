# Claude operating layer — safe-subscriptions

Procedural knowledge, rules and review agents for this repo. Adapted from ARP,
keeping only what's relevant to a MetaMask Delegation Toolkit project (Intuition /
ModuleRegistry-specific material was dropped).

## skills/
- `mms-smart-accounts-kit/` — MetaMask Smart Accounts Kit / Delegation Framework reference (ERC-4337, ERC-7710, ERC-7715, caveats). **Primary reference for this repo.**
- `mms-gator-cli/` — gator CLI for init / grant / redeem / revoke delegations.

## rules/
- `00-INDEX.md` — routing table.
- `code.md` — TS/JS standards (separation of concerns, no `any`, strict).
- `solidity.md` — Solidity 0.8.24, NatSpec, custom errors (for `contracts/`).
- `security.md` — threat-model checklist.
- `metamask-delegation.md` — ERC-7710 delegation rules and patterns.
- `ui.md` — typography-driven, dark-first UI discipline (for `packages/web`).
- `workflow.md` — scope discipline, git hygiene, communication.

## agents/
- `task-verifier.md` — end-of-task verification.
- `contract-reviewer.md` — Solidity security review.
- `ui-reviewer.md` — UI design + quality review.

## learning/ · choices/
Empty except `TEMPLATE.md` + `README.md`. Add post-mortems and ADRs as the project
evolves.
