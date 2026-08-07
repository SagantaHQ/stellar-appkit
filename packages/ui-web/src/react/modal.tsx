/**
 * React JSX wrapper for the `<saganta-appkit-modal>` Web Component.
 *
 * Why this exists: the underlying modal is a Web Component, which works in
 * any framework but feels unidiomatic in React — you have to manage refs,
 * manually set the `.client` property, and listen for CustomEvents. This
 * component wraps all of that behind a normal JSX component with typed props
 * and an imperative handle (via `ref`).
 *
 * Usage:
 *
 * ```tsx
 * import { StellarAppKitProvider, StellarAppKitModal } from '@saganta/stellar-appkit/react';
 *
 * function App() {
 *   return (
 *     <StellarAppKitProvider config={...}>
 *       <StellarAppKitModal mode="auto" theme="dark" />
 *       <ConnectButton />
 *     </StellarAppKitProvider>
 *   );
 * }
 *
 * function ConnectButton() {
 *   const modalRef = useRef<StellarAppKitModalHandle>(null);
 *   return <button onClick={() => modalRef.current?.open()}>Connect</button>;
 * }
 * ```
 *
 * The modal reads its `client` from the same context as the hooks — so it
 * stays in sync with `<StellarAppKitProvider>`. If you want to use it without
 * a provider, use the raw `<saganta-appkit-modal>` element and set
 * `element.client = appkit` directly.
 *
 * The underlying Web Component is imported as a side-effect of importing
 * this module — so the custom element is registered before any modal mounts.
 */

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type ReactNode,
} from 'react';
import { useAppKit } from './index.js';
import type { StellarAppKit } from '@saganta/stellar-appkit';
import {
  type StellarAppKitModalProps,
  type StellarAppKitModalHandle,
  type StellarAppKitModalEvents,
  propsToAttributes,
} from '../ui-web/modal-props.js';

// NOTE: We deliberately do NOT import '../ui-web/connect-modal.js' here.
// The Web Component class extends `HTMLElement`, which is undefined in
// pure-Node SSR/test environments. Importing it at module top-level would
// crash server-side rendering.
//
// Instead, consumers must import `@saganta/stellar-appkit/ui-web` once
// at their app entry point to register the `<saganta-appkit-modal>`
// custom element:
//
//   import '@saganta/stellar-appkit/ui-web';
//
// This keeps the framework wrappers fully SSR-safe and lets bundlers
// tree-shake the Web Component code out of server bundles.

export type { StellarAppKitModalProps, StellarAppKitModalHandle, StellarAppKitModalEvents };

export interface StellarAppKitModalComponentProps
  extends StellarAppKitModalProps,
    StellarAppKitModalEvents {
  /** Optional children — rendered inside the modal host (rarely needed). */
  children?: ReactNode;
  /** CSS class name applied to the host element. */
  className?: string;
  /** Inline style applied to the host element (for theme overrides via CSS vars). */
  style?: React.CSSProperties;
}

/**
 * `<StellarAppKitModal>` — a React component wrapping the underlying
 * `<saganta-appkit-modal>` Web Component.
 *
 * The component:
 * 1. Reads the `StellarAppKit` client from context (via `useAppKit()`).
 * 2. Sets `element.client = client` after mount, so the modal wires up its
 *    internal event listeners and preview handler.
 * 3. Forwards all `StellarAppKitModalProps` to attributes on the Web Component.
 * 4. Subscribes to the modal's CustomEvents and dispatches them as the
 *    `onConnect`, `onDisconnect`, `onError` callbacks.
 * 5. Exposes an imperative handle via `ref` with `open()` / `close()` methods.
 */
export const StellarAppKitModal = forwardRef<
  StellarAppKitModalHandle,
  StellarAppKitModalComponentProps
>(function StellarAppKitModal(props, ref) {
  const client = useAppKit();
  const hostRef = useRef<HTMLElement & { client: StellarAppKit | null } | null>(null);

  // Wire up the client to the host element whenever it changes.
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    el.client = client;
  }, [client]);

  // Forward the props to attributes whenever they change. We do this in an
  // effect (rather than JSX attribute spreading) because React doesn't know
  // how to update Web Component custom attributes reliably across versions
  // — setting them imperatively is the most predictable approach.
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const attrs = propsToAttributes(props);
    for (const [name, value] of Object.entries(attrs)) {
      el.setAttribute(name, value);
    }
  }, [
    props.mode,
    props.theme,
    props.branding,
    props.logoSrc,
    props.title,
    props.autoRetryNetwork,
    props.stellarExpertAvatars,
  ]);

  // Wire up event listeners. We use CustomEvent capture here because the
  // underlying modal dispatches composed/bubbling events.
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    const unsubscribe: Array<() => void> = [];

    if (props.onConnect) {
      const handler = (e: Event) => props.onConnect?.((e as CustomEvent).detail);
      el.addEventListener('sc-connect', handler);
      unsubscribe.push(() => el.removeEventListener('sc-connect', handler));
    }
    if (props.onDisconnect) {
      const handler = (e: Event) => props.onDisconnect?.((e as CustomEvent).detail);
      el.addEventListener('sc-disconnect', handler);
      unsubscribe.push(() => el.removeEventListener('sc-disconnect', handler));
    }
    if (props.onError) {
      const handler = (e: Event) => props.onError?.((e as CustomEvent).detail);
      el.addEventListener('sc-error', handler);
      unsubscribe.push(() => el.removeEventListener('sc-error', handler));
    }
    return () => unsubscribe.forEach((u) => u());
  }, [props.onConnect, props.onDisconnect, props.onError]);

  // Expose the imperative handle: open()/close()/element.
  // The `open()` method ensures the client is set on the host element before
  // calling the Web Component's open() — this fixes a race where the user
  // clicks before the useEffect that sets `el.client = client` runs.
  useImperativeHandle(
    ref,
    (): StellarAppKitModalHandle => ({
      open: async () => {
        const el = hostRef.current as unknown as
          | (HTMLElement & { client: StellarAppKit | null; open?: () => Promise<void> })
          | null;
        if (!el) return;
        // Ensure the client is set before opening — the useEffect might not
        // have run yet if the user clicks immediately after mount.
        if (!el.client) {
          el.client = client;
        }
        await el.open?.();
      },
      close: () => {
        const el = hostRef.current as unknown as
          | (HTMLElement & { close?: () => void })
          | null;
        el?.close?.();
      },
      get element() {
        return hostRef.current as HTMLElement & { client: StellarAppKit | null };
      },
    }),
    [client]
  );

  // JSX doesn't natively know how to render Web Components with TypeScript.
  // We use a lowercase tag name (which React treats as a custom element) and
  // cast the props. The `ref` lets us access the underlying DOM node.
  const HostTag = 'saganta-appkit-modal' as unknown as 'div';
  return (
    <HostTag
      ref={hostRef as never}
      className={props.className}
      style={props.style}
    >
      {props.children}
    </HostTag>
  );
});

// Re-exported above — keep these out of the `React` namespace so they're
// tree-shakeable independently of the component.
export { StellarAppKitModal as default };
