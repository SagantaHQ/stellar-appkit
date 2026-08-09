/**
 * Svelte wrapper for the `<saganta-appkit-modal>` Web Component.
 *
 * Why this exists: the underlying modal is a Web Component, which Svelte
 * can render directly (`<saganta-appkit-modal>` renders as-is in Svelte
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
 * <saganta-appkit-modal
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
 * <saganta-appkit-modal bind:this={modalEl} mode="auto" />
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
import type { StellarAppKitModalProps, StellarAppKitModalHandle, StellarAppKitModalEvents } from '../ui-web/modal-props.js';
export type { StellarAppKitModalProps, StellarAppKitModalHandle, StellarAppKitModalEvents };
/**
 * Svelte action that wires up the `<saganta-appkit-modal>` Web Component
 * to the `StellarAppKit` client from the module-level singleton.
 *
 * Use it like:
 *
 * ```svelte
 * <saganta-appkit-modal use:stellarmodal mode="auto" />
 * ```
 *
 * The action reads the client from `getAppKit()` (set via
 * `setStellarAppKitContext()`). If no client has been set, the action
 * throws — set the context before the modal mounts.
 *
 * @param node The `<saganta-appkit-modal>` DOM element.
 * @returns An action object with a `destroy()` method that nulls the client.
 */
export declare function stellarmodal(node: HTMLElement): {
    destroy(): void;
};
/**
 * Imperative helper — opens a `<saganta-appkit-modal>` element by reference.
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
 * <saganta-appkit-modal use:stellarmodal bind:this={modalEl} />
 * <button on:click={() => openModal(modalEl)}>Connect</button>
 * ```
 */
export declare function openModal(node: HTMLElement): Promise<void>;
/**
 * Imperative helper — closes a `<saganta-appkit-modal>` element by reference.
 */
export declare function closeModal(node: HTMLElement): void;
/**
 * Type guard — checks whether a DOM element is a `<saganta-appkit-modal>`.
 * Useful for narrowing in event handlers.
 */
export declare function isStellarAppKitModal(node: unknown): node is HTMLElement & {
    client: ReturnType<typeof getAppKit> | null;
    open(): Promise<void>;
    close(): void;
};
//# sourceMappingURL=modal.d.ts.map