import type { AnimationPreset, AnimationOptions } from '../types.js';
import { prefersReducedMotion } from '../reduced-motion.js';

const D = 300;
const E = 'cubic-bezier(.16,1,.3,1)';

/** none — instant, no animation. */
export const none: AnimationPreset = {
  enter(el) {
    el.style.opacity = '1';
    return null;
  },
  exit(el) {
    el.style.opacity = '0';
    return null;
  },
};

/** fade — simple opacity transition. */
export const fade: AnimationPreset = {
  enter(el, opts) {
    if (prefersReducedMotion()) return null;
    return el.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: opts?.duration ?? D, easing: opts?.easing ?? E, fill: 'forwards' },
    );
  },
  exit(el, opts) {
    if (prefersReducedMotion()) return null;
    return el.animate(
      [{ opacity: 1 }, { opacity: 0 }],
      { duration: opts?.duration ?? 200, easing: opts?.easing ?? E, fill: 'forwards' },
    );
  },
};

/** scale — opacity 0→1, scale(0.92)→1. */
export const scale: AnimationPreset = {
  enter(el, opts) {
    if (prefersReducedMotion()) return null;
    return el.animate(
      [{ opacity: 0, transform: 'scale(0.92)' }, { opacity: 1, transform: 'scale(1)' }],
      { duration: opts?.duration ?? D, easing: opts?.easing ?? E, fill: 'forwards' },
    );
  },
  exit(el, opts) {
    if (prefersReducedMotion()) return null;
    return el.animate(
      [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.94)' }],
      { duration: opts?.duration ?? 200, easing: opts?.easing ?? E, fill: 'forwards' },
    );
  },
};

/** slide-left — translateX(80px)→0. */
export const slideLeft: AnimationPreset = {
  enter(el, opts) {
    if (prefersReducedMotion()) return null;
    return el.animate(
      [{ transform: 'translateX(80px)', opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }],
      { duration: opts?.duration ?? D, easing: opts?.easing ?? E, fill: 'forwards' },
    );
  },
  exit(el, opts) {
    if (prefersReducedMotion()) return null;
    return el.animate(
      [{ transform: 'translateX(0)', opacity: 1 }, { transform: 'translateX(80px)', opacity: 0 }],
      { duration: opts?.duration ?? 200, easing: opts?.easing ?? E, fill: 'forwards' },
    );
  },
};

/** implode — subtle Web3 entrance. scale(1.25) rotate(8deg) blur(20px) → scale(1) rotate(0) blur(0). */
export const implode: AnimationPreset = {
  enter(el, opts) {
    if (prefersReducedMotion()) return null;
    return el.animate(
      [
        { opacity: 0, transform: 'scale(1.25) rotate(8deg)', filter: 'blur(20px)' },
        { opacity: 1, transform: 'scale(1) rotate(0deg)', filter: 'blur(0)' },
      ],
      { duration: opts?.duration ?? 400, easing: opts?.easing ?? E, fill: 'forwards' },
    );
  },
  exit(el, opts) {
    if (prefersReducedMotion()) return null;
    return el.animate(
      [
        { opacity: 1, transform: 'scale(1) rotate(0deg)', filter: 'blur(0)' },
        { opacity: 0, transform: 'scale(1.15) rotate(-4deg)', filter: 'blur(16px)' },
      ],
      { duration: opts?.duration ?? 250, easing: opts?.easing ?? E, fill: 'forwards' },
    );
  },
};
