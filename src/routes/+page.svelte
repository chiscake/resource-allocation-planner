<script lang="ts">
  import { t } from '$lib/i18n';
</script>

<!--
	Entry is `/app` (see +page.ts). This shell is only shown during prerender
	or briefly before the client load redirect.
-->
<main class="grid min-h-screen place-items-center p-8">
  <p class="text-sm text-text-muted">{t('redirecting')}</p>
</main>
