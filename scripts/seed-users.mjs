/**
 * Seed auth users via Admin API (not SQL).
 * Usage: pnpm seed:users  (requires .env.local with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
 *
 * Default accounts (password from SEED_PASSWORD or password123):
 *   admin@example.com  — app_metadata.role=admin (no org)
 *   admin2@example.com — app_metadata.role=admin (no org; second admin for testing)
 *   mod@example.com    — app_metadata.role=mod (public catalog moderation)
 *   demo1@example.com  — org_owner of Demo Org
 *   demo2@example.com  — member of Demo Org
 *   demo3@example.com  — user, no organization_members row
 *
 * Note: switching from older @rap.local emails creates/updates these addresses;
 * existing cloud users under @rap.local are not removed (no db reset).
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvLocal() {
  const p = resolve(process.cwd(), '.env.local');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvLocal();

const url = process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.SEED_PASSWORD || 'password123';

if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const WHAT_IF = {
  resource_pct: 0.1,
  modernization_pct: 0.1,
  price_pct: 0.15,
};

function withWhatIfDefaults(model) {
  return { ...model, what_if_defaults: { ...WHAT_IF } };
}

const TASK13_MODEL = withWhatIfDefaults({
  schema_version: 1,
  resources: ['Труд', 'Сырье', 'Оборудование'],
  products: ['Осциллограф', 'Частотомер', 'Генератор', 'Вольтметр'],
  A: [
    [7, 2, 2, 6],
    [5, 8, 4, 3],
    [2, 4, 1, 8],
  ],
  b: [80, 480, 130],
  c: [3, 4, 3, 1],
  resource_units: ['чел./дней', 'кг', 'станков/ч'],
  product_units: ['шт', 'шт', 'шт', 'шт'],
  objective_unit: 'у.е.',
});

/** Public catalog examples (from task1–3 CSV fixtures). */
const PUBLIC_CATALOG = [
  {
    title: 'Задача 13',
    model: TASK13_MODEL,
  },
  {
    title: 'Столовая',
    model: withWhatIfDefaults({
      schema_version: 1,
      resources: ['Время повара', 'Мясо', 'Овощи', 'Плита (конфорки)'],
      products: ['Борщ', 'Плов', 'Котлета с пюре', 'Салат'],
      A: [
        [6, 9, 8, 3],
        [40, 120, 100, 0],
        [150, 60, 200, 250],
        [3, 4, 3, 0],
      ],
      b: [480, 12000, 30000, 240],
      c: [45, 70, 65, 25],
      resource_units: ['мин', 'г', 'г', 'конфорко-мин'],
      product_units: ['порц', 'порц', 'порц', 'порц'],
      objective_unit: 'руб.',
    }),
  },
  {
    title: 'Марсианская экспедиция',
    model: withWhatIfDefaults({
      schema_version: 1,
      resources: ['Масса', 'Объём', 'Энергопотребление', 'Время экипажа'],
      products: ['Спектрометр', 'Буровая установка', 'Солнечные панели', 'Теплица'],
      A: [
        [40, 120, 60, 90],
        [2, 5, 8, 6],
        [5, 30, -10, 15],
        [4, 12, 3, 20],
      ],
      b: [1500, 100, 200, 240],
      c: [50, 140, 30, 90],
      resource_units: ['кг', 'м³', 'кВт·ч', 'чел.-ч'],
      product_units: ['шт', 'шт', 'шт', 'шт'],
      objective_unit: 'баллов',
    }),
  },
  {
    title: 'Инвестиционный портфель',
    model: withWhatIfDefaults({
      schema_version: 1,
      resources: ['Бюджет', 'Риск (баллы)', 'Ликвидность (дефицит)', 'Управленческое время'],
      products: ['Облигации', 'Акции IT', 'Недвижимость', 'Золото'],
      A: [
        [1, 1, 1, 1],
        [1, 6, 4, 2],
        [2, 1, 6, 1],
        [1, 5, 3, 1],
      ],
      b: [1000, 3500, 2800, 2400],
      c: [5, 12, 9, 4],
      resource_units: ['тыс. у.е.', 'баллов', 'баллов', 'ч'],
      product_units: ['тыс. у.е.', 'тыс. у.е.', 'тыс. у.е.', 'тыс. у.е.'],
      objective_unit: '% годовых',
    }),
  },
];

