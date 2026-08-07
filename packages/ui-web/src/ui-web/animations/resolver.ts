import type { AnimationPreset, AnimationPresetName, ModalAnimationOption } from './types.js';
import { none, fade, scale, slideLeft, implode } from './presets/index.js';
import { scaleBlur } from './presets/scale-blur.js';
import { slideUp } from './presets/slide-up.js';

const PRESETS: Record<AnimationPresetName, AnimationPreset> = {
  'none': none,
  'fade': fade,
  'scale': scale,
  'scale-blur': scaleBlur,
  'slide-up': slideUp,
  'slide-left': slideLeft,
  'implode': implode,
};

export function getPreset(name: AnimationPresetName): AnimationPreset {
  return PRESETS[name] ?? PRESETS['none'];
}

export function resolveAnimation(
  option: ModalAnimationOption | undefined,
  defaultOpen: AnimationPresetName,
  defaultClose: AnimationPresetName,
): { open: AnimationPreset; close: AnimationPreset } {
  if (!option) {
    return { open: getPreset(defaultOpen), close: getPreset(defaultClose) };
  }
  if (typeof option === 'string') {
    const p = getPreset(option);
    return { open: p, close: p };
  }
  return {
    open: getPreset(option.open ?? defaultOpen),
    close: getPreset(option.close ?? defaultClose),
  };
}
