/** Stable section anchors for sticky workspace nav (no hash / scroll-spy in v1). */
export const SECTION_NAV_IDS = [
  'model',
  'result',
  'result-geometry',
  'result-steps',
  'method-compare',
  'what-if',
  'what-if-ranges',
  'what-if-mutations',
] as const;

export type SectionNavId = (typeof SECTION_NAV_IDS)[number];

export type SectionNavItem = {
  id: SectionNavId;
  label: string;
  children?: SectionNavItem[];
};

export type SolveResultSectionApi = {
  expandGeometry: () => Promise<void>;
  expandSteps: () => Promise<void>;
};

export type WhatIfSectionApi = {
  /** Ensure mutations (pack / interactive) pane is visible. */
  showMutations: () => void;
};

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Leading padding on a wrapped Card (ignore target’s own pad — e.g. ranges `pt-5`). */
function scrollPaddingTop(el: HTMLElement): number {
  const child = el.firstElementChild;
  if (child instanceof HTMLElement) {
    return parseFloat(getComputedStyle(child).paddingTop) || 0;
  }
  return 0;
}

/**
 * Smooth scroll so the section's content (ignoring leading padding on the
 * target or its first child, e.g. Card `p-6`) lines up with scroll-margin /
 * the floating island.
 */
export function scrollToSection(el: Element | null): void {
  if (!(el instanceof HTMLElement)) return;

  const main = el.closest('main');
  const behavior: ScrollBehavior = prefersReducedMotion() ? 'auto' : 'smooth';

  if (!(main instanceof HTMLElement)) {
    el.scrollIntoView({ behavior, block: 'start' });
    return;
  }

  const scrollMargin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
  const pad = scrollPaddingTop(el);
  const mainRect = main.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  const nextTop = main.scrollTop + (elRect.top - mainRect.top) - scrollMargin + pad;

  main.scrollTo({ top: Math.max(0, nextTop), behavior });
}

export function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

/** Flatten a nav tree for keyed rendering (depth 0 = top-level). */
export function flattenSectionNavItems(
  items: SectionNavItem[],
  depth = 0,
): Array<SectionNavItem & { depth: number }> {
  const out: Array<SectionNavItem & { depth: number }> = [];
  for (const item of items) {
    out.push({ ...item, depth });
    if (item.children?.length) {
      out.push(...flattenSectionNavItems(item.children, depth + 1));
    }
  }
  return out;
}
