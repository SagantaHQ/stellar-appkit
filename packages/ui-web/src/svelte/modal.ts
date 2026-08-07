/**
 * Svelte wrapper for the `<stellar-appkit-modal>` Web Component.
 *
 * Why this exists: the underlying modal is a Web Component, which Svelte
 * can render directly (`<stellar-appkit-modal>` renders as-is in Svelte
 * templates since the tag contains a hyphen). But to get typed props,
 * automatic `client` assignment, and event forwarding, we provide a
 * Svelte **action** (`use:stellarmodal`) plus a typed wrapper.
 *
 * ## Usage — option 1: Svelte action (recommended)
 *
 * ```svelte
 * <script lang="ts">
 *   import { setStellarAppKitContext, stellarmodal } from '@saganta/stellar-appkit/svelte';
 *   setStellarAppKitContext({ network: 'TESTNET', connectors: [...] });
 *
 *   let modal: { open: () => void; close: () => void };
 * </script>
 *
 * <stellar-appkit-modal
 *   use:stellarmodal
 *   bind:this={modal}
 *   mode="auto"
 *   theme="dark"
 *   on:sc-connect={(e) => console.log('connected', e.detail)}
 * />
 * <button on:click={() => modal?.open()}>Connect</button>
 * ```
 *
 * The `use:stellarmodal` action:
 * 1. Reads the `StellarAppKit` client from the module-level singleton.
 * 2. Sets `element.client = client`.
 * 3. Returns a destroy function that nulls the client (for cleanup).
 *
 * ## Usage — option 2: raw Web Component
 *
 * If you don't want to use the action, you can wire up the client manually:
 *
 * ```svelte
 * <script lang="ts">
 *   import { getAppKit } from '@saganta/stellar-appkit/svelte';
 *   import '@saganta/stellar-appkit/ui-web';
 *   let modalEl: HTMLElement & { client: any };
 *   $: if (modalEl) modalEl.client = getAppKit();
 * </script>
 *
 * <stellar-appkit-modal bind:this={modalEl} mode="auto" />
 * ```
 *
 * The action approach is cleaner — let the library handle the wiring.
 *
 * ## Events
 *
 * The underlying Web Component dispatches `sc-connect`, `sc-disconnect`,
 * `sc-error` as composed/bubbling CustomEvents. Svelte's `on:sc-connect`
 * syntax picks them up directly — no extra wiring needed.
 *
 * The underlying Web Component is imported as a side-effect of importing
 * this module — so the custom element is registered before any modal mounts.
 */

import { getAppKit } from './index.js';
import type {
  StellarAppKitModalProps,
  StellarAppKitModalHandle,
  StellarAppKitModalEvents,
} from '../ui-web/modal-props.js';

// NOTE: We deliberately do NOT import '../ui-web/connect-modal.js' here.
// The Web Component class extends `HTMLElement`, which is undefined in
// pure-Node SSR/test environments. Importing it at module top-level would
// crash server-side rendering.
//
// Consumers must import `@saganta/stellar-appkit/ui-web` once at their
// app entry point to register the `<stellar-appkit-modal>` custom element:
//
//   import '@saganta/stellar-appkit/ui-web';

export type { StellarAppKitModalProps, StellarAppKitModalHandle, StellarAppKitModalEvents };

/**
 * Svelte action that wires up the `<stellar-appkit-modal>` Web Component
 * to the `StellarAppKit` client from the module-level singleton.
 *
 * Use it like:
 *
 * ```svelte
 * <stellar-appkit-modal use:stellarmodal mode="auto" />
 * ```
 *
 * The action reads the client from `getAppKit()` (set via
 * `setStellarAppKitContext()`). If no client has been set, the action
 * throws — set the context before the modal mounts.
 *
 * @param node The `<stellar-appkit-modal>` DOM element.
 * @returns An action object with a `destroy()` method that nulls the client.
 */
export function stellarmodal(node: HTMLElement): {
  destroy(): void;
} {
  const client = getAppKit();
  // Set the client — the Web Component's `client` setter wires up its
  // internal event listeners, the preview handler, and the initial render.
  (node as unknown as { client: typeof client }).client = client;

  return {
    destroy() {
      // The underlying Web Component's `disconnectedCallback` already
      // releases its event listeners and focus trap. We just null the
      // client to break the reference cycle.
      (node as unknown as { client: typeof client | null }).client = null;
    },
  };
}

/**
 * Imperative helper — opens a `<stellar-appkit-modal>` element by reference.
 * Useful when you store the element via `bind:this` and want a typed open()
 * method.
 *
 * ```svelte
 * <script lang="ts">
 *   import { setStellarAppKitContext, openModal } from '@saganta/stellar-appkit/svelte';
 *   setStellarAppKitContext({...});
 *   let modalEl: HTMLElement;
 * </script>
 *
 * <stellar-appkit-modal use:stellarmodal bind:this={modalEl} />
 * <button on:click={() => openModal(modalEl)}>Connect</button>
 * ```
 */
export async function openModal(node: HTMLElement): Promise<void> {
  await (node as unknown as { open?: () => Promise<void> })?.open?.();
}

/**
 * Imperative helper — closes a `<stellar-appkit-modal>` element by reference.
 */
export function closeModal(node: HTMLElement): void {
  (node as unknown as { close?: () => void })?.close?.();
}

/**
 * Type guard — checks whether a DOM element is a `<stellar-appkit-modal>`.
 * Useful for narrowing in event handlers.
 */
export function isStellarAppKitModal(node: unknown): node is HTMLElement & {
  client: ReturnType<typeof getAppKit> | null;
  open(): Promise<void>;
  close(): void;
} {
  // SSR-safe: don't use `instanceof HTMLElement` because HTMLElement is
  // undefined in pure-Node contexts. Check for the tag name directly.
  return (
    typeof node === 'object' &&
    node !== null &&
    'tagName' in node &&
    (node as { tagName?: string }).tagName === 'SAGANTA-APPKIT-MODAL'
  );
}
