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
export declare function trapFocus(stableRoot: ShadowRoot, getContainer: () => HTMLElement | null): () => void;
//# sourceMappingURL=a11y.d.ts.map