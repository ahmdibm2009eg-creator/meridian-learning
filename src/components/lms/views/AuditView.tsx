"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { get } from "@/lib/api-client";
import { PageHeader, Loader, ErrorNotice, EmptyState, Chip } from "@/components/lms/bits";

interface LogRow { id: string; action: string; entity: string; entityId: string | null; detail: string; createdAt: string; userName: string }

export function AuditView() {
  const { t, locale } = useApp();
  const [rows, setRows] = useState<LogRow[] | null>(null);
  const [error, setError] = useState("");
  const localeTag = locale === "ar" ? "ar" : "en";

  useEffect(() => {
    get<{ logs: LogRow[] }>("/api/audit").then((d) => setRows(d.logs)).catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorNotice message={error} onRetry={() => location.reload()} />;
  if (!rows) return <Loader />;

  return (
    <div>
      <PageHeader title={t("admin.audit")} subtitle={`${rows.length} ${t("common.results")}`} />
      {rows.length === 0 ? (
        <EmptyState title={t("common.empty")} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <caption className="sr-only">{t("admin.audit")}</caption>
            <thead className="border-b border-border bg-muted/50">
              <tr>
                <th scope="col" className="p-3 text-start font-semibold">{t("common.date")}</th>
                <th scope="col" className="p-3 text-start font-semibold">{t("common.you")}</th>
                <th scope="col" className="p-3 text-start font-semibold">{t("admin.action")}</th>
                <th scope="col" className="p-3 text-start font-semibold">{t("admin.entity")}</th>
                <th scope="col" className="p-3 text-start font-semibold">Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id} className="border-b border-border last:border-0">
                  <td className="p-3 whitespace-nowrap text-muted-foreground tabular-nums">
                    {new Date(l.createdAt).toLocaleString(localeTag, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="p-3 font-medium">{l.userName}</td>
                  <td className="p-3"><Chip tone="muted">{l.action}</Chip></td>
                  <td className="p-3 text-muted-foreground">{l.entity}</td>
                  <td className="p-3 max-w-xs truncate text-muted-foreground" title={l.detail}>{l.detail || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
