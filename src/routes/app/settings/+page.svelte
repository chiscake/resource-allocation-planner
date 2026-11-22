<script lang="ts">
  import { onMount } from "svelte";
  import type { Factor } from "@supabase/supabase-js";
  import { mfaErrorMessage } from "$lib/db/mfa-errors";
  import { supabase } from "$lib/db/supabase";
  import { t } from "$lib/i18n";
  import PageHeader from "$lib/components/ui/PageHeader.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Input from "$lib/components/ui/Input.svelte";
  import InlineAlert from "$lib/components/ui/InlineAlert.svelte";
  import Card from "$lib/components/ui/Card.svelte";

  type EnrollDraft = {
    factorId: string;
    qrSrc: string;
    secret: string;
  };

  let ready = $state(false);
  let signedIn = $state(false);
  let verifiedFactor = $state<Factor | null>(null);
  let enroll = $state<EnrollDraft | null>(null);
  let code = $state("");
  let error = $state("");
  let info = $state("");
  let busy = $state(false);

  function qrToSrc(qr: string): string {
    const trimmed = qr.trim();
    if (trimmed.startsWith("data:")) return trimmed;
    if (trimmed.startsWith("<svg")) {
      return `data:image/svg+xml;utf8,${encodeURIComponent(trimmed)}`;
    }
    return trimmed;
  }

  async function refreshFactors() {
    const { data, error: err } = await supabase.auth.mfa.listFactors();
    if (err) {
      error = err.message;
      verifiedFactor = null;
      return;
    }
    verifiedFactor = data.totp.find((f) => f.status === "verified") ?? null;
  }

  async function cleanupUnverified() {
    const { data } = await supabase.auth.mfa.listFactors();
    const unverified = data?.all.filter((f) => f.status === "unverified") ?? [];
    for (const f of unverified) {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
  }

  onMount(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      signedIn = !!data.session?.user;
      ready = true;
      if (!signedIn) return;
      await refreshFactors();
    })();
  });

  async function startEnroll() {
    error = "";
    info = "";
    busy = true;
    try {
      await cleanupUnverified();
      const { data, error: err } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        // Default issuer is Site URL host (e.g. 127.0.0.1:5400); colon splits the otpauth label.
        issuer: t("mfaIssuer"),
        friendlyName: t("mfaIssuer"),
      });
      if (err || !data) {
        error = err?.message?.trim() || t("mfaSetupFailed");
        return;
      }
      enroll = {
        factorId: data.id,
        qrSrc: qrToSrc(data.totp.qr_code),
        secret: data.totp.secret,
      };
      code = "";
    } finally {
      busy = false;
    }
  }

  async function cancelEnroll() {
    error = "";
    info = "";
    const factorId = enroll?.factorId;
    enroll = null;
    code = "";
    if (factorId) {
      await supabase.auth.mfa.unenroll({ factorId });
    }
  }

  async function confirmEnroll() {
    if (!enroll) return;
    error = "";
    info = "";
    const trimmed = code.trim();
    if (!trimmed) {
      error = t("mfaInvalidCode");
      return;
    }
    busy = true;
    try {
      const challenge = await supabase.auth.mfa.challenge({
        factorId: enroll.factorId,
      });
      if (challenge.error || !challenge.data) {
        error = mfaErrorMessage(challenge.error?.message);
        return;
      }
      const verify = await supabase.auth.mfa.verify({
        factorId: enroll.factorId,
        challengeId: challenge.data.id,
        code: trimmed,
      });
      if (verify.error) {
        error = mfaErrorMessage(verify.error.message);
        return;
      }
      enroll = null;
      code = "";
      await refreshFactors();
    } finally {
      busy = false;
    }
  }

  async function disableMfa() {
    if (!verifiedFactor) return;
    error = "";
    info = "";
    const trimmed = code.trim();
    if (!trimmed) {
      error = t("mfaInvalidCode");
      return;
    }
    busy = true;
    try {
      const { data: aal } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel !== "aal2") {
        const challenge = await supabase.auth.mfa.challenge({
          factorId: verifiedFactor.id,
        });
        if (challenge.error || !challenge.data) {
          error = mfaErrorMessage(challenge.error?.message);
          return;
        }
        const verify = await supabase.auth.mfa.verify({
          factorId: verifiedFactor.id,
          challengeId: challenge.data.id,
          code: trimmed,
        });
        if (verify.error) {
          error = mfaErrorMessage(verify.error.message);
          return;
        }
      }

      const { error: unErr } = await supabase.auth.mfa.unenroll({
        factorId: verifiedFactor.id,
      });
      if (unErr) {
        error = unErr.message?.trim() || t("mfaDisableFailed");
        return;
      }
      await supabase.auth.refreshSession();
      code = "";
      await refreshFactors();
    } finally {
      busy = false;
    }
  }

  async function copySecret() {
    if (!enroll?.secret) return;
    try {
      await navigator.clipboard.writeText(enroll.secret);
      info = t("mfaSecretCopied");
    } catch {
      info = "";
    }
  }
