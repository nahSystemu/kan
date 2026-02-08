import { useRouter } from "next/router";
import { t } from "@lingui/core/macro";
import { useCallback, useEffect, useMemo, useRef } from "react";

import type { NotificationItem } from "./types";
import { PageHead } from "~/components/PageHead";
import { useNotificationBadge } from "~/hooks/useNotificationBadge";
import { usePopup } from "~/providers/popup";
import { useWorkspace } from "~/providers/workspace";
import { api } from "~/utils/api";
import { NotificationList } from "./components/NotificationList";
import { NotificationsEmptyState } from "./components/NotificationsEmptyState";
import { NotificationsHeader } from "./components/NotificationsHeader";
import { NotificationsLoadingState } from "./components/NotificationsLoadingState";
import { notificationListSchema } from "./types";

export default function NotificationsPage() {
  const router = useRouter();
  const { workspace, hasLoaded } = useWorkspace();
  const { showPopup } = usePopup();
  const badge = useNotificationBadge();
  const markSeenOnceRef = useRef(false);

  const notificationsQuery = api.notification.list.useInfiniteQuery(
    {
      workspacePublicId: workspace.publicId || undefined,
      limit: 20,
    },
    {
      enabled: hasLoaded,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      refetchOnWindowFocus: false,
    },
  );

  const markSeen = api.notification.markSeen.useMutation();
  const markRead = api.notification.markRead.useMutation();
  const markAllRead = api.notification.markAllRead.useMutation();

  const notifications = useMemo<NotificationItem[]>(() => {
    if (!notificationsQuery.data) {
      return [];
    }

    return notificationsQuery.data.pages.flatMap((page) => {
      const parsed = notificationListSchema.safeParse(page);
      return parsed.success ? parsed.data.items : [];
    });
  }, [notificationsQuery.data]);

  useEffect(() => {
    if (!hasLoaded || markSeenOnceRef.current || !notificationsQuery.data) {
      return;
    }

    markSeenOnceRef.current = true;

    void markSeen
      .mutateAsync({
        workspacePublicId: workspace.publicId || undefined,
      })
      .then(() => badge.refetch())
      .catch(() => {
        // Best effort side effect; silently ignore errors so the page keeps working.
      });
  }, [badge, hasLoaded, markSeen, notificationsQuery.data, workspace.publicId]);

  const handleMarkAllRead = useCallback(async () => {
    try {
      await markAllRead.mutateAsync({
        workspacePublicId: workspace.publicId || undefined,
      });
      await Promise.all([badge.refetch(), notificationsQuery.refetch()]);
    } catch (error) {
      console.error("Failed to mark all notifications as read", error);
      showPopup({
        header: t`Something went wrong`,
        message: t`We could not mark all notifications as read. Please try again later.`,
        icon: "error",
      });
    }
  }, [badge, markAllRead, notificationsQuery, showPopup, workspace.publicId]);

  const handleOpenNotification = useCallback(
    async (notification: NotificationItem) => {
      const redirectPath =
        notification.redirectPath ??
        (notification.entityPublicId
          ? `/cards/${notification.entityPublicId}`
          : undefined);

      if (!redirectPath) {
        return;
      }

      if (!notification.readAt) {
        try {
          await markRead.mutateAsync({
            notificationPublicId: notification.publicId,
          });
          await badge.refetch();
          await notificationsQuery.refetch();
        } catch (error) {
          console.error("Failed to mark notification as read", error);
          showPopup({
            header: t`Unable to mark notification as read`,
            message: t`Please try again later.`,
            icon: "error",
          });
          return;
        }
      }

      void router.push(redirectPath);
    },
    [badge, markRead, notificationsQuery, router, showPopup],
  );

  const workspaceName =
    workspace.name.trim().length > 0 ? workspace.name : t`Workspace`;
  const pageTitle = `${t`Notifications`} | ${workspaceName}`;
  const isLoading = notificationsQuery.isPending;
  const hasNotifications = notifications.length > 0;

  return (
    <>
      <PageHead title={pageTitle} />
      <div className="m-auto flex h-full w-full max-w-[960px] flex-col px-5 py-6 md:px-16 md:py-12">
        <NotificationsHeader
          onMarkAllRead={handleMarkAllRead}
          isMarkingAllRead={markAllRead.isPending}
          unreadCount={badge.unreadCount}
        />

        <div className="flex-1 overflow-y-auto pt-6">
          {isLoading && <NotificationsLoadingState />}

          {!isLoading && !hasNotifications && <NotificationsEmptyState />}

          {!isLoading && hasNotifications && (
            <NotificationList
              notifications={notifications}
              onOpenNotification={handleOpenNotification}
              hasNextPage={Boolean(notificationsQuery.hasNextPage)}
              fetchNextPage={notificationsQuery.fetchNextPage}
              isFetchingNextPage={notificationsQuery.isFetchingNextPage}
            />
          )}
        </div>
      </div>
    </>
  );
}
