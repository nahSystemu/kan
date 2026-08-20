import { useState } from "react";
import { HiChevronDown, HiChevronRight } from "react-icons/hi2";

import type { AssignedCard } from "../index";
import { CardItem } from "./CardItem";

interface BoardGroupProps {
  boardName: string;
  cards: AssignedCard[];
}

export function BoardGroup({ boardName, cards }: BoardGroupProps) {
  const [isOpen, setIsOpen] = useState(true);

  if (cards.length === 0) return null;

  // Sort within board by list index then card index
  const sorted = [...cards].sort((a, b) => {
    const listDiff = a.list.index - b.list.index;
    return listDiff !== 0 ? listDiff : a.index - b.index;
  });

  return (
    <div>
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="mb-2 flex items-center gap-2 text-sm font-semibold text-neutral-900 dark:text-dark-1000"
      >
        {isOpen ? (
          <HiChevronDown className="h-4 w-4 text-light-700 dark:text-dark-800" />
        ) : (
          <HiChevronRight className="h-4 w-4 text-light-700 dark:text-dark-800" />
        )}
        {boardName}
        <span className="ml-1 text-xs font-normal text-light-700 dark:text-dark-800">
          {cards.length}
        </span>
      </button>
      {isOpen && (
        <div className="space-y-2 pl-6">
          {sorted.map((card) => (
            <CardItem key={card.publicId} card={card} />
          ))}
        </div>
      )}
    </div>
  );
}
