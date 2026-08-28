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
