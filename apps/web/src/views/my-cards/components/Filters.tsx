import { useRouter } from "next/router";
import { useRef } from "react";
import { t } from "@lingui/core/macro";
import {
  HiMiniXMark,
  HiOutlineClock,
  HiOutlineRectangleGroup,
  HiOutlineTag,
} from "react-icons/hi2";
import { IoFilterOutline } from "react-icons/io5";

import Button from "~/components/Button";
import CheckboxDropdown from "~/components/CheckboxDropdown";
import LabelIcon from "~/components/LabelIcon";
import Toggle from "~/components/Toggle";
import { formatToArray } from "~/utils/helpers";
import type { AssignedCard } from "../index";

interface MyCardsFiltersProps {
  cards: AssignedCard[];
  isLoading: boolean;
}

const dueDateItems = () => [
  { key: "overdue", value: t`Overdue` },
  { key: "today", value: t`Due today` },
  { key: "tomorrow", value: t`Due tomorrow` },
  { key: "next-week", value: t`Due next week` },
  { key: "next-month", value: t`Due next month` },
  { key: "no-due-date", value: t`No dates` },
];

export default function MyCardsFilters({ cards, isLoading }: MyCardsFiltersProps) {
  const router = useRouter();

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showCompleted = router.query.showCompleted === "1";
  const showArchived = router.query.showArchived === "1";
  const groupBy = (router.query.groupBy as string | undefined) ?? "due-date";

  // Collect unique boards and labels from loaded data
  const boardsMap = new Map<string, string>();
  const labelsMap = new Map<string, { name: string; colourCode: string | null }>();
  for (const card of cards) {
    boardsMap.set(card.list.board.publicId, card.list.board.name);
    for (const label of card.labels) {
      labelsMap.set(label.publicId, { name: label.name, colourCode: label.colourCode });
    }
  }

  const selectedBoards = formatToArray(router.query.boards);
  const selectedLabels = formatToArray(router.query.labels);
  const selectedDueDates = formatToArray(router.query.dueDate);

  const boardItems = Array.from(boardsMap.entries()).map(([publicId, name]) => ({
    key: publicId,
    value: name,
    selected: selectedBoards.includes(publicId),
  }));

  const labelItems = Array.from(labelsMap.entries()).map(([publicId, { name, colourCode }]) => ({
    key: publicId,
    value: name,
    selected: selectedLabels.includes(publicId),
    leftIcon: <LabelIcon colourCode={colourCode} />,
  }));

  const formattedDueDateItems = dueDateItems().map((item) => ({
    ...item,
    selected: selectedDueDates.includes(item.key),
  }));

  const groups = [
    ...(boardItems.length > 0
      ? [
          {
            key: "boards",
            label: t`Board`,
            icon: <HiOutlineRectangleGroup size={16} />,
            items: boardItems,
          },
        ]
      : []),
    ...(labelItems.length > 0
      ? [
          {
            key: "labels",
            label: t`Labels`,
            icon: <HiOutlineTag size={16} />,
            items: labelItems,
          },
        ]
      : []),
    {
      key: "dueDate",
      label: t`Due date`,
      icon: <HiOutlineClock size={16} />,
      items: formattedDueDateItems,
    },
  ];

  const numOfFilters = [
    ...selectedBoards,
    ...selectedLabels,
    ...selectedDueDates,
    ...(router.query.search ? [router.query.search as string] : []),
  ].length;

  const handleSelect = (groupKey: string | null, item: { key: string }) => {
    if (groupKey === null) return;
    const currentQuery = router.query[groupKey] ?? [];
    const formattedCurrentQuery = Array.isArray(currentQuery) ? currentQuery : [currentQuery];
    const updatedQuery = formattedCurrentQuery.includes(item.key)
      ? formattedCurrentQuery.filter((k) => k !== item.key)
      : [...formattedCurrentQuery, item.key];
    void router.push({
      pathname: router.pathname,
      query: { ...router.query, [groupKey]: updatedQuery, page: 0 },
    });
  };

  const clearFilters = () => {
    void router.push({
      pathname: router.pathname,
      query: {
        ...router.query,
        boards: [],
        labels: [],
        dueDate: [],
        search: undefined,
        page: 0,
      },
    });
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      void router.push({
        pathname: router.pathname,
        query: { ...router.query, search: value || undefined, page: 0 },
      });
    }, 300);
  };

  const handleToggle = (key: "showCompleted" | "showArchived") => {
    const current = router.query[key] === "1";
    void router.push({
      pathname: router.pathname,
      query: { ...router.query, [key]: current ? undefined : "1", page: 0 },
    });
  };

  const handleGroupByChange = (value: "due-date" | "board") => {
    void router.push({
      pathname: router.pathname,
      query: { ...router.query, groupBy: value, page: 0 },
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Search */}
      <input
        type="text"
        placeholder={t`Search cards...`}
        defaultValue={(router.query.search as string | undefined) ?? ""}
        onChange={handleSearchChange}
        className="h-8 min-w-[160px] rounded-md border border-light-400 bg-light-100 px-3 text-sm text-neutral-900 placeholder:text-light-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-dark-400 dark:bg-dark-200 dark:text-dark-1000 dark:placeholder:text-dark-700 dark:focus:ring-indigo-500"
      />

      {/* Filter dropdown */}
      <div className="relative">
        <CheckboxDropdown
          groups={groups}
          handleSelect={handleSelect}
          menuSpacing="md"
          position="left"
        >
          <Button variant="secondary" disabled={isLoading} iconLeft={<IoFilterOutline />}>
            {t`Filter`}
          </Button>
          {numOfFilters > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                clearFilters();
              }}
              aria-label={t`Clear filters`}
              className="group absolute -right-[8px] -top-[8px] flex h-5 w-5 items-center justify-center rounded-full border-2 border-light-100 bg-light-1000 text-[8px] font-[700] text-light-600 dark:border-dark-50 dark:bg-dark-1000 dark:text-dark-600"
            >
              <span className="group-hover:hidden">{numOfFilters}</span>
              <span className="hidden text-light-50 group-hover:inline dark:text-dark-50">
                <HiMiniXMark size={12} />
              </span>
            </button>
          )}
        </CheckboxDropdown>
      </div>

      {/* Divider */}
      <div className="h-5 w-px bg-light-400 dark:bg-dark-400" />

      {/* Group by */}
      <div className="flex items-center gap-1 rounded-md border border-light-400 p-0.5 dark:border-dark-400">
        <button
          onClick={() => void handleGroupByChange("due-date")}
          className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
            groupBy === "due-date"
              ? "bg-indigo-600 text-white"
              : "text-light-900 hover:bg-light-300 dark:text-dark-900 dark:hover:bg-dark-300"
          }`}
        >
          {t`Due Date`}
        </button>
        <button
          onClick={() => void handleGroupByChange("board")}
          className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
            groupBy === "board"
              ? "bg-indigo-600 text-white"
              : "text-light-900 hover:bg-light-300 dark:text-dark-900 dark:hover:bg-dark-300"
          }`}
        >
          {t`Board`}
        </button>
      </div>

      {/* Show completed toggle */}
      <Toggle
        label={t`Show completed`}
        isChecked={showCompleted}
        onChange={() => void handleToggle("showCompleted")}
        labelPosition="after"
      />

      {/* Show archived toggle */}
      <Toggle
        label={t`Show archived`}
        isChecked={showArchived}
        onChange={() => void handleToggle("showArchived")}
        labelPosition="after"
      />
    </div>
  );
}
