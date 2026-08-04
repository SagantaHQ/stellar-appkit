const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"]), input, select, textarea';

/**
 * Traps Tab/Shift+Tab focus inside whatever `getContainer()` currently
 * returns, listening on `stableRoot` (a ShadowRoot or other ancestor that
 * survives re-renders) rather than the container itself — the container is
 * re-created on every `render()` call while the modal is open (wallet list
 * loading, connect/error state changes), so binding directly to it would
 * silently stop trapping after the first re-render.
 *
 * Returns a cleanup function that restores focus to whatever had it before
 * the trap was installed — important for keyboard users, who shouldn't
 * lose their place in the host page when the modal closes.
 */
export function trapFocus(stableRoot: ShadowRoot, getContainer: () => HTMLElement | null): () => void {
  const previouslyFocused = document.activeElement as HTMLElement | null;

  function getFocusable(): HTMLElement[] {
    const container = getContainer();
    if (!container) return [];
    return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (el) => el.offsetParent !== null
    );
  }

  getFocusable()[0]?.focus();

  function onKeydown(e: KeyboardEvent) {
    if (e.key !== 'Tab') return;
    const focusable = getFocusable();
    if (focusable.length === 0) return;

    const firstEl = focusable[0]!;
    const lastEl = focusable[focusable.length - 1]!;
    const active = stableRoot.activeElement as HTMLElement | null;

    if (e.shiftKey && active === firstEl) {
      e.preventDefault();
      lastEl.focus();
    } else if (!e.shiftKey && active === lastEl) {
      e.preventDefault();
      firstEl.focus();
    }
  }

  stableRoot.addEventListener('keydown', onKeydown as EventListener);

  return () => {
    stableRoot.removeEventListener('keydown', onKeydown as EventListener);
    previouslyFocused?.focus();
  };
}
