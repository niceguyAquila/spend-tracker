"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LoadingIndicator } from "@/components/ui/loading-indicator";

type Option = {
  value: string;
  label: string;
};

type FilterProps = {
  categories: Option[];
  months: Option[];
  selectedCategoryIds: string[];
  selectedMonthFrom: string | null;
  selectedMonthTo: string | null;
};

type PickerProps = {
  label: string;
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
};

function SearchableDropdown({ label, options, selected, onChange, disabled = false }: PickerProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDetailsElement | null>(null);
  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options;
    return options.filter((item) => item.label.toLowerCase().includes(normalized));
  }, [options, query]);

  function toggleValue(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter((item) => item !== value));
      setIsOpen(false);
      return;
    }
    onChange([...selected, value]);
    setIsOpen(false);
  }

  function selectAll() {
    onChange(options.map((item) => item.value));
    setIsOpen(false);
  }

  function clearAll() {
    onChange([]);
    setIsOpen(false);
  }

  useEffect(() => {
    function handleOutsidePointerDown(event: MouseEvent) {
      if (!isOpen) return;
      const root = rootRef.current;
      if (!root) return;
      if (event.target instanceof Node && !root.contains(event.target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsidePointerDown);
    return () => {
      document.removeEventListener("mousedown", handleOutsidePointerDown);
    };
  }, [isOpen]);

  return (
    <details
      ref={rootRef}
      className="relative"
      open={isOpen}
      onClick={(event) => {
        if (disabled) event.preventDefault();
      }}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
    >
      <summary className="field mt-1 list-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-60">
        {label} ({selected.length || "All"})
      </summary>
      <div className="absolute z-10 mt-2 w-full min-w-64 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-2 shadow-lg">
        <div className="mb-2 flex items-center gap-2 text-xs">
          <button className="btn-secondary btn-sm" type="button" onClick={selectAll} disabled={disabled}>
            All
          </button>
          <button className="btn-secondary btn-sm" type="button" onClick={clearAll} disabled={disabled}>
            Clear
          </button>
        </div>
        <input
          className="field mb-2"
          placeholder={`Search ${label.toLowerCase()}...`}
          value={query}
          disabled={disabled}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="max-h-56 space-y-1 overflow-auto text-sm">
          {filteredOptions.map((option) => (
            <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-[rgb(var(--surface-muted))]">
              <input
                type="checkbox"
                checked={selected.includes(option.value)}
                disabled={disabled}
                onChange={() => toggleValue(option.value)}
              />
              {option.label}
            </label>
          ))}
          {!filteredOptions.length ? <p className="px-1 py-1 text-[rgb(var(--text-muted))]">No options found.</p> : null}
        </div>
      </div>
    </details>
  );
}

type SingleMonthPickerProps = {
  label: string;
  placeholder: string;
  options: Option[];
  value: string | null;
  onChange: (next: string | null) => void;
  disabled?: boolean;
};

function SearchableSingleMonthPicker({
  label,
  placeholder,
  options,
  value,
  onChange,
  disabled = false
}: SingleMonthPickerProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDetailsElement | null>(null);
  const selectedLabel = options.find((item) => item.value === value)?.label ?? placeholder;
  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options;
    return options.filter((item) => item.label.toLowerCase().includes(normalized));
  }, [options, query]);

  function pick(next: string | null) {
    onChange(next);
    setIsOpen(false);
  }

  useEffect(() => {
    function handleOutsidePointerDown(event: MouseEvent) {
      if (!isOpen) return;
      const root = rootRef.current;
      if (!root) return;
      if (event.target instanceof Node && !root.contains(event.target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsidePointerDown);
    return () => {
      document.removeEventListener("mousedown", handleOutsidePointerDown);
    };
  }, [isOpen]);

  return (
    <label className="text-sm text-muted">
      <span className="mb-1 block">{label}</span>
      <details
        ref={rootRef}
        className="relative"
        open={isOpen}
        onClick={(event) => {
          if (disabled) event.preventDefault();
        }}
        onToggle={(event) => setIsOpen(event.currentTarget.open)}
      >
        <summary className="field mt-1 list-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-60">
          {selectedLabel}
        </summary>
        <div className="absolute z-10 mt-2 w-full min-w-64 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-2 shadow-lg">
          <button
            className="btn-secondary btn-sm mb-2"
            type="button"
            disabled={disabled}
            onClick={() => pick(null)}
          >
            Clear
          </button>
          <input
            className="field mb-2"
            placeholder={`Search ${label.toLowerCase()}...`}
            value={query}
            disabled={disabled}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="max-h-56 space-y-1 overflow-auto text-sm">
            {filteredOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-[rgb(var(--surface-muted))] ${
                  value === option.value ? "bg-[rgb(var(--surface-muted))] font-medium" : ""
                }`}
                disabled={disabled}
                onClick={() => pick(option.value)}
              >
                {option.label}
              </button>
            ))}
            {!filteredOptions.length ? (
              <p className="px-1 py-1 text-[rgb(var(--text-muted))]">No options found.</p>
            ) : null}
          </div>
        </div>
      </details>
    </label>
  );
}

export function DashboardReportFilters({
  categories,
  months,
  selectedCategoryIds,
  selectedMonthFrom,
  selectedMonthTo
}: FilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const [categoryValues, setCategoryValues] = useState<string[]>(selectedCategoryIds);
  const [monthFrom, setMonthFrom] = useState<string | null>(selectedMonthFrom);
  const [monthTo, setMonthTo] = useState<string | null>(selectedMonthTo);

  function applyFilters(
    nextCategoryValues: string[],
    nextMonthFrom: string | null,
    nextMonthTo: string | null
  ) {
    const params = new URLSearchParams();
    nextCategoryValues.forEach((value) => params.append("category", value));
    if (nextMonthFrom) params.set("monthFrom", nextMonthFrom);
    if (nextMonthTo) params.set("monthTo", nextMonthTo);

    const query = params.toString();
    startTransition(() => {
      router.push(query ? `${pathname}?${query}` : pathname);
    });
  }

  function resetFilters() {
    setCategoryValues([]);
    setMonthFrom(null);
    setMonthTo(null);
    startTransition(() => {
      router.push(pathname);
    });
  }

  return (
    <section className="card">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <label className="text-sm text-muted">
          <span className="mb-1 block">Category</span>
          <SearchableDropdown
            label="Category"
            options={categories}
            selected={categoryValues}
            disabled={isPending}
            onChange={(next) => {
              setCategoryValues(next);
              applyFilters(next, monthFrom, monthTo);
            }}
          />
        </label>
        <SearchableSingleMonthPicker
          label="From month"
          placeholder="Earliest in data"
          options={months}
          value={monthFrom}
          disabled={isPending}
          onChange={(next) => {
            setMonthFrom(next);
            applyFilters(categoryValues, next, monthTo);
          }}
        />
        <SearchableSingleMonthPicker
          label="To month"
          placeholder="Latest in data"
          options={months}
          value={monthTo}
          disabled={isPending}
          onChange={(next) => {
            setMonthTo(next);
            applyFilters(categoryValues, monthFrom, next);
          }}
        />
      </div>
      <p className="mt-2 text-xs text-[rgb(var(--text-muted))]">
        Leave From and To unset to include every month in the current category filters. Set one or both ends to limit
        columns.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <button className="btn-secondary" type="button" onClick={resetFilters} disabled={isPending}>
          Reset
        </button>
        {isPending ? <LoadingIndicator label="Updating results..." /> : null}
      </div>
    </section>
  );
}
