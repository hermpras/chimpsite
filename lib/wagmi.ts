import { createConfig, createConnector, http } from "wagmi";
import { mainnet } from "wagmi/chains";
import { injected, coinbaseWallet } from "wagmi/connectors";

/**
 * MetaMask connector with EIP-6963-first provider discovery.
 *
 * Why not wagmi's `metaMask()`? That is the MetaMask *SDK* connector and
 * requires the optional `@metamask/connect-evm` package — without it,
 * `connect()` always rejects before any wallet popup can open.
 *
 * Why not `injected({ target: "metaMask" })` alone? Its provider lookup
 * only checks `window.ethereum.providers` / `window.ethereum` (legacy).
 * Modern wallets announce via EIP-6963, and a second installed wallet
 * (e.g. Rabby) typically owns `window.ethereum` — so MetaMask reports
 * "not detected" even when it is installed.
 *
 * Provider resolution order:
 *  1. EIP-6963 announcement with rdns `io.metamask` — exact match, so we
 *     never silently connect the user to a different wallet than the one
 *     they chose.
 *  2. Controlled fallback: `window.ethereum`, but only when it is genuinely
 *     MetaMask (the injected target filter excludes imitators, incl. Rabby).
 *
 * `rdns` is exposed so wagmi's `config.providers` (backed by the EIP-6963
 * mipd store) resolves the announced MetaMask provider for this connector.
 */
export function metaMaskConnector() {
  return createConnector((config) => {
    const fallback = injected({ target: "metaMask" })(config);
    return {
      ...fallback,
      id: "metaMask",
      name: "MetaMask",
      rdns: "io.metamask",
      async getProvider() {
        const eip6963 = config.providers?.[0]?.provider;
        if (eip6963) return eip6963;
        return (await fallback.getProvider()) ?? undefined;
      },
    };
  });
}

/**
 * wagmi v3 configuration for ChimpHood (DEC-002: minimal custom UI over
 * wagmi's built-in connectors — no RainbowKit/AppKit dependency).
 *
 * Chains: Ethereum mainnet only, matching the server default
 * ALLOWED_CHAIN_IDS=[1]. The login flow fetches the live allowlist from
 * GET /api/auth/config and prompts a network switch when needed.
 */
export const wagmiConfig = createConfig({
  chains: [mainnet],
  connectors: [injected(), metaMaskConnector(), coinbaseWallet()],
  transports: {
    [mainnet.id]: http(),
  },
  ssr: true,
});
