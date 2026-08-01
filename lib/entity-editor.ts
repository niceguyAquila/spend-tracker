"use client";

import { useState } from "react";
import { normalizeEntityCode } from "@/lib/entity-code";

export type EditableEntity = { id: string; code: string; name: string };

export type EntityEditor<T extends EditableEntity> = {
  target: T | null;
  draft: { code: string; name: string };
  submitting: boolean;
  canSave: boolean;
  setCode: (value: string) => void;
  setName: (value: string) => void;
  setSubmitting: (value: boolean) => void;
  start: (row: T) => void;
  requestClose: (open: boolean) => void;
  reset: () => void;
};

// Drives the "Edit" dialog for the reference tables. Codes are normalized on
// every keystroke, matching the add forms, so the dialog cannot submit a value
// the API would reject.
export function useEntityEditor<T extends EditableEntity>(): EntityEditor<T> {
  const [target, setTarget] = useState<T | null>(null);
  const [draft, setDraft] = useState({ code: "", name: "" });
  const [submitting, setSubmitting] = useState(false);

  const changed = target ? draft.code !== target.code || draft.name.trim() !== target.name : false;
  const complete = draft.code.trim().length >= 2 && draft.name.trim().length >= 2;

  return {
    target,
    draft,
    submitting,
    canSave: changed && complete,
    setCode: (value) => setDraft((prev) => ({ ...prev, code: normalizeEntityCode(value) })),
    setName: (value) => setDraft((prev) => ({ ...prev, name: value })),
    setSubmitting,
    start: (row) => {
      setTarget(row);
      setDraft({ code: row.code, name: row.name });
    },
    requestClose: (open) => {
      if (!open && !submitting) setTarget(null);
    },
    reset: () => setTarget(null)
  };
}
