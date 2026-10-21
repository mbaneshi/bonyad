import { useId } from "react";

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
  message?: string | undefined;
  path: string;
};

export function NumberField({ label, value, onChange, invalid, message, path }: Props) {
  const msgId = useId();
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        enterKeyHint="done"
        autoComplete="off"
        dir="ltr"
        data-field={path}
        value={value}
        aria-invalid={invalid || undefined}
        aria-describedby={message ? msgId : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {message && (
        <small id={msgId} className="field-error">
          {message}
        </small>
      )}
    </label>
  );
}
