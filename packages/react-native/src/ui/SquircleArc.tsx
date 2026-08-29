/**
 * SquircleArc — the React Native port of the web modal's connecting
 * spinner (`.connecting-view__arc` / `.signing-view__arc`).
 *
 * The web spinner is NOT a circle: it is a rounded-square outline whose
 * 120-unit dash comet travels clockwise around the perimeter
 * (`stroke-dasharray: 120 240`, `stroke-dashoffset` animating to −360).
 * This component reproduces that exact look with plain Views —
 * `squircle-track.ts` divides the path into short segments and computes
 * each segment's EXACT painted fraction over the cycle; here every
 * segment becomes a thin rounded View whose opacity is keyframed off
 * one shared, native-driven progress value.
 *
 * Timings match ui-web v1.9.50 exactly:
 * - connecting arc: 2s linear (reduced motion: 2.5s)
 * - signing arc:    0.8s linear (no reduced-motion override on web)
 *
 * No react-native-svg dependency — geometry + opacity PWM only.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import { SQUIRCLE_COMET, SQUIRCLE_SPEC } from './squircle-track.js';

export interface SquircleArcProps {
  /** Accent color — web uses `color: var(--sak-color-accent)`. */
  color: string;
  /** Rendered side in dp. Defaults to the web viewBox size (88). */
  size?: number;
  /** Stroke width in dp. Defaults to the web 2.5. */
  strokeWidth?: number;
  /** One full cycle in ms — 2000 connecting / 800 signing on web. */
  durationMs?: number;
  /** Pauses the animation (opacity holds its current value). */
  paused?: boolean;
}

/**
 * A 0→1 linear loop with `useNativeDriver` — the single Animated.Value
 * every segment's opacity interpolation hangs off. One native animation
 * drives the whole spinner; JS never runs per-frame.
 */
export function useLoopProgress(durationMs: number, paused = false): Animated.Value {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (paused) {
      value.stopAnimation();
      return;
    }
    const loop = Animated.loop(
      Animated.timing(value, {
        toValue: 1,
        duration: durationMs,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [value, durationMs, paused]);
  return value;
}

export function SquircleArc({
  color,
  size = SQUIRCLE_SPEC.box,
  strokeWidth = SQUIRCLE_SPEC.strokeWidth,
  durationMs = SQUIRCLE_SPEC.connectingDurationMs,
  paused = false,
}: SquircleArcProps) {
  const progress = useLoopProgress(durationMs, paused);
  const scale = size / SQUIRCLE_SPEC.box;
  const stroke = strokeWidth * scale;

  // Interpolations are created per render — cheap (a few dozen small
  // objects) and only on React re-renders, never per animation frame.
  const segments = useMemo(
    () =>
      SQUIRCLE_COMET.map((seg) => {
        const len = seg.length * scale + 0.5; // +0.5dp overlap kills hairline seams
        return {
          key: `${seg.a}`,
          style: {
            position: 'absolute' as const,
            left: seg.cx * scale - len / 2,
            top: seg.cy * scale - stroke / 2,
            width: len,
            height: stroke,
            borderRadius: stroke / 2, // ≈ stroke-linecap: round
            backgroundColor: color,
            transform: [{ rotate: `${seg.angle}deg` }],
          },
          opacity: progress.interpolate({
            inputRange: seg.keyframes.input,
            outputRange: seg.keyframes.output,
          }),
        };
      }),
    [progress, scale, stroke, color]
  );

  return (
    <View pointerEvents="none" style={{ width: size, height: size }}>
      {segments.map((seg) => (
        <Animated.View key={seg.key} style={[seg.style, { opacity: seg.opacity }]} />
      ))}
    </View>
  );
}
