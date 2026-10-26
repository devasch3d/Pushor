/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // `standalone` 让 `next build` 产出可被单个 Node 进程直接启动的最小运行时，
  // 这样同一份代码既能在 Vercel 上跑，也能作为 QW Pages 的 dynamic runtime 发布。
  output: "standalone",

  images: {
    // 关掉 next/image 的服务端优化：截图是 Supabase Storage 的短时效签名 URL，
    // 每次渲染都不一样，走优化器没有收益；同时避免 standalone 运行时依赖 sharp。
    unoptimized: true,
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },

  eslint: {
    // lint 单独跑 `npm run lint`，不要让它把 build 卡住
    ignoreDuringBuilds: false,
  },

  experimental: {
    serverActions: {
      // Storage 不可用的托管环境会把截图以内联 data URL 提交（上限 3 MB，
      // base64 后约 4 MB），默认的 1 MB body 限制不够，这里放宽。
      // 走正常 Storage 路径时，Server Action 只传一个对象路径，几十 byte。
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
