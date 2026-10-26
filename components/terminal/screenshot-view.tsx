"use client";

import * as React from "react";
import Image from "next/image";
import { Download, FileBox, Maximize2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { isPreviewableImage, refExtension } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ScreenshotThumbProps {
  /** Supabase Storage 的临时签名 URL（或 data: 内联）；null 表示取不到 */
  src: string | null;
  alt: string;
  caption?: React.ReactNode;
  className?: string;
  /** 缩略图边长（正方形裁切），像素 */
  size?: number;
}

/** 非图片附件的占位块：显示扩展名 */
function FileChip({ ext, size }: { ext: string; size: number }) {
  return (
    <span
      className="flex h-full w-full flex-col items-center justify-center gap-1 bg-background/60 text-term-dim"
      style={{ width: size, height: size }}
    >
      <FileBox className="h-4 w-4" aria-hidden />
      <span className="px-1 text-center font-mono text-[9px] uppercase leading-tight">
        .{ext || "bin"}
      </span>
    </span>
  );
}

/**
 * 附件缩略图 + 点开看大图 / 下载。
 *
 * 图片类扩展名走 <img> 预览；其他格式（pdf、zip、视频……）显示扩展名块，
 * 点开后给一个「打开 / 下载」链接，不在页面里硬塞播放器。
 *
 * src 是短时效签名 URL，所以 next/image 优化是关掉的（next.config unoptimized）。
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
        aria-label={`${alt}：文件不可用`}
      >
        <FileBox className="h-4 w-4" aria-hidden />
        <span className="px-1 text-center font-mono text-[9px] leading-tight">
          signed url
          <br />
          unavailable
        </span>
      </div>
    );
  }

  const isImage = isPreviewableImage(src);
  const ext = refExtension(src);

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
          aria-label={`查看：${alt}`}
        >
          {isImage ? (
            <Image
              src={src}
              alt={alt}
              width={size * 2}
              height={size * 2}
              className="h-full w-full object-cover"
            />
          ) : (
            <FileChip ext={ext} size={size} />
          )}
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
          <DialogTitle>附件预览</DialogTitle>
          <DialogDescription asChild>
            <div>{caption ?? alt}</div>
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-auto border border-border bg-background p-2">
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element -- 签名 URL 短时效，按原图展示
            <img src={src} alt={alt} className="mx-auto max-w-full" />
          ) : (
            <div className="flex flex-col items-center gap-3 px-4 py-10">
              <FileBox className="h-8 w-8 text-term-dim" aria-hidden />
              <p className="font-mono text-xs text-muted-foreground">
                这不是可直接预览的图片格式（.{ext || "bin"}）
              </p>
              <a
                href={src}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 border border-primary/60 bg-primary/15 px-4 py-2 font-mono text-xs uppercase tracking-[0.14em] text-primary hover:bg-primary/25"
              >
                <Download className="h-3.5 w-3.5" />
                打开 / 下载
              </a>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
