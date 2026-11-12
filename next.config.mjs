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
};

export default nextConfig;
