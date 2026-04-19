import type { NextConfig } from "next";

const isStaticBuild = process.env.STATIC_BUILD === "1";

const nextConfig: NextConfig = {
  // Dev me React 18 Strict Mode effect 2× run karta hai — kuch navigation side-effects zyada dikhte hain.
  // Production build par iska asar nahi; sirf `next dev` behaviour.
  reactStrictMode: false,
  // Static export only when building for APK (npm run build:static)
  ...(isStaticBuild && { output: "export" }),
  // Electron now serves static export over localhost HTTP, so keep default root asset paths (/_next/*).
  // Relative assetPrefix ("./") breaks nested routes like /dashboard by turning assets into /dashboard/_next/*.
  // APK / http-server: /party/index.html so refresh & deep links 404 kam (trailing slash URLs)
  ...(isStaticBuild && { trailingSlash: true }),
  ...(isStaticBuild && {
    webpack: (config) => {
      config.resolve.alias = {
        ...config.resolve.alias,
        "@/lib/actions/deleteCompanyAction": require("path").join(__dirname, "src/lib/actions/deleteCompanyActionStub.ts"),
      };
      return config;
    },
  }),
};

export default nextConfig;
