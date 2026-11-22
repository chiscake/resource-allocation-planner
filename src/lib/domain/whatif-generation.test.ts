import { describe, expect, it } from "vitest";
import { createBlankModel, createTask13Model } from "./task13";
import { cloneModel } from "./mutations";
import type { Model, Mutation, SolveResult } from "./types";
import {
  KIND_SENSITIVITY,
  KIND_WHAT_IF_BASE,
  appendGuestGeneration,
  appendGuestSensitivityItem,
  buildPagerSlots,
  clearGuestActiveGeneration,
  collectGenerations,
  defaultPagerIndex,
  emptyGuestWhatIfState,
  findBaseForGeneration,
  guestGenerationItems,
  hasMutation,
  isSensitivityChild,
  isWhatIfBase,
  modelsEqual,
  mutationKey,
  mutationsEqual,
  nextGenerationNumber,
  resolveActiveAfterModelEdit,
  restoreGuestGeneration,
  sensitivityForGeneration,
  type WhatIfGenNode,
} from "./whatif-generation";

function baseResult(Z: number): SolveResult {
  return {
    x: {},
    Z,
    resource_usage: {},
    resource_slack: {},
    shadow_prices: {},
    critical_resources: [],
    non_critical_resources: [],
    feasible: true,
  };
}

function mut(target = "Труд"): Mutation {
  return { kind: "resource_change", target, delta: 0.1 };
}

function nodesForGens(
  gens: number[],
  opts?: { softDeleteBefore?: number },
): WhatIfGenNode[] {
  const model = createTask13Model();
  const out: WhatIfGenNode[] = [];
  for (const g of gens) {
    const deleted =
      opts?.softDeleteBefore != null && g < opts.softDeleteBefore
        ? "2026-01-01T00:00:00.000Z"
        : null;
    out.push({
      id: `base-${g}`,
      kind: KIND_WHAT_IF_BASE,
      what_if_generation: g,
      deleted_at: deleted,
      model: cloneModel(model),
      result: baseResult(100 + g),
    });
    out.push({
      id: `sens-${g}`,
      kind: KIND_SENSITIVITY,
      what_if_generation: g,
      deleted_at: deleted,
      model: cloneModel(model),
      mutation: mut(),
      result: baseResult(90 + g),
      title: `g${g}`,
    });
  }
  return out;
}

describe("whatif-generation classifiers", () => {
  it("distinguishes sensitivity vs what_if_base", () => {
    const base: WhatIfGenNode = {
      kind: KIND_WHAT_IF_BASE,
      what_if_generation: 1,
      model: createBlankModel(),
    };
    const sens: WhatIfGenNode = {
      kind: KIND_SENSITIVITY,
      what_if_generation: 1,
      model: createBlankModel(),
      mutation: mut(),
    };
    expect(isWhatIfBase(base)).toBe(true);
    expect(isSensitivityChild(base)).toBe(false);
    expect(isSensitivityChild(sens)).toBe(true);
    expect(isWhatIfBase(sens)).toBe(false);
  });

  it("treats legacy mutation+generation as sensitivity when kind is not base", () => {
    const legacy: WhatIfGenNode = {
      kind: "root",
      what_if_generation: 2,
      model: createBlankModel(),
      mutation: mut(),
    };
    expect(isSensitivityChild(legacy)).toBe(true);
  });
});

describe("collectGenerations / nextGenerationNumber", () => {
  it("collects unique sorted gens from mixed kids", () => {
    const nodes = nodesForGens([2, 1, 3]);
    expect(collectGenerations(nodes)).toEqual([1, 2, 3]);
    expect(nextGenerationNumber([1, 2, 3])).toBe(4);
    expect(nextGenerationNumber([])).toBe(1);
  });

  it("finds base and sensitivity for a generation", () => {
    const nodes = nodesForGens([1, 2]);
    expect(findBaseForGeneration(nodes, 2)?.id).toBe("base-2");
    expect(sensitivityForGeneration(nodes, 1)).toHaveLength(1);
    expect(findBaseForGeneration(nodes, 9)).toBeNull();
  });
});

