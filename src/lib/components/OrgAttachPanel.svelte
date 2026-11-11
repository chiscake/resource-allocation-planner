<script lang="ts">
	import { t } from '$lib/i18n';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import InlineAlert from '$lib/components/ui/InlineAlert.svelte';

	let {
		orgId = $bindable(''),
		makePublic = $bindable(false),
		orgOptions,
		attachedOrgId = null,
		onAttach,
		onSetVisibility
	}: {
		orgId?: string;
		makePublic?: boolean;
		orgOptions: { value: string; label: string }[];
		/** Current node.org_id when already attached */
		attachedOrgId?: string | null;
		onAttach: () => void;
		onSetVisibility: (vis: 'private' | 'org') => void;
	} = $props();
</script>

<Card>
	<h2 class="mb-3 text-lg font-medium">{t('attachOrg')}</h2>
	{#if orgOptions.length === 0}
		<div class="mb-3">
			<InlineAlert tone="muted">{t('noOrgsHint')}</InlineAlert>
		</div>
	{:else}
		<Select
			class="mb-3"
			bind:value={orgId}
			options={orgOptions}
			placeholder={t('selectOrg')}
		/>
	{/if}
	<label class="mb-3 flex items-center gap-2 text-sm">
		<input type="checkbox" bind:checked={makePublic} />
		{t('makePublicInOrg')}
	</label>
	<div class="flex flex-wrap gap-2">
		<Button variant="secondary" disabled={!orgId} onclick={onAttach}>{t('attachOrg')}</Button>
		{#if attachedOrgId}
			<Button variant="secondary" onclick={() => onSetVisibility('private')}>
				{t('hideInOrg')}
			</Button>
			<Button variant="secondary" onclick={() => onSetVisibility('org')}>
				{t('showInOrg')}
			</Button>
		{/if}
	</div>
</Card>
