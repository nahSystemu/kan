import { t } from "@lingui/core/macro";
import { formatDistanceToNow } from "date-fns";
import { HiArrowUturnLeft, HiOutlineInbox } from "react-icons/hi2";

import Avatar from "~/components/Avatar";
import Button from "~/components/Button";
import {
  getPriorityBadgeClassName,
  getPriorityLabel,
  PriorityIcon,
} from "~/components/Priority";
import { useLocalisation } from "~/hooks/useLocalisation";
import { usePermissions } from "~/hooks/usePermissions";
import { useModal } from "~/providers/modal";
import { usePopup } from "~/providers/popup";
import { api } from "~/utils/api";

interface InactiveCardsModalProps {
  variant: "archived" | "deleted";
  boardPublicId: string;
}

export function InactiveCardsModal({
  variant,
  boardPublicId,
}: InactiveCardsModalProps) {
  const isArchived = variant === "archived";
  const utils = api.useUtils();
  const { closeModal } = useModal();
  const { showPopup } = usePopup();
  const { dateLocale } = useLocalisation();
  const { canEditCard, canDeleteCard } = usePermissions();

  const enabled = boardPublicId.length >= 12;

  const archivedQuery = api.card.getArchived.useQuery(
    { boardPublicId },
    { enabled: enabled && isArchived },
  );
  const deletedQuery = api.card.getDeleted.useQuery(
    { boardPublicId },
    { enabled: enabled && !isArchived },
  );

  const { data, isLoading } = isArchived ? archivedQuery : deletedQuery;

  const refresh = async () => {
    await Promise.all([
      utils.card.getArchived.invalidate({ boardPublicId }),
      utils.card.getDeleted.invalidate({ boardPublicId }),
      utils.board.byId.invalidate(),
    ]);
  };

  const onRestoreError = () => {
    showPopup({
      header: isArchived
        ? t`Unable to unarchive card`
        : t`Unable to restore card`,
      message: t`Please try again later, or contact customer support.`,
      icon: "error",
    });
  };

  const unarchiveCard = api.card.unarchive.useMutation({
    onError: onRestoreError,
    onSuccess: refresh,
  });

  const restoreCard = api.card.restore.useMutation({
    onError: onRestoreError,
    onSuccess: refresh,
  });

  const mutation = isArchived ? unarchiveCard : restoreCard;
  const canRestore = isArchived ? canEditCard : canDeleteCard;

  const cards = data ?? [];

  return (
    <div className="p-5">
      <div className="flex items-start justify-between pb-4">
        <div>
          <h2 className="text-md font-medium text-neutral-900 dark:text-dark-1000">
            {isArchived ? t`Archived cards` : t`Deleted cards`}
          </h2>
          <p className="pt-1 text-sm text-light-900 dark:text-dark-900">
            {isArchived
              ? t`Archived cards stay active and can still be opened, but they no longer appear on the board.`
              : t`Deleted cards are kept here so they can be put back on the board.`}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-14 w-full animate-pulse rounded-md bg-light-200 dark:bg-dark-300"
            />
          ))}
        </div>
      ) : cards.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <HiOutlineInbox className="mb-3 h-8 w-8 text-light-800 dark:text-dark-800" />
          <p className="text-sm text-light-900 dark:text-dark-900">
            {isArchived ? t`No archived cards` : t`No deleted cards`}
          </p>
        </div>
      ) : (
        <ul className="scrollbar-w-[8px] scrollbar-track-rounded-[4px] scrollbar-thumb-rounded-[4px] max-h-[55vh] space-y-1 overflow-y-auto pr-1 scrollbar scrollbar-track-light-200 scrollbar-thumb-light-400 dark:scrollbar-track-dark-100 dark:scrollbar-thumb-dark-600">
          {cards.map((card) => (
            <li
              key={card.publicId}
              className="flex items-center justify-between gap-3 rounded-md border border-light-300 px-3 py-2 dark:border-dark-300"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-neutral-900 dark:text-dark-1000">
                    {card.title}
                  </p>
                  {card.priority && (
                    <span
                      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${getPriorityBadgeClassName(card.priority)}`}
                    >
                      <PriorityIcon priority={card.priority} />
                      {getPriorityLabel(card.priority)}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-1 pt-0.5 text-xs text-light-900 dark:text-dark-900">
                  <span>{card.list.name}</span>
                  {card.list.isDeleted && (
                    <span className="text-light-800 dark:text-dark-800">
                      {t`(list deleted)`}
                    </span>
                  )}
                  {card.stateAt && (
                    <>
                      <span>·</span>
                      <span>
                        {formatDistanceToNow(new Date(card.stateAt), {
                          addSuffix: true,
                          locale: dateLocale,
                        })}
                      </span>
                    </>
                  )}
                  {card.by && (
                    <>
                      <span>·</span>
                      <Avatar
                        size="xs"
                        name={card.by.name ?? ""}
                        email={card.by.email}
                        imageUrl={card.by.image ?? undefined}
                      />
                      <span>{card.by.name ?? card.by.email}</span>
                    </>
                  )}
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                disabled={!canRestore || mutation.isPending}
                iconLeft={<HiArrowUturnLeft className="h-4 w-4" />}
                onClick={() => mutation.mutate({ cardPublicId: card.publicId })}
              >
                {isArchived ? t`Unarchive` : t`Restore`}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5 flex justify-end">
        <Button onClick={() => closeModal()} variant="secondary">
          {t`Close`}
        </Button>
      </div>
    </div>
  );
}
