"use client";

import * as React from "react";
import { Input } from "./input";

/**
 * Numeric input that lets the user type freely (e.g. "1." or "-") and only
 * commits finite values within [min, max]. Invalid text is flagged, never silently coerced.
 */
export function NumberField({
  value,
  onCommit,
  min = -Infinity,
  max = Infinity,
  integer = false,
  nullable = false,
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "value" | "onChange" | "type" | "min" | "max"> & {
  value: number | null;
  onCommit: (v: number | null) => void;
  min?: number;
  max?: number;
  integer?: boolean;
  nullable?: boolean;
}) {
  const show = (v: number | null) => (v == null ? "" : String(v));
  const [text, setText] = React.useState(show(value));
  const [committed, setCommitted] = React.useState(value);
  const [focused, setFocused] = React.useState(false);
  // Sync when the value changes from outside (reset, shared link, a neighbouring stop moved).
  // Never while the user is typing: the parent may clamp an intermediate keystroke
  // (e.g. "4" on the way to "40"), and overwriting the text would corrupt the next one.
  if (!focused && value !== committed) {
    setCommitted(value);
    setText(show(value));
  }
  const parse = (t: string): { ok: boolean; v: number | null } => {
    if (t.trim() === "") return { ok: nullable, v: null };
    const n = Number(t);
    if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) return { ok: false, v: null };
    return { ok: true, v: n };
  };
  const { ok } = parse(text);
  return (
    <Input
      {...props}
      type="text"
      inputMode={integer ? "numeric" : "decimal"}
      value={text}
      aria-invalid={!ok || undefined}
      className={className}
      onChange={(e) => {
        setText(e.target.value);
        const p = parse(e.target.value);
        if (p.ok) {
          setCommitted(p.v);
          onCommit(p.v);
        }
      }}
      onFocus={(e) => {
        setFocused(true);
        props.onFocus?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        props.onKeyDown?.(e);
      }}
      onBlur={(e) => {
        // Show the value actually in effect (it may have been clamped or rejected).
        setFocused(false);
        setCommitted(value);
        setText(show(value));
        props.onBlur?.(e);
      }}
    />
  );
}
