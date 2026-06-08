import { useState, type FormEvent } from "react";

export interface CreateFormValues {
  orgName: string;
  delegate: string;
  recipient: string;
  tokenAddress: string;
  amount: string;
  periodDays: string;
}

const EMPTY: CreateFormValues = {
  orgName: "ACME Org",
  delegate: "",
  recipient: "",
  tokenAddress: "",
  amount: "10",
  periodDays: "30",
};

export function CreateForm(props: {
  onSubmit: (values: CreateFormValues) => void | Promise<void>;
  disabled?: boolean;
}) {
  const [values, setValues] = useState<CreateFormValues>(EMPTY);

  function set<K extends keyof CreateFormValues>(key: K, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void props.onSubmit(values);
  }

  return (
    <form className="form" onSubmit={submit}>
      <label>
        Organization name
        <input value={values.orgName} onChange={(e) => set("orgName", e.target.value)} />
      </label>
      <label>
        Delegate (org EOA that pulls)
        <input
          required
          placeholder="0x…"
          value={values.delegate}
          onChange={(e) => set("delegate", e.target.value)}
        />
      </label>
      <label>
        Recipient (defaults to delegate)
        <input
          placeholder="0x…"
          value={values.recipient}
          onChange={(e) => set("recipient", e.target.value)}
        />
      </label>
      <label>
        ERC20 token address
        <input
          required
          placeholder="0x…"
          value={values.tokenAddress}
          onChange={(e) => set("tokenAddress", e.target.value)}
        />
      </label>
      <div className="form__row">
        <label>
          Amount / period
          <input
            required
            value={values.amount}
            onChange={(e) => set("amount", e.target.value)}
          />
        </label>
        <label>
          Period (days)
          <input
            required
            value={values.periodDays}
            onChange={(e) => set("periodDays", e.target.value)}
          />
        </label>
      </div>
      <button type="submit" disabled={props.disabled}>
        Sign &amp; create subscription
      </button>
    </form>
  );
}
