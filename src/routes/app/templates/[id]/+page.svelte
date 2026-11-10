<script lang="ts">
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { supabase } from "$lib/db/supabase";
  import type { Model } from "$lib/domain";
  import { cloneModel } from "$lib/domain";
  import { useTemplateAndOpen } from "$lib/db/create-solve-node";
  import {
    requestTemplatePublish,
    withdrawTemplatePublish,
    unpublishTemplate,
    moderateTemplatePublish,
    canEditTemplateContent,
    isPublishedCatalog,
    isPublishPending,
    type PublishStatus,
  } from "$lib/db/template-publish";
  import { t } from "$lib/i18n";
  import LpModelMatrix from "$lib/components/model/LpModelMatrix.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import Card from "$lib/components/ui/Card.svelte";
  import Input from "$lib/components/ui/Input.svelte";
  import PageHeader from "$lib/components/ui/PageHeader.svelte";
  import InlineAlert from "$lib/components/ui/InlineAlert.svelte";

  type Mode = "view" | "edit";

  let title = $state("");
  let model = $state<Model | null>(null);
  let systemKind = $state<string | null>(null);
  let publishStatus = $state<PublishStatus>(null);
  let isOwner = $state(false);
  let isStaff = $state(false);
  let loading = $state(true);
  let saving = $state(false);
  let busy = $state(false);
  let using = $state(false);
  let mode = $state<Mode>("view");
  let msg = $state("");
  let err = $state("");
  let loadedId = $state("");

  const templateId = $derived(page.params.id ?? "");
  const contentEditable = $derived(
    canEditTemplateContent({
      system_kind: systemKind,
      publish_status: publishStatus,
    }),
  );
  const editing = $derived(mode === "edit" && isOwner && contentEditable);
  const pendingForStaff = $derived(
    isStaff && !isOwner && isPublishPending({ publish_status: publishStatus }),
  );
  const pageTitle = $derived(
    pendingForStaff
      ? t("moderationReviewTitle")
      : editing
        ? t("editTemplateTitle")
        : t("viewTemplateTitle"),
  );

  $effect(() => {
    const id = templateId;
    if (!id || id === loadedId) return;
    void loadTemplate(id);
  });

  async function loadTemplate(id: string) {
    loading = true;
    err = "";
    msg = "";
    model = null;
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      void goto("/login");
      return;
    }
    const role = auth.user.app_metadata?.role;
    isStaff = role === "admin" || role === "mod";

    const { data, error } = await supabase
      .from("templates")
      .select("id, title, model, owner_id, system_kind, publish_status")
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (error || !data) {
      err = error?.message ?? t("notFound");
      loadedId = id;
      loading = false;
      return;
    }

    isOwner = data.owner_id === auth.user.id;
    const kind = (data.system_kind as string | null) ?? null;
    const status = (data.publish_status as PublishStatus) ?? null;
    const canStaffReview = isStaff && status === "pending" && kind == null;

    if (!isOwner && !canStaffReview) {
      err = t("notFound");
      loadedId = id;
      loading = false;
      return;
    }
    if (isOwner && kind != null && kind !== "public_repo") {
      err = t("notFound");
      loadedId = id;
      loading = false;
      return;
    }

    title = data.title as string;
    model = cloneModel(data.model as Model);
    systemKind = kind;
    publishStatus = status;
    loadedId = id;

    const wantEdit =
      isOwner &&
      canEditTemplateContent({ system_kind: kind, publish_status: status }) &&
      page.url.searchParams.get("edit") === "1";
    mode = wantEdit ? "edit" : "view";
    loading = false;
  }

  function enterEdit() {
    if (!isOwner || !contentEditable) return;
    mode = "edit";
    err = "";
    msg = "";
    const url = new URL(page.url);
    url.searchParams.set("edit", "1");
    void goto(`${url.pathname}?${url.searchParams.toString()}`, {
      replaceState: true,
      noScroll: true,
      keepFocus: true,
    });
  }

  function enterView() {
    mode = "view";
    err = "";
    msg = "";
    const url = new URL(page.url);
    url.searchParams.delete("edit");
    const q = url.searchParams.toString();
    void goto(q ? `${url.pathname}?${q}` : url.pathname, {
      replaceState: true,
      noScroll: true,
      keepFocus: true,
    });
  }

  function onModelChange(next: Model) {
    if (!editing) return;
    model = next;
    msg = "";
  }

  async function save() {
    if (!model || saving || !editing) return;
    saving = true;
    err = "";
    msg = "";
    const { error } = await supabase
      .from("templates")
      .update({
        title: title.trim() || t("templates"),
        model,
        updated_at: new Date().toISOString(),
      })
      .eq("id", templateId);
    if (error) {
      err = error.message;
    } else {
      msg = t("templateSaved");
    }
    saving = false;
  }

  async function onRequest() {
    if (busy || !isOwner) return;
    busy = true;
    err = "";
    msg = "";
    const res = await requestTemplatePublish(templateId);
    if (res.error) err = res.error;
    else {
      msg = t("publishRequestDone");
      publishStatus = "pending";
      systemKind = null;
      mode = "view";
    }
    busy = false;
  }

  async function onWithdraw() {
    if (busy || !isOwner) return;
    busy = true;
    err = "";
    msg = "";
    const res = await withdrawTemplatePublish(templateId);
    if (res.error) err = res.error;
    else {
      msg = t("publishWithdrawDone");
      publishStatus = null;
    }
    busy = false;
  }

  async function onUnpublish() {
    if (busy || !isOwner) return;
    busy = true;
    err = "";
    msg = "";
    const res = await unpublishTemplate(templateId);
    if (res.error) err = res.error;
    else {
      msg = t("publishUnpublishDone");
      publishStatus = null;
      systemKind = null;
    }
    busy = false;
  }

  async function onModerate(action: "approve" | "reject") {
    if (busy || !pendingForStaff) return;
    busy = true;
    err = "";
    msg = "";
    const res = await moderateTemplatePublish(templateId, action);
    if (res.error) err = res.error;
    else {
      await goto("/app/moderation");
    }
    busy = false;
  }

  async function useTemplate() {
    if (using || !templateId) return;
    using = true;
    err = "";
    msg = "";
    const res = await useTemplateAndOpen(templateId);
    if (res) err = res.error || t("useFailed");
    using = false;
  }
