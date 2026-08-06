---
title: Modal
description: The <saganta-appkit-modal> Web Component — modal, bottom-sheet, and inline presentation.
---

## Overview

`<saganta-appkit-modal>` is a Shadow DOM Web Component. Attach a `StellarAppKit` instance via the `.client` property, then call `.open()`.

## Attributes

| Attribute | Values | Default |
|---|---|---|
| `mode` | `auto` \| `modal` \| `bottom-sheet` \| `inline` | `auto` (viewport-based) |
| `theme` | `dark` \| `light` \| `auto` | `dark` |
| `branding` | `show` \| `hide` | `show` |
| `logo-src` | image URL | — |
| `title` | string | contextual per view |
| `auto-retry-network` | `true` \| `false` | `false` |
| `stellar-expert-avatars` | `true` \| `false` | `false` |

## Methods

| Method | |
|---|---|
| `.client = appkit` | Required — attaches a `StellarAppKit` instance |
| `.open()` | Opens the modal/bottom-sheet |
| `.close()` | Closes it |

## Events

Fires standard `CustomEvent`s mirroring the client's events:
- `sc-connect` — a wallet connected
- `sc-disconnect` — a wallet disconnected
- `sc-error` — an error occurred
