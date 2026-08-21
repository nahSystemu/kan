import type { IconType } from "react-icons";
import { t } from "@lingui/core/macro";
import {
  LuSignal,
  LuSignalHigh,
  LuSignalLow,
  LuSignalMedium,
} from "react-icons/lu";
import { twMerge } from "tailwind-merge";

import type { CardPriority } from "@kan/db/schema";

const priorityIcons: Record<CardPriority, IconType> = {
  urgent: LuSignal,
  high: LuSignalHigh,
  medium: LuSignalMedium,
  low: LuSignalLow,
};

const priorityStyles: Record<CardPriority, { icon: string; badge: string }> = {
  urgent: {
    icon: "text-red-600 dark:text-red-400",
    badge: "text-red-700 ring-red-300 dark:text-red-400 dark:ring-red-900/80",
  },
  high: {
    icon: "text-orange-500 dark:text-orange-400",
    badge:
      "text-orange-700 ring-orange-300 dark:text-orange-400 dark:ring-orange-900/80",
  },
  medium: {
    icon: "text-amber-500 dark:text-amber-300",
    badge:
      "text-amber-700 ring-amber-300 dark:text-amber-300 dark:ring-amber-900/80",
  },
  low: {
    icon: "text-blue-500 dark:text-blue-400",
    badge:
      "text-blue-700 ring-blue-300 dark:text-blue-400 dark:ring-blue-900/80",
  },
};

// Called per render so the label follows the active locale.
export const getPriorityLabel = (priority: CardPriority): string => {
  switch (priority) {
    case "urgent":
      return t`Urgent`;
    case "high":
      return t`High`;
    case "medium":
      return t`Medium`;
    case "low":
      return t`Low`;
  }
};

export const getPriorityBadgeClassName = (priority: CardPriority): string =>
  priorityStyles[priority].badge;

export const PriorityIcon = ({
  priority,
  className,
  title,
}: {
  priority: CardPriority;
  className?: string;
  title?: string;
}) => {
  const Icon = priorityIcons[priority];

  return (
    <Icon
      className={twMerge(
        "h-3 w-3 shrink-0",
        priorityStyles[priority].icon,
        className,
      )}
      title={title}
      aria-hidden={title ? undefined : "true"}
    />
  );
};
