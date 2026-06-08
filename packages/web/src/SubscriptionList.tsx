import { ipfsToHttp, type SubscriptionRecord } from "@safe-subscriptions/core";
import { shortAddr } from "./lib.js";

export function SubscriptionList(props: {
  records: SubscriptionRecord[];
  onRevoke: (record: SubscriptionRecord) => void | Promise<void>;
  canRevoke: boolean;
}) {
  if (props.records.length === 0) {
    return <p className="muted">No subscriptions yet.</p>;
  }

  return (
    <ul className="list">
      {props.records.map((r) => (
        <li key={r.id} className="list__item">
          <div className="list__main">
            <strong>
              {r.terms.amountPerPeriod} {r.terms.token.symbol}
            </strong>{" "}
            every {Math.round(r.terms.periodSeconds / 86400)} days
            <div className="muted small">
              to {shortAddr(r.terms.organization.delegate)} · from{" "}
              {shortAddr(r.terms.subscriber.smartAccount)}
            </div>
            <div className="muted small">
              terms:{" "}
              {r.agreement.uri.startsWith("ipfs://local-") ? (
                <span title={r.agreement.termsHash}>offline ({r.agreement.cid})</span>
              ) : (
                <a href={ipfsToHttp(r.agreement.uri)} target="_blank" rel="noreferrer">
                  {r.agreement.uri}
                </a>
              )}
            </div>
          </div>
          <button
            className="danger"
            disabled={!props.canRevoke}
            title={props.canRevoke ? "Revoke on-chain" : "Set VITE_BUNDLER_URL to revoke"}
            onClick={() => props.onRevoke(r)}
          >
            Revoke
          </button>
        </li>
      ))}
    </ul>
  );
}
