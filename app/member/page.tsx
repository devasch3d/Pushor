"use client";

import * as React from "react";

import { ScreenshotUploadForm } from "@/components/member/screenshot-upload-form";
import { MySubmissions } from "@/components/member/my-submissions";
import { BootScreen } from "@/components/terminal/boot-screen";
import { ErrorLine, Panel } from "@/components/terminal/shell";
import { TerminalShell } from "@/components/terminal/terminal-shell";
import { fetchMySubmissions } from "@/lib/queries";
import { getSupabase } from "@/lib/supabase/client";
import { useRequireRole } from "@/lib/hooks";
import { localDayString } from "@/lib/time";
import type { SignedSubmission } from "@/lib/types";

export default function MemberPage() {
  const { profile, loading } = useRequireRole("member");

  const [submissions, setSubmissions] = React.useState<SignedSubmission[]>([]);
  const [dataError, setDataError] = React.useState<string | null>(null);
  const [fetching, setFetching] = React.useState(true);

  const load = React.useCallback(async () => {
    if (!profile) return;
    setFetching(true);
    setDataError(null);
    try {
      const rows = await fetchMySubmissions(getSupabase(), profile.id);
      setSubmissions(rows);
    } catch (thrown) {
      setDataError(thrown instanceof Error ? thrown.message : "读取数据失败");
    } finally {
      setFetching(false);
    }
  }, [profile]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (loading || !profile) return <BootScreen text="member checkin --init…" />;

  const counts = submissions.reduce(
    (acc, item) => {
      acc[item.status] += 1;
      return acc;
    },
    { pending: 0, approved: 0, rejected: 0 } as Record<string, number>,
  );

  return (
    <TerminalShell
      profile={profile}
      command="member checkin --submit"
      bootNote={`session ready · role=${profile.role} · 今日 ${localDayString(new Date())}`}
    >
      {dataError ? <ErrorLine>{dataError}</ErrorLine> : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <Panel title="提交" hint="status → pending">
          <ScreenshotUploadForm memberId={profile.id} onSuccess={() => void load()} />
        </Panel>

        <Panel
          title="我的提交"
          hint={
            fetching
              ? "读取中…"
              : `pending ${counts.pending} · approved ${counts.approved} · rejected ${counts.rejected}`
          }
        >
          <MySubmissions
            memberId={profile.id}
            submissions={submissions}
            onChanged={() => void load()}
          />
        </Panel>
      </div>
    </TerminalShell>
  );
}
