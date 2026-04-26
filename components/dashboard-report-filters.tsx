"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LoadingIndicator } from "@/components/ui/loading-indicator";

type Option = {
  value: string;
  label: string;
  categoryId?: string;
};

type FilterProps = {
  categories: Option[];
  subcategories: Option[];
  months: Option[];
  selectedCategoryIds: string[];
  selectedSubcategoryIds: string[];
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
            <label key={option.value} className="flex items-center gap-2 px-1 py-1">
              <input
                type="checkbox"
                checked={selected.includes(option.value)}
                disabled={disabled}
                onChange={() => toggleValue(option.value)}
              />
              <span>{option.label}</span>
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
  const selectedLabel = value ? options.find((item) => item.value === value)?.label ?? value : null;

  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options;
    return options.filter((item) => item.label.toLowerCase().includes(normalized));
  }, [options, query]);

  function pick(next: string) {
    onChange(next);
    setIsOpen(false);
  }

  function clearSelection() {
    onChange(null);
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
      <summary className="field mt-1 cursor-pointer list-none">
        {label}: {selectedLabel ?? placeholder}
      </summary>
      <div className="absolute z-10 mt-2 w-full min-w-64 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-2 shadow-lg">
        <div className="mb-2 flex items-center gap-2 text-xs">
          <button className="btn-secondary btn-sm" type="button" onClick={clearSelection} disabled={disabled}>
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
          {!filteredOptions.length ? <p className="px-1 py-1 text-[rgb(var(--text-muted))]">No options found.</p> : null}
        </div>
      </div>
    </details>
  );
}

export function DashboardReportFilters({
  categories,
  subcategories,
  months,
  selectedCategoryIds,
  selectedSubcategoryIds,
  selectedMonthFrom,
  selectedMonthTo
}: FilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const [categoryValues, setCategoryValues] = useState<string[]>(selectedCategoryIds);
  const [subcategoryValues, setSubcategoryValues] = useState<string[]>(selectedSubcategoryIds);
  const [monthFrom, setMonthFrom] = useState<string | null>(selectedMonthFrom);
  const [monthTo, setMonthTo] = useState<string | null>(selectedMonthTo);

  function applyFilters(
    nextCategoryValues: string[],
    nextSubcategoryValues: string[],
    nextMonthFrom: string | null,
    nextMonthTo: string | null
  ) {
    const params = new URLSearchParams();
    nextCategoryValues.forEach((value) => params.append("category", value));
    nextSubcategoryValues.forEach((value) => params.append("subcategory", value));
    if (nextMonthFrom) params.set("monthFrom", nextMonthFrom);
    if (nextMonthTo) params.set("monthTo", nextMonthTo);

    const query = params.toString();
    startTransition(() => {
      router.push(query ? `${pathname}?${query}` : pathname);
    });
  }

  function resetFilters() {
    setCategoryValues([]);
    setSubcategoryValues([]);
    setMonthFrom(null);
    setMonthTo(null);
    startTransition(() => {
      router.push(pathname);
    });
  }

  return (
    <section className="card">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-4">
        <SearchableDropdown
          label="Category"
          options={categories}
          selected={categoryValues}
          disabled={isPending}
          onChange={(next) => {
            setCategoryValues(next);
            const validSubcategoryIds = new Set(
              subcategories
                .filter((item) => !next.length || (item.categoryId && next.includes(item.categoryId)))
                .map((item) => item.value)
            );
            const nextSubcategoryValues = subcategoryValues.filter((value) => validSubcategoryIds.has(value));
            setSubcategoryValues(nextSubcategoryValues);
            applyFilters(next, nextSubcategoryValues, monthFrom, monthTo);
          }}
        />
        <SearchableDropdown
          label="Sub-category"
          options={subcategories}
          selected={subcategoryValues}
          disabled={isPending}
          onChange={(next) => {
            setSubcategoryValues(next);
            applyFilters(categoryValues, next, monthFrom, monthTo);
          }}
        />
        <SearchableSingleMonthPicker
          label="From month"
          placeholder="Earliest in data"
          options={months}
          value={monthFrom}
          disabled={isPending}
          onChange={(next) => {
            setMonthFrom(next);
            applyFilters(categoryValues, subcategoryValues, next, monthTo);
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
            applyFilters(categoryValues, subcategoryValues, monthFrom, next);
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
