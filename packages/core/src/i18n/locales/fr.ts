/**
 * fr locale for Stellar AppKit.
 *
 * Auto-generated from the English locale (./en.ts). All keys match the
 * English locale exactly — only values are translated.
 *
 * This file is lazy-loaded via dynamic import() when setLocale('fr')
 * is called. It is NOT bundled into the main entry — the bundler code-splits
 * it into a separate chunk.
 *
 * ICU MessageFormat syntax is used for interpolation: {variableName}
 * ICU plural syntax: {count, plural, one {...} other {...}}
 */

import type { LocaleMessages } from './en.js';

const fr: LocaleMessages = {
  "footer": {
    "powered_by": "Propulsé par {brand}",
    "brand_name": "Stellar AppKit"
  },
  "aria": {
    "close_dialog": "Fermer",
    "back": "Retour",
    "copy_address": "Copier l'adresse",
    "click_to_copy": "Cliquez pour copier l'adresse",
    "more_options": "Plus d'options",
    "view_on_explorer": "Voir sur l'explorateur"
  },
  "title": {
    "account": "Compte",
    "choose_account": "Choisir un compte",
    "wrong_network": "Mauvais réseau",
    "review_transaction": "Vérifier la transaction",
    "signing": "Signature",
    "connect_wallet": "Connecter un portefeuille"
  },
  "wallet_list": {
    "loading": "Chargement des portefeuilles…",
    "empty": "Aucun portefeuille enregistré. Passez connectors dans la configuration StellarAppKit.",
    "not_installed": "Non installé",
    "install": "Installer",
    "section_stellar": "Portefeuilles Stellar",
    "more_wallets": "Plus de portefeuilles ({count})",
    "status": {
      "connecting": "Connexion…",
      "locked": "Verrouillé",
      "unavailable": "Indisponible",
      "installed": "Installé",
      "scan_qr": "Scanner le QR Code"
    }
  },
  "connecting": {
    "continue_in_wallet": "Continuer dans {walletName}",
    "accept_request": "Acceptez la demande de connexion dans le portefeuille",
    "error_subtitle": "Connexion refusée ou échouée. Réessayez ou choisissez un autre portefeuille."
  },
  "wc": {
    "scan_with": "Scanner avec {walletName}",
    "scan_instructions": "Ouvrez Hana, Lobstr ou Hot Wallet et scannez ce QR code pour vous connecter.",
    "open_in_wallet": "Ouvrir dans l'app du portefeuille",
    open_failed: "Impossible d'ouvrir {walletName}. Si elle n'est pas installée, téléchargez-la ci-dessous.",
    "copy_uri": "Copier l'URI",
    "copied": "Copié !",
    "generating_code": "Génération du code d'appairage…",
    "qr_failed": "Échec de la génération du QR. Utilisez le bouton copier ci-dessous.",
    "copy_pairing_code": "Copier le code d’appairage"
  },
  "action": {
    "try_again": "Réessayer",
    "cancel": "Annuler",
    "sign": "Signer",
    "approve": "Approuver",
    "switch_wallet": "Changer de portefeuille",
    "disconnect": "Déconnecter",
    "connect_wallet": "Connecter le portefeuille"
  },
  "browser": {
    "reload": "Recharger",
    "open_in_browser": "Ouvrir dans le navigateur",
    "copy_link": "Copier le lien"
  },
  "wallet": {
    "fallback_name": "Portefeuille",
    "fallback_your_wallet": "votre portefeuille"
  },
  "account": {
    "default_label": "Compte"
  },
  "connected": {
    "pending_signatures": "{count, plural, one {# signature en attente} other {# signatures en attente}}",
    "balance_label": "Solde XLM",
    "balance_unit": "XLM",
    "recent_activity": "Activité récente",
    "no_transactions": "Aucune transaction récente",
    "get_testnet_funds": "Obtenir des fonds Testnet",
    "funds_requested": "Financement demandé — le solde sera mis à jour sous peu"
  },
  "tx": {
    "default_type": "Transaction",
    "default_asset": "XLM",
    "unknown_asset": "INCONNU",
    "no_amount": "—"
  },
  "preview": {
    "title": {
      "sign_message": "Signer le message",
      "review_transaction": "Vérifier la transaction"
    },
    "subtitle": {
      "sign_message": "Signez ce message pour prouver que vous possédez {walletName}. Annuler rejettera la demande.",
      "review_transaction": "Vérifiez les détails de la transaction ci-dessous. Approuvez pour continuer à signer dans {walletName}."
    },
    "from_account": "De {address}",
    "default_app_name": "App"
  },
  "signing": {
    "continue_in_wallet": "Continuer dans {walletName}",
    "subtitle": "Approuvez la demande dans votre portefeuille pour continuer",
    "error_title": "Signature refusée"
  },
  "siws": {
    "title": "Se connecter avec Stellar",
    "phase": {
      "checking_session": "Vérification de la session…",
      "fetching_nonce": "Récupération du nonce sécurisé…",
      "approve_in_wallet": "Approuvez la demande de connexion dans {walletName}",
      "verifying": "Vérification de votre signature…"
    },
    "error_title": "Échec de la connexion",
    "error_default": "Échec de la connexion.",
    "connect_wallet": "Connecter le portefeuille",
    "error_generic": "Échec de la connexion. Veuillez réessayer.",
    "error_too_many_attempts": "Trop de tentatives échouées ({maxRetries}). Veuillez réessayer plus tard.",
    "error_verification_failed": "Échec de la vérification de la connexion.",
    "error_address_mismatch": "L'adresse de la session ne correspond pas au portefeuille connecté",
    "error_network_mismatch": "Le réseau de la session ne correspond pas au portefeuille connecté",
    "error_session_expired": "La session a expiré"
  },
  "network_mismatch": {
    "title": "Mauvais réseau",
    "detail": "Ce portefeuille est sur {actualNetwork}, cette application a besoin de {expectedNetwork}.",
    "detail_fallback": "Ce portefeuille est sur le mauvais réseau.",
    "action_hint": "Changez de réseau dans votre portefeuille, puis réessayez."
  },
  "error": {
    "title": "Une erreur est survenue",
    "default_message": "Erreur inconnue.",
    "request_timed_out": "La demande a expiré. Veuillez réessayer."
  }
};

export default fr;