</script>

<section class="mx-auto flex max-w-4xl flex-col gap-6">
  {#if loading}
    <p class="text-sm text-text-muted">…</p>
  {:else if !model}
    <p class="text-danger-text">{err || t("notFound")}</p>
    <Button
      variant="secondary"
      href={isStaff ? "/app/moderation" : "/app/templates"}
      >{isStaff ? t("moderation") : t("templates")}</Button
    >
  {:else}
    <PageHeader
      title={pageTitle}
      description={pendingForStaff ? t("moderationReviewHint") : undefined}
    >
      {#snippet actions()}
        {#if !editing}
          <Button
            variant="primary"
            disabled={using || busy}
            onclick={useTemplate}
          >
            {using ? t("creatingTask") : t("useTemplate")}
          </Button>
        {/if}
        {#if isOwner && contentEditable}
          {#if editing}
            <Button variant="secondary" onclick={enterView}
              >{t("backToView")}</Button
            >
          {:else}
            <Button variant="secondary" onclick={enterEdit}
              >{t("editTemplate")}</Button
            >
          {/if}
        {/if}
        {#if pendingForStaff}
          <Button variant="secondary" href="/app/moderation"
            >{t("moderation")}</Button
          >
        {:else if isOwner}
          <Button variant="ghost" href="/app/templates">{t("templates")}</Button
          >
        {/if}
      {/snippet}
    </PageHeader>

    {#if err}
      <InlineAlert>{err}</InlineAlert>
    {/if}
    {#if msg}
      <p class="text-sm text-text-muted">{msg}</p>
    {/if}

    {#if editing}
      <label class="flex flex-col gap-1.5">
        <span class="text-sm font-medium text-text">{t("templateTitle")}</span>
        <Input bind:value={title} />
      </label>
    {:else}
      <div class="flex items-center gap-3">
        <p class="min-w-0 flex-1 text-lg font-medium text-text">{title}</p>
        {#if isPublishPending({ publish_status: publishStatus })}
          <Badge variant="warning">{t("publishStatusPending")}</Badge>
        {:else if isPublishedCatalog( { system_kind: systemKind, publish_status: publishStatus }, )}
          <Badge variant="success">{t("publishStatusPublic")}</Badge>
        {/if}
      </div>
    {/if}

    <Card>
      <p class="mb-2 text-sm font-medium">{t("modelMatrix")}</p>
      <LpModelMatrix {model} onchange={onModelChange} readonly={!editing} />
      {#if editing}
        <div class="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onclick={enterView}
            >{t("backToView")}</Button
          >
          <Button disabled={saving} onclick={save}>
            {saving ? t("saving") : t("save")}
          </Button>
        </div>
      {/if}
    </Card>

    {#if isOwner && !editing}
      <Card>
        <h2 class="mb-1 text-sm font-medium text-text">
          {t("publishSectionTitle")}
        </h2>
        {#if isPublishPending({ publish_status: publishStatus })}
          <p class="mb-4 text-sm text-text-muted">{t("publishPendingHint")}</p>
          <Button variant="secondary" disabled={busy} onclick={onWithdraw}
            >{t("publishWithdraw")}</Button
          >
        {:else if isPublishedCatalog( { system_kind: systemKind, publish_status: publishStatus }, )}
          <p class="mb-4 text-sm text-text-muted">{t("publishPublicHint")}</p>
          <Button variant="secondary" disabled={busy} onclick={onUnpublish}
            >{t("publishUnpublish")}</Button
          >
        {:else}
          <p class="mb-4 text-sm text-text-muted">{t("publishRequestHint")}</p>
          <Button variant="primary" disabled={busy} onclick={onRequest}
            >{t("publishRequest")}</Button
          >
        {/if}
      </Card>
    {/if}

    {#if pendingForStaff}
      <Card>
        <h2 class="mb-1 text-sm font-medium text-text">{t("moderation")}</h2>
        <p class="mb-4 text-sm text-text-muted">{t("moderationReviewHint")}</p>
        <div class="flex flex-wrap gap-2">
          <Button
            variant="primary"
            disabled={busy}
            onclick={() => onModerate("approve")}>{t("publishApprove")}</Button
          >
          <Button
            variant="secondary"
            disabled={busy}
            onclick={() => onModerate("reject")}>{t("publishReject")}</Button
          >
        </div>
      </Card>
    {/if}
  {/if}
</section>
