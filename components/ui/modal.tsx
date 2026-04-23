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

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissible) {
        e.preventDefault();
        onOpenChange(false);
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
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onOpenChange, initialFocusRef, dismissible]);

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
          if (closeOnBackdrop && dismissible) onOpenChange(false);
        }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        {...(descriptionId ? { "aria-describedby": descriptionId } : {})}
        className="card relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="mb-3 text-lg font-semibold">
          {title}
        </h2>
        <div className="text-sm text-slate-700">{children}</div>
        {footer ? <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">{footer}</div> : null}
      </div>
    </div>,
    document.body
  );
}
