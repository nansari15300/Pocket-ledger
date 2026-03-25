import type { NextConfig } from "next";

const isStaticBuild = process.env.STATIC_BUILD === "1";

const nextConfig: NextConfig = {
  // Static export only when building for APK (npm run build:static)
  ...(isStaticBuild && { output: "export" }),
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
