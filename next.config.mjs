/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    "/api/**/*": ["./public/traits/**/*"],
  },
  images: {
    remotePatterns: [
      // X (Twitter) profile image CDN
      new URL("https://pbs.twimg.com/**"),
    ],
  },
  webpack: (config) => {
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      { module: /@wagmi\/connectors/ },
      { message: /Can't resolve '(@coinbase\/wallet-sdk|@metamask\/connect-evm|@safe-global\/safe-apps-sdk)'/ },
    ];
    return config;
  },
};

export default nextConfig;
