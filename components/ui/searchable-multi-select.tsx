"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type SearchableMultiSelectOption = {
  value: string;
  label: string;
};

type SearchableMultiSelectProps = {
  label: string;
  selectedValues: string[];
  options: SearchableMultiSelectOption[];
  onChange: (next: string[]) => void;
  searchPlaceholder?: string;
  disabled?: boolean;
};

export function SearchableMultiSelect({
  label,
  selectedValues,
  options,
  onChange,
  searchPlaceholder,
  disabled = false
}: SearchableMultiSelectProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDetailsElement | null>(null);

  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options;
    return options.filter((item) => item.label.toLowerCase().includes(normalized));
  }, [options, query]);

  const selectedLabel = `${label} (${selectedValues.length || "All"})`;

  function toggleValue(value: string) {
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter((item) => item !== value));
      return;
    }
    onChange([...selectedValues, value]);
  }

  function selectAll() {
    onChange(options.map((item) => item.value));
  }

  function clearAll() {
    onChange([]);
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
      <summary className="field mt-1 list-none cursor-pointer text-[rgb(var(--text))] disabled:cursor-not-allowed disabled:opacity-60">
        {selectedLabel}
      </summary>
      <div className="absolute z-10 mt-2 w-full min-w-64 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-2 text-[rgb(var(--text))] shadow-lg">
        <div className="mb-2 flex items-center gap-2 text-xs text-[rgb(var(--text-muted))]">
          <button className="btn-secondary btn-sm" type="button" onClick={selectAll} disabled={disabled}>
            All
          </button>
          <button className="btn-secondary btn-sm" type="button" onClick={clearAll} disabled={disabled}>
            Clear
          </button>
        </div>
        <input
          className="field mb-2"
          placeholder={searchPlaceholder ?? `Search ${label.toLowerCase()}...`}
          value={query}
          disabled={disabled}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="max-h-56 space-y-1 overflow-auto text-sm text-[rgb(var(--text))]">
          {filteredOptions.map((option) => (
            <label key={option.value} className="flex items-center gap-2 px-1 py-1">
              <input
                type="checkbox"
                checked={selectedValues.includes(option.value)}
                disabled={disabled}
                onChange={() => toggleValue(option.value)}
              />
              <span className="text-[rgb(var(--text))]">{option.label}</span>
            </label>
          ))}
          {!filteredOptions.length ? <p className="px-1 py-1 text-[rgb(var(--text-muted))]">No options found.</p> : null}
        </div>
      </div>
    </details>
  );
}
