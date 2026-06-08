# safe-subscriptions — Kickoff

Abonnements crypto récurrents : un **Gnosis Safe** autorise une **organisation** à
prélever un montant ERC20 fixe **chaque mois**, via le **Safe Allowance Module**.
Le JSON d'accord (`subscription-agreement.example.json`) porte **les termes du
contrat entre l'organisation et l'abonné** — le on-chain ne fait qu'appliquer le
caveat (montant max par période).

---

## Le concept

- L'abonné = un **Safe**. L'organisation = un **delegate** (adresse qui encaisse).
- Les owners du Safe signent UNE fois : activation du module + `setAllowance`.
- Le « caveat » = l'allowance avec **reset mensuel** (`resetTimeMin = 43200`).
- L'orga appelle `executeAllowanceTransfer` chaque mois → prélèvement plafonné.
- Révocation à tout moment : `removeAllowance` / `removeDelegate`.

Le **JSON** = les termes lisibles (qui, quoi, combien, quand, conditions
d'annulation) + le hash des termes figés + la **signature ERC-1271** du Safe.
Voir `subscription-agreement.example.json`.

---

## ⚠️ Pourquoi le Safe Allowance Module (et pas les caveats ERC-7710)

Le MetaMask Delegation Toolkit attend un delegator « DeleGator » (signature EOA
ECDSA). Un **Safe signe en ERC-1271** (signatures owners collectées) → pas
compatible out of the box. Le **Safe Allowance Module** est le primitif natif,
audité, qui fait exactement « allowance + reset périodique + pull par un delegate ».

---

## Prérequis

**Env**
- Node ≥ 20 + bun
- Sepolia, RPC (Alchemy/Infura), faucet ETH + un ERC20 de test
- Un Safe de test déployé sur Sepolia (app.safe.global ou Safe SDK), ≥ 1 owner contrôlé

**Module**
- Safe Allowance Module (adresse Sepolia à mettre dans le README)
- `addDelegate`, `setAllowance(delegate, token, amount, resetTimeMin, resetBaseMin)`,
  `executeAllowanceTransfer`, `removeAllowance`, `removeDelegate`

**Libs**
| Lib | Rôle |
|---|---|
| `@safe-global/protocol-kit` | activer le module, signer/exécuter (ERC-1271, multi-owner) |
| `@safe-global/api-kit` | proposer/collecter les signatures owners |
| `viem` | RPC, encodage, lecture allowances |
| `react` + `vite` + `wagmi` | front |

**À savoir**
- Le Safe signe en ERC-1271 via le Protocol Kit (pas de signature EOA directe)
- `resetTimeMin` en minutes : 43200 ≈ 30 jours
- Le delegate qui prélève peut être un EOA simple

---

## Architecture cible

```
safe-subscriptions/
├── subscription-agreement.example.json   # termes du contrat orga <-> abonné
├── packages/
│   ├── core/
│   │   ├── enableModule.ts          # active l'Allowance Module sur le Safe
│   │   ├── createSubscription.ts    # addDelegate + setAllowance, build le JSON
│   │   ├── signAndExecute.ts        # Protocol Kit : propose -> collecte -> exécute
│   │   ├── charge.ts                # executeAllowanceTransfer (prélèvement du mois)
│   │   └── storage.ts               # persiste les JSON d'accord
│   └── web/                         # React: créer / lister / révoquer
└── scripts/
    └── charge.ts                    # cron du service : prélève les abonnements dus
```

---

## Prompt à coller dans une session Claude Code (dossier safe-subscriptions/)

```text
Construis "safe-subscriptions" : abonnements crypto récurrents où un Gnosis Safe
autorise une organisation à prélever un montant ERC20 fixe chaque mois, via le
Safe Allowance Module. Le fichier subscription-agreement.example.json (déjà présent)
définit le format du contrat orga<->abonné : respecte-le.

OBJECTIF
Les owners du Safe signent UNE fois (activation module + setAllowance). Grâce à
l'allowance avec reset mensuel (le "caveat"), l'organisation prélève le montant dû
tous les 30 jours, plafonné par le module. Révocation via removeAllowance.

STACK
- bun + TypeScript + Vite + React + wagmi
- @safe-global/protocol-kit, @safe-global/api-kit, viem
- Réseau: Sepolia. RPC: Alchemy. Safe de test déjà déployé.

LIVRABLES
1. packages/core :
   - enableModule(safe)
   - createSubscription(delegate, token, monthlyAmount) -> addDelegate +
     setAllowance(amount, resetTimeMin=43200) ; génère le JSON d'accord conforme
     à subscription-agreement.example.json (avec agreedTermsHash = keccak256(terms)).
   - signAndExecute() via Protocol Kit (ERC-1271 + collecte signatures owners)
   - charge(subscription) -> executeAllowanceTransfer
   - storage.ts (localStorage pour le POC)
2. packages/web : connexion + sélection Safe ; formulaire créer un abonnement ;
   liste (allowance restante, prochain reset, révoquer) ; affichage/export du JSON.
3. scripts/charge.ts : cron du service.
4. README : .env (RPC_URL, SAFE_ADDRESS, OWNER_PRIVATE_KEY de test), adresse module,
   ERC20 mock + financement du Safe.

CONTRAINTES
- États loading/error/empty. Adresses en lowercase. Jamais de clé privée committée.
- Le Safe signe en ERC-1271 via le Protocol Kit.
- Plan détaillé d'abord, puis implémente et vérifie le flow
  enableModule -> setAllowance -> charge sur Sepolia.

Lis la doc Safe Modules + Allowance Module + Protocol Kit, puis propose le plan.
```