describe("buildPagerSlots", () => {
  it("marks only active gen as current when pointer set", () => {
    const slots = buildPagerSlots([1, 2, 3], 2);
    expect(slots).toHaveLength(3);
    expect(slots.map((s) => ("generation" in s ? s.generation : null))).toEqual(
      [1, 2, 3],
    );
    expect(slots.map((s) => s.badge)).toEqual(["past", "current", "past"]);
    expect(slots.map((s) => s.canRestore)).toEqual([true, false, true]);
    expect(slots.every((s) => s.kind === "generation")).toBe(true);
  });

  it("appends virtual empty_current when active is null", () => {
    const slots = buildPagerSlots([1, 2], null);
    expect(slots).toHaveLength(3);
    expect(slots[0]).toMatchObject({
      kind: "generation",
      generation: 1,
      badge: "past",
      canRestore: true,
    });
    expect(slots[1]).toMatchObject({
      kind: "generation",
      generation: 2,
      badge: "past",
      canRestore: true,
    });
    expect(slots[2]).toEqual({
      kind: "empty_current",
      badge: "current",
      canRestore: false,
    });
  });

  it("empty gens + null active → only virtual current", () => {
    const slots = buildPagerSlots([], null);
    expect(slots).toEqual([
      { kind: "empty_current", badge: "current", canRestore: false },
    ]);
    expect(defaultPagerIndex(slots)).toBe(0);
  });

  it("defaultPagerIndex prefers current badge", () => {
    expect(defaultPagerIndex(buildPagerSlots([1, 2, 3], 1))).toBe(0);
    expect(defaultPagerIndex(buildPagerSlots([1, 2, 3], 3))).toBe(2);
    expect(defaultPagerIndex(buildPagerSlots([1, 2], null))).toBe(2);
  });
});

describe("resolveActiveAfterModelEdit", () => {
  it("keeps pointer when model matches base snapshot", () => {
    const model = createTask13Model();
    expect(resolveActiveAfterModelEdit(2, model, cloneModel(model))).toBe(2);
  });

  it("clears pointer when model diverges", () => {
    const base = createTask13Model();
    const edited = cloneModel(base);
    edited.b[0] = 999;
    expect(resolveActiveAfterModelEdit(2, base, edited)).toBeNull();
  });

  it("clears when base missing or already null", () => {
    const model = createBlankModel();
    expect(resolveActiveAfterModelEdit(1, null, model)).toBeNull();
    expect(resolveActiveAfterModelEdit(null, model, model)).toBeNull();
  });

  it("modelsEqual is structural", () => {
    const a = createBlankModel();
    const b = cloneModel(a);
    expect(modelsEqual(a, b)).toBe(true);
    (b as Model).c[0] = 42;
    expect(modelsEqual(a, b)).toBe(false);
  });
});

describe("guest what-if state reducer", () => {
  const baseModel = createTask13Model();
  const item = {
    title: "Ресурс +10%",
    mutation: mut(),
    model: cloneModel(baseModel),
    result: baseResult(50),
    solver_meta: null,
  };

  it("append sets active to new gen and keeps prior packs", () => {
    let state = emptyGuestWhatIfState();
    state = appendGuestGeneration(
      state,
      { model: baseModel, result: baseResult(10), solver_meta: null },
      [item],
    );
    expect(state.activeGeneration).toBe(1);
    expect(state.generations).toHaveLength(1);

    const model2 = cloneModel(baseModel);
    model2.b[0] = 70;
    state = appendGuestGeneration(
      state,
      { model: model2, result: baseResult(20), solver_meta: null },
      [{ ...item, title: "v2" }],
    );
    expect(state.activeGeneration).toBe(2);
    expect(state.generations).toHaveLength(2);
    expect(state.generations[0].base.result?.Z).toBe(10);
    expect(state.generations[1].base.model.b[0]).toBe(70);
  });

  it("clear active → virtual current; past gens remain", () => {
    let state = appendGuestGeneration(
      emptyGuestWhatIfState(),
      { model: baseModel, result: baseResult(1), solver_meta: null },
      [item],
    );
    state = appendGuestGeneration(
      state,
      { model: baseModel, result: baseResult(2), solver_meta: null },
      [item],
    );
    state = clearGuestActiveGeneration(state);
    expect(state.activeGeneration).toBeNull();
    expect(state.generations).toHaveLength(2);
    const slots = buildPagerSlots(
      state.generations.map((g) => g.generation),
      state.activeGeneration,
    );
    expect(slots.at(-1)?.kind).toBe("empty_current");
    expect(slots.filter((s) => s.kind === "generation")).toHaveLength(2);
  });

  it("restore past gen → becomes current and returns that base", () => {
    let state = appendGuestGeneration(
      emptyGuestWhatIfState(),
      { model: baseModel, result: baseResult(1), solver_meta: null },
      [item],
    );
    const model2 = cloneModel(baseModel);
    model2.b[0] = 55;
    state = appendGuestGeneration(
      state,
      { model: model2, result: baseResult(2), solver_meta: null },
      [item],
    );
    const restored = restoreGuestGeneration(state, 1);
    expect(restored).not.toBeNull();
    expect(restored!.state.activeGeneration).toBe(1);
    expect(restored!.base.model.b[0]).toBe(baseModel.b[0]);
    expect(restored!.base.result?.Z).toBe(1);
    // gen 2 still in history as past
    const slots = buildPagerSlots(
      restored!.state.generations.map((g) => g.generation),
      restored!.state.activeGeneration,
    );
    expect(slots.map((s) => s.badge)).toEqual(["current", "past"]);
  });

  it("restore unknown gen → null", () => {
    const state = appendGuestGeneration(
      emptyGuestWhatIfState(),
      { model: baseModel, result: null, solver_meta: null },
      [item],
    );
    expect(restoreGuestGeneration(state, 9)).toBeNull();
  });

  it("model edit after active pack clears pointer", () => {
    const state = appendGuestGeneration(
      emptyGuestWhatIfState(),
      { model: baseModel, result: baseResult(1), solver_meta: null },
      [item],
    );
    const edited = cloneModel(baseModel);
    edited.c[0] = 99;
    const nextActive = resolveActiveAfterModelEdit(
      state.activeGeneration,
      state.generations[0].base.model,
      edited,
    );
    expect(nextActive).toBeNull();
    const cleared = { ...state, activeGeneration: nextActive };
    expect(buildPagerSlots([1], cleared.activeGeneration).at(-1)?.kind).toBe(
      "empty_current",
    );
  });

  it("guestGenerationItems returns pack rows", () => {
    const state = appendGuestGeneration(
      emptyGuestWhatIfState(),
      { model: baseModel, result: null, solver_meta: null },
      [item],
    );
    expect(guestGenerationItems(state, 1)).toHaveLength(1);
    expect(guestGenerationItems(state, 2)).toEqual([]);
  });

  it("restore middle gen after three packs (edge)", () => {
    let state = emptyGuestWhatIfState();
    for (let i = 0; i < 3; i++) {
      const m = cloneModel(baseModel);
      m.b[0] = 80 + i;
      state = appendGuestGeneration(
        state,
        { model: m, result: baseResult(i), solver_meta: null },
        [item],
      );
    }
    expect(state.activeGeneration).toBe(3);
    const mid = restoreGuestGeneration(state, 2)!;
    expect(mid.state.activeGeneration).toBe(2);
    expect(mid.base.model.b[0]).toBe(81);
    const slots = buildPagerSlots([1, 2, 3], mid.state.activeGeneration);
    expect(slots.map((s) => s.badge)).toEqual(["past", "current", "past"]);
    expect(slots[2].canRestore).toBe(true);
  });

  it("solve without WI after restore keeps history", () => {
    let state = appendGuestGeneration(
      emptyGuestWhatIfState(),
      { model: baseModel, result: baseResult(1), solver_meta: null },
      [item],
    );
    state = restoreGuestGeneration(state, 1)!.state;
    state = clearGuestActiveGeneration(state);
    expect(state.generations).toHaveLength(1);
    expect(state.activeGeneration).toBeNull();
  });
});

