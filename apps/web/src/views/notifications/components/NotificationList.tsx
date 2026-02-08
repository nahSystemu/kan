import { t } from "@lingui/core/macro";

import type { NotificationItem } from "../types";
import Button from "~/components/Button";
import { NotificationCard } from "./NotificationCard";

interface NotificationListProps {
  notifications: NotificationItem[];
  onOpenNotification: (notification: NotificationItem) => Promise<void> | void;
  hasNextPage: boolean;
  fetchNextPage: () => Promise<unknown>;
  isFetchingNextPage: boolean;
}

export function NotificationList({
  notifications,
  onOpenNotification,
  hasNextPage,
  fetchNextPage,
  isFetchingNextPage,
}: NotificationListProps) {
  return (
    <>
      <ul className="space-y-2">
        {notifications.map((notification) => (
          <NotificationCard
            key={notification.publicId}
            notification={notification}
            onOpen={onOpenNotification}
          />
        ))}
      </ul>
      {hasNextPage && (
        <div className="mt-6 flex justify-center">
          <Button
            variant="secondary"
            onClick={() => void fetchNextPage()}
            isLoading={isFetchingNextPage}
            disabled={isFetchingNextPage}
          >
            {t`Load more`}
          </Button>
        </div>
      )}
    </>
  );
}
