/**
 * Vue 3 component wrapper for the `<saganta-appkit-modal>` Web Component.
 *
 * Why this exists: the underlying modal is a Web Component, which Vue can
 * render via the `v-is` syntax or as a custom element (configured in the
 * compiler), but a typed SFC-style component feels more idiomatic. This
 * wrapper handles `client` assignment, prop-to-attribute forwarding, event
 * listening, and exposes an imperative `open()` / `close()` API via
 * template refs.
 *
 * Usage:
 *
 * ```vue
 * <script setup lang="ts">
 *   import { StellarAppKitModal } from '@saganta/stellar-appkit/vue';
 *   import { provideStellarAppKit } from '@saganta/stellar-appkit/vue';
 *   import { ref } from 'vue';
 *
 *   provideStellarAppKit({ network: 'TESTNET', connectors: [...] });
 *   const modal = ref<InstanceType<typeof StellarAppKitModal>>();
 *
 *   function open() { modal.value?.open(); }
 * </script>
 *
 * <template>
 *   <StellarAppKitModal ref="modal" mode="auto" theme="dark" />
 *   <button @click="open">Connect</button>
 * </template>
 * ```
 *
 * The modal reads its `client` from the same `APPKIT_INJECTION_KEY` as the
 * composables — so it stays in sync with `provideStellarAppKit()` or
 * `app.use(StellarAppKitPlugin, ...)`. If you want to use it without a
 * provider, use the raw `<saganta-appkit-modal>` element and set
 * `element.client = appkit` directly.
 *
 * The underlying Web Component is imported as a side-effect of importing
 * this module — so the custom element is registered before any modal mounts.
 */
import { defineComponent, h, inject, onMounted, onBeforeUnmount, ref, watch, } from 'vue';
import { APPKIT_INJECTION_KEY } from './index.js';
import { propsToAttributes, } from '../ui-web/modal-props.js';
/**
 * Vue component wrapping `<saganta-appkit-modal>`.
 *
 * All props are reactive — changes propagate to the underlying Web Component
 * via attribute updates. Events (`sc-connect`, `sc-disconnect`, `sc-error`)
 * are forwarded as Vue emits (`connect`, `disconnect`, `error`) so they can
 * be listened to with `@connect="..."` in the template.
 */
export const StellarAppKitModal = defineComponent({
    name: 'StellarAppKitModal',
    props: {
        mode: { type: String, default: undefined },
        theme: { type: String, default: undefined },
        branding: { type: String, default: undefined },
        logoSrc: { type: String, default: undefined },
        title: { type: String, default: undefined },
        autoRetryNetwork: { type: Boolean, default: undefined },
        stellarExpertAvatars: { type: Boolean, default: undefined },
    },
    emits: {
        connect: (_session) => true,
        disconnect: (_payload) => true,
        error: (_error) => true,
    },
    setup(props, { expose, emit, attrs }) {
        const client = inject(APPKIT_INJECTION_KEY);
        if (!client) {
            throw new Error('StellarAppKitModal must be used inside a component tree where provideStellarAppKit() ' +
                'was called, or after app.use(StellarAppKitPlugin, ...). ' +
                'If you want to use the modal without a provider, use the raw <saganta-appkit-modal> ' +
                'element and set element.client = appkit directly.');
        }
        // Template ref to the underlying DOM element.
        const hostRef = ref(null);
        // Wire up the client to the host element after mount.
        onMounted(() => {
            const el = hostRef.value;
            if (!el)
                return;
            el.client = client;
            // Apply initial attributes (Vue doesn't know how to set custom-element
            // attributes reactively without compiler config, so we do it manually).
            const attrs = propsToAttributes(props);
            for (const [name, value] of Object.entries(attrs)) {
                el.setAttribute(name, value);
            }
            // Wire up event listeners — forward as Vue emits.
            const onConnect = (e) => emit('connect', e.detail);
            const onDisconnect = (e) => emit('disconnect', e.detail);
            const onError = (e) => emit('error', e.detail);
            el.addEventListener('sc-connect', onConnect);
            el.addEventListener('sc-disconnect', onDisconnect);
            el.addEventListener('sc-error', onError);
            // Save listeners for cleanup.
            cleanupHandlers.push(() => el.removeEventListener('sc-connect', onConnect), () => el.removeEventListener('sc-disconnect', onDisconnect), () => el.removeEventListener('sc-error', onError));
        });
        const cleanupHandlers = [];
        onBeforeUnmount(() => {
            cleanupHandlers.forEach((fn) => fn());
        });
        // Reactive prop updates — watch each prop and re-apply attributes.
        watch(() => ({ ...props }), (newProps) => {
            const el = hostRef.value;
            if (!el)
                return;
            const attrs = propsToAttributes(newProps);
            for (const [name, value] of Object.entries(attrs)) {
                el.setAttribute(name, value);
            }
        }, { deep: true });
        // Expose the imperative handle so template refs can call open()/close().
        expose({
            open: async () => {
                await hostRef.value?.open?.();
            },
            close: () => {
                hostRef.value?.close?.();
            },
            get element() {
                return hostRef.value;
            },
        });
        // Render the underlying Web Component. Vue renders unknown tags as-is
        // when they contain a hyphen, which `saganta-appkit-modal` does.
        return () => h('saganta-appkit-modal', {
            ref: hostRef,
            ...attrs,
        });
    },
});
export default StellarAppKitModal;
//# sourceMappingURL=modal.js.map