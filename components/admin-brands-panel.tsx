"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { sliceForPage, useTablePagination } from "@/lib/table-pagination";
import { TablePaginationBar } from "@/components/ui/table-pagination-bar";
import { handleUnauthorizedResponse } from "@/lib/client/auth-fetch";

type Brand = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
};

export function AdminBrandsPanel() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const brandPagination = useTablePagination(brands.length);
  const pagedBrands = useMemo(
    () => sliceForPage(brands, brandPagination.page, brandPagination.pageSize),
    [brands, brandPagination.page, brandPagination.pageSize]
  );

  async function loadBrands() {
    setLoading(true);
    const response = await fetch("/api/admin/brands");
    if (handleUnauthorizedResponse(response)) {
      setLoading(false);
      return;
    }
    const data = await response.json();
    if (response.ok) {
      setBrands(data.brands ?? []);
    } else {
      setMessage(data.error ?? "Failed to load brands.");
    }
    setLoading(false);
  }

  useEffect(() => {
    loadBrands();
  }, []);

  async function createBrand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/admin/brands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, name })
    });
    if (handleUnauthorizedResponse(response)) {
      return;
    }
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error ?? "Failed to create brand.");
      return;
    }
    setMessage("Brand created.");
    setCode("");
    setName("");
    await loadBrands();
  }

  async function setBrandActive(brand: Brand, active: boolean) {
    const response = await fetch("/api/admin/brands", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: brand.id, is_active: active })
    });
    if (handleUnauthorizedResponse(response)) {
      return;
    }
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error ?? "Failed to update brand.");
      return;
    }
    await loadBrands();
  }

  return (
    <div className="space-y-6">
      <section className="card">
        <h2 className="mb-3 text-lg font-semibold">Create Brand</h2>
        <form className="grid grid-cols-1 gap-3 lg:grid-cols-3" onSubmit={createBrand}>
          <input
            className="field"
            placeholder="Code (e.g. BRAND_A)"
            required
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
          <input
            className="field"
            placeholder="Brand name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <button className="btn" type="submit">
            Create Brand
          </button>
        </form>
      </section>

      <section className="card">
        <h2 className="mb-3 text-lg font-semibold">Brands</h2>
        {loading ? (
          <p className="text-sm text-muted">Loading brands...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[760px] text-sm">
              <thead className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] text-left">
                <tr>
                  <th className="px-3 py-2">Code</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {pagedBrands.map((brand) => (
                  <tr key={brand.id} className="border-b border-[rgb(var(--border))]">
                    <td className="px-3 py-2">{brand.code}</td>
                    <td className="px-3 py-2">{brand.name}</td>
                    <td className="px-3 py-2">{brand.is_active ? "Active" : "Inactive"}</td>
                    <td className="px-3 py-2">
                      <button
                        className="btn-secondary"
                        onClick={() => void setBrandActive(brand, !brand.is_active)}
                        type="button"
                      >
                        {brand.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <TablePaginationBar
              totalCount={brands.length}
              page={brandPagination.page}
              setPage={brandPagination.setPage}
              pageSize={brandPagination.pageSize}
              setPageSize={brandPagination.setPageSize}
              pageCount={brandPagination.pageCount}
              rangeLabel={brandPagination.rangeLabel}
            />
          </div>
        )}
      </section>
      {message ? <p className="text-sm text-muted">{message}</p> : null}
    </div>
  );
}
