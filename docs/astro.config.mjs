import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://docs.saganta.com',
  output: 'static',
  adapter: cloudflare(),
  integrations: [
    starlight({
      title: 'Stellar AppKit',
      description: 'One SDK for every Stellar wallet — real transaction previews, Soroban built in, framework wrappers for React/Vue/Solid/Svelte.',
      logo: {
        src: './src/assets/logo.svg',
        replacesTitle: false,
      },
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/SagantaHQ/stellar-appkit' },
      ],
      sidebar: [
        {
          label: 'Getting Started',
          items: [
            { label: 'Introduction', slug: 'getting-started/introduction' },
            { label: 'Installation', slug: 'getting-started/installation' },
            { label: 'Quick Start', slug: 'getting-started/quick-start' },
          ],
        },
        {
          label: 'Core Concepts',
          items: [
            { label: 'Wallet Connection', slug: 'core/wallet-connection' },
            { label: 'Transaction Preview', slug: 'core/transaction-preview' },
            { label: 'Soroban Integration', slug: 'core/soroban' },
            { label: 'Sign-In With Stellar', slug: 'core/siws' },
            { label: 'Theming', slug: 'core/theming' },
          ],
        },
        {
          label: 'Framework Wrappers',
          items: [
            { label: 'React', slug: 'wrappers/react' },
            { label: 'Vue', slug: 'wrappers/vue' },
            { label: 'Solid', slug: 'wrappers/solid' },
            { label: 'Svelte', slug: 'wrappers/svelte' },
          ],
        },
        {
          label: 'Soroban Features',
          items: [
            { label: 'Typed Contract Client', slug: 'soroban/typed-client' },
            { label: 'RPC Failover', slug: 'soroban/rpc-failover' },
            { label: 'Contract Badges', slug: 'soroban/badges' },
            { label: 'Fee Estimation', slug: 'soroban/fee-estimation' },
            { label: 'Auth-Entry Signing', slug: 'soroban/auth-entry' },
          ],
        },
        {
          label: 'Wallets',
          items: [
            { label: 'Freighter', slug: 'wallets/freighter' },
            { label: 'Albedo', slug: 'wallets/albedo' },
            { label: 'xBull', slug: 'wallets/xbull' },
            { label: 'Ledger', slug: 'wallets/ledger' },
            { label: 'WalletConnect', slug: 'wallets/walletconnect' },
          ],
        },
        {
          label: 'UI Components',
          items: [
            { label: 'Modal', slug: 'ui/modal' },
            { label: 'Bottom Sheet', slug: 'ui/bottom-sheet' },
            { label: 'Avatars', slug: 'ui/avatars' },
            { label: 'Copy-to-Clipboard', slug: 'ui/copy-clipboard' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'API Reference', slug: 'reference/api' },
            { label: 'Error Handling', slug: 'reference/errors' },
            { label: 'Bundle Size', slug: 'reference/bundle-size' },
            { label: 'Changelog', slug: 'reference/changelog' },
          ],
        },
      ],
      customCss: ['./src/styles/custom.css'],
    }),
  ],
});
