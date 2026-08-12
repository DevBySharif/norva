import Link from "next/link";
import { requireOrderManager } from "@/lib/auth/session";
import { getNotificationLog, NOTIFICATION_STATUSES } from "@/features/notifications/admin-queries";
import { RetryNotificationButton } from "@/components/admin/retry-notification-button";

export const dynamic = "force-dynamic";

export default async function AdminNotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireOrderManager();
  const sp = await searchParams;
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";
  const activeStatus = one(sp.status) || undefined;

  const { rows, counts } = await getNotificationLog({ status: activeStatus });
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);

  return (
    <main className="admin-paper min-h-[calc(100vh-4rem)] px-4 py-7 sm:px-7 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-[#8b5946]">Operations</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Notifications</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Every transactional email intent (order events, verification, password resets). Pending rows are delivered by the outbox processor; failed rows can be retried.
        </p>

        <div className="mt-7 flex flex-wrap items-center gap-2" aria-label="Notifications by status">
          <Link
            href="/admin/notifications"
            data-testid={`notify-status-chip-ALL`}
            aria-current={!activeStatus ? "page" : undefined}
            className="rounded-full border px-3 py-1 text-xs font-medium hover:bg-muted"
          >
            All · {total}
          </Link>
          {NOTIFICATION_STATUSES.map((status) => (
            <Link
              key={status}
              href={`/admin/notifications?status=${status}`}
              data-testid={`notify-status-chip-${status}`}
              aria-current={activeStatus === status ? "page" : undefined}
              className="rounded-full border px-3 py-1 text-xs font-medium hover:bg-muted"
            >
              {status} · {counts[status] ?? 0}
            </Link>
          ))}
        </div>

        <div className="mt-6 overflow-hidden rounded-xl border bg-card">
          {rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">No notifications match these filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Event</th>
                    <th className="px-4 py-3 font-semibold">Recipient</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Attempts</th>
                    <th className="px-4 py-3 font-semibold">Created</th>
                    <th className="px-4 py-3 font-semibold">Sent</th>
                    <th className="px-4 py-3 font-semibold">Error / Next retry</th>
                    <th className="px-4 py-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((row) => (
                    <tr key={row.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{row.eventType}</td>
                      <td className="px-4 py-3">{row.email}</td>
                      <td className="px-4 py-3">
                        <span
                          data-testid={`notify-row-status-${row.id}`}
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            row.status === "SENT"
                              ? "bg-green-100 text-green-800"
                              : row.status === "FAILED"
                                ? "bg-red-100 text-red-800"
                                : row.status === "PROCESSING"
                                  ? "bg-blue-100 text-blue-800"
                                  : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{row.attempts}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {row.createdAt.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {row.sentAt ? row.sentAt.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {row.status === "FAILED" && row.lastError ? (
                          <span title={row.lastError} className="line-clamp-1 max-w-[220px] text-red-700">
                            {row.lastError}
                          </span>
                        ) : row.status === "PENDING" && row.nextAttemptAt ? (
                          <span title="Next retry">{row.nextAttemptAt.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {row.status === "FAILED" && <RetryNotificationButton id={row.id} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
