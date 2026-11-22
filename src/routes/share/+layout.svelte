<script lang="ts">
  import AppShell from '$lib/components/chrome/AppShell.svelte';

  let { children } = $props();
</script>

<AppShell>
  {@render children()}
</AppShell>
