import { useRouter } from "next/router";
import { t } from "@lingui/core/macro";
import { keepPreviousData } from "@tanstack/react-query";
import { isBefore, isToday, isTomorrow, startOfDay } from "date-fns";
import { addDays } from "date-fns";

import { PageHead } from "~/components/PageHead";
import { useWorkspace } from "~/providers/workspace";
import { api } from "~/utils/api";
import { formatToArray } from "~/utils/helpers";
import type { RouterOutputs } from "~/utils/api";
import { BoardGroup } from "./components/BoardGroup";
import { DueDateGroup } from "./components/DueDateGroup";
import MyCardsFilters from "./components/Filters";

export type AssignedCard =
  RouterOutputs["card"]["getAssignedToMe"]["cards"][number];

type DueDateGroupKey =
  | "overdue"
  | "today"
  | "tomorrow"
  | "this-week"
  | "later"
  | "no-due-date"
  | "completed";

export default function MyCardsView() {
  const router = useRouter();
  const { workspace } = useWorkspace();

  const groupBy = (router.query.groupBy as string | undefined) ?? "due-date";
  const search = (router.query.search as string | undefined) ?? "";
  const boards = formatToArray(router.query.boards);
  const labelPublicIds = formatToArray(router.query.labels);
  const dueDateFilters = formatToArray(router.query.dueDate) as (
    | "overdue"
    | "today"
    | "tomorrow"
    | "next-week"
    | "next-month"
    | "no-due-date"
  )[];
  const showCompleted = router.query.showCompleted === "1";
  const showArchived = router.query.showArchived === "1";
  const page = Number(router.query.page ?? 0);
  const limit = 50;

  const { data, isLoading, isFetching } = api.card.getAssignedToMe.useQuery(
    {
      workspacePublicId: workspace.publicId,
      boards,
      labelPublicIds,
      dueDateFilters,
      search,
      showCompleted,
      showArchived,
      page,
      limit,
    },
    {
      enabled: !!workspace.publicId && workspace.publicId.length >= 12,
      placeholderData: keepPreviousData,
    },
  );

  const cards = data?.cards ?? [];
  const total = data?.total ?? 0;
  const hasMore = data?.hasMore ?? false;

  const handleLoadMore = () => {
    void router.push({
      pathname: router.pathname,
      query: { ...router.query, page: page + 1 },
    });
  };

  // Group cards
  const grouped = groupCards(cards, groupBy, showCompleted);

  const isLoadingOrFetching = isLoading || (isFetching && !cards.length);

  return (
    <>
      <PageHead
        title={t`My Cards | ${workspace.name || t`Workspace`}`}
      />
      <div className="h-full overflow-y-auto px-5 py-8 md:px-10 md:py-12">
        <div className="mx-auto max-w-[900px]">
          {/* Header */}
          <div className="mb-8 flex items-center justify-between">
            <h1 className="font-bold tracking-tight text-neutral-900 dark:text-dark-1000 sm:text-[1.2rem]">
              {t`My Cards`}
            </h1>
            {total > 0 && (
              <span className="text-sm text-light-700 dark:text-dark-800">
                {total} {total === 1 ? t`card` : t`cards`}
              </span>
            )}
          </div>

          {/* Filters */}
          <div className="mb-6">
            <MyCardsFilters cards={cards} isLoading={isLoading} />
          </div>

          {/* Content */}
          {isLoadingOrFetching ? (
            <LoadingSkeleton />
          ) : cards.length === 0 ? (
            <EmptyState />
          ) : groupBy === "board" ? (
            <div className="space-y-6">
              {grouped.board.map(({ boardPublicId, boardName, cards: boardCards }) => (
                <BoardGroup
                  key={boardPublicId}
                  boardName={boardName}
                  cards={boardCards}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {grouped.dueDate.map(({ key, label, cards: groupCards }) => (
                <DueDateGroup key={key} label={label} cards={groupCards} />
              ))}
            </div>
          )}

          {/* Load more */}
          {hasMore && (
            <div className="mt-8 flex justify-center">
              <button
                onClick={() => void handleLoadMore()}
                disabled={isFetching}
                className="rounded-md border border-light-400 bg-light-200 px-4 py-2 text-sm text-neutral-900 hover:bg-light-300 disabled:opacity-60 dark:border-dark-300 dark:bg-dark-200 dark:text-dark-1000 dark:hover:bg-dark-300"
              >
                {isFetching ? t`Loading...` : t`Load more`}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function groupCards(
  cards: AssignedCard[],
  groupBy: string,
  showCompleted: boolean,
): {
  dueDate: { key: DueDateGroupKey; label: string; cards: AssignedCard[] }[];
  board: { boardPublicId: string; boardName: string; cards: AssignedCard[] }[];
} {
  if (groupBy === "board") {
    const boardMap = new Map<string, { boardName: string; cards: AssignedCard[] }>();
    for (const card of cards) {
      const bid = card.list.board.publicId;
      let entry = boardMap.get(bid);
      if (!entry) {
        entry = { boardName: card.list.board.name, cards: [] };
        boardMap.set(bid, entry);
      }
      entry.cards.push(card);
    }
    return {
      dueDate: [],
      board: Array.from(boardMap.entries()).map(([boardPublicId, { boardName, cards: bc }]) => ({
        boardPublicId,
        boardName,
        cards: bc,
      })),
    };
  }

  // Due date grouping
  const now = new Date();
  const todayStart = startOfDay(now);
  const weekEnd = addDays(todayStart, 7);

  const groups: Record<DueDateGroupKey, AssignedCard[]> = {
    overdue: [],
    today: [],
    tomorrow: [],
    "this-week": [],
    later: [],
    "no-due-date": [],
    completed: [],
  };

  for (const card of cards) {
    if (card.list.isCompleted) {
      groups.completed.push(card);
      continue;
    }
    if (!card.dueDate) {
      groups["no-due-date"].push(card);
      continue;
    }
    const due = new Date(card.dueDate);
    if (isBefore(due, todayStart)) {
      groups.overdue.push(card);
    } else if (isToday(due)) {
      groups.today.push(card);
    } else if (isTomorrow(due)) {
      groups.tomorrow.push(card);
    } else if (isBefore(due, weekEnd)) {
      groups["this-week"].push(card);
    } else {
      groups.later.push(card);
    }
  }

  const dueDateOrder: { key: DueDateGroupKey; label: string }[] = [
    { key: "overdue", label: t`Overdue` },
    { key: "today", label: t`Due Today` },
    { key: "tomorrow", label: t`Due Tomorrow` },
    { key: "this-week", label: t`Due This Week` },
    { key: "later", label: t`Due Later` },
    { key: "no-due-date", label: t`No Due Date` },
    ...(showCompleted ? [{ key: "completed" as DueDateGroupKey, label: t`Completed` }] : []),
  ];

  return {
    board: [],
    dueDate: dueDateOrder
      .map(({ key, label }) => ({ key, label, cards: groups[key] }))
      .filter(({ cards: gc }) => gc.length > 0),
  };
}

function LoadingSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="h-14 w-full animate-pulse rounded-md bg-light-300 dark:bg-dark-200"
        />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <p className="text-sm text-light-700 dark:text-dark-800">
        {t`No cards assigned to you`}
      </p>
    </div>
  );
}
