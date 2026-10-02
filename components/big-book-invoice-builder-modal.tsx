"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { handleUnauthorizedResponse, secureFetch } from "@/lib/client/auth-fetch";
import { formatAmount } from "@/lib/display-format";
import { formatAmountInput, parseAmountInput } from "@/components/big-book-entry-fields";
import { formatInvoiceMoney } from "@/lib/big-book/invoice-money";
import type {
  BigBookCashflowCurrency,
  BigBookInvoiceWallet,
  BigBookLedgerTypeInvoiceProfile
} from "@/lib/types";

export type InvoiceBuilderCreditDraft = {
  id: string;
  amount: number;
  currency_code: BigBookCashflowCurrency;
  explanation: string;
  entry_date: string;
  remark?: string | null;
  entry_type_id?: string | null;
  type_name?: string;
};

export type InvoiceBuilderSeed = {
  vendor_name: string;
  actor_display_name: string;
  currency: BigBookCashflowCurrency;
  credits: InvoiceBuilderCreditDraft[];
  label: string;
};

export type InvoiceLineDraft = {
  key: string;
  unit_name: string;
  unit_no: string;
  period: string;
  description: string;
  price: string;
  big_book_entry_id: string | null;
};

type Props = {
  open: boolean;
  seed: InvoiceBuilderSeed | null;
  /** Optional preloaded wallets; when omitted, loads active wallets on open. */
  wallets?: BigBookInvoiceWallet[];
  onOpenChange: (open: boolean) => void;
};

const CURRENCIES: BigBookCashflowCurrency[] = ["IDR", "MYR", "USDT", "TRX"];

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function monthLabelFromIso(isoDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return "";
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  return date.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).toUpperCase();
}

function newLineKey() {
  return `line-${Math.random().toString(36).slice(2, 10)}`;
}

function emptyManualLine(): InvoiceLineDraft {
  return {
    key: newLineKey(),
    unit_name: "",
    unit_no: "",
    period: "",
    description: "",
    price: "",
    big_book_entry_id: null
  };
}

function creditToLine(credit: InvoiceBuilderCreditDraft): InvoiceLineDraft {
  return {
    key: newLineKey(),
    unit_name: "",
    unit_no: "1",
    period: credit.entry_date,
    description: credit.explanation || credit.remark || "Open credit",
    price: formatAmountInput(String(Math.abs(credit.amount))),
    big_book_entry_id: credit.id
  };
}

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

function parsePrice(value: string) {
  const normalized = parseAmountInput(value).trim();
  if (!normalized) return NaN;
  return Number(normalized);
}

function defaultGroupTypeId(credits: InvoiceBuilderCreditDraft[]): string {
  const ids = credits.map((credit) => credit.entry_type_id).filter(Boolean) as string[];
  const unique = new Set(ids);
  if (unique.size === 1) return [...unique][0];
  return ids[0] ?? "";
}

function applyGroupProfile(
  profile: BigBookLedgerTypeInvoiceProfile | undefined,
  setters: {
    setBillToName: (value: string) => void;
    setBillToPassport: (value: string) => void;
    setBillToAddress: (value: string) => void;
    setBillToPhone: (value: string) => void;
    setBillToCompany: (value: string) => void;
    setBackgroundColor: (value: string | null) => void;
  },
  options: { vendorCompany: string; replaceCompany: boolean }
) {
  if (!profile) {
    setters.setBillToName("");
    setters.setBillToPassport("");
    setters.setBillToAddress("");
    setters.setBillToPhone("");
    setters.setBackgroundColor(null);
    return;
  }
  setters.setBillToName(profile.pic_name);
  setters.setBillToPassport(profile.pic_passport);
  setters.setBillToAddress(profile.pic_address);
  setters.setBillToPhone(profile.pic_phone);
  setters.setBackgroundColor(profile.background_color);
  if (options.replaceCompany && profile.bill_to_company.trim()) {
    setters.setBillToCompany(profile.bill_to_company.trim());
  } else if (options.replaceCompany && !profile.bill_to_company.trim()) {
    setters.setBillToCompany(options.vendorCompany);
  }
}

