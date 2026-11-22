<script lang="ts">
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
</script>

<svelte:head>
  <title>Тестовые наработки — Планировщик распределения ресурсов</title>
</svelte:head>

<PageHeader
  title="Тестовые наработки"
  description="Песочницы для проверки контролов вне основного сценария задачи."
/>

<ul class="mt-6 grid gap-3 sm:grid-cols-2">
  <li>
    <a href="/app/test/viz-3d" class="block no-underline">
      <Card class="transition-colors hover:border-brand">
        <p class="text-sm font-medium text-text">3D / 4D-визуализатор</p>
        <p class="mt-1 text-xs text-text-muted">
          Куб и срезанный гиперкуб — проверка SceneCanvas (exact3d / project4d).
        </p>
      </Card>
    </a>
  </li>
</ul>
