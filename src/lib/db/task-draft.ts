import { createBlankModel, cloneModel, type Model } from '$lib/domain';
import { t } from '$lib/i18n';

const STORAGE_KEY = 'rap:task-draft:v1';

export type TaskDraft = {
  title: string;
  model: Model;
  /** Source public/personal template id when opened via «Использовать». */
  templateId?: string | null;
  activeTab?: string;
  includeSensitivity?: boolean;
  updated_at: string;
};

export function loadTaskDraft(): TaskDraft | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TaskDraft;
    if (!parsed?.model || typeof parsed.title !== 'string') return null;
    return {
      ...parsed,
      model: cloneModel(parsed.model),
    };
  } catch {
    return null;
  }
}

export function saveTaskDraft(draft: TaskDraft): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...draft,
        model: cloneModel(draft.model),
        updated_at: draft.updated_at || new Date().toISOString(),
      }),
    );
  } catch {
    /* quota / private mode */
  }
}

export function clearTaskDraft(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function blankTaskDraft(): TaskDraft {
  return {
    title: t('newTask'),
    model: createBlankModel(),
    templateId: null,
    activeTab: 'plan',
    includeSensitivity: false,
    updated_at: new Date().toISOString(),
  };
}

/** Replace session draft with a blank 2×2 task (drops template association). */
export function resetTaskDraftToBlank(): TaskDraft {
  const draft = blankTaskDraft();
  saveTaskDraft(draft);
  return draft;
}
