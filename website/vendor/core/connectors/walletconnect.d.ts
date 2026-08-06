import type { WalletConnector, ConnectStorage } from '../types.js';
export interface WalletConnectConnectorOptions {
    /** WalletConnect Cloud project ID — get one at cloud.walletconnect.com. */
    projectId: string;
    /** App metadata shown in the wallet's connection approval dialog. */
    metadata: {
        name: string;
        description: string;
        url: string;
        icons: string[];
    };
    /**
     * Called with the WC pairing URI when a new connection is initiated.
     * The app renders this as a QR code (desktop) or opens it as a deep
     * link (mobile). Required — without this, the user can't scan the
     * pairing code.
     */
    onUri: (uri: string) => void;
    /**
     * Optional storage for persisting the WC session topic across page
     * reloads. If provided, `restore()` will attempt to reconnect using
     * the saved topic. If not provided, sessions are lost on page reload.
     */
    storage?: ConnectStorage;
    /** The Stellar network passphrase to include in the session proposal. */
    networkPassphrase: string;
}
export declare function createWalletConnectConnector(opts: WalletConnectConnectorOptions): WalletConnector;
//# sourceMappingURL=walletconnect.d.ts.map