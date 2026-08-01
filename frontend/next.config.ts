import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
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
      {
        pathname: "/images/**",
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
