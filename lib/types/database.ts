/**
 * Supabase 数据库类型（手写，与 supabase/migrations/*.sql 保持一致）。
 *
 * 说明：这里的 `public` 只是 supabase-js 泛型的 schema 键名。
 * 运行时实际使用哪个 schema 由 lib/supabase/env.ts 的 SUPABASE_SCHEMA 决定，
 * 默认 public（你自己的 Supabase 项目 / Vercel 部署都是这个）。
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          role: "admin" | "member";
          display_name: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          role?: "admin" | "member";
          display_name?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          role?: "admin" | "member";
          display_name?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      tasks: {
        Row: {
          id: string;
          member_id: string;
          title: string;
          category: "study" | "review" | "exercise";
          due_date: string | null;
          status: "active" | "archived";
          created_at: string;
        };
        Insert: {
          id?: string;
          member_id: string;
          title: string;
          category: "study" | "review" | "exercise";
          due_date?: string | null;
          status?: "active" | "archived";
          created_at?: string;
        };
        Update: {
          id?: string;
          member_id?: string;
          title?: string;
          category?: "study" | "review" | "exercise";
          due_date?: string | null;
          status?: "active" | "archived";
          created_at?: string;
        };
        Relationships: [];
      };
      submissions: {
        Row: {
          id: string;
          task_id: string | null;
          member_id: string;
          event: string | null;
          image_url: string;
          note: string | null;
          status: "pending" | "approved" | "rejected";
          admin_note: string | null;
          reviewed_at: string | null;
          replaces_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          task_id?: string | null;
          member_id: string;
          event?: string | null;
          image_url: string;
          note?: string | null;
          status?: "pending" | "approved" | "rejected";
          admin_note?: string | null;
          reviewed_at?: string | null;
          replaces_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          task_id?: string | null;
          member_id?: string;
          event?: string | null;
          image_url?: string;
          note?: string | null;
          status?: "pending" | "approved" | "rejected";
          admin_note?: string | null;
          reviewed_at?: string | null;
          replaces_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      purge_log: {
        Row: {
          submission_id: string;
          purged_at: string;
        };
        Insert: {
          submission_id: string;
          purged_at?: string;
        };
        Update: {
          submission_id?: string;
          purged_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
