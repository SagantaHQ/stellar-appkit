/**
 * SSR-safe reduced-motion check.
 * Returns true if the user has prefers-reduced-motion: reduce enabled.
 * In SSR (Node.js), returns false — animations are never evaluated server-side.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
