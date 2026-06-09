# safe-subscriptions — Kickoff

Abonnements crypto récurrents : un **smart account** (DeleGator MetaMask) autorise
une **organisation** à prélever un montant ERC20 fixe **chaque période**, via une
**délégation ERC-7710** portant le caveat **`erc20PeriodTransfer`** (montant max
par période, reset automatique). Le JSON d'accord (`subscription-agreement.example.json`)
porte **les termes du contrat** entre l'organisation et l'abonné, **épinglé sur
IPFS** ; l'on-chain ne fait qu'appliquer le caveat (plafond par période).

> ℹ️ **Pivot vs. première version.** Le design initial visait un Gnosis Safe + Safe
> Allowance Module (parce qu'il supposait l'abonné = un Safe, qui signe en ERC-1271).
> On a basculé sur le **MetaMask Delegation Toolkit** (ERC-7710/4337) : l'abonné est
> un **smart account DeleGator contrôlé par un EOA** (signature ECDSA), qui donne un
> primitif d'abonnement natif (`erc20PeriodTransfer`).

---

## Le concept

- L'abonné = un **smart account DeleGator (Hybrid)**, possédé/signé par un **EOA**.
  L'organisation = un **delegate** (EOA simple qui encaisse).
- L'EOA signe **une fois** la délégation (ECDSA) : caveat `erc20PeriodTransfer`
  (`periodAmount`, `periodDuration = 2592000` ≈ 30 j, `startDate`).
- L'orga appelle `DelegationManager.redeemDelegations` chaque période → prélèvement
  plafonné, transféré vers son adresse.
- Révocation à tout moment : `disableDelegation` (user op signée par le smart account).

Le **JSON** = les termes lisibles (qui, quoi, combien, quand, conditions
d'annulation), épinglé sur IPFS. Son hash `keccak256(terms)` sert de **salt** à la
délégation → la signature de l'abonné **commit on-chain au hash exact des termes**.
Voir `subscription-agreement.example.json`.

---

## ⚠️ Pourquoi un smart account (et pas un EOA pur ni un Safe)

Dans le Delegation Toolkit, le **delegator doit être un smart account** : un EOA
pur ne peut pas porter de caveats, et un **Safe** signe en ERC-1271 alors que le
toolkit attend une signature **ECDSA d'un DeleGator**. Le **Hybrid DeleGator** est
le primitif natif : déployé par un EOA, il détient les tokens et porte le caveat.

---

## Prérequis

**Env**
- Node ≥ 20 + bun
- Sepolia, RPC (Alchemy/Infura), faucet ETH
- (optionnel) un compte Pinata pour épingler le JSON sur IPFS
- (optionnel) une URL de bundler ERC-4337 pour la révocation

**Delegation Framework (Sepolia, v1.3.0)** — résolu via `getSmartAccountsEnvironment(sepolia.id)` :
- DelegationManager : `0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3`
- EntryPoint : `0x0000000071727De22E5E9d8BAf0edAc6f37da032`

**Libs**
| Lib | Rôle |
|---|---|
| `@metamask/smart-accounts-kit` | smart account DeleGator, `createDelegation`, caveats, `DelegationManager`, redeem |
| `viem` | RPC, encodage ERC20, lecture du montant disponible |
| `react` + `vite` + `wagmi` | front |
| Foundry | MockERC20 + déploiement |

**À savoir**
- L'abonné signe la délégation **en ECDSA via le smart account** (`signDelegation`).
- `periodDuration` en **secondes** : 2592000 ≈ 30 jours.
- Le delegate qui prélève peut être un **EOA simple** (tx directe, sans bundler).
- Le smart account doit être **déployé** (appel factory direct) et **financé en tokens**
  pour que le prélèvement passe ; il ne lui faut de l'ETH que pour révoquer (user op).

---

## Architecture (implémentée)

```
safe-subscriptions/
├── subscription-agreement.example.json   # termes orga <-> abonné (format délégation + IPFS)
├── contracts/                            # Foundry
│   ├── src/MockERC20.sol                 # ERC20 mintable de test
│   └── script/Deploy.s.sol
├── packages/
│   ├── core/src/                         # logique runtime-agnostique (TypeScript)
│   │   ├── chain.ts                      # clients viem + getEnvironment(sepolia)
│   │   ├── smartAccount.ts               # createSubscriberSmartAccount + deploySmartAccount
│   │   ├── terms.ts                      # termes + keccak256(terms) canonique
│   │   ├── ipfs.ts                       # pin Pinata (+ pinner offline pour tests)
│   │   ├── createSubscription.ts         # createDelegation(erc20PeriodTransfer) + sign
│   │   ├── charge.ts                     # redeemDelegations + lecture montant dispo
│   │   ├── revoke.ts                     # disableDelegation via bundler
│   │   └── storage.ts                    # persistance JSON des délégations signées
│   └── web/                              # React + wagmi : connecter / créer / lister / révoquer
└── scripts/                             # CLI: create.ts (abonné), charge.ts (orga cron), revoke.ts
```

---

## Flow de bout en bout (Sepolia)

1. `forge script Deploy` → déployer MockERC20, mettre l'adresse dans `.env`.
2. `bun scripts/create.ts 10` → déploie le smart account, mint des tokens, crée +
   signe la délégation (10/période), épingle les termes, persiste.
3. `bun scripts/charge.ts` → l'orga prélève la période en cours.
4. Rejouer `charge` immédiatement → **no-op** (période déjà prélevée, le caveat refuse).
5. `bun scripts/revoke.ts <id>` → `disableDelegation` ; tout `charge` suivant échoue.

Voir `README.md` pour les détails `.env` et la vérification.
