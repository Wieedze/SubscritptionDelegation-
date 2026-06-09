import type { Address, Hex } from "viem";
import {
  buildAgreementDocument,
  buildTerms,
  offlinePinner,
  pinataPinner,
  type AgreementDocument,
  type PinResult,
} from "@safe-subscriptions/core";

const PINATA_JWT = import.meta.env.VITE_PINATA_JWT || "";

/**
 * Build the human-readable subscription contract, pin it to IPFS, and return
 * `keccak256(terms)` to use as the delegation salt — binding the subscriber's
 * signature to the exact pinned terms.
 */
export async function buildAndPinAgreement(params: {
  chainId: number;
  smartAccount: Address;
  owner: Address;
  recipient: Address;
  relayerTarget: Address;
  token: { address: Address; symbol: string; decimals: number };
  amount: string;
  periodSeconds: number;
  startDate: number;
  organizationName?: string;
}): Promise<{ agreement: AgreementDocument; pinned: PinResult; salt: Hex }> {
  const terms = buildTerms({
    organization: {
      name: params.organizationName ?? "Organization",
      delegate: params.relayerTarget,
      recipient: params.recipient,
    },
    subscriber: {
      label: "web subscriber",
      smartAccount: params.smartAccount,
      owner: params.owner,
    },
    token: params.token,
    amountPerPeriod: params.amount,
    periodSeconds: params.periodSeconds,
    startDate: params.startDate,
  });
  const id = `sub_${params.startDate}_${params.smartAccount.slice(2, 10).toLowerCase()}`;
  const agreement = buildAgreementDocument({ id, chainId: params.chainId, terms });
  const pin = PINATA_JWT ? pinataPinner(PINATA_JWT) : offlinePinner();
  const pinned = await pin(agreement);
  return { agreement, pinned, salt: agreement.termsHash };
}
