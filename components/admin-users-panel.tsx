"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { handleUnauthorizedResponse } from "@/lib/client/auth-fetch";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type AllowedUser = {
  id: string;
  auth_user_id: string | null;
  email: string;
  display_name: string | null;
  role: "admin" | "finance" | "viewer";
  is_active: boolean;
  invited_at: string;
  updated_at: string;
};

export function AdminUsersPanel() {
  const [users, setUsers] = useState<AllowedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<AllowedUser["role"]>("viewer");
  const [authMethod, setAuthMethod] = useState<"password" | "magic_link">("password");
  const [password, setPassword] = useState("");
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [editingDisplayName, setEditingDisplayName] = useState("");
  const [inviteConfirmOpen, setInviteConfirmOpen] = useState(false);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);

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

  async function executeInvite() {
    setInviteSubmitting(true);
    const response = await fetch("/api/admin/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        display_name: displayName.trim() || undefined,
        role,
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
    setPassword("");
    setInviteSubmitting(false);
    setInviteConfirmOpen(false);
    await loadUsers();
  }

  async function updateUser(emailToUpdate: string, payload: Partial<Pick<AllowedUser, "display_name">>) {
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

  function startDisplayNameEdit(user: AllowedUser) {
    setEditingEmail(user.email);
    setEditingDisplayName(user.display_name ?? "");
  }

  function cancelDisplayNameEdit() {
    setEditingEmail(null);
    setEditingDisplayName("");
  }

  async function saveDisplayName(emailToUpdate: string) {
    await updateUser(emailToUpdate, { display_name: editingDisplayName.trim() || null });
    setEditingEmail(null);
    setEditingDisplayName("");
  }

  return (
    <div className="space-y-4">
      <section className="card">
        <h2 className="mb-2 text-lg font-semibold">Provision Allowed User</h2>
        <p className="mb-3 text-sm text-slate-600">
          Admin can create password users directly or send a magic-link invite. Public sign-up should remain disabled.
        </p>
        <form className="grid grid-cols-1 gap-2 md:grid-cols-2" onSubmit={requestInvite}>
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
          <button className="btn" type="submit">
            {authMethod === "password" ? "Create User" : "Send Invite"}
          </button>
        </form>
      </section>

      <section className="card">
        <h2 className="mb-2 text-lg font-semibold">Allowed Users</h2>
        {loading ? (
          <p className="text-sm text-slate-600">Loading users...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Display Name</th>
                  <th className="px-3 py-2">Role</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b">
                    <td className="px-3 py-2">{user.email}</td>
                    <td className="px-3 py-2">
                      {editingEmail === user.email ? (
                        <input
                          className="field max-w-[220px]"
                          value={editingDisplayName}
                          placeholder="No display name"
                          onChange={(event) => setEditingDisplayName(event.target.value)}
                        />
                      ) : (
                        <span>{user.display_name ?? "-"}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{user.role}</td>
                    <td className="px-3 py-2">{user.is_active ? "Active" : "Inactive"}</td>
                    <td className="px-3 py-2">
                      {editingEmail === user.email ? (
                        <div className="flex gap-2">
                          <button className="btn-secondary" onClick={() => saveDisplayName(user.email)}>
                            Save
                          </button>
                          <button className="btn-secondary" onClick={cancelDisplayNameEdit}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button className="btn-secondary" onClick={() => startDisplayNameEdit(user)}>
                          Edit
                        </button>
                      )}
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
            <li>{authMethod === "password" ? "Sign-in: password (temporary password will be set)" : "Sign-in: magic link email"}</li>
            {displayName.trim() ? <li>Display name: {displayName.trim()}</li> : null}
          </ul>
        }
        onConfirm={() => void executeInvite()}
      />
    </div>
  );
}
