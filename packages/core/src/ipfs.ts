import type { AgreementDocument } from "./types.js";

export interface PinResult {
  cid: string;
  uri: string; // ipfs://<cid>
}

/** A function that pins the agreement and returns its CID. Swappable for tests. */
export type Pinner = (doc: AgreementDocument) => Promise<PinResult>;

/** Pin the agreement JSON to IPFS via Pinata. Requires a Pinata JWT. */
export function pinataPinner(jwt: string): Pinner {
  return async (doc) => {
    const res = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        pinataContent: doc,
        pinataMetadata: { name: `subscription-agreement-${doc.id}` },
      }),
    });
    if (!res.ok) {
      throw new Error(`Pinata pin failed (${res.status}): ${await res.text()}`);
    }
    const json = (await res.json()) as { IpfsHash: string };
    return { cid: json.IpfsHash, uri: `ipfs://${json.IpfsHash}` };
  };
}

/**
 * Offline pinner for local testing without a Pinata account. Returns a
 * deterministic pseudo-CID derived from the terms hash. The agreement is NOT
 * actually pinned — use only to exercise the flow end-to-end without IPFS.
 */
export function offlinePinner(): Pinner {
  return async (doc) => {
    const cid = `local-${doc.termsHash.slice(2, 18)}`;
    return { cid, uri: `ipfs://${cid}` };
  };
}

/** Resolve an ipfs:// URI to an HTTP gateway URL for display/fetch. */
export function ipfsToHttp(
  uri: string,
  gateway = "https://gateway.pinata.cloud/ipfs/",
): string {
  return uri.startsWith("ipfs://") ? gateway + uri.slice("ipfs://".length) : uri;
}
