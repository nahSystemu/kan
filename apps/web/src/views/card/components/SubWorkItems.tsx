import Link from "next/link";
import { t } from "@lingui/core/macro";
import { format, isBefore, isSameYear, startOfDay } from "date-fns";
import { useState } from "react";
import {
  HiCheckCircle,
  HiChevronDown,
  HiChevronRight,
  HiEllipsisHorizontal,
  HiOutlineArrowTopRightOnSquare,
  HiOutlineClock,
  HiOutlineLink,
  HiOutlineSquare2Stack,
  HiOutlineXMark,
  HiPlus,
} from "react-icons/hi2";
import { twMerge } from "tailwind-merge";

import type { CardLinkType } from "@kan/db/schema";

import type { RouterOutputs } from "~/utils/api";
import Avatar from "~/components/Avatar";
import CircularProgress from "~/components/CircularProgress";
import Dropdown from "~/components/Dropdown";
import { PriorityIcon } from "~/components/Priority";
import { useLocalisation } from "~/hooks/useLocalisation";
import { usePermissions } from "~/hooks/usePermissions";
import { useModal } from "~/providers/modal";
import { usePopup } from "~/providers/popup";
import { api } from "~/utils/api";
import { getAvatarUrl } from "~/utils/helpers";

type CardLink = RouterOutputs["card"]["getLinks"][number];

const getRelationLabel = (link: CardLink): string => {
  if (link.type === "subtask") return t`Parent`;
  if (link.type === "blocks")
    return link.direction === "outgoing" ? t`Blocks` : t`Blocked by`;
  return t`Related`;
};

function LinkRow({
  link,
  cardPublicId,
  canEdit,
  relationLabel,
}: {
  link: CardLink;
  cardPublicId: string;
  canEdit: boolean;
  relationLabel?: string;
}) {
  const { dateLocale } = useLocalisation();
  const { showPopup } = usePopup();
  const utils = api.useUtils();

  const removeLink = api.card.removeLink.useMutation({
    onError: () => {
      showPopup({
        header: t`Unable to remove link`,
        message: t`Please try again.`,
        icon: "error",
      });
    },
    onSettled: async () => {
      await utils.card.getLinks.invalidate({ cardPublicId });
    },
  });

  const dueDate = link.card.dueDate ? new Date(link.card.dueDate) : null;
  const isOverdue = dueDate ? isBefore(dueDate, startOfDay(new Date())) : false;
  const showYear = dueDate ? !isSameYear(dueDate, new Date()) : false;

  return (
    <li className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-light-200 dark:hover:bg-dark-200">
      {link.isCompleted ? (
        <HiCheckCircle
          className="h-4 w-4 shrink-0 text-green-600 dark:text-green-500"
          title={t`Done`}
        />
      ) : (
        <span
          className="h-4 w-4 shrink-0 rounded-full border-[1.5px] border-light-600 dark:border-dark-600"
          title={t`Not done`}
        />
      )}

      <Link
        href={`/cards/${link.card.publicId}`}
        className="flex min-w-0 flex-1 items-center gap-2"
      >
        {relationLabel && (
          <span className="shrink-0 rounded-[4px] bg-light-300 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-light-900 dark:bg-dark-300 dark:text-dark-900">
            {relationLabel}
          </span>
        )}
        {link.card.ticketNumber && (
          <span className="shrink-0 text-xs text-light-700 dark:text-dark-800">
            {link.card.ticketNumber}
          </span>
        )}
        <span
          className={twMerge(
            "truncate text-sm text-neutral-900 dark:text-dark-1000",
            link.isCompleted && "text-light-800 dark:text-dark-800",
          )}
        >
          {link.card.title}
        </span>
      </Link>

      <div className="flex shrink-0 items-center gap-2">
        {link.card.priority && (
          <span className="flex items-center rounded-[4px] border-[1px] border-light-300 px-1 py-0.5 dark:border-dark-600">
            <PriorityIcon priority={link.card.priority} className="h-3 w-3" />
          </span>
        )}
        {dueDate && (
          <span
            className={twMerge(
              "flex items-center gap-1 rounded-[4px] border-[1px] px-1.5 py-0.5 text-[11px]",
              isOverdue
                ? "border-red-300 text-red-600 dark:border-red-900/80 dark:text-red-400"
                : "border-light-300 text-light-900 dark:border-dark-600 dark:text-dark-900",
            )}
          >
            <HiOutlineClock className="h-3 w-3" />
            {format(dueDate, showYear ? "do MMM yyyy" : "do MMM", {
              locale: dateLocale,
            })}
          </span>
        )}
        {link.card.members.length > 0 && (
          <div className="isolate flex -space-x-1 overflow-hidden">
            {link.card.members.map(({ user, email, publicId }) => (
              <Avatar
                key={publicId}
                size="sm"
                name={user?.name ?? ""}
                email={user?.email ?? email}
                imageUrl={user?.image ? getAvatarUrl(user.image) : undefined}
              />
            ))}
          </div>
        )}
        <Dropdown
          items={[
            {
              label: t`Open card`,
              action: () => {
                window.location.href = `/cards/${link.card.publicId}`;
              },
              icon: (
                <HiOutlineArrowTopRightOnSquare className="h-[16px] w-[16px] text-dark-900" />
              ),
            },
            ...(canEdit
              ? [
                  {
                    label: t`Remove link`,
                    action: () =>
                      removeLink.mutate({
                        cardPublicId,
                        linkPublicId: link.publicId,
                      }),
                    icon: (
                      <HiOutlineXMark className="h-[16px] w-[16px] text-dark-900" />
                    ),
                    disabled: removeLink.isPending,
                  },
                ]
              : []),
          ]}
        >
          <HiEllipsisHorizontal className="h-5 w-5 text-dark-900" />
        </Dropdown>
      </div>
    </li>
  );
}

