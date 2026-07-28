import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cms.deere-shop.ru",
        pathname: "/assets/**",
      },
    ],
  },
};

export default nextConfig;
