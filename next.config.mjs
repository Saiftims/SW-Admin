/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["@aws-sdk/client-s3", "bullmq"]
};

export default nextConfig;

