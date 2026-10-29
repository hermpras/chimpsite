import { test, expect } from "@playwright/test";
import { setupMockWallet, TEST_ACCOUNT } from "./helpers/mock-wallet";
import { shortenAddress } from "../lib/auth/address";
import { SiweMessage } from "siwe";
import { Wallet, getAddress } from "ethers";

test.describe("C. SIWE Authentication and Session Lifecycle", () => {
  test.setTimeout(90_000);

  test("complete valid SIWE sign-in produces valid session, persists across refresh, and logs out cleanly", async ({
    page,
    context,
  }) => {
    await setupMockWallet(page);

    await page.goto("/");

    // 1. Initial State: Unauthenticated
    const connectBtn = page
      .locator("header")
      .getByRole("button", { name: "Connect Wallet" });
    await expect(connectBtn).toBeVisible();

    // 2. Connect & Sign
    await connectBtn.click();
    const connectorChoice = page
      .getByRole("button", { name: /MetaMask|Injected/i })
      .first();
    await connectorChoice.click();

    // 3. UI transitions to Authenticated
    const shortAddr = shortenAddress(TEST_ACCOUNT.address);
    const userChip = page
      .locator("header")
      .getByRole("button", { name: new RegExp(shortAddr, "i") });
    await expect(userChip).toBeVisible({ timeout: 30_000 });

    // 4. Verify Server Session Cookie and Endpoint
    const cookies = await context.cookies();
    const sessionCookie = cookies.find((c) => c.name === "chimphood_session");
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie?.httpOnly).toBe(true);

    const sessionRes = await page.request.get("/api/auth/session");
    expect(sessionRes.ok()).toBe(true);
    const sessionData = await sessionRes.json();
    expect(sessionData.authenticated).toBe(true);
    expect(sessionData.address.toLowerCase()).toBe(TEST_ACCOUNT.address.toLowerCase());
    expect(sessionData.userId).toBeTruthy();

    // 5. Page Reload: Verify Session Persistence
    await page.reload();
    await expect(userChip).toBeVisible({ timeout: 10_000 });
    const refreshedSession = await page.request.get("/api/auth/session");
    const refreshedData = await refreshedSession.json();
    expect(refreshedData.authenticated).toBe(true);
    expect(refreshedData.address.toLowerCase()).toBe(TEST_ACCOUNT.address.toLowerCase());

    // 6. Sign Out
    await userChip.click();
    const signOutBtn = page.getByRole("button", { name: /Sign out/i });
    await expect(signOutBtn).toBeVisible();
    await signOutBtn.click();

    // 7. Verify Unauthenticated State
    const unauthButton = page
      .locator("header")
      .getByRole("button", { name: /Connect Wallet|Sign In with Ethereum/i });
    await expect(unauthButton).toBeVisible({ timeout: 15_000 });
    await expect(userChip).not.toBeVisible();

    const postLogoutSession = await page.request.get("/api/auth/session");
    const postLogoutData = await postLogoutSession.json();
    expect(postLogoutData.authenticated).toBe(false);

    // 8. Reload confirms session is completely destroyed
    await page.reload();
    await expect(unauthButton).toBeVisible();
    await expect(userChip).not.toBeVisible();
  });

  test("tampered or invalid signature is rejected by server with 401 and creates no session", async ({
    page,
  }) => {
    // Alter the signature by signing with a different key than the claimed wallet address
    await setupMockWallet(page, { tamperSignature: true });

    await page.goto("/");

    const connectBtn = page
      .locator("header")
      .getByRole("button", { name: "Connect Wallet" });
    await connectBtn.click();
    const connectorChoice = page
      .getByRole("button", { name: /MetaMask|Injected/i })
      .first();
    await connectorChoice.click();

    // Verification must fail with friendly error message in UI
    await expect(
      page
        .getByText(
          /Sign-in failed|Authentication failed|verification failed|Too many attempts/i,
        )
        .first(),
    ).toBeVisible({
      timeout: 20_000,
    });

    // Verify session remains unauthenticated
    const sessionRes = await page.request.get("/api/auth/session");
    const sessionData = await sessionRes.json();
    expect(sessionData.authenticated).toBe(false);

    // No user address chip in navbar header
    const shortAddr = shortenAddress(TEST_ACCOUNT.address);
    await expect(
      page.locator("header").getByRole("button", { name: new RegExp(shortAddr, "i") }),
    ).not.toBeVisible();
  });

  test("nonce replay is strictly rejected by the server", async ({ page }) => {
    // 1. Request an address-bound nonce
    const nonceRes = await page.request.post("/api/auth/nonce", {
      data: { address: TEST_ACCOUNT.address },
    });
    expect(nonceRes.ok()).toBe(true);
    const { nonce } = await nonceRes.json();

    // 2. Build and sign a valid SIWE message matching application specifications
    const siweMessage = new SiweMessage({
      domain: "localhost:3000",
      address: getAddress(TEST_ACCOUNT.address),
      statement: "Sign in to ChimpHood",
      uri: "http://localhost:3000",
      version: "1",
      chainId: 1,
      nonce,
      issuedAt: new Date().toISOString(),
      expirationTime: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    const message = siweMessage.prepareMessage();

    const signer = new Wallet(TEST_ACCOUNT.privateKey);
    const signature = await signer.signMessage(message);

    // 3. First verify: should succeed (200)
    const verifyRes1 = await page.request.post("/api/auth/verify", {
      data: { message, signature },
    });
    expect(verifyRes1.status()).toBe(200);

    // 4. Second verify with the exact same nonce & message: must be rejected with 401
    const verifyRes2 = await page.request.post("/api/auth/verify", {
      data: { message, signature },
    });
    expect(verifyRes2.status()).toBe(401);
    const errorData = await verifyRes2.json();
    expect(errorData.error).toBe("Authentication failed.");
  });
});
