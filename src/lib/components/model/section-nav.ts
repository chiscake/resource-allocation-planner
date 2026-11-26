/** Stable section anchors for sticky workspace nav (no hash / scroll-spy in v1). */
export const SECTION_NAV_IDS = [
  'result-geometry',
  'result-steps',
  'what-if-ranges',
  'what-if',
] as const;

export type SectionNavId = (typeof SECTION_NAV_IDS)[number];

export type SectionNavItem = {
  id: SectionNavId;
  label: string;
};

export type SolveResultSectionApi = {
  expandGeometry: () => Promise<void>;
  expandSteps: () => Promise<void>;
};

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Smooth scroll to a section; respects prefers-reduced-motion. */
export function scrollToSection(el: Element | null): void {
  if (!el) return;
  el.scrollIntoView({
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    block: 'start',
  });
}

export function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}
