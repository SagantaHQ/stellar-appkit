/**
 * WAAPI animation types for the modal open/close transitions.
 * Zero dependencies — uses native Web Animations API (element.animate).
 */

/** Animation preset names available out of the box. */
export type AnimationPresetName =
  | 'none'
  | 'fade'
  | 'scale'
  | 'scale-blur'
  | 'slide-up'
  | 'slide-left'
  | 'implode';

/** Configuration accepted by the modal — either a single preset name
 *  (applied to both open and close) or separate open/close presets. */
export type ModalAnimationOption =
  | AnimationPresetName
  | { open?: AnimationPresetName; close?: AnimationPresetName };

/** Options passed to each preset's enter/exit function. */
export interface AnimationOptions {
  /** Duration in milliseconds. Default: 300 (enter), 200 (exit). */
  duration?: number;
  /** Easing function. Default: cubic-bezier(.16,1,.3,1). */
  easing?: string;
}

/** A resolved animation preset — two functions that return WAAPI Animation objects. */
export interface AnimationPreset {
  enter: (el: HTMLElement, opts?: AnimationOptions) => Animation | null;
  exit: (el: HTMLElement, opts?: AnimationOptions) => Animation | null;
}
