import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // vinext currently applies the Server Action multipart guard before app
    // route dispatch. Keep enough envelope room for the 50 MB media limit.
    serverActions: {
      bodySizeLimit: "52mb",
    },
  },
};

export default nextConfig;
