"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

type ModalSize = "sm" | "md" | "lg" | "xl";

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
  /** Panel max-width. Defaults to `md` (448px) so existing callers are unchanged. */
  size?: ModalSize;
  children: ReactNode;
  footer?: ReactNode;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  /** When set, Ctrl/Cmd+Enter inside the panel invokes this callback. */
  onSubmitShortcut?: () => void;
};

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
  xl: "max-w-5xl"
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
  size = "md",
  children,
  footer,
  initialFocusRef,
  onSubmitShortcut
}: Props) {
  const autoTitleId = useId();
  const titleId = titleIdProp ?? autoTitleId;
  const panelRef = useRef<HTMLDivElement>(null);
  const dismissibleRef = useRef(dismissible);
  const onOpenChangeRef = useRef(onOpenChange);
  const onSubmitShortcutRef = useRef(onSubmitShortcut);

  useEffect(() => {
    dismissibleRef.current = dismissible;
    onOpenChangeRef.current = onOpenChange;
    onSubmitShortcutRef.current = onSubmitShortcut;
  }, [dismissible, onOpenChange, onSubmitShortcut]);

  useEffect(() => {
    if (!open) return;
    lockBodyScroll();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissibleRef.current) {
        e.preventDefault();
        onOpenChangeRef.current(false);
        return;
      }
      if (
        e.key === "Enter" &&
        (e.ctrlKey || e.metaKey) &&
        onSubmitShortcutRef.current
      ) {
        e.preventDefault();
        onSubmitShortcutRef.current();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    const id = requestAnimationFrame(() => {
      const panel = panelRef.current;
      const nominated = panel?.querySelector<HTMLElement>("[data-autofocus]");
      const fallback = panel?.querySelector<HTMLElement>(
        "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
      );
      const target = initialFocusRef?.current ?? nominated ?? fallback;
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
        className={`relative z-10 flex max-h-[90vh] w-full flex-col overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-lg ${SIZE_CLASS[size]}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-[rgb(var(--border))] px-4 pb-3 pt-4 lg:px-5 lg:pt-5">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 text-sm text-[rgb(var(--text))] lg:px-5">
          {children}
        </div>
        {footer ? (
          <div className="shrink-0 border-t border-[rgb(var(--border))] px-4 py-3 lg:px-5">
            <div className="flex flex-wrap justify-end gap-2">{footer}</div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
