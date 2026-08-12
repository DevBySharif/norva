"use client";

import { useState } from "react";
import { retryNotificationAction } from "@/features/notifications/admin-actions";

export function RetryNotificationButton({ id }: { id: string }) {
  const [isPending, setIsPending] = useState(false);

  async function retry() {
    setIsPending(true);
    try {
      await retryNotificationAction(id);
      window.location.reload();
    } catch {
      setIsPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={retry}
      disabled={isPending}
      data-testid={`notify-retry-${id}`}
      className="rounded-md border px-3 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
    >
      {isPending ? "Retrying…" : "Retry"}
    </button>
  );
}