describe("mutationKey / hasMutation", () => {
  it("keys by kind+target+delta", () => {
    const a = mut("Труд");
    const b = { ...a, delta: -0.1 };
    expect(mutationKey(a)).toBe("resource_change:Труд:0.1");
    expect(mutationsEqual(a, { ...a })).toBe(true);
    expect(mutationsEqual(a, b)).toBe(false);
    expect(hasMutation([a, b], a)).toBe(true);
    expect(hasMutation([a], b)).toBe(false);
    expect(hasMutation([null, undefined], a)).toBe(false);
  });
});

describe("appendGuestSensitivityItem", () => {
  const baseModel = createTask13Model();
  const item: import("./whatif-generation").GuestWhatIfItem = {
    title: "Запас: Труд +10%",
    mutation: mut(),
    model: cloneModel(baseModel),
    result: baseResult(50),
    solver_meta: null,
  };

  it("empty active → creates gen 1 with one row", () => {
    const state = appendGuestSensitivityItem(
      emptyGuestWhatIfState(),
      { model: baseModel, result: baseResult(100), solver_meta: null },
      item,
    );
    expect(state.activeGeneration).toBe(1);
    expect(state.generations).toHaveLength(1);
    expect(state.generations[0].items).toHaveLength(1);
    expect(state.generations[0].items[0].mutation.delta).toBe(0.1);
  });

  it("active gen → appends without new generation", () => {
    let state = appendGuestSensitivityItem(
      emptyGuestWhatIfState(),
      { model: baseModel, result: baseResult(100), solver_meta: null },
      item,
    );
    const second: import("./whatif-generation").GuestWhatIfItem = {
      title: "Цена: Прибор 1 +15%",
      mutation: {
        kind: "price_change",
        target: baseModel.products[0],
        delta: 0.15,
      },
      model: cloneModel(baseModel),
      result: baseResult(60),
    };
    state = appendGuestSensitivityItem(
      state,
      { model: baseModel, result: baseResult(100), solver_meta: null },
      second,
    );
    expect(state.activeGeneration).toBe(1);
    expect(state.generations).toHaveLength(1);
    expect(state.generations[0].items).toHaveLength(2);
    expect(
      hasMutation(
        state.generations[0].items.map((i) => i.mutation),
        second.mutation,
      ),
    ).toBe(true);
  });
});
