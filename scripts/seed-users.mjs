/**
 * Seed auth users via Admin API (not SQL).
 * Usage: pnpm seed:users  (requires .env.local with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
 *
 * Default accounts (password from SEED_PASSWORD or password123):
 *   admin@example.com  — app_metadata.role=admin (no org)
 *   mod@example.com    — app_metadata.role=mod (public catalog moderation)
 *   demo1@example.com  — org_owner of Demo Org
 *   demo2@example.com  — member of Demo Org
 *   demo3@example.com  — user, no organization_members row
 *
 * Note: switching from older @rap.local emails creates/updates these addresses;
 * existing cloud users under @rap.local are not removed (no db reset).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvLocal();

const url = process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.SEED_PASSWORD || "password123";

if (!url || !serviceKey) {
  console.error(
    "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TASK13_MODEL = {
  schema_version: 1,
  resources: ["Труд", "Сырье", "Оборудование"],
  products: ["Осциллограф", "Частотомер", "Генератор", "Вольтметр"],
  A: [
    [7, 2, 2, 6],
    [5, 8, 4, 3],
    [2, 4, 1, 8],
  ],
  b: [80, 480, 130],
  c: [3, 4, 3, 1],
  resource_units: ["чел./дней", "кг", "станков/ч"],
  product_units: ["шт", "шт", "шт", "шт"],
  objective_unit: "у.е.",
  what_if_defaults: {
    resource_pct: 0.1,
    modernization_pct: 0.1,
    price_pct: 0.15,
  },
};

const WHAT_IF = {
  resource_pct: 0.1,
  modernization_pct: 0.1,
  price_pct: 0.15,
};

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
      .from("profiles")
      .upsert({ id: existing.id, role, display_name: email.split("@")[0] });
    console.log("updated", email, existing.id);
    return existing.id;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role },
    user_metadata: { display_name: email.split("@")[0] },
  });
  if (error) throw error;
  console.log("created", email, data.user.id);
  return data.user.id;
}

async function ensureTemplates() {
  const { data: existing } = await admin
    .from("templates")
    .select("id, system_kind")
    .is("deleted_at", null);
  const kinds = new Set((existing ?? []).map((t) => t.system_kind));
  if (!kinds.has("signup_seed")) {
    const { error } = await admin.from("templates").insert({
      title: "Задача 13 — выпуск СИ",
      system_kind: "signup_seed",
      model: TASK13_MODEL,
      what_if: WHAT_IF,
      owner_id: null,
    });
    if (error) throw error;
    console.log("inserted signup_seed template");
  }
  if (!kinds.has("public_repo")) {
    const { error } = await admin.from("templates").insert({
      title: "Задача 13",
      system_kind: "public_repo",
      publish_status: "approved",
      model: TASK13_MODEL,
      what_if: WHAT_IF,
      owner_id: null,
    });
    if (error) throw error;
    console.log("inserted public_repo template");
  } else {
    // Strip legacy «(публичный каталог)» suffix without full reset.
    const { error: titleErr } = await admin
      .from("templates")
      .update({ title: "Задача 13" })
      .eq("system_kind", "public_repo")
      .is("deleted_at", null)
      .neq("title", "Задача 13");
    if (titleErr) throw titleErr;
    const { error: statusErr } = await admin
      .from("templates")
      .update({ publish_status: "approved" })
      .eq("system_kind", "public_repo")
      .is("deleted_at", null)
      .is("publish_status", null);
    if (statusErr) throw statusErr;
  }
}

async function copySignupSeedToUser(userId) {
  const { data: seeds } = await admin
    .from("templates")
    .select("*")
    .eq("system_kind", "signup_seed")
    .is("deleted_at", null);
  for (const t of seeds ?? []) {
    const { data: mine } = await admin
      .from("templates")
      .select("id")
      .eq("owner_id", userId)
      .eq("title", t.title)
      .maybeSingle();
    if (mine) continue;
    await admin.from("templates").insert({
      owner_id: userId,
      title: t.title,
      system_kind: null,
      model: t.model,
      what_if: t.what_if,
    });
  }
}

const adminId = await ensureUser("admin@example.com", "admin");
const modId = await ensureUser("mod@example.com", "mod");
const d1 = await ensureUser("demo1@example.com", "user");
const d2 = await ensureUser("demo2@example.com", "user");
const d3 = await ensureUser("demo3@example.com", "user");
await ensureTemplates();
await copySignupSeedToUser(d1);
await copySignupSeedToUser(d2);
await copySignupSeedToUser(d3);

const { data: orgs } = await admin
  .from("organizations")
  .select("id")
  .eq("name", "Demo Org")
  .limit(1);
let orgId = orgs?.[0]?.id;
if (!orgId) {
  const { data: org, error } = await admin
    .from("organizations")
    .insert({ name: "Demo Org" })
    .select()
    .single();
  if (error) throw error;
  orgId = org.id;
  // Only demo1/demo2 — demo3 stays without organization_members.
  await admin.from("organization_members").insert([
    { org_id: orgId, user_id: d1, role: "org_owner" },
    { org_id: orgId, user_id: d2, role: "member" },
  ]);
  console.log("created Demo Org", orgId);
}

console.log("seed done", { adminId, modId, d1, d2, d3, orgId });
