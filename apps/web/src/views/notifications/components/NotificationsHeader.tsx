import { t } from "@lingui/core/macro";

import Button from "~/components/Button";

interface NotificationsHeaderProps {
  onMarkAllRead: () => Promise<void> | void;
  isMarkingAllRead: boolean;
  unreadCount: number;
}

export function NotificationsHeader({
  onMarkAllRead,
  isMarkingAllRead,
  unreadCount,
}: NotificationsHeaderProps) {
  const canMarkAllRead = unreadCount > 0 && !isMarkingAllRead;

  return (
    <div className="flex items-center justify-between border-b border-light-200 pb-6 dark:border-dark-300">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-light-1000 dark:text-dark-1000">
          {t`Notifications`}
        </h1>
        <p className="text-sm text-light-800 dark:text-dark-800">
          {t`Stay up to date with activity that needs your attention.`}
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        disabled={!canMarkAllRead}
        isLoading={isMarkingAllRead}
        onClick={() => void onMarkAllRead()}
      >
        {t`Mark all as read`}
      </Button>
    </div>
  );
}
