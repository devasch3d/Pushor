"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Pushor 的 logo：深绿渐变底 + 一个极简的小写 p（一根竖 + 一个圆）。
 * 用 SVG 画而不是图片文件，这样任意尺寸都清晰，也能跟着主题色走。
 */
export function PushorLogo({
  size = 40,
  className,
}: {
  size?: number;
  className?: string;
}) {
  // 同一页可能出现多个 logo，渐变 id 必须唯一，否则后一个会复用前一个的 defs
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, "");
  const bg = `pushor-bg-${uid}`;
  const glow = `pushor-glow-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden
      className={cn("shrink-0", className)}
    >
      <defs>
        <linearGradient id={bg} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#02120a" />
          <stop offset="0.52" stopColor="#0a3a20" />
          <stop offset="1" stopColor="#166534" />
        </linearGradient>
        <radialGradient id={glow} cx="0.32" cy="0.24" r="0.95">
          <stop offset="0" stopColor="#4ade80" stopOpacity="0.30" />
          <stop offset="1" stopColor="#4ade80" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="64" height="64" rx="14" fill={`url(#${bg})`} />
      <rect width="64" height="64" rx="14" fill={`url(#${glow})`} />
      <rect
        x="0.75"
        y="0.75"
        width="62.5"
        height="62.5"
        rx="13.25"
        stroke="#4ade80"
        strokeOpacity="0.35"
        strokeWidth="1.5"
      />

      {/* 极简 p：竖笔 + 圆碗，圆碗左缘正好切在竖笔上 */}
      <path d="M25 15v34" stroke="#86efac" strokeWidth="6" strokeLinecap="round" />
      <circle cx="35" cy="27" r="10" stroke="#86efac" strokeWidth="6" />
    </svg>
  );
}
