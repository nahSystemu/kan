import { t } from "@lingui/core/macro";
import { useState } from "react";

import type { CardLinkType } from "@kan/db/schema";

import Button from "~/components/Button";
import Input from "~/components/Input";
import { useModal } from "~/providers/modal";
import { usePopup } from "~/providers/popup";
import { useWorkspace } from "~/providers/workspace";
import { api } from "~/utils/api";

const LINK_TYPES: { value: CardLinkType; label: () => string }[] = [
  { value: "subtask", label: () => t`Sub-work item` },
  { value: "blocks", label: () => t`Blocks` },
  { value: "relates", label: () => t`Related to` },
];

export default function LinkCardForm({
  cardPublicId,
}: {
  cardPublicId: string;
}) {
  const { entityId, closeModal } = useModal();
  const { showPopup } = usePopup();
  const { workspace } = useWorkspace();
  const utils = api.useUtils();

  const initialType = LINK_TYPES.some((type) => type.value === entityId)
    ? (entityId as CardLinkType)
    : "subtask";

  const [type, setType] = useState<CardLinkType>(initialType);
  const [query, setQuery] = useState("");

  const { data: results, isFetching } = api.workspace.search.useQuery(
    { workspacePublicId: workspace.publicId, query, limit: 20 },
    { enabled: query.trim().length > 0 && workspace.publicId.length >= 12 },
  );

  const addLink = api.card.addLink.useMutation({
    onSuccess: async () => {
      await utils.card.getLinks.invalidate({ cardPublicId });
      closeModal();
    },
    onError: (error) => {
      showPopup({
        header: t`Unable to link card`,
        message: error.message,
        icon: "error",
      });
    },
  });

  const cardResults = (results ?? []).filter(
    (result) => result.type === "card" && result.publicId !== cardPublicId,
  );

  return (
    <div className="p-5">
      <h2 className="text-md pb-4 font-medium text-neutral-900 dark:text-dark-1000">
        {t`Link a card`}
      </h2>

      <div className="flex gap-1 pb-4">
        {LINK_TYPES.map((linkType) => (
          <button
            key={linkType.value}
            type="button"
            onClick={() => setType(linkType.value)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${
              type === linkType.value
                ? "bg-light-1000 text-light-50 dark:bg-dark-1000 dark:text-dark-50"
                : "bg-light-200 text-light-1000 dark:bg-dark-300 dark:text-dark-1000"
            }`}
          >
            {linkType.label()}
          </button>
        ))}
      </div>

      <Input
        placeholder={t`Search cards by title or ticket ID`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="mt-3 max-h-[40vh] min-h-[6rem] overflow-y-auto">
        {query.trim().length === 0 ? (
          <p className="px-2 py-3 text-sm text-light-900 dark:text-dark-900">
            {t`Start typing to find a card.`}
          </p>
        ) : isFetching ? (
          <p className="px-2 py-3 text-sm text-light-900 dark:text-dark-900">
            {t`Searching...`}
          </p>
        ) : cardResults.length === 0 ? (
          <p className="px-2 py-3 text-sm text-light-900 dark:text-dark-900">
            {t`No cards found.`}
          </p>
        ) : (
          <ul className="space-y-1">
            {cardResults.map((result) => (
              <li key={result.publicId}>
                <button
                  type="button"
                  disabled={addLink.isPending}
                  onClick={() =>
                    addLink.mutate({
                      cardPublicId,
                      linkedCardPublicId: result.publicId,
                      type,
                    })
                  }
                  className="w-full rounded-md px-3 py-2 text-left hover:bg-light-200 disabled:opacity-60 dark:hover:bg-dark-400"
                >
                  <span className="block truncate text-sm text-neutral-900 dark:text-dark-1000">
                    {result.title}
                  </span>
                  <span className="block truncate text-xs text-light-900 dark:text-dark-900">
                    {"boardName" in result
                      ? `${result.boardName} · ${result.listName}`
                      : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-5 flex justify-end">
        <Button onClick={() => closeModal()} variant="secondary">
          {t`Cancel`}
        </Button>
      </div>
    </div>
  );
}
