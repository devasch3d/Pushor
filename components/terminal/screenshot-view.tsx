"use client";

import * as React from "react";
import Image from "next/image";
import { ImageIcon, Maximize2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface ScreenshotThumbProps {
  /** Supabase Storage 的临时签名 URL；null 表示签名失败或对象缺失 */
  src: string | null;
  alt: string;
  caption?: React.ReactNode;
  className?: string;
  /** 缩略图边长（正方形裁切），像素 */
  size?: number;
}

/**
 * 截图缩略图 + 点开看大图。
 *
 * src 是短时效签名 URL，所以关掉 next/image 的优化（next.config 里 unoptimized: true），
 * 直接当普通 <img> 用，避免签名过期后命中优化器缓存。
 */
export function ScreenshotThumb({
  src,
  alt,
  caption,
  className,
  size = 96,
}: ScreenshotThumbProps) {
  if (!src) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-1 border border-dashed border-border bg-background/60 text-term-dim",
          className,
        )}
        style={{ width: size, height: size }}
        role="img"
        aria-label={`${alt}：图片不可用`}
      >
        <ImageIcon className="h-4 w-4" aria-hidden />
        <span className="px-1 text-center font-mono text-[9px] leading-tight">
          signed url
          <br />
          unavailable
        </span>
      </div>
    );
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            "group relative shrink-0 overflow-hidden border border-border bg-background/60",
            "transition-colors hover:border-primary/70 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            className,
          )}
          style={{ width: size, height: size }}
          aria-label={`放大查看：${alt}`}
        >
          <Image
            src={src}
            alt={alt}
            width={size * 2}
            height={size * 2}
            className="h-full w-full object-cover"
          />
          <span
            className={cn(
              "absolute inset-0 flex items-center justify-center bg-background/70",
              "opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100",
            )}
            aria-hidden
          >
            <Maximize2 className="h-4 w-4 text-primary" />
          </span>
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>截图预览</DialogTitle>
          <DialogDescription asChild>
            <div>{caption ?? alt}</div>
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-auto border border-border bg-background p-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- 大图按原始尺寸展示，不做优化 */}
          <img src={src} alt={alt} className="mx-auto max-w-full" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
