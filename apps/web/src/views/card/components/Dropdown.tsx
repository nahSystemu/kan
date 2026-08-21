import { t } from "@lingui/core/macro";
import {
  HiArrowUturnLeft,
  HiEllipsisHorizontal,
  HiHashtag,
  HiLink,
  HiOutlineArchiveBox,
  HiOutlineCheckCircle,
  HiOutlineDocumentDuplicate,
  HiOutlineTrash,
} from "react-icons/hi2";

import { authClient } from "@kan/auth/client";

import Dropdown from "~/components/Dropdown";
import { usePermissions } from "~/hooks/usePermissions";
import { useModal } from "~/providers/modal";
import { usePopup } from "~/providers/popup";
import { api } from "~/utils/api";

export default function CardDropdown({
  cardPublicId,
  isTemplate,
  boardPublicId,
  cardCreatedBy,
  ticketNumber,
  listPublicId,
  cardIndex,
  isArchived,
}: {
  cardPublicId: string;
  isTemplate?: boolean;
  boardPublicId?: string;
  cardCreatedBy?: string | null;
  ticketNumber?: string | null;
  listPublicId?: string;
  cardIndex?: number;
  isArchived?: boolean;
}) {
  const { openModal } = useModal();
  const { showPopup } = usePopup();
  const { canEditCard, canDeleteCard } = usePermissions();
  const { data: session } = authClient.useSession();
  const utils = api.useUtils();
  const isCreator = cardCreatedBy && session?.user.id === cardCreatedBy;

  const duplicateCard = api.card.duplicate.useMutation({
    onSuccess: () => {
      showPopup({
        header: t`Card duplicated`,
        icon: "success",
        message: t`Card duplicated successfully.`,
      });
    },
    onError: () => {
      showPopup({
        header: t`Unable to duplicate card`,
        icon: "error",
        message: t`Please try again.`,
      });
    },
    onSettled: async () => {
      await utils.board.byId.invalidate();
    },
  });

  const invalidateArchiveState = async () => {
    await Promise.all([
      utils.card.byId.invalidate({ cardPublicId }),
      utils.board.byId.invalidate(),
      utils.card.getArchived.invalidate(),
    ]);
  };

  const archiveCard = api.card.archive.useMutation({
    onSuccess: () => {
      showPopup({
        header: t`Card archived`,
        icon: "success",
        message: t`The card has been moved to the archive.`,
      });
    },
    onError: () => {
      showPopup({
        header: t`Unable to archive card`,
        icon: "error",
        message: t`Please try again.`,
      });
    },
    onSettled: invalidateArchiveState,
  });

  const unarchiveCard = api.card.unarchive.useMutation({
    onSuccess: () => {
      showPopup({
        header: t`Card unarchived`,
        icon: "success",
        message: t`The card is back on the board.`,
      });
    },
    onError: () => {
      showPopup({
        header: t`Unable to unarchive card`,
        icon: "error",
        message: t`Please try again.`,
      });
    },
    onSettled: invalidateArchiveState,
  });

  const handleCopyCardLink = async () => {
    const path =
      isTemplate && boardPublicId
        ? `/templates/${boardPublicId}/cards/${cardPublicId}`
        : `/cards/${cardPublicId}`;
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      showPopup({
        header: t`Link copied`,
        icon: "success",
        message: t`Card URL copied to clipboard`,
      });
    } catch (error) {
      console.error(error);
      showPopup({
        header: t`Unable to copy link`,
        icon: "error",
        message: t`Please try again.`,
      });
    }
  };

  const handleCopyTicketId = async () => {
    if (!ticketNumber) return;
    try {
      await navigator.clipboard.writeText(ticketNumber);
      showPopup({
        header: t`ID copied`,
        icon: "success",
        message: t`Ticket ID copied to clipboard`,
      });
    } catch (error) {
      console.error(error);
      showPopup({
        header: t`Unable to copy ID`,
        icon: "error",
        message: t`Please try again.`,
      });
    }
  };

  const items = [
    {
      label: t`Copy card link`,
      action: handleCopyCardLink,
      icon: <HiLink className="h-[16px] w-[16px] text-dark-900" />,
    },
    ...(ticketNumber
      ? [
          {
            label: t`Copy ticket ID`,
            action: handleCopyTicketId,
            icon: <HiHashtag className="h-[16px] w-[16px] text-dark-900" />,
          },
        ]
      : []),
    ...(canEditCard
      ? [
          {
            label: t`Add checklist`,
            action: () => openModal("ADD_CHECKLIST"),
            icon: (
              <HiOutlineCheckCircle className="h-[16px] w-[16px] text-dark-900" />
            ),
          },
          {
            label: t`Duplicate card`,
            action: () => {
              if (!listPublicId || cardIndex === undefined) return;
              duplicateCard.mutate({
                cardPublicId,
                listPublicId,
                index: cardIndex + 1,
                copyLabels: true,
                copyMembers: true,
                copyChecklists: true,
              });
            },
            icon: (
              <HiOutlineDocumentDuplicate className="h-[16px] w-[16px] text-dark-900" />
            ),
            disabled: duplicateCard.isPending || !listPublicId,
          },
          {
            label: isArchived ? t`Unarchive card` : t`Archive card`,
            action: () => {
              if (isArchived) unarchiveCard.mutate({ cardPublicId });
              else archiveCard.mutate({ cardPublicId });
            },
            icon: isArchived ? (
              <HiArrowUturnLeft className="h-[16px] w-[16px] text-dark-900" />
            ) : (
              <HiOutlineArchiveBox className="h-[16px] w-[16px] text-dark-900" />
            ),
            disabled: archiveCard.isPending || unarchiveCard.isPending,
          },
        ]
      : []),
    ...(canDeleteCard || isCreator
      ? [
          {
            label: t`Delete card`,
            action: () => openModal("DELETE_CARD"),
            icon: (
              <HiOutlineTrash className="h-[16px] w-[16px] text-dark-900" />
            ),
          },
        ]
      : []),
  ];

  if (items.length === 0) {
    return null;
  }

  return (
    <Dropdown items={items}>
      <HiEllipsisHorizontal className="h-5 w-5 text-dark-900" />
    </Dropdown>
  );
}
