import Link from "next/link";
import { t } from "@lingui/core/macro";
import { formatDistanceToNow } from "date-fns";
import { z } from "zod";

import type { NotificationItem } from "../types";
import Avatar from "~/components/Avatar";

interface NotificationCardProps {
  notification: NotificationItem;
  onOpen: (notification: NotificationItem) => void | Promise<void>;
}

const cardAssignedPayloadSchema = z
  .object({
    cardTitle: z.string().optional(),
    boardName: z.string().nullable().optional(),
    boardPublicId: z.string().nullable().optional(),
    boardSlug: z.string().nullable().optional(),
    workspaceName: z.string().nullable().optional(),
    workspacePublicId: z.string().nullable().optional(),
    assignedByName: z.string().nullable().optional(),
    assignedByEmail: z.string().nullable().optional(),
  })
  .partial();

type CardAssignedPayload = z.infer<typeof cardAssignedPayloadSchema>;

const getNotificationMessage = (
  notification: NotificationItem,
  payload: CardAssignedPayload,
) => {
  const assignedBy = payload.assignedByName ?? payload.assignedByEmail;
  const cardTitle = payload.cardTitle ?? t`a card`;
  const workspaceName = payload.workspaceName ?? notification.workspace.name;

  return assignedBy
    ? t`${assignedBy} added you to ${cardTitle} in ${workspaceName}`
    : t`You were added to ${cardTitle} in ${workspaceName}`;
};

export function NotificationCard({
  notification,
  onOpen,
}: NotificationCardProps) {
  const parsedPayload = cardAssignedPayloadSchema.safeParse(
    notification.payload,
  );
  const payload: CardAssignedPayload = parsedPayload.success
    ? parsedPayload.data
    : {};
  const message = getNotificationMessage(notification, payload);
  const boardLink = payload.boardPublicId
    ? `/boards/${payload.boardPublicId}`
    : undefined;
  const createdAtDistance = formatDistanceToNow(
    new Date(notification.createdAt),
    { addSuffix: true },
  );
  const isUnread = !notification.readAt;

  return (
    <li>
      <button
        type="button"
        onClick={() => void onOpen(notification)}
        aria-label={message}
        className="dark:hover:bg-dark-150 group relative flex w-full items-center gap-3 rounded-lg border border-light-200/70 bg-white px-3 py-1 text-left shadow-sm transition-all hover:-translate-y-[1px] hover:border-light-300 hover:bg-light-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-light-400 focus-visible:ring-offset-2 focus-visible:ring-offset-light-50 dark:border-dark-400/70 dark:bg-dark-200 dark:hover:border-dark-200 dark:focus-visible:ring-dark-600 dark:focus-visible:ring-offset-dark-200"
      >
        <span className="relative flex w-3 shrink-0 items-center justify-center">
          {isUnread ? (
            <span className="relative inline-flex h-2.5 w-2.5 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#6366f1]/35 dark:bg-[#a855f7]/30" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full border-2 border-white bg-[#6366f1] dark:border-dark-200 dark:bg-[#a855f7]" />
            </span>
          ) : (
            <span className="relative inline-flex h-2 w-2 rounded-full border border-light-300 bg-white dark:border-dark-400 dark:bg-dark-200" />
          )}
        </span>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex-shrink-0">
            <Avatar
              size="sm"
              name={notification.createdBy?.name ?? ""}
              email={notification.createdBy?.email ?? ""}
              imageUrl={notification.createdBy?.image ?? undefined}
            />
          </div>

          <div className="flex min-w-0 flex-1 items-center gap-2 text-[13px]">
            <p className="min-w-0 flex-1 truncate font-medium text-light-1000 dark:text-dark-1000">
              {payload.cardTitle
                ? `${message} · ${payload.cardTitle}`
                : message}
            </p>

            {boardLink && (
              <Link
                href={boardLink}
                className="shrink-0 rounded-full bg-light-200/80 px-2 py-[2px] text-[11px] font-medium text-light-900 transition-colors hover:bg-light-300/90 dark:bg-dark-400/60 dark:text-dark-1000 dark:hover:bg-dark-300/80"
                onClick={(event) => event.stopPropagation()}
              >
                {payload.boardName ?? t`View board`}
              </Link>
            )}
          </div>
        </div>

        <span className="shrink-0 whitespace-nowrap text-[11px] text-light-700 dark:text-dark-900">
          {createdAtDistance}
        </span>
      </button>
    </li>
  );
}
