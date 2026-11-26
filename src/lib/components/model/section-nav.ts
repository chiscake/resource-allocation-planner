import { CHROME_MD } from '$lib/chrome/chrome.svelte';

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

/** Island header row height (h-10). */
export const SECTION_NAV_BAR_HEIGHT = '2.5rem';
/** Gap under chrome / main inset (p-6). */
export const SECTION_NAV_GAP = '1.5rem';

const SECTION_NAV_GAP_PX = 24;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function isDesktopViewport(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(`(min-width: ${CHROME_MD}px)`).matches;
}

/**
 * Section title for scroll alignment: only the top title row of the anchor
 * (not deep headings inside expanded panels, e.g. SimplexStepsPanel).
 * Skips Card padding and border-t / pt-* separators on the anchor itself.
 */
function resolveSectionHeading(el: HTMLElement): HTMLElement {
  const child = el.firstElementChild;
  if (!(child instanceof HTMLElement)) return el;

  // Padded Card: title lives in the first content row inside the card.
  const padTop = parseFloat(getComputedStyle(child).paddingTop) || 0;
  const titleRoot =
    padTop > 0 && child.firstElementChild instanceof HTMLElement ? child.firstElementChild : child;

  if (/^H[1-6]$/.test(titleRoot.tagName)) return titleRoot;

  // Heading in the title row / first block only — do not scan nested panels.
  const heading = titleRoot.querySelector('h1, h2, h3, h4, h5, h6');
  if (heading instanceof HTMLElement) return heading;

  return titleRoot;
}

/**
 * Smooth scroll into the workspace `main`:
 * - Mobile: section title top sits ~p-6 below the sticky nav bar.
 * - Desktop: vertical center of the section title matches the island header center.
 */
export function scrollToSection(el: Element | null): void {
  if (!(el instanceof HTMLElement)) return;

  const main = el.closest('main');
  const behavior: ScrollBehavior = prefersReducedMotion() ? 'auto' : 'smooth';

  if (!(main instanceof HTMLElement)) {
    el.scrollIntoView({ behavior, block: 'start' });
    return;
  }

  const mainRect = main.getBoundingClientRect();
  const heading = resolveSectionHeading(el);
  const headingRect = heading.getBoundingClientRect();

  if (isDesktopViewport()) {
    const headingCenter = headingRect.top + headingRect.height / 2;

    const islandHeader = document.querySelector<HTMLElement>('[data-section-nav-header]');
    let alignCenter: number;
    if (islandHeader) {
      const ir = islandHeader.getBoundingClientRect();
      alignCenter = ir.top + ir.height / 2;
    } else {
      const inset = parseFloat(getComputedStyle(main).paddingTop) || SECTION_NAV_GAP_PX;
      const barH = parseFloat(SECTION_NAV_BAR_HEIGHT) * 16 || 40;
      alignCenter = mainRect.top + inset + barH / 2;
    }

    const nextTop = main.scrollTop + (headingCenter - alignCenter);
    main.scrollTo({ top: Math.max(0, nextTop), behavior });
    return;
  }

  // Header only — list may still be open during navigate; ignore expanded panel height.
  const mobileHeader = document.querySelector<HTMLElement>('[data-section-nav-header]');
  const alignTop = mobileHeader
    ? mobileHeader.getBoundingClientRect().bottom + SECTION_NAV_GAP_PX
    : mainRect.top + (parseFloat(getComputedStyle(el).scrollMarginTop) || 40);

  const nextTop = main.scrollTop + (headingRect.top - alignTop);
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
