import { getOfflineBackend } from '$lib/db/offline-idb';
import type { PublishStatus } from '$lib/db/template-publish';
import type { Model } from '$lib/domain';

export type CachedPublicTemplate = {
  id: string;
  title: string;
  model: Model | null;
  owner_id: string | null;
};

export type PublicTemplatesSnapshot = {
  rows: CachedPublicTemplate[];
  savedAt: string;
};

export type CachedPersonalTemplate = {
  id: string;
  title: string;
  model: Model | null;
  updated_at: string | null;
  system_kind: string | null;
  publish_status: PublishStatus;
  /** Unsynced after a failed/offline save attempt — show badge/banner. */
  dirty?: boolean;
  /** Created on device; not yet INSERTed to cloud. Quiet until first save attempt. */
  localOnly?: boolean;
};

export type PersonalTemplatesSnapshot = {
  userId: string;
  rows: CachedPersonalTemplate[];
  savedAt: string;
};

const PUBLIC_META_KEY = 'public_templates';

function personalMetaKey(userId: string): string {
  return `personal_templates:${userId}`;
}

export async function savePublicTemplatesCache(
  rows: CachedPublicTemplate[],
): Promise<PublicTemplatesSnapshot> {
  const snap: PublicTemplatesSnapshot = {
    rows,
    savedAt: new Date().toISOString(),
  };
  await getOfflineBackend().put('meta', PUBLIC_META_KEY, snap);
  return snap;
}

export async function loadPublicTemplatesCache(): Promise<PublicTemplatesSnapshot | null> {
  const snap = await getOfflineBackend().get<PublicTemplatesSnapshot>('meta', PUBLIC_META_KEY);
  return snap ?? null;
}

export async function clearPublicTemplatesCache(): Promise<void> {
  await getOfflineBackend().delete('meta', PUBLIC_META_KEY);
}

export async function savePersonalTemplatesCache(
  userId: string,
  rows: CachedPersonalTemplate[],
): Promise<PersonalTemplatesSnapshot> {
  const snap: PersonalTemplatesSnapshot = {
    userId,
    rows,
    savedAt: new Date().toISOString(),
  };
  await getOfflineBackend().put('meta', personalMetaKey(userId), snap);
  return snap;
}

export async function loadPersonalTemplatesCache(
  userId: string,
): Promise<PersonalTemplatesSnapshot | null> {
  const snap = await getOfflineBackend().get<PersonalTemplatesSnapshot>(
    'meta',
    personalMetaKey(userId),
  );
  if (!snap || snap.userId !== userId) return null;
  return snap;
}

export async function clearPersonalTemplatesCache(userId: string): Promise<void> {
  await getOfflineBackend().delete('meta', personalMetaKey(userId));
}

export async function getPersonalTemplateCacheRow(
  userId: string,
  templateId: string,
): Promise<CachedPersonalTemplate | null> {
  const snap = await loadPersonalTemplatesCache(userId);
  return snap?.rows.find((r) => r.id === templateId) ?? null;
}

/** Upsert one personal row; preserves other cached rows (including dirty locals). */
export async function upsertPersonalTemplateCache(
  userId: string,
  row: CachedPersonalTemplate,
): Promise<PersonalTemplatesSnapshot> {
  const prev = await loadPersonalTemplatesCache(userId);
  const rows = [...(prev?.rows ?? [])];
  const idx = rows.findIndex((r) => r.id === row.id);
  if (idx >= 0) rows[idx] = row;
  else rows.push(row);
  return savePersonalTemplatesCache(userId, rows);
}

/**
 * Replace the cloud snapshot but keep dirty / localOnly rows that are not in `cloudRows`.
 */
export async function savePersonalTemplatesCacheMergingDirty(
  userId: string,
  cloudRows: CachedPersonalTemplate[],
): Promise<PersonalTemplatesSnapshot> {
  const prev = await loadPersonalTemplatesCache(userId);
  const cloudIds = new Set(cloudRows.map((r) => r.id));
  const keepLocals = (prev?.rows ?? []).filter(
    (r) => !cloudIds.has(r.id) && (r.dirty || r.localOnly),
  );
  const mergedCloud = cloudRows.map((row) => {
    const prevRow = prev?.rows.find((r) => r.id === row.id);
    if (prevRow?.dirty || prevRow?.localOnly) {
      return {
        ...prevRow,
        // Keep local dirty payload; refresh catalog fields that cannot diverge offline.
        system_kind: row.system_kind,
        publish_status: row.publish_status,
      };
    }
    return { ...row, dirty: false, localOnly: false };
  });
  return savePersonalTemplatesCache(userId, [...keepLocals, ...mergedCloud]);
}

/** Find a template model in public or personal offline caches. */
export async function findCachedTemplateRow(
  templateId: string,
  userId?: string | null,
): Promise<{ id: string; title: string; model: Model; system_kind?: string | null } | null> {
  const pub = await loadPublicTemplatesCache();
  const fromPub = pub?.rows.find((r) => r.id === templateId);
  if (fromPub?.model) {
    return {
      id: fromPub.id,
      title: fromPub.title,
      model: fromPub.model,
      system_kind: 'public_repo',
    };
  }
  if (userId) {
    const personal = await loadPersonalTemplatesCache(userId);
    const fromPersonal = personal?.rows.find((r) => r.id === templateId);
    if (fromPersonal?.model) {
      return {
        id: fromPersonal.id,
        title: fromPersonal.title,
        model: fromPersonal.model,
        system_kind: fromPersonal.system_kind,
      };
    }
  }
  return null;
}
