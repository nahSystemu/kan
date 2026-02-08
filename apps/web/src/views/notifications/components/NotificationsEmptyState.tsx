import { t } from "@lingui/core/macro";

export function NotificationsEmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center text-light-800 dark:text-dark-800">
      <p className="text-base font-semibold">{t`You're all caught up!`}</p>
      <p className="mt-2 max-w-sm text-sm">
        {t`Assign or update cards to see new activity appear here.`}
      </p>
    </div>
  );
}
