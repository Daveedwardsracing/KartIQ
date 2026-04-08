import path from "path";

const nextConfig = {
  distDir: ".next-runtime",
  experimental: {
    optimizePackageImports: []
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:8000/:path*"
      }
    ];
  },
  outputFileTracingRoot: path.join(import.meta.dirname, "..")
};

export default nextConfig;