async function ensureUser(email, role) {
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 });
  const existing = list?.users?.find((u) => u.email === email);
  if (existing) {
    await admin.auth.admin.updateUserById(existing.id, {
      password,
      app_metadata: { role },
      email_confirm: true,
    });
    await admin
      .from('profiles')
      .upsert({ id: existing.id, role, display_name: email.split('@')[0] });
    console.log('updated', email, existing.id);
    return existing.id;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role },
    user_metadata: { display_name: email.split('@')[0] },
  });
  if (error) throw error;
  console.log('created', email, data.user.id);
  return data.user.id;
}

async function ensureTemplates() {
  const { data: existing, error: listErr } = await admin
    .from('templates')
    .select('id, title, system_kind, owner_id')
    .is('deleted_at', null);
  if (listErr) throw listErr;

  const hasSignup = (existing ?? []).some((t) => t.system_kind === 'signup_seed');
  if (!hasSignup) {
    const { error } = await admin.from('templates').insert({
      title: 'Задача 13 — выпуск СИ',
      system_kind: 'signup_seed',
      model: TASK13_MODEL,
      what_if: WHAT_IF,
      owner_id: null,
    });
    if (error) throw error;
    console.log('inserted signup_seed template');
  }

  const publicByTitle = new Map(
    (existing ?? [])
      .filter((t) => t.system_kind === 'public_repo' && t.owner_id == null)
      .map((t) => [t.title, t]),
  );

  for (const entry of PUBLIC_CATALOG) {
    const row = publicByTitle.get(entry.title);
    if (!row) {
      const { error } = await admin.from('templates').insert({
        title: entry.title,
        system_kind: 'public_repo',
        publish_status: 'approved',
        model: entry.model,
        what_if: WHAT_IF,
        owner_id: null,
      });
      if (error) throw error;
      console.log('inserted public_repo template:', entry.title);
      continue;
    }
    const { error } = await admin
      .from('templates')
      .update({
        publish_status: 'approved',
        model: entry.model,
        what_if: WHAT_IF,
      })
      .eq('id', row.id);
    if (error) throw error;
    console.log('updated public_repo template:', entry.title);
  }
}

// Disabled: copy signup_seed → personal templates for seed demos.
// async function copySignupSeedToUser(userId) {
//   const { data: seeds } = await admin
//     .from("templates")
//     .select("*")
//     .eq("system_kind", "signup_seed")
//     .is("deleted_at", null);
//   for (const t of seeds ?? []) {
//     const { data: mine } = await admin
//       .from("templates")
//       .select("id")
//       .eq("owner_id", userId)
//       .eq("title", t.title)
//       .maybeSingle();
//     if (mine) continue;
//     await admin.from("templates").insert({
//       owner_id: userId,
//       title: t.title,
//       system_kind: null,
//       model: t.model,
//       what_if: t.what_if,
//     });
//   }
// }

const adminId = await ensureUser('admin@example.com', 'admin');
const admin2Id = await ensureUser('admin2@example.com', 'admin');
const modId = await ensureUser('mod@example.com', 'mod');
const d1 = await ensureUser('demo1@example.com', 'user');
const d2 = await ensureUser('demo2@example.com', 'user');
const d3 = await ensureUser('demo3@example.com', 'user');
await ensureTemplates();
// Disabled: copy signup_seed → personal templates for seed demos.
// await copySignupSeedToUser(d1);
// await copySignupSeedToUser(d2);
// await copySignupSeedToUser(d3);

const { data: orgs } = await admin
  .from('organizations')
  .select('id')
  .eq('name', 'Demo Org')
  .limit(1);
let orgId = orgs?.[0]?.id;
if (!orgId) {
  const { data: org, error } = await admin
    .from('organizations')
    .insert({ name: 'Demo Org' })
    .select()
    .single();
  if (error) throw error;
  orgId = org.id;
  // Only demo1/demo2 — demo3 stays without organization_members.
  await admin.from('organization_members').insert([
    { org_id: orgId, user_id: d1, role: 'org_owner' },
    { org_id: orgId, user_id: d2, role: 'member' },
  ]);
  console.log('created Demo Org', orgId);
}

console.log('seed done', { adminId, admin2Id, modId, d1, d2, d3, orgId });
