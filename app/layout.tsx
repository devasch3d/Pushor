import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "成员截图验收终端",
  description:
    "成员上传打卡截图，管理员在终端风格后台人工审核（通过 / 驳回）。只做提交与审核，不涉及金额、账本或支付。",
};

export const viewport: Viewport = {
  themeColor: "#050805",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className="dark">
      <body className="min-h-screen font-mono text-sm leading-relaxed">
        {children}
      </body>
    </html>
  );
}
