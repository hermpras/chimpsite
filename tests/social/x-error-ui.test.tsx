import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import XErrorPage from "@/app/social/x/error/page";

let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
  usePathname: () => "/social/x/error",
}));

describe("XErrorPage UI (/social/x/error)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  it("renders X_ACCOUNT_ALREADY_LINKED with conflict guidance and action buttons", () => {
    mockSearchParams = new URLSearchParams(
      "error=X_ACCOUNT_ALREADY_LINKED&message=This+X+account+is+already+linked+to+another+Elychimp+profile.",
    );

    render(<XErrorPage />);

    expect(screen.getByText("X ACCOUNT ALREADY LINKED")).toBeInTheDocument();
    expect(
      screen.getByText("This X (Twitter) profile is already connected to another wallet."),
    ).toBeInTheDocument();
    expect(screen.getByText("Account Conflict")).toBeInTheDocument();

    // Verify troubleshooting steps
    expect(screen.getByText("How to Resolve This:")).toBeInTheDocument();
    expect(screen.getByText("Switch back to your previous wallet")).toBeInTheDocument();
    expect(screen.getByText("Want to use this new wallet instead?")).toBeInTheDocument();
    expect(screen.getByText("Use an alternate X account")).toBeInTheDocument();

    // Verify technical details
    expect(screen.getByText("X_ACCOUNT_ALREADY_LINKED")).toBeInTheDocument();
    expect(
      screen.getByText("This X account is already linked to another Elychimp profile."),
    ).toBeInTheDocument();

    // Verify navigation links
    const profileLink = screen.getByRole("link", { name: /Go to Profile/i });
    expect(profileLink).toHaveAttribute("href", "/profile");

    const whitelistLink = screen.getByRole("link", { name: /Whitelist Portal/i });
    expect(whitelistLink).toHaveAttribute("href", "/whitelist");

    const homeLink = screen.getByRole("link", { name: /Return Home/i });
    expect(homeLink).toHaveAttribute("href", "/");
  });

  it("renders user-friendly UI for access_denied / cancellation", () => {
    mockSearchParams = new URLSearchParams("error=access_denied");

    render(<XErrorPage />);

    expect(screen.getByText("AUTHORIZATION CANCELLED")).toBeInTheDocument();
    expect(
      screen.getByText("The connection request was denied or cancelled on X."),
    ).toBeInTheDocument();
    expect(screen.queryByText("How to Resolve This:")).not.toBeInTheDocument();
  });

  it("renders user-friendly UI for expired OAuth state", () => {
    mockSearchParams = new URLSearchParams("error=OAUTH_STATE_EXPIRED");

    render(<XErrorPage />);

    expect(screen.getByText("CONNECTION TIMED OUT")).toBeInTheDocument();
    expect(
      screen.getByText("The authorization window remained open too long and has expired."),
    ).toBeInTheDocument();
  });

  it("renders generic fallback UI when unknown error or no params provided", () => {
    mockSearchParams = new URLSearchParams();

    render(<XErrorPage />);

    expect(screen.getByText("LINKING FAILED")).toBeInTheDocument();
    expect(
      screen.getByText("Unable to complete X account verification at this time."),
    ).toBeInTheDocument();
  });
});
