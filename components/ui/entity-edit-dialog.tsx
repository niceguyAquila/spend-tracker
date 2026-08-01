"use client";

import { ConfirmDialog } from "./confirm-dialog";
import { ENTITY_CODE_HINT, ENTITY_CODE_MAX_LENGTH } from "@/lib/entity-code";
import type { EditableEntity, EntityEditor } from "@/lib/entity-editor";

type Props<T extends EditableEntity> = {
  editor: EntityEditor<T>;
  entityLabel: string;
  description?: string;
  onSave: () => void | Promise<void>;
};

export function EntityEditDialog<T extends EditableEntity>({
  editor,
  entityLabel,
  description,
  onSave
}: Props<T>) {
  return (
    <ConfirmDialog
      open={Boolean(editor.target)}
      onOpenChange={editor.requestClose}
      title={`Edit ${entityLabel.toLowerCase()}`}
      description={
        <div className="space-y-3">
          {description ? <p className="text-sm text-muted">{description}</p> : null}
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Code</span>
            <input
              className="field w-full"
              maxLength={ENTITY_CODE_MAX_LENGTH}
              value={editor.draft.code}
              onChange={(event) => editor.setCode(event.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Name</span>
            <input
              className="field w-full"
              maxLength={100}
              value={editor.draft.name}
              onChange={(event) => editor.setName(event.target.value)}
            />
          </label>
          <p className="text-xs text-muted">{ENTITY_CODE_HINT}</p>
        </div>
      }
      confirmLabel="Save Changes"
      confirming={editor.submitting}
      confirmDisabled={!editor.canSave}
      closeOnBackdrop={false}
      onConfirm={onSave}
    />
  );
}
