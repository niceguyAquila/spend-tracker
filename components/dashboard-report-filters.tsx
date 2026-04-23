"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

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
};

function SearchableDropdown({ label, options, selected, onChange }: PickerProps) {
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
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
    >
      <summary className="field mt-1 cursor-pointer list-none">
        {label} ({selected.length || "All"})
      </summary>
      <div className="absolute z-10 mt-2 w-full min-w-64 rounded-md border bg-white p-2 shadow-lg">
        <div className="mb-2 flex items-center gap-2 text-xs">
          <button className="btn-secondary !px-2 !py-1" type="button" onClick={selectAll}>
            All
          </button>
          <button className="btn-secondary !px-2 !py-1" type="button" onClick={clearAll}>
            Clear
          </button>
        </div>
        <input
          className="field mb-2"
          placeholder={`Search ${label.toLowerCase()}...`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="max-h-56 space-y-1 overflow-auto text-sm">
          {filteredOptions.map((option) => (
            <label key={option.value} className="flex items-center gap-2 px-1 py-1">
              <input
                type="checkbox"
                checked={selected.includes(option.value)}
                onChange={() => toggleValue(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
          {!filteredOptions.length ? <p className="px-1 py-1 text-slate-500">No options found.</p> : null}
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
};

function SearchableSingleMonthPicker({ label, placeholder, options, value, onChange }: SingleMonthPickerProps) {
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
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
    >
      <summary className="field mt-1 cursor-pointer list-none">
        {label}: {selectedLabel ?? placeholder}
      </summary>
      <div className="absolute z-10 mt-2 w-full min-w-64 rounded-md border bg-white p-2 shadow-lg">
        <div className="mb-2 flex items-center gap-2 text-xs">
          <button className="btn-secondary !px-2 !py-1" type="button" onClick={clearSelection}>
            Clear
          </button>
        </div>
        <input
          className="field mb-2"
          placeholder={`Search ${label.toLowerCase()}...`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="max-h-56 space-y-1 overflow-auto text-sm">
          {filteredOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-slate-100 ${
                value === option.value ? "bg-slate-100 font-medium" : ""
              }`}
              onClick={() => pick(option.value)}
            >
              {option.label}
            </button>
          ))}
          {!filteredOptions.length ? <p className="px-1 py-1 text-slate-500">No options found.</p> : null}
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
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  function resetFilters() {
    setCategoryValues([]);
    setSubcategoryValues([]);
    setMonthFrom(null);
    setMonthTo(null);
    router.push(pathname);
  }

  return (
    <section className="card">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        <SearchableDropdown
          label="Category"
          options={categories}
          selected={categoryValues}
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
          onChange={(next) => {
            setMonthTo(next);
            applyFilters(categoryValues, subcategoryValues, monthFrom, next);
          }}
        />
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Leave From and To unset to include every month in the current category filters. Set one or both ends to limit
        columns.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <button className="btn-secondary" type="button" onClick={resetFilters}>
          Reset
        </button>
      </div>
    </section>
  );
}
