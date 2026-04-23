"use client";

import { useRef, type ReactNode } from "react";
import { Modal } from "./modal";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
  confirming?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
  /** Destructive: backdrop does not dismiss; Escape still closes via Modal */
  closeOnBackdrop?: boolean;
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  confirming = false,
  onConfirm,
  onCancel,
  closeOnBackdrop = true
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const initialFocusRef = variant === "danger" ? cancelRef : confirmRef;

  function handleCancel() {
    onCancel?.();
    onOpenChange(false);
  }

  async function handleConfirm() {
    await onConfirm();
  }

  const confirmClass =
    variant === "danger"
      ? "rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
      : "btn";

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      closeOnBackdrop={closeOnBackdrop}
      dismissible={!confirming}
      initialFocusRef={initialFocusRef}
      footer={
        <>
          <button ref={cancelRef} type="button" className="btn-secondary" disabled={confirming} onClick={handleCancel}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={confirmClass}
            disabled={confirming}
            onClick={() => void handleConfirm()}
          >
            {confirming ? "Please wait…" : confirmLabel}
          </button>
        </>
      }
    >
      {description}
    </Modal>
  );
}
