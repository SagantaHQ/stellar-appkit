---
title: Theming
description: Every color, radius, and font is a CSS custom property that crosses the shadow boundary.
---

## CSS custom properties

```css
saganta-appkit-modal {
  --sak-color-bg: #0B0D0E;
  --sak-color-surface: #14171A;
  --sak-color-border: rgba(255,255,255,0.08);
  --sak-color-text: #F5F6F7;
  --sak-color-text-muted: #9AA0A6;
  --sak-color-accent: #6EE7B7;
  --sak-radius-sm: 10px;
  --sak-radius-lg: 20px;
  --sak-font-display: 'Geist Sans', ui-sans-serif, system-ui;
  --sak-font-mono: 'Geist Mono', ui-monospace;
  --sak-logo-url: url('/brand/logo.svg');
}
```

## Theme attribute

```html
<saganta-appkit-modal theme="dark"></saganta-appkit-modal>
<saganta-appkit-modal theme="light"></saganta-appkit-modal>
<saganta-appkit-modal theme="auto"></saganta-appkit-modal>
```

`theme="auto"` follows the user's `prefers-color-scheme`.

## All attributes

| Attribute | Values | Default |
|---|---|---|
| `mode` | `auto` \| `modal` \| `bottom-sheet` \| `inline` | `auto` |
| `theme` | `dark` \| `light` \| `auto` | `dark` |
| `branding` | `show` \| `hide` | `show` |
| `logo-src` | image URL | — |
| `title` | string | contextual |
| `auto-retry-network` | `true` \| `false` | `false` |
| `stellar-expert-avatars` | `true` \| `false` | `false` |
