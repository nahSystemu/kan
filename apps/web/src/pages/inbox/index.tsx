import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { t } from "@lingui/core/macro";

import { getDashboardLayout } from "~/components/Dashboard";
import Popup from "~/components/Popup";
import { PageHead } from "~/components/PageHead";
import { api } from "~/utils/api";

type StatusFilter = "all" | "read" | "unread";

function NotificationRow({
  n,
  onOpen,
}: {
  n: {
    publicId: string;
    type: string;
    createdAt: string | Date;
    readAt?: string | Date | null;
    cardPublicId?: string | null;
    cardTitle?: string | null;
    commentPublicId?: string | null;
  };
  onOpen: (id: string, cardPublicId?: string | null) => void;
}) {
  const isUnread = !n.readAt;
  const createdAt = new Date(n.createdAt);
  const message = useMemo(() => {
    switch (n.type) {
      case "card.member.added":
        return t`You were added to a card: ${n.cardTitle ?? ""}`;
      case "card.comment.added":
        return t`New comment on a card you are on: ${n.cardTitle ?? ""}`;
      case "comment.mention":
        return t`You were mentioned in a comment`;
      default:
        return n.type;
    }
  }, [n.type, n.cardTitle]);

  return (
    <li
      className={
        "flex items-center justify-between border-b border-light-300 py-3 last:border-none dark:border-dark-300"
      }
    >
      <div>
        <p className={isUnread ? "font-semibold" : ""}>{message}</p>
        <p className="text-xs text-neutral-500 dark:text-dark-700">
          {createdAt.toLocaleString()}
        </p>
      </div>
      {n.cardPublicId ? (
        <button
          onClick={() => onOpen(n.publicId, n.cardPublicId)}
          className="rounded-md border border-light-400 px-3 py-1.5 text-sm hover:bg-light-200 dark:border-dark-400 dark:hover:bg-dark-300"
        >
          {t`Open`}
        </button>
      ) : (
        <span className="text-xs text-neutral-500">{t`No link`}</span>
      )}
    </li>
  );
}

function InboxView() {
  const [status, setStatus] = useState<StatusFilter>("all");
  const utils = api.useUtils();
  const { data, isLoading } = api.notification.list.useQuery({ status });
  const markAllRead = api.notification.markAllRead.useMutation({
    onSuccess: async () => {
      await utils.notification.list.invalidate();
    },
  });
  const clearAll = api.notification.clear.useMutation({
    onSuccess: async () => {
      await utils.notification.list.invalidate();
    },
  });
  const markRead = api.notification.markRead.useMutation({
    onSuccess: async () => {
      await utils.notification.list.invalidate();
    },
  });

  const onOpen = async (notificationPublicId: string, cardPublicId?: string | null) => {
    if (!cardPublicId) return;
    await markRead.mutateAsync({ notificationPublicId });
    window.location.href = `/cards/${cardPublicId}`;
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <PageHead title={t`Inbox`} description={t`Your notifications`} />
      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-2">
          {([
            { key: "all", label: t`All` },
            { key: "unread", label: t`Unread` },
            { key: "read", label: t`Read` },
          ] as { key: StatusFilter; label: string }[]).map((f) => (
            <button
              key={f.key}
              onClick={() => setStatus(f.key)}
              className={`rounded-md px-3 py-1.5 text-sm ${status === f.key ? "bg-light-300 dark:bg-dark-300" : "border border-light-400 hover:bg-light-200 dark:border-dark-400 dark:hover:bg-dark-300"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            disabled={markAllRead.isPending}
            onClick={() => markAllRead.mutate()}
            className="rounded-md border border-light-400 px-3 py-1.5 text-sm hover:bg-light-200 disabled:opacity-50 dark:border-dark-400 dark:hover:bg-dark-300"
          >
            {t`Mark all as read`}
          </button>
          <button
            disabled={clearAll.isPending}
            onClick={() => clearAll.mutate({ scope: "all" })}
            className="rounded-md border border-light-400 px-3 py-1.5 text-sm hover:bg-light-200 disabled:opacity-50 dark:border-dark-400 dark:hover:bg-dark-300"
          >
            {t`Clear`}
          </button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-neutral-600 dark:text-dark-700">{t`Loading...`}</p>
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-neutral-600 dark:text-dark-700">{t`Nothing here yet.`}</p>
      ) : (
        <ul className="divide-y divide-light-300 dark:divide-dark-300">
          {data.map((n) => (
            <NotificationRow key={n.publicId} n={n as any} onOpen={onOpen} />
          ))}
        </ul>
      )}

      <div className="mt-6 text-xs text-neutral-500">
        <p>
          {t`Notifications include:`} {t`being added to a card`} · {t`new comments on your cards`}
        </p>
      </div>
    </div>
  );
}

function InboxPage() {
  return (
    <>
      <InboxView />
      <Popup />
    </>
  );
}

// @ts-expect-error Next.js custom layout typing
InboxPage.getLayout = (page) => getDashboardLayout(page);

export default InboxPage;
