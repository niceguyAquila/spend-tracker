"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BigBookActor, BigBookAllowedUserOption, BigBookLedgerType } from "@/lib/types";
import { handleUnauthorizedResponse, secureFetch } from "@/lib/client/auth-fetch";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { BlockingOverlay } from "@/components/ui/blocking-overlay";

type Props = {
  initialTypes: BigBookLedgerType[];
  initialActors: BigBookActor[];
  allowedUsers: BigBookAllowedUserOption[];
};

type ApiErrorShape = {
  formErrors?: unknown;
  fieldErrors?: Record<string, unknown>;
};

function extractApiError(error: unknown, fallback: string) {
  if (typeof error === "string" && error.trim().length > 0) return error;
  if (error && typeof error === "object") {
    const maybeZod = error as ApiErrorShape;
    if (Array.isArray(maybeZod.formErrors)) {
      const formError = maybeZod.formErrors.find((item) => typeof item === "string" && item.trim().length > 0);
      if (typeof formError === "string") return formError;
    }
    if (maybeZod.fieldErrors && typeof maybeZod.fieldErrors === "object") {
      for (const value of Object.values(maybeZod.fieldErrors)) {
        if (Array.isArray(value)) {
          const fieldError = value.find((item) => typeof item === "string" && item.trim().length > 0);
          if (typeof fieldError === "string") return fieldError;
        }
      }
    }
  }
  return fallback;
}

