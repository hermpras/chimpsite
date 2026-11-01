import { test, expect } from "@playwright/test";
import { setupMockWallet, TEST_ACCOUNT } from "./helpers/mock-wallet";
import { shortenAddress } from "../lib/auth/address";
import {
  startMockXServer,
  cleanupXOAuthTestData,
  type MockXServer,
} from "./helpers/mock-x-server";

test.describe("F. X (Twitter) OAuth 2.0 PKCE End-to-End Flow", () => {
  test.setTimeout(90_000);

  let mockXServer: MockXServer;

  test.beforeAll(async () => {
    // 1. Clean any existing test records in the local test database
    await cleanupXOAuthTestData("e2e_tester");

    // 2. Start local Node HTTP mock server for Twitter API on port 9999
    mockXServer = await startMockXServer({
      port: 9999,
      mockUserId: "e2e_x_user_12345",
      mockUsername: "e2e_tester",
      mockName: "E2E Tester",
      mockProfileImageUrl: "https://pbs.twimg.com/profile_images/1/avatar_normal.jpg",
    });
  });

  test.afterAll(async () => {
    if (mockXServer) {
      await mockXServer.stop();
    }
    await cleanupXOAuthTestData("e2e_tester");
  });

  test.beforeEach(async () => {
    await cleanupXOAuthTestData("e2e_tester");
  });

  test.afterEach(async () => {
    await cleanupXOAuthTestData("e2e_tester");
  });

  test("happy path: user initiates X OAuth, authorises, exchanges code via mock server, and connects profile", async ({
    page,
  }) => {
    await setupMockWallet(page);

    // 1. Visit Profile and sign in via SIWE
    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: "User Profile" })).toBeVisible({
      timeout: 20_000,
    });

    const connectBtn = page
      .getByRole("button", { name: /Connect MetaMask|Connect Injected/i })
      .first();
    await expect(connectBtn).toBeVisible({ timeout: 20_000 });
    await connectBtn.click();

    // Verify wallet authenticated state
    const shortAddr = shortenAddress(TEST_ACCOUNT.address);
    await expect(page.getByText("Signed in", { exact: false }).first()).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.getByText(/user:/i)).toBeVisible({ timeout: 20_000 });

    // Re-visit /profile to ensure all page components mount cleanly with authenticated session
    await page.goto("/profile");
    await expect(page.getByText("Signed in", { exact: false }).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/user:/i)).toBeVisible({ timeout: 20_000 });

    const userChip = page
      .locator("header")
      .getByRole("button", { name: new RegExp(shortAddr, "i") });
    await expect(userChip).toBeVisible({ timeout: 20_000 });

    // Verify initial unlinked state for X
    const linkXBtn = page.getByRole("button", { name: "Link X Account" }).first();
    await expect(linkXBtn).toBeVisible();
    await expect(linkXBtn).toBeEnabled();
    await expect(page.getByText("No X account linked")).toBeVisible();
    await expect(
      page.getByText("Please connect and authenticate your Web3 wallet first."),
    ).not.toBeVisible();

    // 2. Intercept browser navigation to official Twitter authorize URL
    let interceptedAuthUrl: string | null = null;
    let extractedState: string | null = null;

    await page.route("**/i/oauth2/authorize*", async (route) => {
      const requestUrl = route.request().url();
      interceptedAuthUrl = requestUrl;

      const parsedUrl = new URL(requestUrl);
      extractedState = parsedUrl.searchParams.get("state");

      // Verify that the browser was sent to the official Twitter domain with correct PKCE params
      expect(parsedUrl.hostname).toBe("twitter.com");
      expect(parsedUrl.pathname).toBe("/i/oauth2/authorize");
      expect(parsedUrl.searchParams.get("response_type")).toBe("code");
      expect(parsedUrl.searchParams.get("code_challenge")).toBeTruthy();
      expect(parsedUrl.searchParams.get("code_challenge_method")).toBe("S256");
      expect(extractedState).toBeTruthy();

      // Simulate Twitter redirecting user back to the local callback endpoint
      await route.fulfill({
        status: 302,
        headers: {
          Location: `http://localhost:3000/api/social/x/callback?code=mock_valid_auth_code_123&state=${extractedState}`,
        },
      });
    });

    // 3. Click "Link X Account" and follow redirect chain
    await linkXBtn.click();

    // 4. Verify browser follows redirect chain back to /profile?x_linked=1
    await expect(page).toHaveURL(/.*\/profile\?x_linked=1/, { timeout: 30_000 });

    // 5. Verify success feedback banner rendered
    const successBanner = page.getByTestId("x-link-success-banner");
    await expect(successBanner).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByText("X Account Successfully Linked", { exact: false }),
    ).toBeVisible();

    // 6. Verify profile card updates to connected status with username @e2e_tester
    await expect(page.getByText("Status: Connected (@e2e_tester)")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("@e2e_tester").first()).toBeVisible();

    // 7. Verify connect button changes to "X Account Connected" and is disabled
    const connectedBtn = page.getByRole("button", { name: "X Account Connected" });
    await expect(connectedBtn).toBeVisible();
    await expect(connectedBtn).toBeDisabled();

    // 8. Verify the mock X server received the expected outbound calls from Next.js backend
    const tokenReqs = mockXServer.getTokenRequests();
    expect(tokenReqs.length).toBeGreaterThanOrEqual(1);
    expect(tokenReqs[0].body).toContain("code=mock_valid_auth_code_123");
    expect(tokenReqs[0].body).toContain("grant_type=authorization_code");
    expect(tokenReqs[0].body).toContain("code_verifier=");

    const userMeReqs = mockXServer.getUserMeRequests();
    expect(userMeReqs.length).toBeGreaterThanOrEqual(1);
    expect(userMeReqs[0].headers.authorization).toBe(
      "Bearer mock_e2e_access_token_12345",
    );
  });

  test("negative: callback with tampered/mismatched state parameter is rejected with HTTP 400", async ({
    page,
  }) => {
    await setupMockWallet(page);

    await page.goto("/profile");
    const connectBtn = page
      .getByRole("button", { name: /Connect MetaMask|Connect Injected/i })
      .first();
    await expect(connectBtn).toBeVisible({ timeout: 20_000 });

    await connectBtn.click();

    const shortAddr = shortenAddress(TEST_ACCOUNT.address);
    await expect(page.getByText("Signed in", { exact: false }).first()).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.getByText(/user:/i)).toBeVisible({ timeout: 20_000 });

    await page.goto("/profile");
    await expect(page.getByText("Signed in", { exact: false }).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/user:/i)).toBeVisible({ timeout: 20_000 });

    const userChip = page
      .locator("header")
      .getByRole("button", { name: new RegExp(shortAddr, "i") });
    await expect(userChip).toBeVisible({ timeout: 20_000 });

    // Intercept and simulate callback with tampered state
    await page.route("**/i/oauth2/authorize*", async (route) => {
      await route.fulfill({
        status: 302,
        headers: {
          Location:
            "http://localhost:3000/api/social/x/callback?code=mock_code&state=tampered_invalid_state_123",
        },
      });
    });

    const linkXBtn = page.getByRole("button", { name: "Link X Account" }).first();
    await expect(linkXBtn).toBeVisible();
    await linkXBtn.click();

    // The callback endpoint rejects with 400 JSON { error: "INVALID_OAUTH_STATE" }
    await expect(page.getByText(/INVALID_OAUTH_STATE|OAuth state mismatch/i)).toBeVisible({
      timeout: 20_000,
    });
  });

  test("negative: callback invoked directly without valid OAuth cookie returns 400", async ({
    page,
  }) => {
    // Direct invocation without the HttpOnly chimphood_x_oauth cookie
    const response = await page.request.get(
      "/api/social/x/callback?code=mock_code&state=any_state",
    );
    expect(response.status()).toBe(400);

    const body = await response.json();
    expect(body.error).toBe("INVALID_OAUTH_STATE");
    expect(body.message).toMatch(/Missing or invalid OAuth state cookie/i);
  });
});
