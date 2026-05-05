import type { UseBatchStateResult } from "./useBatchState";

export function useQuantumEditor(batch: UseBatchStateResult) {
  const titleFeedback = batch.inlineSaveFeedback?.field === "title" ? batch.inlineSaveFeedback : null;
  const descriptionFeedback = batch.inlineSaveFeedback?.field === "description" ? batch.inlineSaveFeedback : null;

  return {
    editingField: batch.editingField,
    editableTitleDraft: batch.editableTitleDraft,
    setEditableTitleDraft: batch.setEditableTitleDraft,
    editableDescriptionDraft: batch.editableDescriptionDraft,
    setEditableDescriptionDraft: batch.setEditableDescriptionDraft,
    inlineSaveFeedback: batch.inlineSaveFeedback,
    titleFeedback,
    descriptionFeedback,
    beginInlineEdit: batch.beginInlineEdit,
    commitInlineEdit: batch.commitInlineEdit,
    rerollSelectedImageField: batch.rerollSelectedImageField,
    setEditingField: batch.setEditingField,
    setInlineSaveFeedback: batch.setInlineSaveFeedback,
  };
}

export type UseQuantumEditorResult = ReturnType<typeof useQuantumEditor>;

