# stellar-appkit.saganta.com

Static site — landing page, docs, and a fully interactive demo. No build step: plain HTML/CSS + native ES modules, same "works everywhere" philosophy as the SDK itself.

## Structure

```
website/
  index.html       # landing page — hero, features, wallets, code sample, live embedded modal
  docs.html         # documentation — sidebar nav, ported from the repo's README
  demo.html          # full interactive playground (theming, wallet connect, SIWS, tx preview)
  assets/
    site.css          # shared design tokens + component styles
  vendor/
    core/               # vendored build of @saganta/stellar-appkit (ui-web/ lives inside it — see below)
```

`vendor/` is a **copied build output**, not a symlink — this directory needs to be self-contained for static hosting. `@saganta/stellar-appkit/ui-web` is a subpath of the core package (not a separate one — see ARCHITECTURE.md §8), so `vendor/core/ui-web/` comes along automatically when you copy `packages/core/dist/`. Regenerate after any change to `packages/core`:

```bash
# from the repo root
npm run build
rm -rf website/vendor/core
mkdir -p website/vendor/core
cp -r packages/core/dist/* website/vendor/core/
```

## Local preview

ES modules are blocked under `file://`, so serve it:

```bash
cd website
npx serve .
# or: python3 -m http.server
```

## Deploying to stellar-appkit.saganta.com

This is a plain static site — any static host works (Vercel, Netlify, Cloudflare Pages, S3+CloudFront, GitHub Pages). Point the host at the `website/` directory as the site root. No build command is needed since there's no bundler — just publish the directory as-is (after regenerating `vendor/`, per above, if the SDK has changed).

## Wallet SDK CDN dependencies

The demo and landing page's live "Connect wallet" button load wallet SDKs (`@stellar/freighter-api`, `@albedo-link/intent`, `@creit.tech/xbull-wallet-connect`, the Ledger transport packages, `@stellar/stellar-sdk`) from `esm.sh` via an import map, rather than being bundled locally — keeps the site itself dependency-free and always current. If you'd rather not depend on a third-party CDN in production, vendor those too and update the import maps in `index.html`/`demo.html` to point at local copies instead.
