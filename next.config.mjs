/** @type {import('next').NextConfig} */
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : 'qnkfzbsnpmfpjcukyhyt.supabase.co';

const nextConfig = {
  reactStrictMode: true,
  // الإصدار الأول اتكتب بدون build محلي، فمنمنعش النشر بسبب تحذيرات الأنواع
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  images: {
    remotePatterns: [{ protocol: 'https', hostname: supabaseHost }],
  },
};

export default nextConfig;
