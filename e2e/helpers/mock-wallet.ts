import { type Page } from "@playwright/test";
import { Wallet } from "ethers";

export const TEST_ACCOUNT = {
  address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266".toLowerCase(),
  privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
};

export const ALTERNATE_ACCOUNT = {
  address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8".toLowerCase(),
  privateKey: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
};

export interface MockWalletOptions {
  autoConnect?: boolean;
  initialChainId?: string;
  rejectConnect?: boolean;
  rejectSign?: boolean;
  tamperSignature?: boolean;
}

export interface MockWalletController {
  address: string;
  setConnected: (connected: boolean) => Promise<void>;
  rejectNextConnect: () => Promise<void>;
  rejectNextSign: () => Promise<void>;
  tamperNextSignature: () => Promise<void>;
  setChainId: (chainIdHex: string) => Promise<void>;
}

/**
 * Injects a controlled EIP-1193 and EIP-6963 provider into the Playwright browser page.
 * Real cryptographic ECDSA signing is handled securely by ethers in the Node runner,
 * ensuring authentic EIP-4361 SIWE message validation against the backend.
 */
export async function setupMockWallet(
  page: Page,
  options: MockWalletOptions = {},
): Promise<MockWalletController> {
  const primaryWallet = new Wallet(TEST_ACCOUNT.privateKey);
  const alternateWallet = new Wallet(ALTERNATE_ACCOUNT.privateKey);

  // Expose cryptographic signing function to the page context
  await page.exposeFunction(
    "__playwright_signMessage",
    async (rawMessage: string, tamper: boolean) => {
      let text = rawMessage;
      if (rawMessage.startsWith("0x")) {
        try {
          const bytes = Buffer.from(rawMessage.slice(2), "hex");
          const utf8 = bytes.toString("utf8");
          if (/^[\x20-\x7E\r\n]+$/.test(utf8)) {
            text = utf8;
          }
        } catch {
          // fallback to raw
        }
      }

      if (tamper) {
        return await alternateWallet.signMessage(text);
      }
      return await primaryWallet.signMessage(text);
    },
  );

  const initialConnected = Boolean(options.autoConnect);
  const initialChain = options.initialChainId ?? "0x1";
  const initialRejectConnect = Boolean(options.rejectConnect);
  const initialRejectSign = Boolean(options.rejectSign);
  const initialTamperSignature = Boolean(options.tamperSignature);

  // In-page mock wallet initialization script
  await page.addInitScript(
    ({
      address,
      initialConnected,
      initialChain,
      initialRejectConnect,
      initialRejectSign,
      initialTamperSignature,
    }) => {
      const listeners: Record<string, ((...args: any[]) => void)[]> = {};

      const state = {
        address,
        connected: initialConnected,
        chainId: initialChain,
        rejectConnect: initialRejectConnect,
        rejectSign: initialRejectSign,
        tamperSignature: initialTamperSignature,
        rejectSwitch: false,
      };

      (window as any).__mockWalletState = state;

      const provider = {
        isMetaMask: true,
        isChimpHoodTestProvider: true,

        on(event: string, callback: (...args: any[]) => void) {
          listeners[event] = listeners[event] || [];
          listeners[event].push(callback);
          return provider;
        },

        removeListener(event: string, callback: (...args: any[]) => void) {
          if (!listeners[event]) return provider;
          listeners[event] = listeners[event].filter((cb) => cb !== callback);
          return provider;
        },

        emit(event: string, ...args: any[]) {
          if (!listeners[event]) return;
          listeners[event].forEach((cb) => {
            try {
              cb(...args);
            } catch (err) {
              console.error("[MockWallet] listener error", err);
            }
          });
        },

        async request({ method, params }: { method: string; params?: any[] }) {
          switch (method) {
            case "eth_requestAccounts": {
              if (state.rejectConnect) {
                state.rejectConnect = false;
                const err = new Error("User rejected the request.");
                (err as any).code = 4001;
                throw err;
              }
              state.connected = true;
              provider.emit("accountsChanged", [state.address]);
              return [state.address];
            }

            case "eth_accounts": {
              return state.connected ? [state.address] : [];
            }

            case "eth_chainId": {
              return state.chainId;
            }

            case "net_version": {
              return String(parseInt(state.chainId, 16));
            }

            case "wallet_switchEthereumChain": {
              if (state.rejectSwitch) {
                state.rejectSwitch = false;
                const err = new Error("User rejected chain switch.");
                (err as any).code = 4001;
                throw err;
              }
              const newChain = params?.[0]?.chainId;
              if (newChain) {
                state.chainId = newChain;
                provider.emit("chainChanged", newChain);
              }
              return null;
            }

            case "personal_sign": {
              if (state.rejectSign) {
                state.rejectSign = false;
                const err = new Error("User rejected the signature request.");
                (err as any).code = 4001;
                throw err;
              }
              let msg = params?.[0];
              if (
                typeof msg === "string" &&
                msg.toLowerCase() === state.address.toLowerCase()
              ) {
                msg = params?.[1];
              }
              const tamper = state.tamperSignature;
              state.tamperSignature = false;
              return await (window as any).__playwright_signMessage(msg, tamper);
            }

            default: {
              return null;
            }
          }
        },
      };

      (window as any).ethereum = provider;

      function announce() {
        const detail = Object.freeze({
          info: Object.freeze({
            uuid: "00000000-0000-0000-0000-000000000001",
            name: "MetaMask",
            icon: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg'/>",
            rdns: "io.metamask",
          }),
          provider,
        });
        window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail }));
      }

      window.addEventListener("eip6963:requestProvider", announce);
      announce();
    },
    {
      address: TEST_ACCOUNT.address,
      initialConnected,
      initialChain,
      initialRejectConnect,
      initialRejectSign,
      initialTamperSignature,
    },
  );

  return {
    address: TEST_ACCOUNT.address,
    setConnected: async (connected: boolean) => {
      await page.evaluate((c) => {
        const s = (window as any).__mockWalletState;
        if (s) {
          s.connected = c;
          (window as any).ethereum?.emit?.("accountsChanged", c ? [s.address] : []);
        }
      }, connected);
    },
    rejectNextConnect: async () => {
      await page.evaluate(() => {
        const s = (window as any).__mockWalletState;
        if (s) s.rejectConnect = true;
      });
    },
    rejectNextSign: async () => {
      await page.evaluate(() => {
        const s = (window as any).__mockWalletState;
        if (s) s.rejectSign = true;
      });
    },
    tamperNextSignature: async () => {
      await page.evaluate(() => {
        const s = (window as any).__mockWalletState;
        if (s) s.tamperSignature = true;
      });
    },
    setChainId: async (chainIdHex: string) => {
      await page.evaluate((hex) => {
        const s = (window as any).__mockWalletState;
        if (s) {
          s.chainId = hex;
          (window as any).ethereum?.emit?.("chainChanged", hex);
        }
      }, chainIdHex);
    },
  };
}
