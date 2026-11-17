import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Migrations are read from disk at startup (lib/db/index.ts), so ship them with every function.
  outputFileTracingIncludes: { "/**": ["./drizzle/**/*"] },
  // Native / filesystem-heavy deps stay out of the server bundle.
  serverExternalPackages: ["@libsql/client", "libsql", "sharp", "unpdf", "mammoth", "pdf-lib"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
