import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    localPatterns: [
      {
        pathname: "/media/**",
      },
      {
        pathname: "/brand/**",
        search: "",
      },
    ],
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
