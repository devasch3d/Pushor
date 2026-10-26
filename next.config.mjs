/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // 静态导出：`next build` 产出纯 HTML/JS/CSS 到 out/，不需要任何 Node 服务器。
  // 这样 Cloudflare Pages（以及任何静态托管 / OSS+CDN）都能直接放。
  // 所有 Supabase 交互都在浏览器端完成，安全边界是数据库 RLS，不依赖服务器。
  output: "export",

  images: {
    // 静态导出没有图片优化服务，必须关掉；截图本来就是 Storage 的短时效签名 URL
    unoptimized: true,
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },

  eslint: {
    // lint 单独跑 `npm run lint`，不要让它把 build 卡住
    ignoreDuringBuilds: false,
  },
};

export default nextConfig;
