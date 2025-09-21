import { t } from "@lingui/core/macro";

import Badge from "../../../components/Badge";
import Button from "../../../components/Button";
import { useModal } from "../../../providers/modal";
import { useWorkspace } from "../../../providers/workspace";
import { api } from "../../../utils/api";

export function PagesList() {
  const { workspace } = useWorkspace();
  const { openModal } = useModal();

  // Temporary type bridge until typegen is updated
  const allHook = (
    api as unknown as {
      page?: {
        all?: {
          useQuery: (input: { workspacePublicId: string }) => {
            data?: {
              publicId: string;
              slug?: string | null;
              title: string;
              createdAt: string;
              visibility?: "public" | "private";
              tags?: {
                publicId: string;
                name: string;
                colourCode?: string | null;
              }[];
              pageLabelJoins?: {
                label: {
                  publicId: string;
                  name: string;
                  colourCode?: string | null;
                };
              }[];
            }[];
            isLoading: boolean;
          };
        };
      };
    }
  ).page?.all?.useQuery;

  const { data = [], isLoading } = allHook
    ? allHook({ workspacePublicId: workspace.publicId })
    : { data: [], isLoading: true };

  api.useUtils();

  if (isLoading)
    return (
      <div className="space-y-2">
        <div className="h-9 w-full max-w-[680px] animate-pulse rounded bg-light-200 dark:bg-dark-200" />
        <div className="h-9 w-full max-w-[620px] animate-pulse rounded bg-light-200 dark:bg-dark-200" />
        <div className="h-9 w-full max-w-[520px] animate-pulse rounded bg-light-200 dark:bg-dark-200" />
      </div>
    );

  if (data.length === 0)
    return (
      <div className="z-10 flex h-full w-full flex-col items-center justify-center space-y-8 pb-[150px]">
        <div className="flex flex-col items-center">
          <svg
            className="h-10 w-10 text-light-800 dark:text-dark-800"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <rect
              x="3"
              y="4"
              width="18"
              height="6"
              rx="1"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <rect
              x="3"
              y="10"
              width="18"
              height="6"
              rx="1"
              stroke="currentColor"
              strokeWidth="1.5"
              opacity="0.6"
            />
            <rect
              x="3"
              y="16"
              width="18"
              height="4"
              rx="1"
              stroke="currentColor"
              strokeWidth="1.5"
              opacity="0.3"
            />
          </svg>
          <p className="mb-2 mt-4 text-[14px] font-bold text-light-1000 dark:text-dark-950">
            {t`No pages`}
          </p>
          <p className="text-[14px] text-light-900 dark:text-dark-900">
            {t`Get started by creating a new page`}
          </p>
        </div>
        <Button
          onClick={() => openModal("NEW_PAGE")}
        >{t`Create new page`}</Button>
      </div>
    );

  return (
    <div className="flex w-full flex-col gap-2">
      {data.map((p) => (
        <div
          key={p.publicId}
          className="relative w-full rounded-md border border-light-400 bg-light-50 shadow-sm hover:bg-light-200 dark:border-dark-600 dark:bg-dark-50 dark:hover:bg-dark-100"
        >
          <div className="relative z-0 flex w-full items-center justify-between px-4 py-3">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <p className="truncate px-0 text-[14px] font-bold text-neutral-700 dark:text-dark-1000">
                {p.title}
              </p>
              <div className="flex flex-wrap gap-1">
                {(() => {
                  const labels = (
                    (
                      p as unknown as {
                        pageLabelJoins?: {
                          label: {
                            publicId: string;
                            name: string;
                            colourCode?: string | null;
                          };
                        }[];
                      }
                    ).pageLabelJoins ?? []
                  ).map((j) => j.label);
                  const tags =
                    (
                      p as unknown as {
                        tags?: {
                          publicId: string;
                          name: string;
                          colourCode?: string | null;
                        }[];
                      }
                    ).tags ?? [];
                  const pills = labels.length ? labels : tags;
                  return pills.map((tag) => (
                    <Badge
                      key={tag.publicId}
                      value={tag.name}
                      iconLeft={
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{
                            backgroundColor: tag.colourCode ?? "#94a3b8",
                          }}
                        />
                      }
                    />
                  ));
                })()}
              </div>
            </div>
            <div className="ml-4 flex shrink-0 items-center gap-3">
              <span className="text-xs text-light-800 dark:text-dark-800">
                {new Date(p.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
          <a
            href={p.slug ? `/pages/${p.slug}` : `/pages/${p.publicId}`}
            className="absolute inset-0 z-10"
            aria-label={p.title}
          />
        </div>
      ))}
    </div>
  );
}
