"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Modal } from "./modal";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  label: string;
  initialValue: string;
  confirmLabel?: string;
  cancelLabel?: string;
  minLength?: number;
  submitting?: boolean;
  onConfirm: (value: string) => void | Promise<void>;
};

export function PromptDialog({
  open,
  onOpenChange,
  title,
  label,
  initialValue,
  confirmLabel = "Save",
  cancelLabel = "Cancel",
  minLength = 2,
  submitting = false,
  onConfirm
}: Props) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fieldId = useId();
  const errorId = useId();

  useEffect(() => {
    if (open) {
      setValue(initialValue);
      setError(null);
    }
  }, [open, initialValue]);

  function handleCancel() {
    onOpenChange(false);
  }

  async function handleConfirm() {
    const trimmed = value.trim();
    if (trimmed.length < minLength) {
      setError(`Name must be at least ${minLength} characters.`);
      return;
    }
    if (trimmed === initialValue.trim()) {
      onOpenChange(false);
      return;
    }
    setError(null);
    await onConfirm(trimmed);
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      dismissible={!submitting}
      initialFocusRef={inputRef}
      footer={
        <>
          <button type="button" className="btn-secondary" disabled={submitting} onClick={handleCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="btn" disabled={submitting} onClick={() => void handleConfirm()}>
            {submitting ? "Saving…" : confirmLabel}
          </button>
        </>
      }
    >
      <label htmlFor={fieldId} className="mb-1 block font-medium text-slate-800">
        {label}
      </label>
      <input
        ref={inputRef}
        id={fieldId}
        className="field"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        disabled={submitting}
      />
      {error ? (
        <p id={errorId} className="mt-2 text-sm text-rose-600" role="alert">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}
