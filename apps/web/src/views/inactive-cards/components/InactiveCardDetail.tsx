import { t } from "@lingui/core/macro";
import { format, formatDistanceToNow } from "date-fns";
import {
  HiArrowUturnLeft,
  HiOutlineArrowTopRightOnSquare,
  HiOutlineArchiveBox,
  HiOutlineTrash,
} from "react-icons/hi2";

import Avatar from "~/components/Avatar";
import Button from "~/components/Button";
import Editor from "~/components/Editor";
import LabelIcon from "~/components/LabelIcon";
import {
  getPriorityBadgeClassName,
  getPriorityLabel,
  PriorityIcon,
} from "~/components/Priority";
import { useLocalisation } from "~/hooks/useLocalisation";
import { usePermissions } from "~/hooks/usePermissions";
import { usePopup } from "~/providers/popup";
import { useWorkspace } from "~/providers/workspace";
import { api } from "~/utils/api";
import { formatMemberDisplayName, getAvatarUrl } from "~/utils/helpers";
import ActivityList from "~/views/card/components/ActivityList";
import { AttachmentThumbnails } from "~/views/card/components/AttachmentThumbnails";
import Checklists from "~/views/card/components/Checklists";
import SubWorkItems from "~/views/card/components/SubWorkItems";

interface InactiveCardDetailProps {
  cardPublicId: string;
  variant: "archived" | "deleted";
  boardPublicId: string;
  stateAt: Date | null;
  by: { name: string | null; email: string; image: string | null } | null;
}

