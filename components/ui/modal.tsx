"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  titleId?: string;
  descriptionId?: string;
  /** If false, backdrop clicks do not close (destructive dialogs). */
  closeOnBackdrop?: boolean;
  /** When false, Escape does not close (e.g. while submitting). */
  dismissible?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
};

// Reference-counted body scroll lock shared across all Modal instances.
// Using a simple "save/restore prev value" pattern per modal breaks when
// multiple modals close in the same render: cleanups run in mount order, so
// a later modal restores its stale captured value ("hidden") and leaves the
// page unscrollable. The counter ensures only the first lock saves the
// original overflow and only the last release restores it, regardless of
// which modal cleans up first.
let bodyScrollLockCount = 0;
let bodyScrollLockPrevOverflow = "";

function lockBodyScroll() {
  if (typeof document === "undefined") return;
  if (bodyScrollLockCount === 0) {
    bodyScrollLockPrevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  bodyScrollLockCount += 1;
}

function unlockBodyScroll() {
  if (typeof document === "undefined") return;
  if (bodyScrollLockCount === 0) return;
  bodyScrollLockCount -= 1;
  if (bodyScrollLockCount === 0) {
    document.body.style.overflow = bodyScrollLockPrevOverflow;
    bodyScrollLockPrevOverflow = "";
  }
}

export function Modal({
  open,
  onOpenChange,
  title,
  titleId: titleIdProp,
  descriptionId,
  closeOnBackdrop = true,
  dismissible = true,
  children,
  footer,
  initialFocusRef
}: Props) {
  const autoTitleId = useId();
  const titleId = titleIdProp ?? autoTitleId;
  const panelRef = useRef<HTMLDivElement>(null);
  const dismissibleRef = useRef(dismissible);
  const onOpenChangeRef = useRef(onOpenChange);

  useEffect(() => {
    dismissibleRef.current = dismissible;
    onOpenChangeRef.current = onOpenChange;
  }, [dismissible, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    lockBodyScroll();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissibleRef.current) {
        e.preventDefault();
        onOpenChangeRef.current(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);

    const id = requestAnimationFrame(() => {
      const target = initialFocusRef?.current ?? panelRef.current?.querySelector<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
      target?.focus();
    });

    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener("keydown", onKeyDown);
      unlockBodyScroll();
    };
  }, [open, initialFocusRef]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close dialog"
        onClick={() => {
          if (closeOnBackdrop && dismissibleRef.current) onOpenChangeRef.current(false);
        }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        {...(descriptionId ? { "aria-describedby": descriptionId } : {})}
        className="relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 shadow-lg lg:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="mb-3 text-lg font-semibold">
          {title}
        </h2>
        <div className="text-sm text-slate-700">{children}</div>
        {footer ? <div className="mt-4 flex flex-wrap justify-end gap-2 pt-4">{footer}</div> : null}
      </div>
    </div>,
    document.body
  );
}
