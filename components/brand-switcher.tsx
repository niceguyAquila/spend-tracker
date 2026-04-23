"use client";

import { useRouter } from "next/navigation";

type BrandOption = {
  id: string;
  name: string;
};

export function BrandSwitcher({
  activeBrandId,
  options
}: {
  activeBrandId: string;
  options: BrandOption[];
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
    <label className="mb-2 block text-left text-xs text-slate-600">
      Active brand
      <select
        className="field mt-1 min-w-[180px]"
        value={activeBrandId}
        onChange={(event) => void onBrandChange(event.target.value)}
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
