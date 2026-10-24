import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import ProfilePage from "@/app/profile/page";
import { Providers } from "@/components/providers";

let mockSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  usePathname: () => "/profile",
  useRouter: () => ({
    push: vi.fn(),
  }),
  useSearchParams: () => mockSearchParams,
}));

const mockFetchWhitelistStatus = vi.fn();
vi.mock("@/lib/whitelist/client", () => ({
  fetchWhitelistStatus: (...args: unknown[]) => mockFetchWhitelistStatus(...args),
}));

vi.mock("@/lib/inventory/client", () => ({
  fetchUserInventory: vi.fn().mockResolvedValue({ items: [] }),
}));

const mockUseSiweAuth = vi.fn();
vi.mock("@/hooks/useSiweAuth", () => ({
  useSiweAuth: () => mockUseSiweAuth(),
}));

describe("ProfilePage X OAuth UX Improvements (I-4)", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    mockUseSiweAuth.mockReturnValue({
      status: "unauthenticated",
      sessionAddress: null,
      walletAddress: null,
    });
    mockFetchWhitelistStatus.mockResolvedValue({
      configured: true,
      authenticated: false,
      status: null,
    });

    Object.defineProperty(window, "location", {
      writable: true,
      value: {
        ...originalLocation,
        href: "http://localhost:3000/profile",
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      writable: true,
      value: originalLocation,
    });
  });

  it("does not render removed placeholder banners or placeholder text", () => {
    render(
      <Providers>
        <ProfilePage />
      </Providers>,
    );

    expect(screen.queryByText(/X OAuth Not Active Yet/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Link X Account \(Placeholder\)/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/@username \(Placeholder\)/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Link X Account" })).toBeInTheDocument();
    expect(screen.getByText("No X account linked")).toBeInTheDocument();
  });

  it("renders success feedback banner when redirected back with x_linked=1", () => {
    mockSearchParams = new URLSearchParams("x_linked=1");

    render(
      <Providers>
        <ProfilePage />
      </Providers>,
    );

    const banner = screen.getByTestId("x-link-success-banner");
    expect(banner).toBeInTheDocument();
    expect(screen.getByText("X Account Successfully Linked")).toBeInTheDocument();
    expect(
      screen.getByText(/Your X \(Twitter\) profile has been verified/i),
    ).toBeInTheDocument();
  });

  it("renders user-friendly error feedback banner when redirected with x_error=access_denied", () => {
    mockSearchParams = new URLSearchParams("x_error=access_denied");

    render(
      <Providers>
        <ProfilePage />
      </Providers>,
    );

    const banner = screen.getByTestId("x-link-error-banner");
    expect(banner).toBeInTheDocument();
    expect(screen.getByText("X Authentication Failed")).toBeInTheDocument();
    expect(screen.getByText(/Authorization was denied by user/i)).toBeInTheDocument();
  });

  it("renders generic error feedback banner when redirected with other x_error codes", () => {
    mockSearchParams = new URLSearchParams("x_error=session_expired");

    render(
      <Providers>
        <ProfilePage />
      </Providers>,
    );

    const banner = screen.getByTestId("x-link-error-banner");
    expect(banner).toBeInTheDocument();
    expect(screen.getByText("X Authentication Failed")).toBeInTheDocument();
    expect(
      screen.getByText(/Failed to link X account \(session_expired\)/i),
    ).toBeInTheDocument();
  });

  it("requires wallet connection before initiating X OAuth linking", () => {
    mockUseSiweAuth.mockReturnValue({
      status: "unauthenticated",
      sessionAddress: null,
      walletAddress: null,
    });

    render(
      <Providers>
        <ProfilePage />
      </Providers>,
    );

    const linkButton = screen.getByRole("button", { name: "Link X Account" });
    fireEvent.click(linkButton);

    expect(
      screen.getByText("Please connect and authenticate your Web3 wallet first."),
    ).toBeInTheDocument();
  });

  it("initiates X OAuth flow and redirects to authorization URL when authenticated", async () => {
    mockUseSiweAuth.mockReturnValue({
      status: "authenticated",
      sessionAddress: "0x1234567890123456789012345678901234567890",
      walletAddress: "0x1234567890123456789012345678901234567890",
    });

    const mockAuthUrl = "https://twitter.com/i/oauth2/authorize?state=mock123";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ url: mockAuthUrl }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(
      <Providers>
        <ProfilePage />
      </Providers>,
    );

    const linkButton = screen.getByRole("button", { name: "Link X Account" });
    fireEvent.click(linkButton);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith("/api/social/x/connect");
      expect(window.location.href).toBe(mockAuthUrl);
    });

    fetchSpy.mockRestore();
  });

  it("displays inline error feedback when /api/social/x/connect fails", async () => {
    mockUseSiweAuth.mockReturnValue({
      status: "authenticated",
      sessionAddress: "0x1234567890123456789012345678901234567890",
      walletAddress: "0x1234567890123456789012345678901234567890",
    });

    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: "X_OAUTH_NOT_CONFIGURED",
          message: "X OAuth is not configured on this server.",
        }),
        {
          status: 503,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    render(
      <Providers>
        <ProfilePage />
      </Providers>,
    );

    const linkButton = screen.getByRole("button", { name: "Link X Account" });
    fireEvent.click(linkButton);

    await waitFor(() => {
      expect(
        screen.getAllByText("X OAuth is not configured on this server.").length,
      ).toBeGreaterThan(0);
      expect(alertSpy).not.toHaveBeenCalled();
    });

    alertSpy.mockRestore();
    fetchSpy.mockRestore();
  });

  it("displays connected state and disables link button when X account is linked", async () => {
    mockUseSiweAuth.mockReturnValue({
      status: "authenticated",
      sessionAddress: "0x1234567890123456789012345678901234567890",
      walletAddress: "0x1234567890123456789012345678901234567890",
    });

    mockFetchWhitelistStatus.mockResolvedValue({
      configured: true,
      authenticated: true,
      status: {
        phase: "SLOT_ALLOCATED",
        slotNumber: 42,
        details: {
          hasLinkedX: true,
          xUsername: "chimphood_og",
          heldCategories: ["FUR"],
          completedMandatoryTasksCount: 1,
          totalMandatoryTasksCount: 1,
        },
      },
    });

    render(
      <Providers>
        <ProfilePage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText("Status: Connected (@chimphood_og)")).toBeInTheDocument();
      expect(screen.getByText("@chimphood_og")).toBeInTheDocument();
    });

    const connectedButton = screen.getByRole("button", { name: "X Account Connected" });
    expect(connectedButton).toBeInTheDocument();
    expect(connectedButton).toBeDisabled();
  });
});