export default function SubWorkItems({
  cardPublicId,
  viewOnly = false,
  includeDeleted = false,
}: {
  cardPublicId: string;
  viewOnly?: boolean;
  includeDeleted?: boolean;
}) {
  const { openModal } = useModal();
  const { canEditCard } = usePermissions();
  const [isExpanded, setIsExpanded] = useState(true);

  const { data: links } = api.card.getLinks.useQuery(
    { cardPublicId, includeDeleted },
    { enabled: cardPublicId.length >= 12 },
  );

  const canEdit = canEditCard && !viewOnly;

  const subWorkItems = (links ?? []).filter(
    (link) => link.type === "subtask" && link.direction === "outgoing",
  );
  const otherLinks = (links ?? []).filter(
    (link) => !(link.type === "subtask" && link.direction === "outgoing"),
  );

  const doneCount = subWorkItems.filter((link) => link.isCompleted).length;
  const progress =
    subWorkItems.length > 0
      ? Math.round((doneCount / subWorkItems.length) * 100)
      : 0;

  const openLinkModal = (type: CardLinkType) => {
    openModal("LINK_CARD", type);
  };

  if (subWorkItems.length === 0 && otherLinks.length === 0 && !canEdit)
    return null;

  return (
    <div className="mt-6 space-y-6">
      <div>
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setIsExpanded((value) => !value)}
            className="flex items-center gap-2 text-sm font-medium text-light-1000 dark:text-dark-1000"
          >
            {t`Sub-work items`}
            <span className="text-light-900 dark:text-dark-900">
              {subWorkItems.length}
            </span>
            {isExpanded ? (
              <HiChevronDown className="h-4 w-4 text-light-900 dark:text-dark-900" />
            ) : (
              <HiChevronRight className="h-4 w-4 text-light-900 dark:text-dark-900" />
            )}
          </button>
          <div className="flex items-center gap-3">
            {subWorkItems.length > 0 && (
              <div className="flex items-center gap-1.5">
                <CircularProgress progress={progress || 2} size="sm" />
                <span className="text-xs text-light-900 dark:text-dark-900">
                  {doneCount}/{subWorkItems.length} {t`Done`}
                </span>
              </div>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={() => openLinkModal("subtask")}
                aria-label={t`Add sub-work item`}
                className="flex h-7 w-7 items-center justify-center rounded-[5px] text-light-900 hover:bg-light-200 dark:text-dark-900 dark:hover:bg-dark-200"
              >
                <HiPlus className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {isExpanded && (
          <ul className="mt-2">
            {subWorkItems.length === 0 ? (
              <li className="flex items-center gap-2 px-2 py-2 text-sm text-light-900 dark:text-dark-900">
                <HiOutlineSquare2Stack className="h-4 w-4" />
                {t`No sub-work items yet.`}
              </li>
            ) : (
              subWorkItems.map((link) => (
                <LinkRow
                  key={link.publicId}
                  link={link}
                  cardPublicId={cardPublicId}
                  canEdit={canEdit}
                />
              ))
            )}
          </ul>
        )}
      </div>

      {(otherLinks.length > 0 || canEdit) && (
        <div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-medium text-light-1000 dark:text-dark-1000">
              {t`Linked items`}
              <span className="text-light-900 dark:text-dark-900">
                {otherLinks.length}
              </span>
            </span>
            {canEdit && (
              <button
                type="button"
                onClick={() => openLinkModal("relates")}
                aria-label={t`Link a card`}
                className="flex h-7 w-7 items-center justify-center rounded-[5px] text-light-900 hover:bg-light-200 dark:text-dark-900 dark:hover:bg-dark-200"
              >
                <HiOutlineLink className="h-4 w-4" />
              </button>
            )}
          </div>
          {otherLinks.length > 0 && (
            <ul className="mt-2">
              {otherLinks.map((link) => (
                <LinkRow
                  key={link.publicId}
                  link={link}
                  cardPublicId={cardPublicId}
                  canEdit={canEdit}
                  relationLabel={getRelationLabel(link)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