export function BigBookSettingsPanel({ initialTypes, initialActors, allowedUsers }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newTypeCode, setNewTypeCode] = useState("");
  const [newTypeName, setNewTypeName] = useState("");
  const [pendingAddTypeConfirm, setPendingAddTypeConfirm] = useState(false);
  const [typeSubmitting, setTypeSubmitting] = useState(false);
  const [pendingToggleType, setPendingToggleType] = useState<BigBookLedgerType | null>(null);
  const [toggleTypeSubmitting, setToggleTypeSubmitting] = useState(false);
  const [actorDrafts, setActorDrafts] = useState<Record<string, { display_name: string; user_id: string }>>(() => {
    const draftMap: Record<string, { display_name: string; user_id: string }> = {};
    for (const actor of initialActors) {
      draftMap[actor.id] = { display_name: actor.display_name, user_id: actor.user_id ?? "" };
    }
    return draftMap;
  });
  const [pendingActorId, setPendingActorId] = useState<string | null>(null);
  const [actorSubmitting, setActorSubmitting] = useState(false);

  const criticalPending = typeSubmitting || toggleTypeSubmitting || actorSubmitting;

  function triggerRefresh() {
    startTransition(() => {
      router.refresh();
    });
  }

  async function addType() {
    setTypeSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await secureFetch("/api/big-book/types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: newTypeCode.trim().toUpperCase(),
          name: newTypeName.trim()
        })
      });
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setError(extractApiError(data.error, "Failed to add type."));
        return;
      }
      setMessage("Type added.");
      setPendingAddTypeConfirm(false);
      setNewTypeCode("");
      setNewTypeName("");
      triggerRefresh();
    } catch {
      setError("Failed to add type due to a network error.");
    } finally {
      setTypeSubmitting(false);
    }
  }

  async function toggleType() {
    if (!pendingToggleType) return;
    setToggleTypeSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await secureFetch("/api/big-book/types", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: pendingToggleType.id,
          is_active: !pendingToggleType.is_active
        })
      });
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setError(extractApiError(data.error, "Failed to update type."));
        return;
      }
      setMessage(`Type ${pendingToggleType.is_active ? "deactivated" : "activated"}.`);
      setPendingToggleType(null);
      triggerRefresh();
    } catch {
      setError("Failed to update type due to a network error.");
    } finally {
      setToggleTypeSubmitting(false);
    }
  }

  async function saveActorMapping() {
    if (!pendingActorId) return;
    const draft = actorDrafts[pendingActorId];
    if (!draft) return;
    setActorSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await secureFetch("/api/big-book/actors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: pendingActorId,
          display_name: draft.display_name.trim(),
          user_id: draft.user_id || null
        })
      });
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setError(extractApiError(data.error, "Failed to update actor mapping."));
        return;
      }
      setMessage("Actor mapping updated.");
      setPendingActorId(null);
      triggerRefresh();
    } catch {
      setError("Failed to update actor mapping due to a network error.");
    } finally {
      setActorSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="card relative" aria-busy={criticalPending}>
        <BlockingOverlay active={criticalPending} label="Processing settings..." />
        <h2 className="text-lg font-semibold">Type Management</h2>
        <p className="mt-1 text-sm text-slate-600">Add new types and activate/deactivate existing ones.</p>
        <div className="mt-4 grid grid-cols-1 gap-2 lg:grid-cols-3">
          <input
            className="field"
            placeholder="Code (e.g. OPERATIONAL)"
            value={newTypeCode}
            onChange={(event) => setNewTypeCode(event.target.value)}
          />
          <input
            className="field"
            placeholder="Type Name"
            value={newTypeName}
            onChange={(event) => setNewTypeName(event.target.value)}
          />
          <button
            className="btn"
            disabled={!newTypeCode.trim() || !newTypeName.trim() || typeSubmitting}
            onClick={() => setPendingAddTypeConfirm(true)}
          >
            Add Type
          </button>
        </div>
        <div className="mt-4 space-y-2">
          {initialTypes.map((type) => (
            <div key={type.id} className="flex flex-wrap items-center justify-between rounded-md border border-slate-200 p-3">
              <div>
                <p className="font-medium">{type.name}</p>
                <p className="text-xs text-slate-600">
                  {type.code} · Sort {type.sort_order} · {type.is_active ? "Active" : "Inactive"}
                </p>
              </div>
              <button className="btn-secondary" onClick={() => setPendingToggleType(type)} disabled={toggleTypeSubmitting}>
                {type.is_active ? "Deactivate" : "Activate"}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold">Actor A/B Mapping</h2>
        <p className="mt-1 text-sm text-slate-600">Both actors share the same authority level and are fixed globally.</p>
        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {initialActors.map((actor) => (
            <div key={actor.id} className="rounded-md border border-slate-200 p-3">
              <p className="font-medium">Actor {actor.actor_code}</p>
              <label className="mt-2 block text-sm">
                Display Name
                <input
                  className="field mt-1"
                  value={actorDrafts[actor.id]?.display_name ?? actor.display_name}
                  onChange={(event) =>
                    setActorDrafts((prev) => ({
                      ...prev,
                      [actor.id]: { ...(prev[actor.id] ?? { display_name: "", user_id: "" }), display_name: event.target.value }
                    }))
                  }
                />
              </label>
              <label className="mt-2 block text-sm">
                Linked User
                <select
                  className="field mt-1"
                  value={actorDrafts[actor.id]?.user_id ?? ""}
                  onChange={(event) =>
                    setActorDrafts((prev) => ({
                      ...prev,
                      [actor.id]: { ...(prev[actor.id] ?? { display_name: actor.display_name, user_id: "" }), user_id: event.target.value }
                    }))
                  }
                >
                  <option value="">Unassigned</option>
                  {allowedUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.display_name} ({user.email})
                    </option>
                  ))}
                </select>
              </label>
              <button className="btn-secondary mt-3" onClick={() => setPendingActorId(actor.id)} disabled={actorSubmitting}>
                Save Actor Mapping
              </button>
            </div>
          ))}
        </div>
      </section>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}

      <ConfirmDialog
        open={pendingAddTypeConfirm}
        onOpenChange={setPendingAddTypeConfirm}
        title="Add new type?"
        description="The new type will become available for future Big Book records."
        confirmLabel="Add Type"
        confirming={typeSubmitting}
        closeOnBackdrop={false}
        onConfirm={addType}
      />

      <ConfirmDialog
        open={Boolean(pendingToggleType)}
        onOpenChange={(open) => {
          if (!open && !toggleTypeSubmitting) setPendingToggleType(null);
        }}
        title={pendingToggleType?.is_active ? "Deactivate type?" : "Activate type?"}
        description="Changing active state affects whether this type can be selected in new records."
        confirmLabel={pendingToggleType?.is_active ? "Deactivate" : "Activate"}
        confirming={toggleTypeSubmitting}
        closeOnBackdrop={false}
        onConfirm={toggleType}
      />

      <ConfirmDialog
        open={Boolean(pendingActorId)}
        onOpenChange={(open) => {
          if (!open && !actorSubmitting) setPendingActorId(null);
        }}
        title="Save actor mapping?"
        description="This changes the global Actor A/B identity mapping used across all brands."
        confirmLabel="Save Mapping"
        confirming={actorSubmitting}
        closeOnBackdrop={false}
        onConfirm={saveActorMapping}
      />
    </div>
  );
}
