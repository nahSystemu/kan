import Link from "next/link";
import { useRouter } from "next/router";
import { t } from "@lingui/core/macro";
import { formatDistanceToNow } from "date-fns";
import { useEffect } from "react";
import { HiOutlineInbox, HiXMark } from "react-icons/hi2";
import { IoChevronForwardSharp } from "react-icons/io5";

import type { RouterOutputs } from "~/utils/api";
import Avatar from "~/components/Avatar";
import { PageHead } from "~/components/PageHead";
import {
  getPriorityBadgeClassName,
  getPriorityLabel,
  PriorityIcon,
} from "~/components/Priority";
import { useLocalisation } from "~/hooks/useLocalisation";
import { useWorkspace } from "~/providers/workspace";
import { api } from "~/utils/api";
import { InactiveCardDetail } from "./components/InactiveCardDetail";

type InactiveCard = RouterOutputs["card"]["getArchived"][number];

export default function InactiveCardsView({
  variant,
}: {
  variant: "archived" | "deleted";
}) {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { dateLocale } = useLocalisation();

  const isArchived = variant === "archived";

  const boardPublicId = Array.isArray(router.query.boardId)
    ? (router.query.boardId[0] ?? "")
    : (router.query.boardId ?? "");
  const selectedCardId = Array.isArray(router.query.card)
    ? router.query.card[0]
    : router.query.card;

  const enabled = boardPublicId.length >= 12;

  const { data: board } = api.board.byId.useQuery(
    { boardPublicId },
    { enabled },
  );

  const archivedQuery = api.card.getArchived.useQuery(
    { boardPublicId },
    { enabled: enabled && isArchived },
  );
  const deletedQuery = api.card.getDeleted.useQuery(
    { boardPublicId },
    { enabled: enabled && !isArchived },
  );

  const { data, isLoading } = isArchived ? archivedQuery : deletedQuery;
  const cards = data ?? [];

  const selectCard = (cardPublicId: string | null) => {
    void router.replace(
      {
        pathname: router.pathname,
        query: cardPublicId
          ? { boardId: boardPublicId, card: cardPublicId }
          : { boardId: boardPublicId },
      },
      undefined,
      { shallow: true },
    );
  };

  // Keeps the detail pane populated: falls back to the first card whenever the
  // selected one is no longer listed, which is what happens once it's restored.
  useEffect(() => {
    if (isLoading) return;
    if (cards.some((card) => card.publicId === selectedCardId)) return;
    if (!selectedCardId && cards.length === 0) return;
    selectCard(cards[0]?.publicId ?? null);
  }, [isLoading, cards, selectedCardId]);

  const selectedCard =
    cards.find((card) => card.publicId === selectedCardId) ?? null;

  const title = isArchived ? t`Archived cards` : t`Deleted cards`;

  return (
    <>
      <PageHead title={`${title} | ${board?.name ?? t`Board`}`} />
      <div className="flex h-full flex-1 flex-col overflow-hidden">
        <div className="flex w-full items-center justify-between border-b-[1px] border-light-300 bg-light-50 px-8 py-2 dark:border-dark-300 dark:bg-dark-50">
          <div className="flex items-center gap-1">
            <Link
              className="whitespace-nowrap text-sm font-bold leading-[1.5rem] text-light-900 dark:text-dark-950"
              href="/boards"
            >
              {workspace.name}
            </Link>
            <IoChevronForwardSharp className="h-[10px] w-[10px] text-light-900 dark:text-dark-900" />
            <Link
              className="whitespace-nowrap text-sm font-bold leading-[1.5rem] text-light-900 dark:text-dark-950"
              href={`/boards/${boardPublicId}`}
            >
              {board?.name}
            </Link>
            <IoChevronForwardSharp className="h-[10px] w-[10px] text-light-900 dark:text-dark-900" />
            <span className="whitespace-nowrap text-sm font-bold leading-[1.5rem] text-light-700 dark:text-dark-800">
              {title}
            </span>
          </div>
          <Link
            href={`/boards/${boardPublicId}`}
            className="flex h-7 w-7 items-center justify-center rounded-[5px] text-light-900 hover:bg-light-200 dark:text-dark-900 dark:hover:bg-dark-200"
            aria-label={t`Close`}
          >
            <HiXMark className="h-4 w-4" />
          </Link>
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <div className="scrollbar-thumb-rounded-[4px] scrollbar-track-rounded-[4px] max-h-[40vh] w-full shrink-0 overflow-y-auto border-b-[1px] border-light-300 scrollbar scrollbar-track-light-200 scrollbar-thumb-light-400 dark:border-dark-300 dark:scrollbar-track-dark-100 dark:scrollbar-thumb-dark-300 md:max-h-none md:w-[340px] md:border-b-0 md:border-r-[1px]">
            <div className="px-5 pb-3 pt-5">
              <p className="text-sm text-light-900 dark:text-dark-900">
                {isArchived
                  ? t`Archived cards stay active and can still be opened, but they no longer appear on the board.`
                  : t`Deleted cards are kept here so they can be put back on the board.`}
              </p>
            </div>

            {isLoading ? (
              <div className="space-y-2 px-3 pb-5">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-16 w-full animate-pulse rounded-md bg-light-200 dark:bg-dark-300"
                  />
                ))}
              </div>
            ) : cards.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-5 py-10 text-center">
                <HiOutlineInbox className="mb-3 h-8 w-8 text-light-800 dark:text-dark-800" />
                <p className="text-sm text-light-900 dark:text-dark-900">
                  {isArchived ? t`No archived cards` : t`No deleted cards`}
                </p>
              </div>
            ) : (
              <ul className="space-y-1 px-3 pb-5">
                {cards.map((card) => (
                  <li key={card.publicId}>
                    <CardListItem
                      card={card}
                      isSelected={card.publicId === selectedCardId}
                      dateLocale={dateLocale}
                      onSelect={() => selectCard(card.publicId)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="scrollbar-thumb-rounded-[4px] scrollbar-track-rounded-[4px] min-w-0 flex-1 overflow-y-auto scrollbar scrollbar-track-light-200 scrollbar-thumb-light-400 dark:scrollbar-track-dark-100 dark:scrollbar-thumb-dark-300">
            {selectedCard ? (
              <InactiveCardDetail
                key={selectedCard.publicId}
                cardPublicId={selectedCard.publicId}
                variant={variant}
                boardPublicId={boardPublicId}
                stateAt={selectedCard.stateAt}
                by={selectedCard.by}
              />
            ) : (
              <div className="flex h-full items-center justify-center p-8 text-center">
                <p className="text-sm text-light-900 dark:text-dark-900">
                  {isArchived
                    ? t`Select an archived card to view its details.`
                    : t`Select a deleted card to view its details.`}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function CardListItem({
  card,
  isSelected,
  dateLocale,
  onSelect,
}: {
  card: InactiveCard;
  isSelected: boolean;
  dateLocale: ReturnType<typeof useLocalisation>["dateLocale"];
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-md border px-3 py-2 text-left ${
        isSelected
          ? "border-light-400 bg-light-200 dark:border-dark-400 dark:bg-dark-200"
          : "border-transparent hover:bg-light-200 dark:hover:bg-dark-200"
      }`}
    >
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
        <span className="truncate">{card.list.name}</span>
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
            <span className="truncate">{card.by.name ?? card.by.email}</span>
          </>
        )}
      </div>
    </button>
  );
}
