/**
 * RN Animated equivalents of the web modal's connecting/signing animations.
 *
 * Timing parity with ui-web v1.9.50 (the reduced-motion fix release):
 * - logo breathe: 2.5s ease-in-out, infinite
 * - spinner dash: 2s linear, infinite
 * - prefers-reduced-motion: spinner capped at 2.5s (never the old 8s), breathe disabled
 *
 * On RN, "reduced motion" comes from the OS accessibility setting via
 * `AccessibilityInfo.isReduceMotionEnabled()` — the same signal the web modal
 * reads through `matchMedia('(prefers-reduced-motion: reduce)')`.
 */

import { useEffect, useRef, useState } from 'react';
import { Animated, AccessibilityInfo, Easing } from 'react-native';

/** Reads the OS "reduce motion" accessibility setting (async, one-shot). */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (mounted) setReduced(value);
      })
      .catch(() => {
        // Setting unavailable (older RN / exotic runtime) — animations stay on.
      });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
      setReduced(value);
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

/**
 * The logo "breathe" — a gentle 1 → 1.06 → 1 scale loop.
 * 2.5s ease-in-out, matching the web modal. Disabled entirely under
 * reduced motion (web sets `animation: none` there).
 */
export function useBreathe(reducedMotion: boolean): Animated.Value {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reducedMotion) {
      scale.stopAnimation();
      scale.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.06,
          duration: 1250,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 1250,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [scale, reducedMotion]);
  return scale;
}

/**
 * The spinner — a 360° rotation loop. 2s linear to match the web modal's
 * `sak-connecting-dash 2s linear infinite`; slowed to 2.5s under reduced
 * motion (web: `animation-duration: 2.5s`), never the pre-v1.9.50 8s.
 *
 * Kept for backward compatibility (public export). The web-parity
 * squircle spinner (SquircleArc) consumes `useLoopProgress` instead —
 * the same 0→1 cycle but consumed as dash-pattern progress rather than
 * a rotation angle.
 */
export function useSpinner(reducedMotion: boolean): Animated.Value {
  const rotate = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const duration = reducedMotion ? 2500 : 2000;
    const loop = Animated.loop(
      Animated.timing(rotate, {
        toValue: 1,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [rotate, reducedMotion]);
  return rotate;
}

/**
 * Staggered entrance for the connecting/signing views — port of the web
 * `.connecting-view > *` cascade: each child fades in and slides up 8px
 * over 0.5s `cubic-bezier(0.16, 1, 0.3, 1)`, delayed 0/80/160/240ms by
 * child index (web caps the delays at the 4th child; later children all
 * ride the 240ms slot). Disabled entirely under reduced motion (web:
 * `animation: none; opacity: 1`).
 *
 * Returns one style per child index 0..count-1.
 */
export function useEntranceStagger(
  count: number,
  reducedMotion: boolean
): Array<{ opacity: Animated.Value; translateY: Animated.Value }> {
  const [styles] = useState(() =>
    Array.from({ length: count }, () => ({
      opacity: new Animated.Value(reducedMotion ? 1 : 0),
      translateY: new Animated.Value(reducedMotion ? 0 : 8),
    }))
  );
  useEffect(() => {
    if (reducedMotion) {
      // Instant final state (still animate to be safe if the flag flipped).
      styles.forEach((s) => {
        s.opacity.setValue(1);
        s.translateY.setValue(0);
      });
      return;
    }
    const anims = styles.map((s, i) =>
      Animated.parallel([
        Animated.timing(s.opacity, {
          toValue: 1,
          duration: 500,
          easing: Easing.bezier(0.16, 1, 0.3, 1),
          delay: Math.min(i, 3) * 80,
          useNativeDriver: true,
        }),
        Animated.timing(s.translateY, {
          toValue: 0,
          duration: 500,
          easing: Easing.bezier(0.16, 1, 0.3, 1),
          delay: Math.min(i, 3) * 80,
          useNativeDriver: true,
        }),
      ])
    );
    const all = Animated.parallel(anims);
    all.start();
    return () => all.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);
  return styles;
}
