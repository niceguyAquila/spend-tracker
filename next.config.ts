import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Keep pdfkit out of the webpack bundle so Node can resolve its
  // package `#standard-fonts/*` imports (Helvetica, etc.) at runtime.
  // Bundling pdfkit into App Router handlers breaks that resolution on Vercel.
  serverExternalPackages: ["pdfkit", "fontkit"],
  // Ensure AFM + standard-font modules are included in the serverless trace.
  outputFileTracingIncludes: {
    "/api/big-book/invoice/pdf": [
      "./node_modules/pdfkit/js/data/**/*",
      "./node_modules/pdfkit/js/standard-fonts/**/*"
    ]
  }
};

export default nextConfig;
