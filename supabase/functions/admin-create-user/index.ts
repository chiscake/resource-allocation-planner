import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const anonKey = requireEnv("SUPABASE_ANON_KEY");
    const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization" }, 401);

    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userErr,
    } = await caller.auth.getUser();
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);
    if (user.app_metadata?.role !== "admin") {
      return json({ error: "Only admin can create users" }, 403);
    }

    const body = (await req.json()) as {
      email?: string;
      password?: string;
      display_name?: string;
    };
    const email = String(body.email ?? "")
      .trim()
      .toLowerCase();
    const password = String(body.password ?? "");
    const displayName =
      String(body.display_name ?? "").trim() || email.split("@")[0];

    if (!email.includes("@")) return json({ error: "Invalid email" }, 400);
    if (password.length < 8) return json({ error: "Password too short" }, 400);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: created, error: createErr } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { role: "user" },
        user_metadata: { display_name: displayName },
      });
    if (createErr || !created.user) {
      return json(
        { error: createErr?.message ?? "Failed to create user" },
        400,
      );
    }

    const userId = created.user.id;
    await admin
      .from("profiles")
      .upsert({ id: userId, role: "user", display_name: displayName });

    const { data: seeds } = await admin
      .from("templates")
      .select("*")
      .eq("system_kind", "signup_seed")
      .is("deleted_at", null);
    for (const t of seeds ?? []) {
      await admin.from("templates").insert({
        owner_id: userId,
        title: t.title,
        model: t.model,
        what_if: t.what_if,
      });
    }

    return json({ id: userId, email, display_name: displayName });
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : "Unexpected error" },
      500,
    );
  }
});
