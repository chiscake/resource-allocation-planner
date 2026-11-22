import { goto } from '$app/navigation';
import { createBlankModel, cloneModel, type Model, type SolveResponse } from '$lib/domain';
import { writeAudit } from '$lib/db/audit';
import { supabase } from '$lib/db/supabase';
import { clearGuest, saveGuestModel } from '$lib/db/guest';
import { recordPublicTemplateUse } from '$lib/db/template-uses';
import { blankTaskDraft, clearTaskDraft, saveTaskDraft, type TaskDraft } from '$lib/db/task-draft';
import { t } from '$lib/i18n';

export type CreateSolveNodeOk = { id: string };
export type CreateSolveNodeErr = { error: string };
export type CreateSolveNodeResult = CreateSolveNodeOk | CreateSolveNodeErr;

type TemplateRow = {
  id: string;
  title: string;
  model: Model;
  what_if?: Model['what_if_defaults'] | null;
  system_kind?: string | null;
};

/** Snapshot a template row into a solve_nodes model (copies what_if → what_if_defaults). */
export function modelFromTemplate(row: Pick<TemplateRow, 'model' | 'what_if'>): Model {
  const snapshot = cloneModel(row.model);
  if (row.what_if && typeof row.what_if === 'object') {
    snapshot.what_if_defaults = { ...row.what_if };
  }
  return snapshot;
}

export async function createSolveNode(
  model: Model,
  title: string,
  extra?: {
    result?: SolveResponse['result'] | null;
    solver_meta?: SolveResponse['solver_meta'] | null;
  },
): Promise<CreateSolveNodeResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: t('noSession') };
  }
  const snapshot = cloneModel(model);
  const { data, error } = await supabase
    .from('solve_nodes')
    .insert({
      owner_id: user.id,
      title,
      kind: 'root',
      model: snapshot,
      result: extra?.result ?? null,
      solver_meta: extra?.solver_meta ?? null,
    })
    .select('id')
    .single();
  if (error) {
    return { error: error.message };
  }
  return { id: data.id as string };
}

export async function createEmptySolveNode(): Promise<CreateSolveNodeResult> {
  return createSolveNode(createBlankModel(), t('newTask'));
}

export async function createSolveNodeFromTemplateId(
  templateId: string,
): Promise<CreateSolveNodeResult> {
  const { data, error } = await supabase
    .from('templates')
    .select('id, title, model, what_if')
    .eq('id', templateId)
    .is('deleted_at', null)
    .single();
  if (error || !data) {
    return { error: error?.message ?? t('notFound') };
  }
  const row = data as TemplateRow;
  return createSolveNode(modelFromTemplate(row), row.title);
}

async function openGuestFromModel(model: Model, title: string): Promise<null> {
  saveGuestModel(title, model);
  await goto('/app', { replaceState: true });
  return null;
}

/** Create a root node and navigate to it (replaceState so Back skips the helper route). */
export async function createSolveNodeAndOpen(
  model: Model,
  title: string,
): Promise<CreateSolveNodeErr | null> {
  const result = await createSolveNode(model, title);
  if ('error' in result) {
    if (result.error === t('noSession')) {
      return openGuestFromModel(model, title);
    }
    return result;
  }
  clearTaskDraft();
  await goto(`/app/task/${result.id}`, { replaceState: true });
  return null;
}

/** Open blank draft editor — no DB row until first solve. */
export async function createEmptySolveNodeAndOpen(): Promise<CreateSolveNodeErr | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // Fresh in-memory blank on /app; persist only after guest edits (GuestWorkspace).
    clearGuest();
    await goto('/app', { replaceState: true });
    return null;
  }
  const draft = blankTaskDraft();
  saveTaskDraft(draft);
  await goto('/app/create', { replaceState: true });
  return null;
}

/**
 * Open draft from template (no solve_nodes insert).
 * Records template_uses immediately for public_repo.
 */
export async function useTemplateAndOpen(templateId: string): Promise<CreateSolveNodeErr | null> {
  const { data, error } = await supabase
    .from('templates')
    .select('id, title, model, what_if, system_kind')
    .eq('id', templateId)
    .is('deleted_at', null)
    .single();
  if (error || !data) {
    return { error: error?.message ?? t('notFound') };
  }
  const row = data as TemplateRow;
  const model = modelFromTemplate(row);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return openGuestFromModel(model, row.title);
  }

  await recordPublicTemplateUse(templateId);

  const draft: TaskDraft = {
    title: row.title,
    model,
    templateId,
    activeTab: 'plan',
    includeSensitivity: false,
    updated_at: new Date().toISOString(),
  };
  saveTaskDraft(draft);
  await goto(`/app/create?template=${encodeURIComponent(templateId)}`, {
    replaceState: true,
  });
  return null;
}

/** Persist draft after a solve response (any status) and open the task. */
export async function persistDraftAfterSolve(opts: {
  title: string;
  model: Model;
  response: SolveResponse;
}): Promise<CreateSolveNodeResult> {
  const result = await createSolveNode(opts.model, opts.title, {
    result: opts.response.result ?? null,
    solver_meta: opts.response.solver_meta ?? null,
  });
  if ('error' in result) return result;
  clearTaskDraft();
  await goto(`/app/task/${result.id}`, { replaceState: true });
  return result;
}

/** Create a blank private template for the signed-in user. */
export async function createBlankPersonalTemplate(): Promise<CreateSolveNodeResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: t('noSession') };
  }
  const model = createBlankModel();
  const { data: inserted, error: insErr } = await supabase
    .from('templates')
    .insert({
      owner_id: user.id,
      title: t('newTemplate'),
      system_kind: null,
      model,
      what_if: model.what_if_defaults ?? null,
    })
    .select('id')
    .single();
  if (insErr || !inserted) {
    return { error: insErr?.message ?? t('createTemplateFailed') };
  }
  const id = inserted.id as string;
  await writeAudit({
    action: 'template_create',
    entity_type: 'template',
    entity_id: id,
  });
  return { id };
}

/** Copy a catalog/system template onto the signed-in user's personal templates. */
export async function copyTemplateToAccount(templateId: string): Promise<CreateSolveNodeResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: t('noSession') };
  }
  const { data, error } = await supabase
    .from('templates')
    .select('id, title, model, what_if')
    .eq('id', templateId)
    .is('deleted_at', null)
    .single();
  if (error || !data) {
    return { error: error?.message ?? t('notFound') };
  }
  const row = data as TemplateRow;
  const model = modelFromTemplate(row);
  const { data: inserted, error: insErr } = await supabase
    .from('templates')
    .insert({
      owner_id: user.id,
      title: row.title,
      system_kind: null,
      model,
      what_if: row.what_if ?? model.what_if_defaults ?? null,
    })
    .select('id')
    .single();
  if (insErr || !inserted) {
    return { error: insErr?.message ?? t('saveTemplateFailed') };
  }
  return { id: inserted.id as string };
}

/** Save a personal copy and open the template editor — no solve-node created. */
export async function copyTemplateAndEdit(templateId: string): Promise<CreateSolveNodeErr | null> {
  const result = await copyTemplateToAccount(templateId);
  if ('error' in result) return result;
  await goto(`/app/templates/${result.id}?edit=1`);
  return null;
}
