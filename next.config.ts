import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // NOTE: Do NOT set output:"standalone" on Vercel — Vercel manages its own output format.
  // Use standalone only for Docker/self-hosted deployments.
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  images: {
    remotePatterns: [],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(self), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: process.env.NODE_ENV === "development"
              ? "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; worker-src 'self' blob: https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://grainy-gradients.vercel.app; font-src 'self' data:; connect-src 'self' https:; frame-ancestors 'none';"
              : "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; worker-src 'self' blob: https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://grainy-gradients.vercel.app; font-src 'self' data:; connect-src 'self' https: https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://tessdata.projectnaptha.com; frame-ancestors 'none';",
          },
        ],
      },
    ];
  },
};

export default nextConfig;