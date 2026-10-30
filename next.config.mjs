/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      // X (Twitter) profile image CDN
      new URL("https://pbs.twimg.com/**"),
    ],
  },
};

export default nextConfig;
