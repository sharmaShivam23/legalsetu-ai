import type { NextConfig } from "next";

// Map tiles for Find a Lawyer (Leaflet). The CSP must allow exactly the
// tile host the map uses, so both read the same setting.
const MAP_TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const MAP_TILE_ORIGIN = (() => {
  try {
    return new URL(MAP_TILE_URL.replace(/\{[a-z]\}/g, "a")).origin;
  } catch {
    return "https://tile.openstreetmap.org";
  }
})();

const IMG_SRC = `img-src 'self' data: blob: https://grainy-gradients.vercel.app ${MAP_TILE_ORIGIN};`;

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
            // geolocation=(self): "Use my current location" on Find a Lawyer.
            // Still denied to any embedded third-party frame.
            value: "camera=(), microphone=(self), geolocation=(self)",
          },
          // media-src: voice mode plays each synthesised reply from a blob:
          // URL (and unlocks autoplay with a data: clip). With no media-src
          // the policy fell back to default-src 'self', so the browser
          // rejected EVERY reply clip — the assistant "spoke" in silence.
          {
            key: "Content-Security-Policy",
            value: process.env.NODE_ENV === "development"
              ? `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; worker-src 'self' blob: https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline'; media-src 'self' blob: data:; ${IMG_SRC} font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https: data: blob: https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://tessdata.projectnaptha.com https://fonts.gstatic.com; frame-ancestors 'none';`
              : `default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob: https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; worker-src 'self' blob: https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline'; media-src 'self' blob: data:; ${IMG_SRC} font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https: data: blob: https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://tessdata.projectnaptha.com https://fonts.gstatic.com; frame-ancestors 'none';`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
