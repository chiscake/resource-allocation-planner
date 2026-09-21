/**
 * Seed auth users via Admin API (not SQL).
 * Usage: pnpm seed:users  (requires .env.local with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
 *
 * Default accounts (password from SEED_PASSWORD or password123):
 *   admin@rap.local  — app_metadata.role=admin
 *   demo1@rap.local
 *   demo2@rap.local
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
      title: "Задача 13 (публичный каталог)",
      system_kind: "public_repo",
      model: TASK13_MODEL,
      what_if: WHAT_IF,
      owner_id: null,
    });
    if (error) throw error;
    console.log("inserted public_repo template");
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

const adminId = await ensureUser("admin@rap.local", "admin");
const d1 = await ensureUser("demo1@rap.local", "user");
const d2 = await ensureUser("demo2@rap.local", "user");
await ensureTemplates();
await copySignupSeedToUser(d1);
await copySignupSeedToUser(d2);

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
  await admin.from("organization_members").insert([
    { org_id: orgId, user_id: d1, role: "org_owner" },
    { org_id: orgId, user_id: d2, role: "member" },
  ]);
  console.log("created Demo Org", orgId);
}

console.log("seed done", { adminId, d1, d2, orgId });