export function InactiveCardDetail({
  cardPublicId,
  variant,
  boardPublicId,
  stateAt,
  by,
}: InactiveCardDetailProps) {
  const isArchived = variant === "archived";
  const utils = api.useUtils();
  const { showPopup } = usePopup();
  const { dateLocale } = useLocalisation();
  const { workspace } = useWorkspace();
  const { canEditCard, canDeleteCard } = usePermissions();

  const { data: card, isLoading } = api.card.inactiveById.useQuery(
    { cardPublicId },
    { enabled: cardPublicId.length >= 12 },
  );

  const refresh = async () => {
    await Promise.all([
      utils.card.getArchived.invalidate({ boardPublicId }),
      utils.card.getDeleted.invalidate({ boardPublicId }),
      utils.card.inactiveById.invalidate({ cardPublicId }),
      utils.card.byId.invalidate({ cardPublicId }),
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
    onSuccess: () => {
      showPopup({
        header: t`Card unarchived`,
        message: t`The card is back on the board.`,
        icon: "success",
      });
    },
    onSettled: refresh,
  });

  const restoreCard = api.card.restore.useMutation({
    onError: onRestoreError,
    onSuccess: () => {
      showPopup({
        header: t`Card restored`,
        message: t`The card is back on the board.`,
        icon: "success",
      });
    },
    onSettled: refresh,
  });

  const mutation = isArchived ? unarchiveCard : restoreCard;
  const canRestore = isArchived ? canEditCard : canDeleteCard;

  if (isLoading || !card) {
    return (
      <div className="mx-auto w-full max-w-[800px] space-y-4 p-6 md:p-8">
        <div className="h-8 w-2/3 animate-pulse rounded-md bg-light-200 dark:bg-dark-300" />
        <div className="h-24 w-full animate-pulse rounded-md bg-light-200 dark:bg-dark-300" />
        <div className="h-40 w-full animate-pulse rounded-md bg-light-200 dark:bg-dark-300" />
      </div>
    );
  }

  const boardWorkspace = card.list.board.workspace;
  const ticketNumber =
    card.cardNumber != null && boardWorkspace.cardPrefix
      ? `${boardWorkspace.cardPrefix}-${card.cardNumber}`
      : null;

  const editorWorkspaceMembers = boardWorkspace.members
    .filter((member) => member.email)
    .map((member) => ({
      publicId: member.publicId,
      email: member.email,
      user: member.user
        ? {
            id: member.user.id,
            name: member.user.name ?? null,
            image: member.user.image ?? null,
          }
        : null,
    }));

  // Card members carry no avatar, so the image comes from the workspace member.
  const memberImages = new Map(
    boardWorkspace.members.map((member) => [member.publicId, member.user?.image]),
  );

  return (
    <div className="mx-auto w-full max-w-[800px] p-6 md:p-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-light-900 dark:text-dark-900">
          {isArchived ? (
            <HiOutlineArchiveBox className="h-4 w-4 shrink-0" />
          ) : (
            <HiOutlineTrash className="h-4 w-4 shrink-0" />
          )}
          <span>
            {isArchived ? t`Archived` : t`Deleted`}
            {stateAt
              ? ` ${formatDistanceToNow(new Date(stateAt), {
                  addSuffix: true,
                  locale: dateLocale,
                })}`
              : ""}
          </span>
          {by && (
            <>
              <span>·</span>
              <Avatar
                size="xs"
                name={by.name ?? ""}
                email={by.email}
                imageUrl={by.image ?? undefined}
              />
              <span>{by.name ?? by.email}</span>
            </>
          )}
          {ticketNumber && (
            <>
              <span>·</span>
              <span>{ticketNumber}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isArchived && (
            <Button
              variant="secondary"
              size="sm"
              href={`/cards/${cardPublicId}`}
              iconLeft={<HiOutlineArrowTopRightOnSquare className="h-4 w-4" />}
            >
              {t`Open card`}
            </Button>
          )}
          <Button
            size="sm"
            disabled={!canRestore || mutation.isPending}
            isLoading={mutation.isPending}
            iconLeft={<HiArrowUturnLeft className="h-4 w-4" />}
            onClick={() => mutation.mutate({ cardPublicId })}
          >
            {isArchived ? t`Unarchive` : t`Restore`}
          </Button>
        </div>
      </div>

      <h1 className="mb-6 text-[1.2rem] font-bold leading-relaxed text-neutral-900 dark:text-dark-1000">
        {card.title}
      </h1>

      <dl className="mb-8 grid grid-cols-[100px_1fr] gap-y-3 text-sm">
        <dt className="font-medium text-light-900 dark:text-dark-900">{t`List`}</dt>
        <dd className="text-neutral-900 dark:text-dark-1000">
          {card.list.name}
        </dd>

        <dt className="font-medium text-light-900 dark:text-dark-900">{t`Labels`}</dt>
        <dd className="flex flex-wrap items-center gap-2">
          {card.labels.length === 0 ? (
            <span className="text-light-900 dark:text-dark-900">{t`None`}</span>
          ) : (
            card.labels.map((label) => (
              <span
                key={label.publicId}
                className="inline-flex items-center gap-1.5 text-neutral-900 dark:text-dark-1000"
              >
                <LabelIcon colourCode={label.colourCode} />
                {label.name}
              </span>
            ))
          )}
        </dd>

        <dt className="font-medium text-light-900 dark:text-dark-900">{t`Members`}</dt>
        <dd className="flex flex-wrap items-center gap-2">
          {card.members.length === 0 ? (
            <span className="text-light-900 dark:text-dark-900">{t`None`}</span>
          ) : (
            card.members.map((member) => {
              const image = memberImages.get(member.publicId);

              return (
                <span
                  key={member.publicId}
                  className="inline-flex items-center gap-1.5 text-neutral-900 dark:text-dark-1000"
                >
                  <Avatar
                    size="xs"
                    name={member.user?.name ?? ""}
                    email={member.email}
                    imageUrl={image ? getAvatarUrl(image) : undefined}
                  />
                  {formatMemberDisplayName(
                    member.user?.name ?? null,
                    member.email,
                  )}
                </span>
              );
            })
          )}
        </dd>

        <dt className="font-medium text-light-900 dark:text-dark-900">{t`Priority`}</dt>
        <dd>
          {card.priority ? (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${getPriorityBadgeClassName(card.priority)}`}
            >
              <PriorityIcon priority={card.priority} />
              {getPriorityLabel(card.priority)}
            </span>
          ) : (
            <span className="text-light-900 dark:text-dark-900">{t`None`}</span>
          )}
        </dd>

        <dt className="font-medium text-light-900 dark:text-dark-900">{t`Due date`}</dt>
        <dd className="text-neutral-900 dark:text-dark-1000">
          {card.dueDate ? (
            format(new Date(card.dueDate), "d MMM yyyy", { locale: dateLocale })
          ) : (
            <span className="text-light-900 dark:text-dark-900">{t`None`}</span>
          )}
        </dd>
      </dl>

      <div className="mb-10">
        <Editor
          content={card.description}
          workspaceMembers={editorWorkspaceMembers}
          workspacePublicId={workspace.publicId}
          readOnly
        />
      </div>

      <Checklists
        checklists={card.checklists}
        cardPublicId={cardPublicId}
        viewOnly
      />

      <SubWorkItems
        cardPublicId={cardPublicId}
        viewOnly
        includeDeleted={!isArchived}
      />

      {card.attachments.length > 0 && (
        <div className="mt-6">
          <AttachmentThumbnails
            attachments={card.attachments}
            cardPublicId={cardPublicId}
            isReadOnly
          />
        </div>
      )}

      <div className="mt-12 border-t-[1px] border-light-300 pt-12 dark:border-dark-300">
        <h2 className="text-md pb-4 font-medium text-light-1000 dark:text-dark-1000">
          {t`Activity`}
        </h2>
        <ActivityList
          cardPublicId={cardPublicId}
          isLoading={isLoading}
          isViewOnly
          includeDeleted={!isArchived}
        />
      </div>
    </div>
  );
}
