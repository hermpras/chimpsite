import React from "react";

export function MetaMaskIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none">
      <path
        d="M29.07 3L17.79 11.39l2.12-5.02L29.07 3z"
        fill="#E17726"
        stroke="#E17726"
        strokeWidth="0.25"
      />
      <path
        d="M2.93 3l11.16 8.46-2-5.09L2.93 3z"
        fill="#E27625"
        stroke="#E27625"
        strokeWidth="0.25"
      />
      <path
        d="M24.8 21.68l-2.98 4.54 6.37 1.75 1.83-6.2-5.22-.09z"
        fill="#E27625"
        stroke="#E27625"
        strokeWidth="0.25"
      />
      <path
        d="M1.98 21.77l1.82 6.2 6.36-1.75-2.97-4.54-5.21.09z"
        fill="#E27625"
        stroke="#E27625"
        strokeWidth="0.25"
      />
      <path
        d="M9.82 13.97L7.75 17.1l6.09.27-.2-6.58-3.82 3.18z"
        fill="#E27625"
        stroke="#E27625"
        strokeWidth="0.25"
      />
      <path
        d="M22.18 13.97l-3.84-3.26-.14 6.66 6.09-.27-2.11-3.13z"
        fill="#E27625"
        stroke="#E27625"
        strokeWidth="0.25"
      />
      <path
        d="M10.18 26.22l3.71-1.81-3.21-2.5-2.48 2.22 1.98 2.09z"
        fill="#E27625"
        stroke="#E27625"
        strokeWidth="0.25"
      />
      <path
        d="M18.11 24.41l3.71 1.81 1.98-2.09-2.48-2.22-3.21 2.5z"
        fill="#E27625"
        stroke="#E27625"
        strokeWidth="0.25"
      />
      <path
        d="M21.82 26.22l-3.71-1.81.3 2.45v1.05l5.39-1.69-1.98-2.09z"
        fill="#D5BFB2"
        stroke="#D5BFB2"
        strokeWidth="0.25"
      />
      <path
        d="M10.18 26.22l1.98 2.09 5.39 1.69v-1.05l.3-2.45-3.71 1.81-3.96-.09z"
        fill="#D5BFB2"
        stroke="#D5BFB2"
        strokeWidth="0.25"
      />
      <path
        d="M14.07 19.34l-3.69-.99 2.62-1.21 1.07 2.2z"
        fill="#233447"
        stroke="#233447"
        strokeWidth="0.25"
      />
      <path
        d="M17.93 19.34l1.07-2.2 2.62 1.21-3.69.99z"
        fill="#233447"
        stroke="#233447"
        strokeWidth="0.25"
      />
      <path
        d="M9.82 13.97l2.25 4.38-2.62 1.21-2.58-2.46 2.95-3.13z"
        fill="#CC6228"
        stroke="#CC6228"
        strokeWidth="0.25"
      />
      <path
        d="M19.93 18.35l2.25-4.38 2.95 3.13-2.58 2.46-2.62-1.21z"
        fill="#CC6228"
        stroke="#CC6228"
        strokeWidth="0.25"
      />
      <path
        d="M24.8 21.68l-2.98 4.54-3.71-1.81 2.48-2.22 4.21-.51z"
        fill="#CC6228"
        stroke="#CC6228"
        strokeWidth="0.25"
      />
      <path
        d="M10.18 26.22l-2.98-4.54 4.21.51 2.48 2.22-3.71 1.81z"
        fill="#CC6228"
        stroke="#CC6228"
        strokeWidth="0.25"
      />
      <path
        d="M17.79 11.39l-3.95.4 3.99-6.9 2.08 1.48-2.12 5.02z"
        fill="#E27625"
        stroke="#E27625"
        strokeWidth="0.25"
      />
      <path
        d="M14.21 11.39l2.12-5.02L18.41 4.9l3.99 6.89-3.95-.4h-4.24z"
        fill="#F5841F"
        stroke="#F5841F"
        strokeWidth="0.25"
      />
      <path
        d="M14.21 11.39l-3.95.4-2.12-5.02 2.08-1.48 3.99 6.1z"
        fill="#E27625"
        stroke="#E27625"
        strokeWidth="0.25"
      />
    </svg>
  );
}

export function CoinbaseWalletIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none">
      <circle cx="16" cy="16" r="16" fill="#0052FF" />
      <path
        d="M16 7C11.0294 7 7 11.0294 7 16C7 20.9706 11.0294 25 16 25C20.9706 25 25 20.9706 25 16C25 11.0294 20.9706 7 16 7ZM13.8 18.2C13.3582 18.2 13 17.8418 13 17.4V14.6C13 14.1582 13.3582 13.8 13.8 13.8H18.2C18.6418 13.8 19 14.1582 19 14.6V17.4C19 17.8418 18.6418 18.2 18.2 18.2H13.8Z"
        fill="white"
      />
    </svg>
  );
}

export function RabbyIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none">
      <rect width="32" height="32" rx="16" fill="#7084FF" />
      <path
        d="M21.5 19.8C20.3 22.3 17.8 24 15 24C11.1 24 8 20.9 8 17C8 13.1 11.1 10 15 10C16.8 10 18.5 10.7 19.8 11.8L21.2 9.5C21.6 8.8 22.5 8.6 23.2 9C23.9 9.4 24.1 10.3 23.7 11L21.8 14.2C22.2 15.1 22.5 16 22.5 17C22.5 18 22.1 19 21.5 19.8Z"
        fill="white"
      />
      <circle cx="14" cy="16" r="1.5" fill="#7084FF" />
    </svg>
  );
}

export function PhantomIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none">
      <rect width="32" height="32" rx="16" fill="#AB9FF2" />
      <path
        d="M23.5 17.5C23.5 21.5 20.2 24 16.5 24C12.5 24 9.5 21 9.5 17C9.5 12.5 12.8 9 17 9C20.6 9 23.5 12.2 23.5 17.5Z"
        fill="white"
      />
      <circle cx="18" cy="15" r="1.2" fill="#5544B2" />
      <circle cx="14" cy="15" r="1.2" fill="#5544B2" />
    </svg>
  );
}

export function GenericWalletIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none">
      <rect width="32" height="32" rx="16" fill="#1E2333" />
      <path
        d="M9 12C9 10.8954 9.89543 10 11 10H21C22.1046 10 23 10.8954 23 12V20C23 21.1046 22.1046 22 21 22H11C9.89543 22 9 21.1046 9 20V12Z"
        stroke="#F59E0B"
        strokeWidth="2"
      />
      <path
        d="M20 16H23"
        stroke="#F59E0B"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="19" cy="16" r="1" fill="#F59E0B" />
    </svg>
  );
}

/**
 * Helper to select the right wallet icon based on connector name or rdns.
 */
export function WalletIcon({
  name,
  iconUrl,
  className = "h-6 w-6",
}: {
  name: string;
  iconUrl?: string;
  className?: string;
}) {
  if (iconUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={iconUrl} alt={name} className={`${className} object-contain rounded`} />;
  }

  const normalized = name.toLowerCase();

  if (normalized.includes("metamask")) {
    return <MetaMaskIcon className={className} />;
  }
  if (normalized.includes("coinbase")) {
    return <CoinbaseWalletIcon className={className} />;
  }
  if (normalized.includes("rabby")) {
    return <RabbyIcon className={className} />;
  }
  if (normalized.includes("phantom")) {
    return <PhantomIcon className={className} />;
  }

  return <GenericWalletIcon className={className} />;
}
