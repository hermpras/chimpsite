import { describe, it, expect, vi, afterEach } from "vitest";
import { metaMaskConnector } from "@/lib/wagmi";

type ConnectorFactory = ReturnType<typeof metaMaskConnector>;
type ConnectorConfig = Parameters<ConnectorFactory>[0];

interface FakeWindow {
  ethereum?: unknown;
}

function stubProvider(flags: Record<string, boolean>) {
  return {
    request: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
    ...flags,
  };
}

function eip6963Detail(rdns: string, provider: unknown) {
  return { info: { rdns }, provider };
}

function buildConnector(providers: unknown[]) {
  const factory: ConnectorFactory = metaMaskConnector();
  return factory({ providers } as unknown as ConnectorConfig);
}

/**
 * The custom MetaMask connector must resolve the EIP-6963 MetaMask
 * provider first (exact rdns match), fall back to `window.ethereum` only
 * when it is genuinely MetaMask, and never silently pick another wallet
 * (e.g. Rabby) when the user chose MetaMask.
 */
describe("metaMaskConnector provider detection", () => {
  const win = window as unknown as FakeWindow;
  const originalEthereum = win.ethereum;

  afterEach(() => {
    win.ethereum = originalEthereum;
  });

  it("prefers the EIP-6963 provider over window.ethereum", async () => {
    const metaMask = stubProvider({ isMetaMask: true });
    const rabby = stubProvider({ isRabby: true });
    // Rabby typically owns window.ethereum when both are installed.
    win.ethereum = rabby;
    // `providers` arrives pre-filtered by rdns via wagmi's config.providers
    // getter, so the connector takes the first entry.
    const connector = buildConnector([eip6963Detail("io.metamask", metaMask)]);
    await expect(connector.getProvider()).resolves.toBe(metaMask);
  });

  it("falls back to window.ethereum only when it is genuinely MetaMask", async () => {
    const metaMask = stubProvider({ isMetaMask: true });
    win.ethereum = metaMask;
    const connector = buildConnector([]);
    await expect(connector.getProvider()).resolves.toBe(metaMask);
  });

  it("never selects Rabby when MetaMask was chosen", async () => {
    const rabby = stubProvider({ isRabby: true, isMetaMask: false });
    win.ethereum = rabby;
    const connector = buildConnector([]);
    await expect(connector.getProvider()).resolves.toBeUndefined();
  });

  it("throws ProviderNotFoundError when no MetaMask provider exists", async () => {
    win.ethereum = undefined;
    const connector = buildConnector([]);
    await expect(connector.connect()).rejects.toThrow(/not found/i);
  });

  it("exposes rdns io.metamask so wagmi filters EIP-6963 providers", () => {
    const connector = buildConnector([]);
    expect(connector.id).toBe("metaMask");
    expect(connector.rdns).toBe("io.metamask");
  });
});
