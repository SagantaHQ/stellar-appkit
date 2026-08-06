---
title: Bottom Sheet
description: Draggable bottom-sheet with spring physics — pull down to dismiss.
---

## Overview

On mobile (viewport ≤ 640px), the modal automatically becomes a bottom-sheet. The sheet slides up from the bottom with a drag handle.

## Drag-to-dismiss

The bottom-sheet supports drag-to-dismiss using `@use-gesture/vanilla` + `motion` (optional peer dependencies):

```bash
npm install @use-gesture/vanilla motion
```

Behavior:
- **Drag down** on the sheet moves it with the finger
- **Backdrop fades** as the sheet drags down
- **Release with velocity > 0.5 or drag > 40%** of sheet height → closes (animated slide-down + fade)
- **Release otherwise** → springs back to open position (spring physics)
- **`touch-action: pan-y`** prevents browser scroll interference
- **`filterTaps: true`** ensures clicks on buttons inside the sheet still work

If the gesture packages aren't installed, the bottom-sheet still works via the close button and backdrop tap.

## Forcing bottom-sheet mode

```html
<saganta-appkit-modal mode="bottom-sheet"></saganta-appkit-modal>
```

## Forcing modal mode (even on mobile)

```html
<saganta-appkit-modal mode="modal"></saganta-appkit-modal>
```
