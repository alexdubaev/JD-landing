import type { NextConfig } from "next";

const remoteImagePatterns: NonNullable<NextConfig["images"]>["remotePatterns"] = [
  {
    protocol: "https",
    hostname: "cms.deere-shop.ru",
    pathname: "/assets/**",
  },
];

if (process.env.NODE_ENV !== "production") {
  remoteImagePatterns.push({
    protocol: "http",
    hostname: "127.0.0.1",
    port: "8055",
    pathname: "/assets/**",
  });
}

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  output: "standalone",
  async redirects() {
    return [
      {
        source: "/catalog/:path*",
        has: [{ type: "query", key: "page", value: "1" }],
        destination: "/catalog/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
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
    remotePatterns: remoteImagePatterns,
  },
};

export default nextConfig;
