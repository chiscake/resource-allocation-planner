import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/** ~100 years — same pattern as ИБМЗКИ lab1 */
const BAN_DURATION = "876000h";

type Action = "list" | "set_blocked" | "delete" | "set_role";
type AppRole = "user" | "mod";

type AdminUserRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  role: string;
  created_at: string | null;
  last_sign_in_at: string | null;
  blocked: boolean;
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

function isBanned(bannedUntil: string | null | undefined): boolean {
  if (!bannedUntil) return false;
  const t = Date.parse(bannedUntil);
  return Number.isFinite(t) && t > Date.now();
}

async function revokeSessions(
  supabaseUrl: string,
  serviceKey: string,
  userId: string,
) {
  const logoutRes = await fetch(
    `${supabaseUrl}/auth/v1/admin/users/${userId}/logout`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ scope: "global" }),
    },
  );
  if (logoutRes.ok) return;
  await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}/sessions`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
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
      return json({ error: "Only admin can manage users" }, 403);
    }

    const body = (await req.json()) as {
      action?: Action;
      user_ids?: string[];
      blocked?: boolean;
      role?: string;
    };
    const action = body.action;
    if (
      action !== "list" &&
      action !== "set_blocked" &&
      action !== "delete" &&
      action !== "set_role"
    ) {
      return json({ error: "Invalid action" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    if (action === "list") {
      const { data: listed, error: listErr } = await admin.auth.admin.listUsers(
        {
          page: 1,
          perPage: 1000,
        },
      );
      if (listErr) return json({ error: listErr.message }, 400);

      const { data: profiles, error: profilesErr } = await admin
        .from("profiles")
        .select("id, display_name, role");
      if (profilesErr) return json({ error: profilesErr.message }, 500);

      const byId = new Map(
        (profiles ?? []).map((p) => [
          p.id as string,
          p as { id: string; display_name: string | null; role: string },
        ]),
      );

      const users: AdminUserRow[] = (listed.users ?? []).map((u) => {
        const profile = byId.get(u.id);
        // Auth app_metadata is the source of truth for admin protection in UI/Edge.
        const authRole =
          (u.app_metadata?.role as string | undefined) ??
          profile?.role ??
          "user";
        return {
          id: u.id,
          email: u.email ?? null,
          display_name:
            profile?.display_name ??
            (u.user_metadata?.display_name as string | undefined) ??
            null,
          role: authRole,
          created_at: u.created_at ?? null,
          last_sign_in_at: u.last_sign_in_at ?? null,
          blocked: isBanned(u.banned_until as string | null | undefined),
        };
      });

      users.sort((a, b) => {
        const ta = a.created_at ? Date.parse(a.created_at) : 0;
        const tb = b.created_at ? Date.parse(b.created_at) : 0;
        return tb - ta;
      });

      return json({ users });
    }

    const ids = Array.from(
      new Set(
        (body.user_ids ?? [])
          .map((id) => String(id ?? "").trim())
          .filter(Boolean),
      ),
    );
    if (ids.length === 0) return json({ error: "user_ids required" }, 400);
    if (ids.includes(user.id)) {
      return json({ error: "Cannot modify your own account" }, 400);
    }

    const results: { id: string; ok: boolean; error?: string }[] = [];

    for (const targetId of ids) {
      const { data: target, error: getErr } =
        await admin.auth.admin.getUserById(targetId);
      if (getErr || !target.user) {
        results.push({
          id: targetId,
          ok: false,
          error: getErr?.message ?? "User not found",
        });
        continue;
      }
      if (target.user.app_metadata?.role === "admin") {
        results.push({
          id: targetId,
          ok: false,
          error: "Cannot modify admin users",
        });
        continue;
      }

      if (action === "set_blocked") {
        const blocked = Boolean(body.blocked);
        const { error: banErr } = await admin.auth.admin.updateUserById(
          targetId,
          { ban_duration: blocked ? BAN_DURATION : "none" },
        );
        if (banErr) {
          results.push({ id: targetId, ok: false, error: banErr.message });
          continue;
        }
        if (blocked) {
          await revokeSessions(supabaseUrl, serviceKey, targetId);
        }
        await admin.from("audit_events").insert({
          actor_id: user.id,
          action: blocked ? "user.block" : "user.unblock",
          entity_type: "profiles",
          entity_id: targetId,
          target_user_id: targetId,
        });
        results.push({ id: targetId, ok: true });
        continue;
      }

      if (action === "set_role") {
        const nextRole = String(body.role ?? "").trim() as AppRole;
        if (nextRole !== "user" && nextRole !== "mod") {
          results.push({
            id: targetId,
            ok: false,
            error: "role must be user or mod",
          });
          continue;
        }
        const currentRole = String(
          target.user.app_metadata?.role ?? "user",
        ).toLowerCase();
        if (currentRole === "admin") {
          results.push({
            id: targetId,
            ok: false,
            error: "Cannot modify admin users",
          });
          continue;
        }
        if (currentRole === nextRole) {
          results.push({ id: targetId, ok: true });
          continue;
        }
        // Only user ↔ mod
        if (
          !(
            (currentRole === "user" && nextRole === "mod") ||
            (currentRole === "mod" && nextRole === "user")
          )
        ) {
          results.push({
            id: targetId,
            ok: false,
            error: "Only user↔mod role changes are allowed",
          });
          continue;
        }

        const { error: roleErr } = await admin.auth.admin.updateUserById(
          targetId,
          {
            app_metadata: {
              ...(target.user.app_metadata ?? {}),
              role: nextRole,
            },
          },
        );
        if (roleErr) {
          results.push({ id: targetId, ok: false, error: roleErr.message });
          continue;
        }
        const { error: profileErr } = await admin
          .from("profiles")
          .update({ role: nextRole })
          .eq("id", targetId);
        if (profileErr) {
          results.push({ id: targetId, ok: false, error: profileErr.message });
          continue;
        }
        await admin.from("audit_events").insert({
          actor_id: user.id,
          action: nextRole === "mod" ? "user.promote_mod" : "user.demote_user",
          entity_type: "profiles",
          entity_id: targetId,
          target_user_id: targetId,
        });
        results.push({ id: targetId, ok: true });
        continue;
      }

      // delete
      const { error: delErr } = await admin.auth.admin.deleteUser(targetId);
      if (delErr) {
        results.push({ id: targetId, ok: false, error: delErr.message });
        continue;
      }
      await admin.from("audit_events").insert({
        actor_id: user.id,
        action: "user.delete",
        entity_type: "profiles",
        entity_id: targetId,
        target_user_id: targetId,
      });
      results.push({ id: targetId, ok: true });
    }

    const failed = results.filter((r) => !r.ok);
    if (failed.length === ids.length) {
      return json(
        { error: failed[0]?.error ?? "All operations failed", results },
        400,
      );
    }
    return json({ results, ok: results.filter((r) => r.ok).length });
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : "Unexpected error" },
      500,
    );
  }
});
