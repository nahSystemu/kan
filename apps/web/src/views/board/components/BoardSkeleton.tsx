// Mirrors the real board markup (List.tsx column chrome, Card.tsx card chrome) so
// the skeleton occupies the exact same space the loaded board will.
const SKELETON_COLUMNS = [
  { titleWidth: "w-24", cards: [2, 1, 2] },
  { titleWidth: "w-16", cards: [1, 2] },
  { titleWidth: "w-32", cards: [2, 1, 1, 2] },
] as const;

const Bar = ({ className }: { className: string }) => (
  <div
    className={`animate-pulse rounded bg-light-400 dark:bg-dark-300 ${className}`}
  />
);

const CardSkeleton = ({ titleLines }: { titleLines: number }) => (
  <div className="mb-2 flex flex-col overflow-hidden rounded-md border border-light-200 bg-light-50 px-3 py-2 dark:border-dark-200 dark:bg-dark-200">
    <Bar className="mb-1 h-3 w-12" />
    <Bar className="h-4 w-full" />
    {titleLines > 1 && <Bar className="mt-1 h-4 w-2/3" />}
    <div className="mt-3 flex items-center justify-between">
      <Bar className="h-4 w-4" />
      <Bar className="h-6 w-16 rounded-full" />
    </div>
  </div>
);

export function BoardSkeleton() {
  return (
    <div className="flex w-max">
      <div className="min-w-[10px] md:min-w-[2rem]" />
      {SKELETON_COLUMNS.map((column, columnIndex) => (
        <div
          key={columnIndex}
          className="mr-5 h-fit min-w-[22rem] max-w-[22rem] rounded-md border border-light-400 bg-light-300 py-2 pl-2 pr-1 dark:border-dark-300 dark:bg-dark-100"
        >
          <div className="mb-2 flex justify-between">
            <div className="px-4 pt-1">
              <Bar className={`h-4 ${column.titleWidth}`} />
            </div>
            <div className="flex items-center gap-2 pr-2">
              <Bar className="h-5 w-5" />
              <Bar className="h-5 w-5" />
            </div>
          </div>
          <div className="pr-1">
            {column.cards.map((titleLines, cardIndex) => (
              <CardSkeleton key={cardIndex} titleLines={titleLines} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
