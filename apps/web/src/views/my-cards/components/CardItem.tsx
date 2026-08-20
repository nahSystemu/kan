import Link from "next/link";
import { format, isBefore, isSameDay, isSameYear, startOfDay } from "date-fns";
import {
  HiArchiveBox,
  HiChatBubbleLeft,
  HiCheckCircle,
  HiEllipsisHorizontal,
  HiOutlineArchiveBox,
  HiOutlineClock,
  HiOutlinePaperClip,
} from "react-icons/hi2";

import Avatar from "~/components/Avatar";
import Badge from "~/components/Badge";
import CircularProgress from "~/components/CircularProgress";
import Dropdown from "~/components/Dropdown";
import LabelIcon from "~/components/LabelIcon";
import { useLocalisation } from "~/hooks/useLocalisation";
import { api } from "~/utils/api";
import { getAvatarUrl } from "~/utils/helpers";
import type { AssignedCard } from "../index";
import { t } from "@lingui/core/macro";
import { twMerge } from "tailwind-merge";

interface CardItemProps {
  card: AssignedCard;
}

export function CardItem({ card }: CardItemProps) {
  const { dateLocale } = useLocalisation();
  const utils = api.useUtils();

  const archiveMutation = api.card.archive.useMutation({
    onSuccess: () => void utils.card.getAssignedToMe.invalidate(),
  });
  const unarchiveMutation = api.card.unarchive.useMutation({
    onSuccess: () => void utils.card.getAssignedToMe.invalidate(),
  });
  const updateMutation = api.card.update.useMutation({
    onSuccess: () => void utils.card.getAssignedToMe.invalidate(),
  });

  const isCompleted = card.list.isCompleted;
  const isArchived = card.isArchived;
  const dueDate = card.dueDate ? new Date(card.dueDate) : null;
  const now = new Date();
  const todayStart = startOfDay(now);
  const isOverdue = dueDate ? isBefore(dueDate, todayStart) : false;
  const isDueToday = dueDate ? isSameDay(dueDate, now) : false;
  const showYear = dueDate ? !isSameYear(dueDate, now) : false;

  const completionLists = card.list.board.lists;
  const hasMultipleCompletionLists = completionLists.length > 1;

  const handleMarkComplete = () => {
    if (isCompleted) {
      // No native "unmark" — this would need a list picker; skip for now
      return;
    }
    if (completionLists.length === 0) return;
    // If there's exactly one completion list, move there
    if (!hasMultipleCompletionLists && completionLists[0]) {
      updateMutation.mutate({
        cardPublicId: card.publicId,
        listPublicId: completionLists[0].publicId,
      });
    }
    // Multiple completion lists: move to first one (user can use full card view for more)
    else if (completionLists[0]) {
      updateMutation.mutate({
        cardPublicId: card.publicId,
        listPublicId: completionLists[0].publicId,
      });
    }
  };

  const dropdownItems = [
    ...(completionLists.length > 0 && !isCompleted
      ? [
          {
            label: t`Mark as complete`,
            action: handleMarkComplete,
            icon: <HiCheckCircle className="h-4 w-4 text-dark-900" />,
          },
        ]
      : []),
    {
      label: isArchived ? t`Unarchive` : t`Archive`,
      action: () => {
        if (isArchived) {
          unarchiveMutation.mutate({ cardPublicId: card.publicId });
        } else {
          archiveMutation.mutate({ cardPublicId: card.publicId });
        }
      },
      icon: isArchived ? (
        <HiArchiveBox className="h-4 w-4 text-dark-900" />
      ) : (
        <HiOutlineArchiveBox className="h-4 w-4 text-dark-900" />
      ),
    },
  ];

  return (
    <div
      className={twMerge(
        "flex items-start gap-3 rounded-md border border-light-300 bg-light-50 px-4 py-3 transition-colors hover:bg-light-100 dark:border-dark-300 dark:bg-dark-200 dark:hover:bg-dark-300",
        isArchived && "opacity-60",
      )}
    >
      {/* Completion indicator */}
      <button
        onClick={handleMarkComplete}
        disabled={isCompleted || completionLists.length === 0}
        className="mt-0.5 flex-shrink-0 disabled:cursor-default"
        aria-label={isCompleted ? t`Completed` : t`Mark as complete`}
      >
        <HiCheckCircle
          className={twMerge(
            "h-5 w-5 transition-colors",
            isCompleted
              ? "text-indigo-600 dark:text-indigo-400"
              : "text-light-500 hover:text-indigo-500 dark:text-dark-600 dark:hover:text-indigo-400",
          )}
        />
      </button>

      {/* Card content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            {/* Breadcrumb: board → list */}
            <p className="mb-0.5 truncate text-[11px] text-light-700 dark:text-dark-800">
              {card.list.board.name}
              <span className="mx-1">›</span>
              {card.list.name}
            </p>

            {/* Title */}
            <Link
              href={`/cards/${card.publicId}`}
              className={twMerge(
                "break-words text-sm font-medium text-neutral-900 hover:text-indigo-600 dark:text-dark-1000 dark:hover:text-indigo-400",
                isCompleted && "line-through opacity-60",
              )}
            >
              {card.title}
            </Link>
          </div>

          {/* Actions */}
          <div className="flex-shrink-0">
            <Dropdown items={dropdownItems}>
              <HiEllipsisHorizontal className="h-5 w-5 text-dark-900" />
            </Dropdown>
          </div>
        </div>

        {/* Meta row */}
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {/* Labels */}
          {card.labels.map((label) => (
            <Badge
              key={label.publicId}
              value={label.name}
              iconLeft={<LabelIcon colourCode={label.colourCode} />}
            />
          ))}

          {/* Due date */}
          {dueDate && (
            <span
              className={twMerge(
                "flex items-center gap-1 text-[11px]",
                isOverdue && !isCompleted
                  ? "text-red-600 dark:text-red-400"
                  : isDueToday && !isCompleted
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-light-800 dark:text-dark-800",
              )}
            >
              <HiOutlineClock className="h-3.5 w-3.5" />
              {format(dueDate, showYear ? "do MMM yyyy" : "do MMM", { locale: dateLocale })}
            </span>
          )}

          {/* Checklist progress */}
          {card.checklistItemCount > 0 && (
            <span className="flex items-center gap-1 rounded-full border border-light-300 px-1.5 py-0.5 dark:border-dark-600">
              <CircularProgress
                progress={
                  card.checklistItemCount > 0
                    ? Math.round((card.completedChecklistItemCount / card.checklistItemCount) * 100)
                    : 0
                }
                size="sm"
                className="flex-shrink-0"
              />
              <span className="text-[10px] text-light-900 dark:text-dark-950">
                {card.completedChecklistItemCount}/{card.checklistItemCount}
              </span>
            </span>
          )}

          {/* Comments */}
          {card.commentCount > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-light-700 dark:text-dark-800">
              <HiChatBubbleLeft className="h-3.5 w-3.5" />
              {card.commentCount}
            </span>
          )}

          {/* Attachments */}
          {card.attachmentCount > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-light-700 dark:text-dark-800">
              <HiOutlinePaperClip className="h-3.5 w-3.5" />
              {card.attachmentCount}
            </span>
          )}

          {/* Members */}
          {card.members.length > 0 && (
            <div className="isolate flex -space-x-1 overflow-hidden">
              {card.members.slice(0, 5).map((member) => (
                <Avatar
                  key={member.publicId}
                  name={member.user?.name ?? ""}
                  email={member.email}
                  imageUrl={member.user?.image ? getAvatarUrl(member.user.image) : undefined}
                  size="sm"
                />
              ))}
            </div>
          )}

          {/* Archive badge */}
          {isArchived && (
            <span className="rounded-full bg-light-300 px-1.5 py-0.5 text-[10px] text-light-700 dark:bg-dark-400 dark:text-dark-800">
              {t`Archived`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
