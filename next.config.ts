import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // TypeORM, ioredis and reflect-metadata rely on native Node.js APIs and must
  // not be bundled into the server graph. `pg` is already part of Next.js's
  // default external list. All database access therefore runs on the Node.js
  // runtime (the Edge runtime is deprecated in Next.js 16 and must not be used
  // for TypeORM-backed operations).
  serverExternalPackages: ["typeorm", "ioredis", "reflect-metadata"],
};

export default nextConfig;
