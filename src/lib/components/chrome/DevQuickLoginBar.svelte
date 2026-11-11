<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { supabase } from "$lib/db/supabase";
  import { DEV_QUICK_ACCOUNTS, type DevQuickAccount } from "$lib/devQuickLogin";

  let { currentEmail = "" }: { currentEmail?: string } = $props();

  let busyEmail = $state<string | null>(null);
  let errorMessage = $state("");

  async function switchTo(account: DevQuickAccount) {
    if (busyEmail) return;
    if (currentEmail.toLowerCase() === account.email.toLowerCase()) return;

    busyEmail = account.email;
    errorMessage = "";
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session) {
        await supabase.auth.signOut();
      }
      const { error } = await supabase.auth.signInWithPassword({
        email: account.email,
        password: account.password,
      });
      if (error) throw error;
      await invalidateAll();
    } catch (err) {
      errorMessage =
        err instanceof Error ? err.message : "Не удалось переключить аккаунт";
    } finally {
      busyEmail = null;
    }
  }
</script>

<div class="bar" role="region" aria-label="Быстрый вход (demo)">
  <span class="hint">Быстрый вход</span>
  <div class="buttons">
    {#each DEV_QUICK_ACCOUNTS as account (account.email)}
      {@const current =
        currentEmail.toLowerCase() === account.email.toLowerCase()}
      <button
        type="button"
        class:current
        disabled={busyEmail !== null || current}
        title={account.email}
        onclick={() => switchTo(account)}
      >
        {account.label}
      </button>
    {/each}
  </div>
  {#if errorMessage}
    <p class="error" role="alert">{errorMessage}</p>
  {/if}
</div>

<style>
  .bar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 40;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.5rem 0.75rem;
    padding: 0.45rem 1.25rem;
    background: #0f172a;
    border-top: 1px solid #1e293b;
    color: #e2e8f0;
    font-size: 0.8rem;
  }

  .hint {
    color: #94a3b8;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 0.7rem;
  }

  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  button {
    padding: 0.28rem 0.6rem;
    border: 1px solid #334155;
    border-radius: 6px;
    background: #1e293b;
    color: #f8fafc;
    font: inherit;
    cursor: pointer;
  }

  button:hover:not(:disabled) {
    background: #334155;
  }

  button.current {
    background: #1d4ed8;
    border-color: #3b82f6;
    cursor: default;
  }

  button:disabled:not(.current) {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .error {
    margin: 0;
    width: 100%;
    text-align: center;
    color: #fecaca;
    font-size: 0.75rem;
  }
</style>
