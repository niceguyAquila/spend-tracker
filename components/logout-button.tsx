"use client";

import { useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { readCsrfCookie } from "@/lib/client/auth-fetch";

export function LogoutButton() {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const tokenRef = useRef<HTMLInputElement>(null);

  function handleConfirm() {
    if (tokenRef.current) {
      tokenRef.current.value = readCsrfCookie() ?? "";
    }
    formRef.current?.requestSubmit();
  }

  return (
    <>
      <form ref={formRef} action="/auth/logout" method="post" className="hidden">
        <input ref={tokenRef} type="hidden" name="csrf_token" defaultValue="" />
      </form>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--text))] transition hover:bg-[rgb(var(--surface-muted))]"
        aria-label="Sign out"
        title="Sign out"
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12.5 4.5h2a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-2" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.5 7.5 11 10l-2.5 2.5M11 10H3.5" />
        </svg>
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Sign out?"
        description="You are about to sign out of this workspace on every device."
        confirmLabel="Sign out"
        cancelLabel="Stay signed in"
        variant="danger"
        onConfirm={handleConfirm}
      />
    </>
  );
}
