import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function sessionIdFromJwt(accessToken: string): string | null {
  try {
    const parts = accessToken.split('.');
    if (parts.length < 2) return null;
    const payload = parts[1];
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    const jsonStr = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
    const claims = JSON.parse(jsonStr) as { session_id?: unknown };
    return typeof claims.session_id === 'string' && claims.session_id.trim()
      ? claims.session_id.trim()
      : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const supabaseUrl = requireEnv('SUPABASE_URL');
    const anonKey = requireEnv('SUPABASE_ANON_KEY');
    const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization' }, 401);

    const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!accessToken) return json({ error: 'Missing Authorization' }, 401);

    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userErr,
    } = await caller.auth.getUser();
    if (userErr || !user) return json({ error: 'Unauthorized' }, 401);

    let body: { auth_session_id?: unknown };
    try {
      body = (await req.json()) as { auth_session_id?: unknown };
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }

    const authSessionId =
      typeof body.auth_session_id === 'string' ? body.auth_session_id.trim() : '';
    if (!authSessionId) return json({ error: 'auth_session_id required' }, 400);

    const currentSessionId = sessionIdFromJwt(accessToken);
    if (currentSessionId && authSessionId === currentSessionId) {
      return json({ error: 'cannot_revoke_current' }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { error: rpcErr } = await admin.rpc('admin_revoke_device_session', {
      p_user_id: user.id,
      p_auth_session_id: authSessionId,
      p_current_session_id: currentSessionId,
    });

    if (rpcErr) {
      const msg = rpcErr.message ?? 'revoke failed';
      if (msg.includes('cannot_revoke_current')) {
        return json({ error: 'cannot_revoke_current' }, 400);
      }
      if (msg.includes('session_not_found')) {
        return json({ error: 'session_not_found' }, 404);
      }
      return json({ error: msg }, 400);
    }

    return json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: message }, 500);
  }
});
