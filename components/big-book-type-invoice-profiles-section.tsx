"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BigBookLedgerType, BigBookLedgerTypeInvoiceProfile } from "@/lib/types";
import { handleUnauthorizedResponse, secureFetch } from "@/lib/client/auth-fetch";
import { BlockingOverlay } from "@/components/ui/blocking-overlay";
import { Modal } from "@/components/ui/modal";
import { TableEmptyState } from "@/components/ui/table-empty-state";

type Props = {
  types: BigBookLedgerType[];
  initialProfiles: BigBookLedgerTypeInvoiceProfile[];
};

function extractApiError(error: unknown, fallback: string) {
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const maybe = error as { formErrors?: unknown; fieldErrors?: Record<string, unknown> };
    if (Array.isArray(maybe.formErrors)) {
      const formError = maybe.formErrors.find((item) => typeof item === "string" && item.trim());
      if (typeof formError === "string") return formError;
    }
    if (maybe.fieldErrors) {
      for (const value of Object.values(maybe.fieldErrors)) {
        if (Array.isArray(value)) {
          const fieldError = value.find((item) => typeof item === "string" && item.trim());
          if (typeof fieldError === "string") return fieldError;
        }
      }
    }
  }
  return fallback;
}

function profileSummary(profile: BigBookLedgerTypeInvoiceProfile | undefined) {
  if (!profile) return "No preset saved";
  const parts: string[] = [];
  if (profile.pic_name.trim()) parts.push(profile.pic_name.trim());
  if (profile.background_color) parts.push(profile.background_color);
  return parts.length ? parts.join(" · ") : "Empty preset";
}

