"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { handleUnauthorizedResponse } from "@/lib/client/auth-fetch";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal } from "@/components/ui/modal";

type AllowedUser = {
  id: string;
  auth_user_id: string | null;
  email: string;
  display_name: string | null;
  role: "admin" | "finance" | "viewer";
  is_active: boolean;
  invited_at: string;
  updated_at: string;
  brand_roles: Array<{
    brand_id: string;
    role: "admin" | "finance" | "viewer";
    is_active: boolean;
  }>;
};

type Brand = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
};

export function AdminUsersPanel() {
  const [users, setUsers] = useState<AllowedUser[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<AllowedUser["role"]>("viewer");
  const [selectedBrandIds, setSelectedBrandIds] = useState<string[]>([]);
  const [authMethod, setAuthMethod] = useState<"password" | "magic_link">("password");
  const [password, setPassword] = useState("");
  const [inviteConfirmOpen, setInviteConfirmOpen] = useState(false);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [editingUser, setEditingUser] = useState<AllowedUser | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editRole, setEditRole] = useState<AllowedUser["role"]>("viewer");
  const [editBrandRoles, setEditBrandRoles] = useState<Record<string, "admin" | "finance" | "viewer" | "none">>({});
  const [editSubmitting, setEditSubmitting] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/admin/users");
    if (handleUnauthorizedResponse(response)) {
      setLoading(false);
      return;
    }
    const data = await response.json();
    if (response.ok) {
      setUsers(data.users ?? []);
      setBrands((data.brands ?? []).filter((item: Brand) => item.is_active));
      setSelectedBrandIds((current) => {
        if (current.length || !Array.isArray(data.brands) || data.brands.length === 0) {
          return current;
        }
        return [data.brands[0].id];
      });
    } else {
      setMessage(data.error ?? "Failed to load users.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  function requestInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setInviteConfirmOpen(true);
  }

  function toggleInviteBrand(brandId: string) {
    setSelectedBrandIds((current) =>
      current.includes(brandId) ? current.filter((item) => item !== brandId) : [...current, brandId]
    );
  }

  async function executeInvite() {
    if (!selectedBrandIds.length) {
      setMessage("Select at least one brand for this user.");
      setInviteSubmitting(false);
      setInviteConfirmOpen(false);
      return;
    }
    setInviteSubmitting(true);
    const response = await fetch("/api/admin/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        display_name: displayName.trim() || undefined,
        role,
        brand_roles: selectedBrandIds.map((brandId) => ({
          brand_id: brandId,
          role
        })),
        auth_method: authMethod,
        password: authMethod === "password" ? password : undefined
      })
    });
    if (handleUnauthorizedResponse(response)) {
      setInviteSubmitting(false);
      setInviteConfirmOpen(false);
      return;
    }
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error ?? "Failed to invite user.");
      setInviteSubmitting(false);
      setInviteConfirmOpen(false);
      return;
    }

    setMessage(authMethod === "password" ? "User created/updated with password." : "Invitation sent.");
    setEmail("");
    setDisplayName("");
    setRole("viewer");
    setSelectedBrandIds(brands.length > 0 ? [brands[0].id] : []);
    setPassword("");
    setInviteSubmitting(false);
    setInviteConfirmOpen(false);
    await loadUsers();
  }

  async function updateUser(
    emailToUpdate: string,
    payload: Partial<Pick<AllowedUser, "display_name" | "role">> & {
      brand_roles?: Array<{ brand_id: string; role: "admin" | "finance" | "viewer"; is_active: boolean }>;
    }
  ) {
    const response = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailToUpdate, ...payload })
    });
    if (handleUnauthorizedResponse(response)) {
      return;
    }
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error ?? "Failed to update user.");
      return;
    }
    setMessage("User updated.");
    await loadUsers();
  }

  function getUserBrandRole(user: AllowedUser, brandId: string): "admin" | "finance" | "viewer" | "none" {
    const roleRow = user.brand_roles.find((item) => item.brand_id === brandId && item.is_active);
    return roleRow?.role ?? "none";
  }

  function startUserEdit(user: AllowedUser) {
    const nextRoles: Record<string, "admin" | "finance" | "viewer" | "none"> = {};
    for (const brand of brands) {
      nextRoles[brand.id] = getUserBrandRole(user, brand.id);
    }
    setEditingUser(user);
    setEditDisplayName(user.display_name ?? "");
    setEditRole(user.role);
    setEditBrandRoles(nextRoles);
  }

  function closeUserEditDialog() {
    if (editSubmitting) return;
    setEditingUser(null);
    setEditDisplayName("");
    setEditRole("viewer");
    setEditBrandRoles({});
  }

  async function saveUserEdit() {
    if (!editingUser) return;
    setEditSubmitting(true);

    const nextBrandRoles = Object.entries(editBrandRoles)
      .filter(([, roleValue]) => roleValue !== "none")
      .map(([brandId, roleValue]) => ({
        brand_id: brandId,
        role: roleValue as "admin" | "finance" | "viewer",
        is_active: true
      }));

    await updateUser(editingUser.email, {
      role: editRole,
      display_name: editDisplayName.trim() || null,
      brand_roles: nextBrandRoles
    });

    setEditSubmitting(false);
    closeUserEditDialog();
  }

  return (
    <div className="space-y-6">
      <section className="card">
        <h2 className="mb-3 text-lg font-semibold">Provision Allowed User</h2>
        <p className="mb-4 text-sm text-slate-600">
          Admin can create password users directly or send a magic-link invite. Public sign-up should remain disabled.
        </p>
        <form className="grid grid-cols-1 gap-3 lg:grid-cols-2" onSubmit={requestInvite}>
          <input
            className="field"
            type="email"
            required
            placeholder="user@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <input
            className="field"
            type="text"
            placeholder="Display name (optional)"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
          <select className="field" value={role} onChange={(event) => setRole(event.target.value as AllowedUser["role"])}>
            <option value="viewer">Viewer</option>
            <option value="finance">Finance</option>
            <option value="admin">Admin</option>
          </select>
          <select
            className="field"
            value={authMethod}
            onChange={(event) => setAuthMethod(event.target.value as "password" | "magic_link")}
          >
            <option value="password">Password</option>
            <option value="magic_link">Magic link</option>
          </select>
          <input
            className="field"
            type="password"
            placeholder={authMethod === "password" ? "Temporary password (min 8)" : "Password not required for magic link"}
            disabled={authMethod !== "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required={authMethod === "password"}
          />
          <div className="lg:col-span-2">
            <p className="mb-1 text-xs font-medium text-slate-700">Brand access</p>
            <div className="flex flex-wrap gap-2">
              {brands.map((brand) => (
                <label key={brand.id} className="inline-flex items-center gap-2 rounded border px-2 py-1 text-xs">
                  <input
                    type="checkbox"
                    checked={selectedBrandIds.includes(brand.id)}
                    onChange={() => toggleInviteBrand(brand.id)}
                  />
                  {brand.name}
                </label>
              ))}
            </div>
          </div>
          <button className="btn" type="submit">
            {authMethod === "password" ? "Create User" : "Send Invite"}
          </button>
        </form>
      </section>

      <section className="card">
        <h2 className="mb-3 text-lg font-semibold">Allowed Users</h2>
        {loading ? (
          <p className="text-sm text-slate-600">Loading users...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[980px] text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Display Name</th>
                  <th className="px-3 py-2">Role</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Brand Access</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b">
                    <td className="px-3 py-2">{user.email}</td>
                    <td className="px-3 py-2">{user.display_name ?? "-"}</td>
                    <td className="px-3 py-2">{user.role}</td>
                    <td className="px-3 py-2">{user.is_active ? "Active" : "Inactive"}</td>
                    <td className="px-3 py-2">
                      <div className="grid gap-1 text-xs">
                        {brands.map((brand) => (
                          <div key={brand.id} className="flex items-center justify-between gap-2">
                            <span>{brand.name}</span>
                            <span className="rounded bg-slate-100 px-2 py-0.5">{getUserBrandRole(user, brand.id)}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <button className="btn-secondary" onClick={() => startUserEdit(user)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {message ? (
        <p className="text-sm text-slate-700" role="status" aria-live="polite">
          {message}
        </p>
      ) : null}

      <ConfirmDialog
        open={inviteConfirmOpen}
        onOpenChange={(open) => {
          if (!open && !inviteSubmitting) setInviteConfirmOpen(false);
        }}
        title={authMethod === "password" ? "Create user?" : "Send invitation?"}
        closeOnBackdrop={false}
        confirming={inviteSubmitting}
        confirmLabel={authMethod === "password" ? "Create user" : "Send invite"}
        description={
          <ul className="list-inside list-disc space-y-1">
            <li className="break-all font-medium text-slate-900">{email}</li>
            <li>Role: {role}</li>
            <li>Brands: {selectedBrandIds.length}</li>
            <li>{authMethod === "password" ? "Sign-in: password (temporary password will be set)" : "Sign-in: magic link email"}</li>
            {displayName.trim() ? <li>Display name: {displayName.trim()}</li> : null}
          </ul>
        }
        onConfirm={() => void executeInvite()}
      />

      <Modal
        open={Boolean(editingUser)}
        onOpenChange={(open) => {
          if (!open) closeUserEditDialog();
        }}
        title="Edit Allowed User"
        dismissible={!editSubmitting}
        closeOnBackdrop={!editSubmitting}
        footer={
          <>
            <button type="button" className="btn-secondary" disabled={editSubmitting} onClick={closeUserEditDialog}>
              Cancel
            </button>
            <button type="button" className="btn" disabled={editSubmitting} onClick={() => void saveUserEdit()}>
              {editSubmitting ? "Saving..." : "Save"}
            </button>
          </>
        }
      >
        {editingUser ? (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">{editingUser.email}</p>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-700">Display name</span>
              <input
                className="field"
                value={editDisplayName}
                placeholder="No display name"
                onChange={(event) => setEditDisplayName(event.target.value)}
                disabled={editSubmitting}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-700">Global role</span>
              <select
                className="field"
                value={editRole}
                onChange={(event) => setEditRole(event.target.value as AllowedUser["role"])}
                disabled={editSubmitting}
              >
                <option value="viewer">Viewer</option>
                <option value="finance">Finance</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-700">Brand access</p>
              <div className="space-y-2">
                {brands.map((brand) => (
                  <label key={brand.id} className="flex items-center justify-between gap-2">
                    <span className="text-xs">{brand.name}</span>
                    <select
                      className="field w-40"
                      value={editBrandRoles[brand.id] ?? "none"}
                      disabled={editSubmitting}
                      onChange={(event) =>
                        setEditBrandRoles((current) => ({
                          ...current,
                          [brand.id]: event.target.value as "admin" | "finance" | "viewer" | "none"
                        }))
                      }
                    >
                      <option value="none">No access</option>
                      <option value="viewer">Viewer</option>
                      <option value="finance">Finance</option>
                      <option value="admin">Admin</option>
                    </select>
                  </label>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
