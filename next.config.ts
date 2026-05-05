import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.printify.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "**.printful.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "images-api.printify.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "files.cdn.printful.com",
        pathname: "/**",
      },
    ],
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
