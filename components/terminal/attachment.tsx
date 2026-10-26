"use client";

import * as React from "react";
import { Download, FileBox, Trash2 } from "lucide-react";

import { refExtension, submissionFiles, type SignedSubmission } from "@/lib/types";
import { cn } from "@/lib/utils";

interface AttachmentRowProps {
  /** 签名 URL；null 表示文件已被定时清理 */
  src: string | null;
  /** 显示名，例如「附件」或事件名 */
  label: string;
  /** 大一号，用在审核弹层里 */
  large?: boolean;
  className?: string;
}

/**
 * 附件行：不做任何图片预览，只给扩展名 + 明确的下载入口。
 * 预览图在签名 URL 过期 / 文件被清理 / 格式不是图片时都会裂，
 * 索性不渲染 <img>，下载入口永远可用。
 */
export function AttachmentRow({ src, label, large, className }: AttachmentRowProps) {
  const ext = src ? refExtension(src) : "";

  return (
    <div
      className={cn(
        "flex items-center gap-2 border border-border bg-background/50",
        large ? "px-3 py-2.5" : "px-2 py-1.5",
        className,
      )}
    >
      <FileBox
        className={cn("shrink-0 text-term-dim", large ? "h-4 w-4" : "h-3.5 w-3.5")}
        aria-hidden
      />
      <span
        className={cn(
          "min-w-0 flex-1 truncate font-mono text-foreground",
          large ? "text-xs" : "text-[11px]",
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "shrink-0 font-mono uppercase text-term-dim",
          large ? "text-[11px]" : "text-[10px]",
        )}
      >
        .{ext || "bin"}
      </span>
      {src ? (
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          download
          className={cn(
            "inline-flex shrink-0 items-center gap-1 border border-primary/60 bg-primary/15",
            "font-mono uppercase tracking-[0.14em] text-primary term-glow",
            "hover:bg-primary/25 hover:border-primary",
            large ? "px-3 py-1.5 text-xs" : "px-2 py-1 text-[10px]",
          )}
        >
          <Download className={large ? "h-3.5 w-3.5" : "h-3 w-3"} />
          下载
        </a>
      ) : (
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 border border-border font-mono text-term-dim",
            large ? "px-3 py-1.5 text-xs" : "px-2 py-1 text-[10px]",
          )}
        >
          <Trash2 className="h-3 w-3" />
          已清理
        </span>
      )}
    </div>
  );
}

/**
 * 一条提交的全部附件：每个文件一行 AttachmentRow。
 * 多附件时标注序号「附件 i/N」。
 */
export function AttachmentList({
  submission,
  large,
  className,
}: {
  submission: SignedSubmission;
  large?: boolean;
  className?: string;
}) {
  const files = submissionFiles(submission);
  if (files.length === 0) return null;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {files.map((file, index) => (
        <AttachmentRow
          key={`${index}-${file.ref.slice(-24)}`}
          src={file.signedUrl}
          label={files.length > 1 ? `附件 ${index + 1}/${files.length}` : "附件"}
          large={large}
        />
      ))}
    </div>
  );
}
