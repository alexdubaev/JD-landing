import type { NextConfig } from "next";

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
    const cspReportOnly = [
      "default-src 'self'",
      "img-src 'self' data: blob: https://cms.deere-shop.ru",
      "media-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      "connect-src 'self' https://cms.deere-shop.ru",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "report-uri /api/csp-report",
    ].join("; ");

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
          { key: "Content-Security-Policy-Report-Only", value: cspReportOnly },
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
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cms.deere-shop.ru",
        pathname: "/assets/**",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "8055",
        pathname: "/assets/**",
      },
    ],
  },
};

export default nextConfig;
