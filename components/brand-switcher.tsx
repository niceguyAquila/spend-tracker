"use client";

import { useRouter } from "next/navigation";

type BrandOption = {
  id: string;
  name: string;
};

export function BrandSwitcher({
  activeBrandId,
  options,
  compact = false
}: {
  activeBrandId: string;
  options: BrandOption[];
  compact?: boolean;
}) {
  const router = useRouter();

  async function onBrandChange(nextBrandId: string) {
    const response = await fetch("/api/brands/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand_id: nextBrandId })
    });

    if (!response.ok) {
      return;
    }

    router.refresh();
  }

  return (
    <label className={compact ? "block text-xs text-slate-600 lg:text-right" : "mb-2 block text-left text-xs text-slate-600"}>
      <span className={compact ? "sr-only" : ""}>Active brand</span>
      <select
        className={compact ? "field min-w-[220px]" : "field mt-1 min-w-[220px]"}
        value={activeBrandId}
        onChange={(event) => void onBrandChange(event.target.value)}
        aria-label="Active brand"
      >
        {options.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </label>
  );
}
