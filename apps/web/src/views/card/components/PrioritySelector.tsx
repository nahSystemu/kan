import { t } from "@lingui/core/macro";
import { HiMiniPlus } from "react-icons/hi2";

import type { CardPriority } from "@kan/db/schema";
import { cardPriorities } from "@kan/db/schema";

import Badge from "~/components/Badge";
import CheckboxDropdown from "~/components/CheckboxDropdown";
import {
  getPriorityBadgeClassName,
  getPriorityLabel,
  PriorityIcon,
} from "~/components/Priority";
import { usePopup } from "~/providers/popup";
import { api } from "~/utils/api";
import { invalidateCard } from "~/utils/cardInvalidation";

interface PrioritySelectorProps {
  cardPublicId: string;
  priority: CardPriority | null;
  isLoading: boolean;
  disabled?: boolean;
}

export default function PrioritySelector({
  cardPublicId,
  priority,
  isLoading,
  disabled = false,
}: PrioritySelectorProps) {
  const utils = api.useUtils();
  const { showPopup } = usePopup();

  const updatePriority = api.card.update.useMutation({
    onMutate: async (update) => {
      await utils.card.byId.cancel();

      const previousCard = utils.card.byId.getData({ cardPublicId });

      utils.card.byId.setData({ cardPublicId }, (oldCard) => {
        if (!oldCard) return oldCard;

        return { ...oldCard, priority: update.priority ?? null };
      });

      return { previousCard };
    },
    onError: (_error, _update, context) => {
      utils.card.byId.setData({ cardPublicId }, context?.previousCard);
      showPopup({
        header: t`Unable to update priority`,
        message: t`Please try again later, or contact customer support.`,
        icon: "error",
      });
    },
    onSettled: async () => {
      await invalidateCard(utils, cardPublicId);
      await utils.board.byId.invalidate();
    },
  });

  const items = cardPriorities.map((value) => ({
    key: value,
    value: getPriorityLabel(value),
    selected: priority === value,
    leftIcon: <PriorityIcon priority={value} />,
  }));

  if (isLoading)
    return (
      <div className="flex w-full">
        <div className="h-full w-[150px] animate-pulse rounded-[5px] bg-light-300 dark:bg-dark-300" />
      </div>
    );

  return (
    <CheckboxDropdown
      items={items}
      handleSelect={(_, item) => {
        // Selecting the active priority clears it — there is no explicit "None" option.
        const next = item.key as CardPriority;
        updatePriority.mutate({
          cardPublicId,
          priority: priority === next ? null : next,
        });
      }}
      disabled={disabled}
      asChild
    >
      {priority ? (
        <div className="flex flex-wrap gap-x-0.5">
          <Badge
            value={getPriorityLabel(priority)}
            iconLeft={<PriorityIcon priority={priority} />}
            className={getPriorityBadgeClassName(priority)}
          />
        </div>
      ) : (
        <div
          className={`flex h-full w-full items-center rounded-[5px] border-[1px] border-light-50 pl-2 text-left text-sm text-neutral-900 dark:border-dark-50 dark:text-dark-1000 ${disabled ? "cursor-not-allowed opacity-60" : "hover:border-light-300 hover:bg-light-200 dark:hover:border-dark-200 dark:hover:bg-dark-100"}`}
        >
          <HiMiniPlus size={22} className="pr-2" />
          {t`Add priority`}
        </div>
      )}
    </CheckboxDropdown>
  );
}