export function BigBookTypeInvoiceProfilesSection({ types, initialProfiles }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [editType, setEditType] = useState<BigBookLedgerType | null>(null);
  const [picName, setPicName] = useState("");
  const [picPassport, setPicPassport] = useState("");
  const [picAddress, setPicAddress] = useState("");
  const [picPhone, setPicPhone] = useState("");
  const [billToCompany, setBillToCompany] = useState("");
  const [backgroundColor, setBackgroundColor] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const profileByTypeId = useMemo(() => {
    const map = new Map<string, BigBookLedgerTypeInvoiceProfile>();
    for (const row of initialProfiles) map.set(row.type_id, row);
    return map;
  }, [initialProfiles]);

  const sortedTypes = useMemo(() => {
    return [...types].sort((a, b) => {
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.name.localeCompare(b.name);
    });
  }, [types]);

  const filteredTypes = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return sortedTypes;
    return sortedTypes.filter(
      (row) =>
        row.name.toLowerCase().includes(needle) ||
        row.code.toLowerCase().includes(needle) ||
        profileSummary(profileByTypeId.get(row.id)).toLowerCase().includes(needle)
    );
  }, [sortedTypes, query, profileByTypeId]);

  function triggerRefresh() {
    startTransition(() => router.refresh());
  }

  function openEdit(type: BigBookLedgerType) {
    const profile = profileByTypeId.get(type.id);
    setEditType(type);
    setPicName(profile?.pic_name ?? "");
    setPicPassport(profile?.pic_passport ?? "");
    setPicAddress(profile?.pic_address ?? "");
    setPicPhone(profile?.pic_phone ?? "");
    setBillToCompany(profile?.bill_to_company ?? "");
    setBackgroundColor(profile?.background_color ?? "");
    setError(null);
  }

  function closeEdit() {
    if (submitting) return;
    setEditType(null);
  }

  async function saveProfile() {
    if (!editType) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await secureFetch("/api/big-book/type-invoice-profiles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type_id: editType.id,
          pic_name: picName.trim(),
          pic_passport: picPassport.trim(),
          pic_address: picAddress.trim(),
          pic_phone: picPhone.trim(),
          bill_to_company: billToCompany.trim(),
          background_color: backgroundColor.trim() || null
        })
      });
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setError(extractApiError(data.error, "Failed to save invoice profile."));
        return;
      }
      setMessage(`Invoice preset saved for ${editType.name}.`);
      setEditType(null);
      triggerRefresh();
    } catch {
      setError("Failed to save invoice profile due to a network error.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="space-y-4 rounded-lg border border-[rgb(var(--border))] p-4">
      <BlockingOverlay active={submitting} label="Saving…" />
      <div>
        <h2 className="text-lg font-semibold">Invoice group presets</h2>
        <p className="mt-1 text-sm text-muted">
          Ledger types are invoice groups (e.g. IP Group). Set PIC details and a PDF background tint per type.
        </p>
      </div>

      {message ? <p className="text-sm text-[rgb(var(--success))]">{message}</p> : null}
      {error && !editType ? <p className="text-sm text-[rgb(var(--danger))]">{error}</p> : null}

      <label className="block text-sm">
        Search types
        <input
          className="field mt-1 w-full max-w-md"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type name or code"
        />
      </label>

      {filteredTypes.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-[rgb(var(--border))] text-left text-xs uppercase text-muted">
                <th className="py-2 pr-3 font-medium">Type (group)</th>
                <th className="py-2 pr-3 font-medium">Preset</th>
                <th className="py-2 pr-3 font-medium">PDF color</th>
                <th className="py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTypes.map((type) => {
                const profile = profileByTypeId.get(type.id);
                return (
                  <tr key={type.id} className="border-b border-[rgb(var(--border))]/60">
                    <td className="py-2 pr-3">
                      <span className="font-medium">{type.name}</span>
                      <span className="mt-0.5 block text-xs text-muted">
                        {type.code}
                        {!type.is_active ? " · inactive" : ""}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-muted">{profileSummary(profile)}</td>
                    <td className="py-2 pr-3">
                      {profile?.background_color ? (
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="inline-block h-5 w-5 rounded border border-[rgb(var(--border))]"
                            style={{ backgroundColor: profile.background_color }}
                            aria-hidden
                          />
                          <span className="font-mono text-xs">{profile.background_color}</span>
                        </span>
                      ) : (
                        <span className="text-muted">Default (white)</span>
                      )}
                    </td>
                    <td className="py-2">
                      <button type="button" className="btn-secondary btn-sm" onClick={() => openEdit(type)}>
                        Edit preset
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <TableEmptyState message="No ledger types match your search." />
      )}

      <Modal
        open={Boolean(editType)}
        onOpenChange={(open) => {
          if (!open) closeEdit();
        }}
        title={editType ? `Invoice preset · ${editType.name}` : "Invoice preset"}
        size="lg"
        dismissible={!submitting}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" disabled={submitting} onClick={closeEdit}>
              Cancel
            </button>
            <button type="button" className="btn" disabled={submitting} onClick={() => void saveProfile()}>
              {submitting ? "Saving…" : "Save preset"}
            </button>
          </div>
        }
      >
        {error ? <p className="mb-3 text-sm text-[rgb(var(--danger))]">{error}</p> : null}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="block text-sm md:col-span-2">
            Bill To company override (optional)
            <input
              className="field mt-1 w-full"
              value={billToCompany}
              onChange={(e) => setBillToCompany(e.target.value)}
              placeholder="Leave blank to keep vendor name on invoice"
            />
          </label>
          <label className="block text-sm">
            PIC name
            <input className="field mt-1 w-full" value={picName} onChange={(e) => setPicName(e.target.value)} />
          </label>
          <label className="block text-sm">
            Passport no
            <input
              className="field mt-1 w-full"
              value={picPassport}
              onChange={(e) => setPicPassport(e.target.value)}
            />
          </label>
          <label className="block text-sm md:col-span-2">
            Address
            <textarea
              className="field mt-1 w-full min-h-[72px]"
              value={picAddress}
              onChange={(e) => setPicAddress(e.target.value)}
            />
          </label>
          <label className="block text-sm md:col-span-2">
            Phone
            <input className="field mt-1 w-full" value={picPhone} onChange={(e) => setPicPhone(e.target.value)} />
          </label>
          <label className="block text-sm md:col-span-2">
            Invoice PDF background
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <input
                type="color"
                className="h-10 w-14 cursor-pointer rounded border border-[rgb(var(--border))] bg-transparent p-1"
                value={
                  /^#[0-9A-Fa-f]{6}$/.test(backgroundColor.trim())
                    ? backgroundColor.trim()
                    : "#E8F4FF"
                }
                onChange={(e) => setBackgroundColor(e.target.value.toUpperCase())}
              />
              <input
                className="field font-mono text-sm"
                value={backgroundColor}
                onChange={(e) => setBackgroundColor(e.target.value)}
                placeholder="#RRGGBB or empty for white"
              />
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => setBackgroundColor("")}
              >
                Clear color
              </button>
            </div>
          </label>
        </div>
      </Modal>
    </section>
  );
}
