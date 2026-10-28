import { describe, it, expect } from "vitest";
import {
  createConfig,
  WagmiProvider,
  useAccount,
  useChainId,
  useConnect,
  useConnectors,
  useDisconnect,
  useSignMessage,
  useSwitchChain,
} from "wagmi";
import { injected, coinbaseWallet } from "wagmi/connectors";
import { wagmiConfig } from "@/lib/wagmi";

/**
 * Regression guard for the wagmi v3 import surface used by the SIWE client
 * (DEC-002: hooks/useSiweAuth.ts, lib/wagmi.ts, components/providers.tsx).
 *
 * A missing or renamed export must fail loudly here — at test time —
 * instead of surfacing as a cryptic runtime `ReferenceError` (e.g.
 * "useChainId is not defined") in the browser. If a wagmi upgrade removes
 * or renames any of these, this test names the exact export.
 */
describe("wagmi v3 import surface (DEC-002)", () => {
  it("exposes every hook and helper the SIWE client imports", () => {
    const surface: Record<string, unknown> = {
      createConfig,
      WagmiProvider,
      useAccount,
      useChainId,
      useConnect,
      useConnectors,
      useDisconnect,
      useSignMessage,
      useSwitchChain,
      injected,
      coinbaseWallet,
    };
    for (const [name, value] of Object.entries(surface)) {
      expect(typeof value, `wagmi export "${name}"`).toBe("function");
    }
  });

  it("uses the injected MetaMask connector, not the SDK one", () => {
    // wagmi v3's `metaMask()` is the MetaMask *SDK* connector: its connect()
    // dynamically imports the optional `@metamask/connect-evm` package and
    // always rejects without it — before any wallet popup can open.
    // The classic injected EIP-1193 connector (`injected({ target: "metaMask" })`)
    // has id "metaMask"; the SDK one has id "metaMaskSDK".
    const ids = wagmiConfig.connectors.map((c) => c.id);
    expect(ids).toContain("metaMask");
    expect(ids).not.toContain("metaMaskSDK");
    // The generic injected connector is Rabby's path — it must survive.
    expect(ids).toContain("injected");
  });
});
