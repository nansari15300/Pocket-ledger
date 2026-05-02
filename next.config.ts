import type { NextConfig } from "next";
import path from "path";

const isStaticBuild = process.env.STATIC_BUILD === "1";

const nextConfig: NextConfig = {
  // Next.js 16: default `next build` Turbopack use karta hai; yahan intentional `webpack()` (pdfjs-dist, aliases).
  // Prod / Firebase App Hosting: `package.json` me `next build --webpack` — warna Turbopack + webpack config = build fail.
  // Dev me React 18 Strict Mode effect 2× run karta hai — kuch navigation side-effects zyada dikhte hain.
  // Production build par iska asar nahi; sirf `next dev` behaviour.
  reactStrictMode: false,
  // pdfjs-dist pre-built `.mjs` — transpile + rule ke bina Webpack dobara bundle karke `defineProperty` crash
  // `serverExternalPackages: ['pdfjs-dist']` yahan mat rakho — Next 16 me `transpilePackages` se conflict
  transpilePackages: ["pdfjs-dist"],
  // Static export only when building for APK (npm run build:static)
  ...(isStaticBuild && { output: "export" }),
  // Electron now serves static export over localhost HTTP, so keep default root asset paths (/_next/*).
  // Relative assetPrefix ("./") breaks nested routes like /dashboard by turning assets into /dashboard/_next/*.
  // APK / http-server: /party/index.html so refresh & deep links 404 kam (trailing slash URLs)
  ...(isStaticBuild && { trailingSlash: true }),
  webpack: (config, { isServer }) => {
    // pdfjs-dist/build/*.mjs: `fullySpecified: false` — nested harmony exports break fix (GH/pdf.js + Next issues)
    config.module.rules.push({
      test: /\.mjs$/,
      include: /node_modules[\\/]pdfjs-dist/,
      type: "javascript/auto",
      resolve: {
        fullySpecified: false,
      },
    });

    const alias = { ...(config.resolve.alias as Record<string, string | false | string[]> | undefined) };
    // Browser: optional `@napi-rs/canvas` resolve mat todo
    if (!isServer) {
      alias.canvas = false;
    }
    if (isStaticBuild) {
      alias["@/lib/actions/deleteCompanyAction"] = path.join(__dirname, "src/lib/actions/deleteCompanyActionStub.ts");
    }
    config.resolve.alias = alias;
    return config;
  },
};

export default nextConfig;
