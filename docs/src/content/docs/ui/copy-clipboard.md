---
title: Copy-to-Clipboard
description: Every address display has a copy button with per-address "copied!" feedback.
---

## Overview

Every address display in the modal has a copy-to-clipboard button:

- **Connected sessions** — each session row has its own copy button
- **Account picker** — each account option has a copy button (with `stopPropagation` so copy doesn't select the account)
- **Transaction preview** — the source account has a copy button

The "copied!" checkmark feedback is per-address — copying address A doesn't show a checkmark on address B.

## Programmatic copy

```ts
// The modal handles this automatically, but you can also copy programmatically:
await navigator.clipboard.writeText(session.address);
```