export function BigBookInvoiceBuilderModal({ open, seed, wallets: walletsProp, onOpenChange }: Props) {
  const [loadedWallets, setLoadedWallets] = useState<BigBookInvoiceWallet[]>(walletsProp ?? []);
  const activeWallets = useMemo(
    () => (walletsProp ?? loadedWallets).filter((row) => row.is_active),
    [walletsProp, loadedWallets]
  );
  const [title, setTitle] = useState("INVOICE");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(todayIsoDate);
  const [dueDate, setDueDate] = useState(() => addDaysIso(todayIsoDate(), 7));
  const [terms, setTerms] = useState("Due on receipt");
  const [currency, setCurrency] = useState<BigBookCashflowCurrency>("USDT");
  const [billToCompany, setBillToCompany] = useState("");
  const [billToName, setBillToName] = useState("");
  const [billToPassport, setBillToPassport] = useState("");
  const [billToAddress, setBillToAddress] = useState("");
  const [billToPhone, setBillToPhone] = useState("");
  const [subject, setSubject] = useState("");
  const [notes, setNotes] = useState("");
  const [fxNote, setFxNote] = useState("");
  const [selectedWalletIds, setSelectedWalletIds] = useState<Set<string>>(() => new Set());
  const [lines, setLines] = useState<InvoiceLineDraft[]>([]);
  const [availableCredits, setAvailableCredits] = useState<InvoiceBuilderCreditDraft[]>([]);
  const [creditPickIds, setCreditPickIds] = useState<Set<string>>(() => new Set());
  const [groupProfiles, setGroupProfiles] = useState<BigBookLedgerTypeInvoiceProfile[]>([]);
  const [groupTypeOptions, setGroupTypeOptions] = useState<
    Array<{ id: string; name: string; code: string; is_active: boolean }>
  >([]);
  const [selectedGroupTypeId, setSelectedGroupTypeId] = useState("");
  const [pdfBackgroundColor, setPdfBackgroundColor] = useState<string | null>(null);
  const [allocatingNo, setAllocatingNo] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const profileByTypeId = useMemo(() => {
    const map = new Map<string, BigBookLedgerTypeInvoiceProfile>();
    for (const row of groupProfiles) map.set(row.type_id, row);
    return map;
  }, [groupProfiles]);

  const vendorCompanyDefault = useMemo(() => {
    if (!seed?.vendor_name || seed.vendor_name === "—") return "";
    return seed.vendor_name;
  }, [seed]);

  useEffect(() => {
    if (!open || !seed) return;

    const today = todayIsoDate();
    const monthLabel = monthLabelFromIso(seed.credits[0]?.entry_date || today);
    const defaultGroupId = defaultGroupTypeId(seed.credits);
    setTitle(monthLabel ? `${monthLabel} INVOICE` : "INVOICE");
    setInvoiceDate(today);
    setDueDate(addDaysIso(today, 7));
    setTerms("Due on receipt");
    setCurrency(seed.currency);
    setBillToCompany(vendorCompanyDefault);
    setSelectedGroupTypeId(defaultGroupId);
    setSubject(
      seed.credits.length
        ? `Open credits for ${seed.actor_display_name} · ${seed.currency}`
        : ""
    );
    setNotes("");
    setFxNote("");
    setSelectedWalletIds(new Set());
    setLines(seed.credits.map(creditToLine));
    setAvailableCredits(seed.credits);
    setCreditPickIds(new Set());
    setError(null);
    setInfo(null);
    setInvoiceNo("");
    setBillToName("");
    setBillToPassport("");
    setBillToAddress("");
    setBillToPhone("");
    setPdfBackgroundColor(null);
    setGroupProfiles([]);
    setGroupTypeOptions([]);

    let cancelled = false;
    async function allocateNumber() {
      setAllocatingNo(true);
      try {
        const response = await secureFetch("/api/big-book/invoice/next-number", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}"
        });
        if (handleUnauthorizedResponse(response)) return;
        const data = await response.json();
        if (!response.ok) {
          if (!cancelled) {
            setError(extractApiError(data.error, "Failed to allocate invoice number."));
          }
          return;
        }
        if (!cancelled) {
          setInvoiceNo(typeof data.invoice_no === "string" ? data.invoice_no : "");
        }
      } catch {
        if (!cancelled) setError("Failed to allocate invoice number due to a network error.");
      } finally {
        if (!cancelled) setAllocatingNo(false);
      }
    }

    async function loadWallets() {
      if (walletsProp) {
        setLoadedWallets(walletsProp);
        return;
      }
      try {
        const response = await fetch("/api/big-book/wallets");
        if (handleUnauthorizedResponse(response)) return;
        const data = await response.json();
        if (!response.ok || cancelled) return;
        setLoadedWallets(Array.isArray(data?.rows) ? data.rows : []);
      } catch {
        // Wallet list is optional for drafting; download still works without selections.
      }
    }

    async function loadGroupPresets() {
      try {
        const [profilesResponse, typesResponse] = await Promise.all([
          secureFetch("/api/big-book/type-invoice-profiles"),
          secureFetch("/api/big-book/types")
        ]);
        if (handleUnauthorizedResponse(profilesResponse) || handleUnauthorizedResponse(typesResponse)) return;
        const profilesData = await profilesResponse.json();
        const typesData = await typesResponse.json();
        if (!profilesResponse.ok || !typesResponse.ok || cancelled) return;

        const rows: BigBookLedgerTypeInvoiceProfile[] = Array.isArray(profilesData?.rows)
          ? profilesData.rows
          : [];
        setGroupProfiles(rows);

        const ledgerTypes: Array<{ id: string; name: string; code: string; is_active: boolean }> =
          Array.isArray(typesData?.rows) ? typesData.rows : [];
        const typeIdsFromCredits = new Set(
          seed.credits.map((credit) => credit.entry_type_id).filter(Boolean) as string[]
        );
        const optionsMap = new Map<string, { id: string; name: string; code: string; is_active: boolean }>();
        for (const type of ledgerTypes) {
          if (type.is_active || typeIdsFromCredits.has(type.id)) {
            optionsMap.set(type.id, type);
          }
        }
        for (const typeId of typeIdsFromCredits) {
          if (!optionsMap.has(typeId)) {
            const credit = seed.credits.find((item) => item.entry_type_id === typeId);
            optionsMap.set(typeId, {
              id: typeId,
              name: credit?.type_name ?? typeId,
              code: "",
              is_active: true
            });
          }
        }
        setGroupTypeOptions(
          [...optionsMap.values()].sort((a, b) => {
            if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
            return a.name.localeCompare(b.name);
          })
        );

        const profile = defaultGroupId
          ? rows.find((row) => row.type_id === defaultGroupId)
          : undefined;
        applyGroupProfile(
          profile,
          {
            setBillToName,
            setBillToPassport,
            setBillToAddress,
            setBillToPhone,
            setBillToCompany,
            setBackgroundColor: setPdfBackgroundColor
          },
          { vendorCompany: vendorCompanyDefault, replaceCompany: true }
        );
      } catch {
        // Presets are optional; invoice can still be edited manually.
      }
    }

    void allocateNumber();
    void loadWallets();
    void loadGroupPresets();
    return () => {
      cancelled = true;
    };
  }, [open, seed, walletsProp, vendorCompanyDefault]);

  function onGroupChange(typeId: string) {
    setSelectedGroupTypeId(typeId);
    const profile = typeId ? profileByTypeId.get(typeId) : undefined;
    applyGroupProfile(
      profile,
      {
        setBillToName,
        setBillToPassport,
        setBillToAddress,
        setBillToPhone,
        setBillToCompany,
        setBackgroundColor: setPdfBackgroundColor
      },
      { vendorCompany: vendorCompanyDefault, replaceCompany: true }
    );
    if (!profile) {
      setBillToName("");
      setBillToPassport("");
      setBillToAddress("");
      setBillToPhone("");
      setPdfBackgroundColor(null);
      setBillToCompany(vendorCompanyDefault);
    }
  }

  const total = useMemo(() => {
    return lines.reduce((sum, line) => {
      const price = parsePrice(line.price);
      return sum + (Number.isFinite(price) ? price : 0);
    }, 0);
  }, [lines]);

  const usedCreditIds = useMemo(() => {
    return new Set(lines.map((line) => line.big_book_entry_id).filter(Boolean) as string[]);
  }, [lines]);

  const unusedCredits = useMemo(
    () => availableCredits.filter((credit) => !usedCreditIds.has(credit.id)),
    [availableCredits, usedCreditIds]
  );

  function updateLine(key: string, patch: Partial<InvoiceLineDraft>) {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((line) => line.key !== key));
  }

  function moveLine(key: string, direction: -1 | 1) {
    setLines((prev) => {
      const index = prev.findIndex((line) => line.key === key);
      if (index < 0) return prev;
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      copy.splice(nextIndex, 0, item);
      return copy;
    });
  }

  function toggleWallet(id: string) {
    setSelectedWalletIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleCreditPick(id: string) {
    setCreditPickIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function insertSelectedCredits() {
    const selected = unusedCredits.filter((credit) => creditPickIds.has(credit.id));
    if (!selected.length) return;
    setLines((prev) => [...prev, ...selected.map(creditToLine)]);
    setCreditPickIds(new Set());
  }

  async function downloadPdf() {
    setDownloading(true);
    setError(null);
    setInfo(null);

    const parsedLines = lines.map((line) => ({
      unit_name: line.unit_name.trim(),
      unit_no: line.unit_no.trim(),
      period: line.period.trim(),
      description: line.description.trim(),
      price: parsePrice(line.price),
      big_book_entry_id: line.big_book_entry_id
    }));

    if (!invoiceNo.trim()) {
      setError("Invoice number is still loading. Wait a moment and try again.");
      setDownloading(false);
      return;
    }
    if (!billToCompany.trim()) {
      setError("Bill To company is required.");
      setDownloading(false);
      return;
    }
    if (!parsedLines.length) {
      setError("Add at least one line item.");
      setDownloading(false);
      return;
    }
    if (parsedLines.some((line) => !Number.isFinite(line.price))) {
      setError("Every line needs a valid price.");
      setDownloading(false);
      return;
    }

    try {
      const response = await secureFetch("/api/big-book/invoice/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          invoice_no: invoiceNo.trim(),
          invoice_date: invoiceDate,
          due_date: dueDate,
          terms: terms.trim(),
          currency,
          bill_to_company: billToCompany.trim(),
          bill_to_name: billToName.trim(),
          bill_to_passport: billToPassport.trim(),
          bill_to_address: billToAddress.trim(),
          bill_to_phone: billToPhone.trim(),
          subject: subject.trim(),
          lines: parsedLines,
          notes: notes.trim(),
          fx_note: fxNote.trim(),
          wallet_ids: Array.from(selectedWalletIds),
          ledger_type_id: selectedGroupTypeId || null,
          background_color: pdfBackgroundColor
        })
      });
      if (handleUnauthorizedResponse(response)) return;

      const contentType = response.headers.get("content-type") || "";
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(extractApiError(data.error, "Failed to download invoice PDF."));
        return;
      }
      if (!contentType.includes("application/pdf")) {
        setError("Unexpected response when generating PDF.");
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const disposition = response.headers.get("content-disposition") || "";
      const match = /filename="([^"]+)"/i.exec(disposition);
      anchor.href = url;
      anchor.download = match?.[1] || `${invoiceNo.trim()}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setInfo("Invoice PDF downloaded.");
    } catch {
      setError("Failed to download invoice PDF due to a network error.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!downloading && !allocatingNo) onOpenChange(next);
      }}
      title="Create invoice"
      size="xl"
      dismissible={!downloading && !allocatingNo}
      closeOnBackdrop={false}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted">
            Total{" "}
            <span className="font-medium text-[rgb(var(--text))]">
              {formatInvoiceMoney(total, currency)}
            </span>
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-secondary"
              disabled={downloading}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn"
              disabled={downloading || allocatingNo || !invoiceNo}
              onClick={() => void downloadPdf()}
            >
              {downloading ? "Downloading…" : allocatingNo ? "Allocating #…" : "Download PDF"}
            </button>
          </div>
        </div>
      }
    >
      <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
        {seed ? (
          <p className="text-sm text-muted">
            Prefill from <span className="font-medium text-[rgb(var(--text))]">{seed.label}</span>
            {seed.credits.length
              ? ` · ${seed.credits.length} open credit${seed.credits.length === 1 ? "" : "s"}`
              : null}
          </p>
        ) : null}

        {error ? <p className="text-sm text-[rgb(var(--danger))]">{error}</p> : null}
        {info ? <p className="text-sm text-[rgb(var(--success))]">{info}</p> : null}

        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">Header</h3>
          <label className="block text-sm">
            Title
            <input className="field mt-1 w-full" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            <label className="block text-sm md:col-span-2 lg:col-span-3">
              Group (ledger type)
              <select
                className="field mt-1 w-full max-w-md"
                value={selectedGroupTypeId}
                onChange={(e) => onGroupChange(e.target.value)}
              >
                <option value="">Select group…</option>
                {groupTypeOptions.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                    {type.code ? ` (${type.code})` : ""}
                    {!type.is_active ? " · inactive" : ""}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-muted">
                Changing group replaces PIC fields from the saved preset. PDF uses the group background tint when set.
              </span>
            </label>
            <label className="block text-sm">
              Invoice no
              <input className="field mt-1 w-full font-mono" value={invoiceNo} readOnly />
            </label>
            <label className="block text-sm">
              Invoice date
              <input
                type="date"
                className="field mt-1 w-full"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              Due date
              <input
                type="date"
                className="field mt-1 w-full"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              Terms
              <input className="field mt-1 w-full" value={terms} onChange={(e) => setTerms(e.target.value)} />
            </label>
            <label className="block text-sm">
              Currency
              <select
                className="field mt-1 w-full"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as BigBookCashflowCurrency)}
              >
                {CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">Bill To</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="block text-sm md:col-span-2">
              Company name
              <input
                className="field mt-1 w-full"
                value={billToCompany}
                onChange={(e) => setBillToCompany(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              Name (PIC)
              <input
                className="field mt-1 w-full"
                value={billToName}
                onChange={(e) => setBillToName(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              Passport No
              <input
                className="field mt-1 w-full"
                value={billToPassport}
                onChange={(e) => setBillToPassport(e.target.value)}
              />
            </label>
            <label className="block text-sm md:col-span-2">
              Address
              <textarea
                className="field mt-1 w-full min-h-[72px]"
                value={billToAddress}
                onChange={(e) => setBillToAddress(e.target.value)}
              />
            </label>
            <label className="block text-sm md:col-span-2">
              Phone
              <input
                className="field mt-1 w-full"
                value={billToPhone}
                onChange={(e) => setBillToPhone(e.target.value)}
              />
            </label>
          </div>
          <label className="block text-sm">
            Period / subject
            <input className="field mt-1 w-full" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">Line items</h3>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => setLines((prev) => [...prev, emptyManualLine()])}
            >
              Add manual line
            </button>
          </div>

          {unusedCredits.length ? (
            <div className="rounded-md border border-[rgb(var(--border))] p-3">
              <p className="text-xs font-medium uppercase text-muted">Add from outstanding credits</p>
              <div className="mt-2 max-h-36 space-y-1 overflow-y-auto">
                {unusedCredits.map((credit) => (
                  <label key={credit.id} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={creditPickIds.has(credit.id)}
                      onChange={() => toggleCreditPick(credit.id)}
                    />
                    <span>
                      <span className="font-medium">
                        {formatAmount(Math.abs(credit.amount), {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 4
                        })}{" "}
                        {credit.currency_code}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted">
                        {credit.entry_date} · {credit.explanation}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              <button
                type="button"
                className="btn-secondary btn-sm mt-2"
                disabled={creditPickIds.size === 0}
                onClick={insertSelectedCredits}
              >
                Insert selected ({creditPickIds.size})
              </button>
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="data-table min-w-[900px]">
              <thead>
                <tr>
                  <th>Unit name</th>
                  <th>Unit no</th>
                  <th>Period</th>
                  <th>Description</th>
                  <th>Price</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => (
                  <tr key={line.key}>
                    <td className="px-2 py-2">
                      <input
                        className="field w-full"
                        value={line.unit_name}
                        onChange={(e) => updateLine(line.key, { unit_name: e.target.value })}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        className="field w-full"
                        value={line.unit_no}
                        onChange={(e) => updateLine(line.key, { unit_no: e.target.value })}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        className="field w-full"
                        value={line.period}
                        onChange={(e) => updateLine(line.key, { period: e.target.value })}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        className="field w-full"
                        value={line.description}
                        onChange={(e) => updateLine(line.key, { description: e.target.value })}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        className="field w-full text-right"
                        value={line.price}
                        onChange={(e) => updateLine(line.key, { price: formatAmountInput(e.target.value) })}
                        inputMode="decimal"
                        aria-label="Price"
                      />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          disabled={index === 0}
                          onClick={() => moveLine(line.key, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          disabled={index === lines.length - 1}
                          onClick={() => moveLine(line.key, 1)}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="btn-secondary btn-sm !text-[rgb(var(--danger))]"
                          onClick={() => removeLine(line.key)}
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!lines.length ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-4 text-sm text-muted">
                      No lines yet. Add from outstanding credits or insert a manual line.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">Notes & wallets</h3>
          <div>
            <p className="text-sm font-medium">1. Wallets to print</p>
            {activeWallets.length ? (
              <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                {activeWallets.map((wallet) => (
                  <label
                    key={wallet.id}
                    className="flex items-start gap-2 rounded-md border border-[rgb(var(--border))] p-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selectedWalletIds.has(wallet.id)}
                      onChange={() => toggleWallet(wallet.id)}
                    />
                    <span>
                      <span className="font-medium">
                        {wallet.name} ({wallet.network})
                      </span>
                      <span className="mt-0.5 block break-all font-mono text-xs text-muted">
                        {wallet.address}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted">
                No active wallets. Add them under Big Book Settings → Invoice Wallets.
              </p>
            )}
          </div>
          <label className="block text-sm">
            2. FX note
            <textarea
              className="field mt-1 w-full min-h-[64px]"
              value={fxNote}
              onChange={(e) => setFxNote(e.target.value)}
              placeholder="Optional free-text FX note for this invoice"
            />
          </label>
          <label className="block text-sm">
            3. Notes
            <textarea
              className="field mt-1 w-full min-h-[80px]"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional free-text notes / terms"
            />
          </label>
        </section>
      </div>
    </Modal>
  );
}
