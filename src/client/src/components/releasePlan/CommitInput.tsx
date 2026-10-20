import { useState, type InputHTMLAttributes, type KeyboardEvent } from "react";

type CommitInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange" | "type"> & {
  value: string;
  /** Called with the raw text on blur or Enter (like a native `change` event); the caller trims/defaults it. */
  onCommit: (value: string) => void;
};

/**
 * Text input that edits a local draft and commits it on blur or Enter (Esc
 * reverts), mirroring the template's `change` listeners so trimming and
 * "empty → default" rules don't fight the user while typing.
 */
export function CommitInput({ value, onCommit, onBlur, onKeyDown, ...rest }: CommitInputProps) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft !== null) {
      onCommit(draft);
      setDraft(null);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event);
    if (event.key === "Enter") {
      commit();
    } else if (event.key === "Escape" && draft !== null) {
      event.stopPropagation();
      setDraft(null);
    }
  };

  return (
    <input
      {...rest}
      type="text"
      value={draft ?? value}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => {
        commit();
        onBlur?.(event);
      }}
      onKeyDown={handleKeyDown}
    />
  );
}