</script>

<section class="mx-auto max-w-2xl space-y-6">
  <PageHeader title={t("settings")} description={t("settingsHint")} />

  {#if !ready}
    <p class="text-sm text-text-muted">…</p>
  {:else if !signedIn}
    <InlineAlert tone="muted">{t("settingsSignInRequired")}</InlineAlert>
    <Button href="/login">{t("login")}</Button>
  {:else}
    <Card class="space-y-4">
      <div>
        <h2 class="text-base font-medium text-text">{t("mfaSectionTitle")}</h2>
        <p class="mt-1 text-sm leading-relaxed text-text-muted">
          {t("mfaSectionHint")}
        </p>
      </div>

      {#if error}
        <InlineAlert>{error}</InlineAlert>
      {/if}
      {#if info}
        <InlineAlert tone="muted">{info}</InlineAlert>
      {/if}

      {#if verifiedFactor && !enroll}
        <p class="text-sm text-text">{t("mfaEnabled")}</p>
        <label class="flex flex-col gap-1 text-sm">
          <span>{t("mfaCode")}</span>
          <Input
            bind:value={code}
            inputmode="numeric"
            autocomplete="one-time-code"
            placeholder="000000"
          />
        </label>
        <Button
          variant="danger"
          disabled={busy}
          onclick={() => void disableMfa()}
        >
          {t("mfaDisable")}
        </Button>
      {:else if enroll}
        <div
          class="flex flex-col items-start gap-3 sm:flex-row sm:items-center"
        >
          <img
            src={enroll.qrSrc}
            alt={t("mfaQrAlt")}
            class="h-60 w-60 rounded-[8px] border border-border bg-white p-2"
          />
          <div class="flex min-w-0 flex-1 flex-col gap-2">
            <p class="text-sm font-medium text-text">{t("mfaSecretLabel")}</p>
            <code
              class="break-all rounded-[8px] border border-border bg-bg-soft px-3 py-2 font-mono text-xs text-text"
            >
              {enroll.secret}
            </code>
            <Button
              variant="secondary"
              type="button"
              onclick={() => void copySecret()}
            >
              {t("mfaCopySecret")}
            </Button>
          </div>
        </div>
        <label class="flex flex-col gap-1 text-sm">
          <span>{t("mfaCode")}</span>
          <Input
            bind:value={code}
            inputmode="numeric"
            autocomplete="one-time-code"
            placeholder="000000"
          />
        </label>
        <div class="flex flex-wrap gap-2">
          <Button disabled={busy} onclick={() => void confirmEnroll()}>
            {t("mfaConfirmEnable")}
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onclick={() => void cancelEnroll()}
          >
            {t("mfaCancelSetup")}
          </Button>
        </div>
      {:else}
        <p class="text-sm text-text-muted">{t("mfaDisabled")}</p>
        <Button disabled={busy} onclick={() => void startEnroll()}
          >{t("mfaStartSetup")}</Button
        >
      {/if}
    </Card>
  {/if}
</section>
