import { test, expect, describe } from 'bun:test';
import { buildStyles } from '../src/ui-web/styles.js';
import { stellarDark } from '../src/ui-web/tokens.js';

/**
 * Regression tests for the v1.9.49 → v1.9.50 animation saga.
 *
 * v1.9.49 sped up the base spinner animations but missed the
 * `prefers-reduced-motion: reduce` override, which still forced an 8s
 * spin for users with OS-level "reduce motion" enabled — so the fix was
 * invisible to exactly the users who reported the problem. v1.9.50
 * fixed the override (8s → 2.5s) and rebalanced the base timings
 * (logo breathe 1.2s → 2.5s, border spinner 0.8s → 2s).
 *
 * These tests pin the shipped values so neither layer can silently
 * drift again — the reduced-motion override especially, which is easy
 * to break because dev machines rarely have it enabled.
 */

describe('spinner animation timings (v1.9.50)', () => {
  const css = buildStyles(stellarDark);

  test('base layer: logo breathe runs at 2.5s', () => {
    expect(css).toContain('animation: sak-logo-breathe 2.5s ease-in-out infinite');
  });

  test('base layer: border spinner runs at 2s linear', () => {
    expect(css).toContain('animation: sak-connecting-dash 2s linear infinite');
  });

  test('reduced-motion override caps the spinner at 2.5s — never the old 8s', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('.connecting-view__arc { animation-duration: 2.5s; }');
    // The v1.9.49 bug: an 8s override made the speedup invisible to
    // reduced-motion users. Guard against it ever coming back.
    expect(css).not.toContain('animation-duration: 8s');
  });

  test('reduced-motion disables breathe + entrance animations entirely', () => {
    expect(css).toContain('.connecting-view__logo { animation: none; }');
    expect(css).toContain('.connecting-view > * { animation: none; opacity: 1; }');
  });

  test('signing view uses the same rebalanced 2.5s breathe', () => {
    const matches = css.match(/sak-logo-breathe 2\.5s ease-in-out infinite/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2); // connect + sign views
  });
});
