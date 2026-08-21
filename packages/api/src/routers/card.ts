import { on } from "events";
import { tracked, TRPCError } from "@trpc/server";
import { z } from "zod";

import type { CardPriority } from "@kan/db/schema";
import * as boardRepo from "@kan/db/repository/board.repo";
import * as cardRepo from "@kan/db/repository/card.repo";
import * as cardActivityRepo from "@kan/db/repository/cardActivity.repo";
import * as cardCommentRepo from "@kan/db/repository/cardComment.repo";
import * as cardLinkRepo from "@kan/db/repository/cardLink.repo";
import * as checklistRepo from "@kan/db/repository/checklist.repo";
import * as labelRepo from "@kan/db/repository/label.repo";
import * as listRepo from "@kan/db/repository/list.repo";
import * as workspaceRepo from "@kan/db/repository/workspace.repo";
import { cardLinkTypes, cardPriorities } from "@kan/db/schema";
import { generateAttachmentUrl, generateAvatarUrl } from "@kan/shared/utils";

import { cardTopic, emitBoardEvent, emitCardEvent, eventBus } from "../events";
import {
  activityItemSchema,
  cardCreateResponseSchema,
  cardDetailSchema,
  cardLinkSchema,
  cardUpdateResponseSchema,
  commentDeleteResponseSchema,
  commentResponseSchema,
  inactiveCardSchema,
} from "../schemas";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { mergeActivities } from "../utils/activities";
import { assertUserInWorkspace } from "../utils/auth";
import { sendMentionEmails } from "../utils/notifications";
import {
  assertCanDelete,
  assertCanEdit,
  assertPermission,
} from "../utils/permissions";
import {
  createCardWebhookPayload,
  sendWebhooksForWorkspace,
} from "../utils/webhook";

type InactiveCard = Awaited<
  ReturnType<typeof cardRepo.getArchivedByBoardId>
>[number];

const formatInactiveCard = (card: InactiveCard) => ({
  publicId: card.publicId,
  title: card.title,
  cardNumber: card.cardNumber,
  priority: card.priority,
  stateAt: card.stateAt,
  list: {
    publicId: card.listPublicId,
    name: card.listName,
    isDeleted: card.listDeletedAt !== null,
  },
  by: card.byEmail
    ? { name: card.byName, email: card.byEmail, image: card.byImage }
    : null,
});

/**
 * A card is restored into the list it came from, unless that list has since been
 * deleted, in which case it falls back to the first remaining list on the board.
 */
const resolveTargetList = async (
  db: Parameters<typeof listRepo.getById>[0],
  listId: number,
) => {
  const originalList = await listRepo.getById(db, listId);

  if (!originalList) return null;
  if (!originalList.deletedAt) return originalList;

  const fallback = await listRepo.getFirstActiveByBoardId(
    db,
    originalList.boardId,
  );

  return fallback ? { ...fallback, boardId: originalList.boardId } : null;
};

export const cardRouter = createTRPCRouter({
  boardIdByCardPublicId: publicProcedure
    .meta({
      openapi: {
        summary: "Get board public ID by card public ID",
        method: "GET",
        path: "/cards/{cardPublicId}/board",
        description:
          "Resolves the board public ID for a given card public ID, including when the card is soft-deleted",
        tags: ["Cards"],
      },
    })
    .input(z.object({ cardPublicId: z.string().min(12) }))
    .output(z.object({ boardPublicId: z.string().min(12) }).nullable())
    .query(async ({ ctx, input }) => {
      const boardPublicId = await cardRepo.getBoardPublicIdByCardPublicId(
        ctx.db,
        input.cardPublicId,
      );
      return boardPublicId ? { boardPublicId } : null;
    }),
  events: protectedProcedure
    .meta({
      openapi: {
        enabled: false,
        method: "GET",
        path: "/cards/{cardPublicId}/events",
      },
    })
    .input(
      z.object({
        cardPublicId: z.string().min(12),
        lastEventId: z.string().nullish().optional(),
      }),
    )
    .subscription(async function* ({ ctx, input, signal }) {
      const userId = ctx.user?.id;
      if (!userId)
        throw new TRPCError({
          message: `User not authenticated`,
          code: "UNAUTHORIZED",
        });

      const card = await cardRepo.getWorkspaceAndCardIdByCardPublicId(
        ctx.db,
        input.cardPublicId,
      );

      if (!card)
        throw new TRPCError({
          message: `Card with public ID ${input.cardPublicId} not found`,
          code: "NOT_FOUND",
        });

      await assertUserInWorkspace(ctx.db, userId, card.workspaceId);

      for await (const [data] of on(eventBus, cardTopic(card.id), { signal })) {
        const id = Date.now().toString();
        yield tracked(id, data as unknown);
      }
    }),
  create: protectedProcedure
    .meta({
      openapi: {
        summary: "Create a card",
        method: "POST",
        path: "/cards",
        description: "Creates a new card for a given list",
        tags: ["Cards"],
        protect: true,
      },
    })
    .input(
      z.object({
        title: z.string().min(1).max(2000),
        description: z.string().max(10000),
        listPublicId: z.string().min(12),
        labelPublicIds: z.array(z.string().min(12)),
        memberPublicIds: z.array(z.string().min(12)),
        position: z.enum(["start", "end"]),
        dueDate: z.date().nullable().optional(),
        priority: z.enum(cardPriorities).nullable().optional(),
      }),
    )
    .output(cardCreateResponseSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: `User not authenticated`,
          code: "UNAUTHORIZED",
        });

      const list = await listRepo.getWorkspaceAndListIdByListPublicId(
        ctx.db,
        input.listPublicId,
      );

      if (!list)
        throw new TRPCError({
          message: `List with public ID ${input.listPublicId} not found`,
          code: "NOT_FOUND",
        });

      await assertPermission(ctx.db, userId, list.workspaceId, "card:create");

      const newCard = await cardRepo.create(ctx.db, {
        title: input.title,
        description: input.description,
        createdBy: userId,
        listId: list.id,
        workspaceId: list.workspaceId,
        position: input.position,
        dueDate: input.dueDate ?? null,
        priority: input.priority ?? null,
      });

      const newCardId = newCard.id;

      if (!newCardId)
        throw new TRPCError({
          message: `Failed to create card`,
          code: "INTERNAL_SERVER_ERROR",
        });

      // Emit board-level event for card creation
      const listDetails = await listRepo.getByPublicId(
        ctx.db,
        input.listPublicId,
      );
      if (listDetails) {
        const maybePublicId = (newCard as { publicId?: string }).publicId;
        emitBoardEvent(listDetails.boardId, {
          scope: "board",
          type: "card.created",
          boardId: listDetails.boardId,
          cardPublicId: maybePublicId ?? "",
        });
      }

      if (newCardId && input.labelPublicIds.length) {
        const labels = await labelRepo.getAllByPublicIds(
          ctx.db,
          input.labelPublicIds,
        );

        if (!labels.length)
          throw new TRPCError({
            message: `Labels with public IDs (${input.labelPublicIds.join(", ")}) not found`,
            code: "NOT_FOUND",
          });

        const labelsInsert = labels.map((label) => ({
          cardId: newCardId,
          labelId: label.id,
        }));

        const cardLabels = await cardRepo.bulkCreateCardLabelRelationships(
          ctx.db,
          labelsInsert,
        );

        if (!cardLabels.length)
          throw new TRPCError({
            message: `Failed to create card label relationships`,
            code: "INTERNAL_SERVER_ERROR",
          });

        const cardActivitesInsert = cardLabels.map((cardLabel) => ({
          type: "card.updated.label.added" as const,
          cardId: cardLabel.cardId,
          labelId: cardLabel.labelId,
          createdBy: userId,
        }));

        await cardActivityRepo.bulkCreate(ctx.db, cardActivitesInsert);
      }

      if (newCardId && input.memberPublicIds.length) {
        const members = await workspaceRepo.getAllMembersByPublicIds(
          ctx.db,
          input.memberPublicIds,
        );

        if (!members.length)
          throw new TRPCError({
            message: `Members with public IDs (${input.memberPublicIds.join(", ")}) not found`,
            code: "NOT_FOUND",
          });

        const membersInsert = members.map((member) => ({
          cardId: newCardId,
          workspaceMemberId: member.id,
        }));

        const cardMembers =
          await cardRepo.bulkCreateCardWorkspaceMemberRelationships(
            ctx.db,
            membersInsert,
          );

        if (!cardMembers.length)
          throw new TRPCError({
            message: `Failed to create card member relationships`,
            code: "INTERNAL_SERVER_ERROR",
          });

        const cardActivitesInsert = cardMembers.map((cardMember) => ({
          type: "card.updated.member.added" as const,
          cardId: cardMember.cardId,
          workspaceMemberId: cardMember.workspaceMemberId,
          createdBy: userId,
        }));

        await cardActivityRepo.bulkCreate(ctx.db, cardActivitesInsert);
      }

      if (input.description) {
        sendMentionEmails({
          db: ctx.db,
          cardPublicId: newCard.publicId,
          commentHtml: input.description,
          commenterUserId: userId,
        }).catch((error) => {
          console.error("Failed to send mention emails:", error);
        });
      }

      // Fire webhooks (non-blocking)
      sendWebhooksForWorkspace(
        ctx.db,
        list.workspaceId,
        createCardWebhookPayload(
          "card.created",
          {
            id: String(newCard.id),
            publicId: newCard.publicId,
            title: input.title,
            description: input.description,
            dueDate: input.dueDate ?? null,
            priority: input.priority ?? null,
            listId: list.publicId,
          },
          {
            boardId: list.boardPublicId,
            boardName: list.boardName,
            listName: list.name,
            user: ctx.user
              ? { id: ctx.user.id, name: ctx.user.name }
              : undefined,
          },
        ),
      ).catch((error) => {
        console.error("Webhook delivery failed:", error);
      });

      return newCard;
    }),
  addComment: protectedProcedure
    .meta({
      openapi: {
        summary: "Add a comment to a card",
        method: "POST",
        path: "/cards/{cardPublicId}/comments",
        description: "Adds a comment to a card",
        tags: ["Cards"],
        protect: true,
      },
    })
    .input(
      z.object({
        cardPublicId: z.string().min(12),
        comment: z.string().min(1),
      }),
    )
    .output(commentResponseSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: `User not authenticated`,
          code: "UNAUTHORIZED",
        });

      const card = await cardRepo.getWorkspaceAndCardIdByCardPublicId(
        ctx.db,
        input.cardPublicId,
      );

      if (!card)
        throw new TRPCError({
          message: `Card with public ID ${input.cardPublicId} not found`,
          code: "NOT_FOUND",
        });

      await assertPermission(
        ctx.db,
        userId,
        card.workspaceId,
        "comment:create",
      );

      const newComment = await cardCommentRepo.create(ctx.db, {
        comment: input.comment,
        createdBy: userId,
        cardId: card.id,
      });

      if (!newComment?.id)
        throw new TRPCError({
          message: `Failed to create comment`,
          code: "INTERNAL_SERVER_ERROR",
        });

      await cardActivityRepo.create(ctx.db, {
        type: "card.updated.comment.added" as const,
        cardId: card.id,
        commentId: newComment.id,
        toComment: newComment.comment,
        createdBy: userId,
      });

      sendMentionEmails({
        db: ctx.db,
        cardPublicId: input.cardPublicId,
        commentHtml: input.comment,
        commenterUserId: userId,
        commentId: newComment.id,
      }).catch((error) => {
        console.error("Failed to send mention emails:", error);
      });

      // Emit card-level event
      emitCardEvent(card.id, {
        scope: "card",
        type: "comment.added",
        cardId: card.id,
        cardPublicId: input.cardPublicId,
        commentPublicId: newComment.publicId,
        comment: newComment.comment,
      });

      return newComment;
    }),
  updateComment: protectedProcedure
    .meta({
      openapi: {
        summary: "Update a comment",
        method: "PUT",
        path: "/cards/{cardPublicId}/comments/{commentPublicId}",
        description: "Updates a comment",
        tags: ["Cards"],
        protect: true,
      },
    })
    .input(
      z.object({
        cardPublicId: z.string().min(12),
        commentPublicId: z.string().min(12),
        comment: z.string().min(1),
      }),
    )
    .output(commentResponseSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: `User not authenticated`,
          code: "UNAUTHORIZED",
        });

      const card = await cardRepo.getWorkspaceAndCardIdByCardPublicId(
        ctx.db,
        input.cardPublicId,
      );

      if (!card)
        throw new TRPCError({
          message: `Card with public ID ${input.cardPublicId} not found`,
          code: "NOT_FOUND",
        });

      const existingComment = await cardCommentRepo.getByPublicId(
        ctx.db,
        input.commentPublicId,
      );

      if (!existingComment || existingComment.cardId !== card.id)
        throw new TRPCError({
          message: `Comment with public ID ${input.commentPublicId} not found`,
          code: "NOT_FOUND",
        });

      await assertCanEdit(
        ctx.db,
        userId,
        card.workspaceId,
        "comment:edit",
        existingComment.createdBy,
      );

      const updatedComment = await cardCommentRepo.update(ctx.db, {
        id: existingComment.id,
        comment: input.comment,
      });

      if (!updatedComment?.id)
        throw new TRPCError({
          message: `Failed to update comment`,
          code: "INTERNAL_SERVER_ERROR",
        });

      await cardActivityRepo.create(ctx.db, {
        type: "card.updated.comment.updated" as const,
        cardId: card.id,
        commentId: updatedComment.id,
        fromComment: existingComment.comment,
        toComment: updatedComment.comment,
        createdBy: userId,
      });

      sendMentionEmails({
        db: ctx.db,
        cardPublicId: input.cardPublicId,
        commentHtml: input.comment,
        commenterUserId: userId,
        commentId: updatedComment.id,
      }).catch((error) => {
        console.error("Failed to send mention emails:", error);
      });

      // Emit card-level event
      emitCardEvent(card.id, {
        scope: "card",
        type: "comment.updated",
        cardId: card.id,
        cardPublicId: input.cardPublicId,
        commentPublicId: updatedComment.publicId,
        comment: updatedComment.comment,
      });

      return updatedComment;
    }),
  deleteComment: protectedProcedure
    .meta({
      openapi: {
        summary: "Delete a comment",
        method: "DELETE",
        path: "/cards/{cardPublicId}/comments/{commentPublicId}",
        description: "Deletes a comment",
        tags: ["Cards"],
      },
    })
    .input(
      z.object({
        cardPublicId: z.string().min(12),
        commentPublicId: z.string().min(12),
      }),
    )
    .output(commentDeleteResponseSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: `User not authenticated`,
          code: "UNAUTHORIZED",
        });

      const card = await cardRepo.getWorkspaceAndCardIdByCardPublicId(
        ctx.db,
        input.cardPublicId,
      );

      if (!card)
        throw new TRPCError({
          message: `Card with public ID ${input.cardPublicId} not found`,
          code: "NOT_FOUND",
        });

      const existingComment = await cardCommentRepo.getByPublicId(
        ctx.db,
        input.commentPublicId,
      );

      if (!existingComment || existingComment.cardId !== card.id)
        throw new TRPCError({
          message: `Comment with public ID ${input.commentPublicId} not found`,
          code: "NOT_FOUND",
        });

      await assertCanDelete(
        ctx.db,
        userId,
        card.workspaceId,
        "comment:delete",
        existingComment.createdBy,
      );

      const deletedComment = await cardCommentRepo.softDelete(ctx.db, {
        commentId: existingComment.id,
        deletedAt: new Date(),
        deletedBy: userId,
      });

      if (!deletedComment)
        throw new TRPCError({
          message: `Failed to delete comment`,
          code: "INTERNAL_SERVER_ERROR",
        });

      await cardActivityRepo.create(ctx.db, {
        type: "card.updated.comment.deleted" as const,
        cardId: card.id,
        commentId: existingComment.id,
        createdBy: userId,
      });

      emitCardEvent(card.id, {
        scope: "card",
        type: "comment.deleted",
        cardId: card.id,
        cardPublicId: input.cardPublicId,
        commentPublicId: existingComment.publicId,
      });

      return { publicId: input.commentPublicId };
    }),
  addOrRemoveLabel: protectedProcedure
    .meta({
      openapi: {
        summary: "Add or remove a label from a card",
        method: "PUT",
        path: "/cards/{cardPublicId}/labels/{labelPublicId}",
        description: "Adds or removes a label from a card",
        tags: ["Cards"],
        protect: true,
      },
    })
    .input(
      z.object({
        cardPublicId: z.string().min(12),
        labelPublicId: z.string().min(12),
      }),
    )
    .output(z.object({ newLabel: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: `User not authenticated`,
          code: "UNAUTHORIZED",
        });

      const card = await cardRepo.getWorkspaceAndCardIdByCardPublicId(
        ctx.db,
        input.cardPublicId,
      );

      if (!card)
        throw new TRPCError({
          message: `Card with public ID ${input.cardPublicId} not found`,
          code: "NOT_FOUND",
        });

      await assertPermission(ctx.db, userId, card.workspaceId, "card:edit");

      const label = await labelRepo.getByPublicId(ctx.db, input.labelPublicId);

      if (!label)
        throw new TRPCError({
          message: `Label with public ID ${input.labelPublicId} not found`,
          code: "NOT_FOUND",
        });

      const cardLabelIds = { cardId: card.id, labelId: label.id };

      const existingLabel = await cardRepo.getCardLabelRelationship(
        ctx.db,
        cardLabelIds,
      );

      if (existingLabel) {
        const deletedCardLabelRelationship =
          await cardRepo.hardDeleteCardLabelRelationship(ctx.db, cardLabelIds);

        if (!deletedCardLabelRelationship)
          throw new TRPCError({
            message: `Failed to remove label from card`,
            code: "INTERNAL_SERVER_ERROR",
          });

        await cardActivityRepo.create(ctx.db, {
          type: "card.updated.label.removed" as const,
          cardId: card.id,
          labelId: label.id,
          createdBy: userId,
        });

        {
          emitCardEvent(card.id, {
            scope: "card",
            type: "label.removed",
            cardId: card.id,
            cardPublicId: input.cardPublicId,
            labelPublicId: input.labelPublicId,
          });
        }

        // Emit board-level card.updated to reflect label change on board UI
        {
          const boardId = await cardRepo.getBoardIdByCardId(ctx.db, card.id);
          if (boardId !== null) {
            emitBoardEvent(boardId, {
              scope: "board",
              type: "card.updated",
              boardId,
              cardPublicId: input.cardPublicId,
              changes: {},
            });
          }
        }

        return { newLabel: false };
      }

      const newCardLabelRelationship =
        await cardRepo.createCardLabelRelationship(ctx.db, cardLabelIds);

      if (!newCardLabelRelationship)
        throw new TRPCError({
          message: `Failed to add label to card`,
          code: "INTERNAL_SERVER_ERROR",
        });

      await cardActivityRepo.create(ctx.db, {
        type: "card.updated.label.added" as const,
        cardId: card.id,
        labelId: label.id,
        createdBy: userId,
      });

      {
        emitCardEvent(card.id, {
          scope: "card",
          type: "label.added",
          cardId: card.id,
          cardPublicId: input.cardPublicId,
          labelPublicId: input.labelPublicId,
        });
      }

      // Emit board-level card.updated to reflect label change on board UI
      {
        const boardId = await cardRepo.getBoardIdByCardId(ctx.db, card.id);
        if (boardId !== null) {
          emitBoardEvent(boardId, {
            scope: "board",
            type: "card.updated",
            boardId,
            cardPublicId: input.cardPublicId,
            changes: {},
          });
        }
      }

      return { newLabel: true };
    }),
  addOrRemoveMember: protectedProcedure
    .meta({
      openapi: {
        summary: "Add or remove a member from a card",
        method: "PUT",
        path: "/cards/{cardPublicId}/members/{workspaceMemberPublicId}",
        description: "Adds or removes a member from a card",
        tags: ["Cards"],
      },
    })
    .input(
      z.object({
        cardPublicId: z.string().min(12),
        workspaceMemberPublicId: z.string().min(12),
      }),
    )
    .output(z.object({ newMember: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: `User not authenticated`,
          code: "UNAUTHORIZED",
        });

      const card = await cardRepo.getWorkspaceAndCardIdByCardPublicId(
        ctx.db,
        input.cardPublicId,
      );

      if (!card)
        throw new TRPCError({
          message: `Card with public ID ${input.cardPublicId} not found`,
          code: "NOT_FOUND",
        });

      await assertPermission(ctx.db, userId, card.workspaceId, "card:edit");

      const member = await workspaceRepo.getMemberByPublicId(
        ctx.db,
        input.workspaceMemberPublicId,
      );

      if (!member)
        throw new TRPCError({
          message: `Member with public ID ${input.workspaceMemberPublicId} not found`,
          code: "NOT_FOUND",
        });

      const cardMemberIds = { cardId: card.id, memberId: member.id };

      const existingMember = await cardRepo.getCardMemberRelationship(
        ctx.db,
        cardMemberIds,
      );

      if (existingMember) {
        const deletedCardMemberRelationship =
          await cardRepo.hardDeleteCardMemberRelationship(
            ctx.db,
            cardMemberIds,
          );

        if (!deletedCardMemberRelationship.success)
          throw new TRPCError({
            message: `Failed to remove member from card`,
            code: "INTERNAL_SERVER_ERROR",
          });

        await cardActivityRepo.create(ctx.db, {
          type: "card.updated.member.removed" as const,
          cardId: card.id,
          workspaceMemberId: member.id,
          createdBy: userId,
        });

        {
          emitCardEvent(card.id, {
            scope: "card",
            type: "member.removed",
            cardId: card.id,
            cardPublicId: input.cardPublicId,
            workspaceMemberPublicId: input.workspaceMemberPublicId,
          });
        }

        // Emit board-level card.updated to reflect member change on board UI
        {
          const boardId = await cardRepo.getBoardIdByCardId(ctx.db, card.id);
          if (boardId !== null) {
            emitBoardEvent(boardId, {
              scope: "board",
              type: "card.updated",
              boardId,
              cardPublicId: input.cardPublicId,
              changes: {},
            });
          }
        }

        return { newMember: false };
      }

      const newCardMemberRelationship =
        await cardRepo.createCardMemberRelationship(ctx.db, cardMemberIds);

      if (!newCardMemberRelationship.success)
        throw new TRPCError({
          message: `Failed to add member to card`,
          code: "INTERNAL_SERVER_ERROR",
        });

      await cardActivityRepo.create(ctx.db, {
        type: "card.updated.member.added" as const,
        cardId: card.id,
        workspaceMemberId: member.id,
        createdBy: userId,
      });

      {
        emitCardEvent(card.id, {
          scope: "card",
          type: "member.added",
          cardId: card.id,
          cardPublicId: input.cardPublicId,
          workspaceMemberPublicId: input.workspaceMemberPublicId,
        });
      }

      // Emit board-level card.updated to reflect member change on board UI
      {
        const boardId = await cardRepo.getBoardIdByCardId(ctx.db, card.id);
        if (boardId !== null) {
          emitBoardEvent(boardId, {
            scope: "board",
            type: "card.updated",
            boardId,
            cardPublicId: input.cardPublicId,
            changes: {},
          });
        }
      }

      return { newMember: true };
    }),
  byId: publicProcedure
    .meta({
      openapi: {
        summary: "Get a card by public ID",
        method: "GET",
        path: "/cards/{cardPublicId}",
        description: "Retrieves a card by its public ID",
        tags: ["Cards"],
      },
    })
    .input(z.object({ cardPublicId: z.string().min(12) }))
    .output(cardDetailSchema)
    .query(async ({ ctx, input }) => {
      const card = await cardRepo.getWorkspaceAndCardIdByCardPublicId(
        ctx.db,
        input.cardPublicId,
      );

      if (!card)
        throw new TRPCError({
          message: `Card with public ID ${input.cardPublicId} not found`,
          code: "NOT_FOUND",
        });

      if (card.workspaceVisibility === "private") {
        const userId = ctx.user?.id;

        if (!userId)
          throw new TRPCError({
            message: `User not authenticated`,
            code: "UNAUTHORIZED",
          });

        await assertPermission(ctx.db, userId, card.workspaceId, "card:view");
      }

      const result = await cardRepo.getWithListAndMembersByPublicId(
        ctx.db,
        input.cardPublicId,
      );

      if (!result)
        throw new TRPCError({
          message: `Card with public ID ${input.cardPublicId} not found`,
          code: "NOT_FOUND",
        });

      // Generate URLs for all attachments
      const attachmentsWithUrls = await Promise.all(
        result.attachments.map(async (attachment) => {
          const url = await generateAttachmentUrl(attachment.s3Key);
          return {
            publicId: attachment.publicId,
            contentType: attachment.contentType,
            s3Key: attachment.s3Key,
            originalFilename: attachment.originalFilename,
            size: attachment.size,
            url,
          };
        }),
      );

      // Generate presigned URLs for workspace member avatars
      const workspaceWithAvatarUrls = result.list.board.workspace
        ? {
            ...result.list.board.workspace,
            members: await Promise.all(
              result.list.board.workspace.members.map(async (member) => {
                if (!member.user?.image) {
                  return member;
                }

                const avatarUrl = await generateAvatarUrl(member.user.image);
                return {
                  ...member,
                  user: {
                    ...member.user,
                    image: avatarUrl,
                  },
                };
              }),
            ),
          }
        : result.list.board.workspace;

      return {
        ...result,
        attachments: attachmentsWithUrls,
        list: {
          ...result.list,
          board: {
            ...result.list.board,
            workspace: workspaceWithAvatarUrls,
          },
        },
      };
    }),
  getActivities: publicProcedure
    .meta({
      openapi: {
        summary: "Get paginated card activities",
        method: "GET",
        path: "/cards/{cardPublicId}/activities",
        description:
          "Retrieves paginated activities for a card with merged frequent changes",
        tags: ["Cards"],
      },
    })
    .input(
      z.object({
        cardPublicId: z.string().min(12),
        limit: z.number().min(1).max(100).optional().default(10),
        cursor: z.string().datetime().optional(), // ISO datetime string
      }),
    )
    .output(
      z.object({
        activities: z.array(activityItemSchema),
        hasMore: z.boolean(),
        nextCursor: z.string().datetime().nullable(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const card = await cardRepo.getWorkspaceAndCardIdByCardPublicId(
        ctx.db,
        input.cardPublicId,
      );

      if (!card)
        throw new TRPCError({
          message: `Card with public ID ${input.cardPublicId} not found`,
          code: "NOT_FOUND",
        });

      if (card.workspaceVisibility === "private") {
        const userId = ctx.user?.id;

        if (!userId)
          throw new TRPCError({
            message: `User not authenticated`,
            code: "UNAUTHORIZED",
          });

        await assertPermission(ctx.db, userId, card.workspaceId, "card:view");
      }

      const cursor = input.cursor ? new Date(input.cursor) : undefined;
      const result = await cardActivityRepo.getPaginatedActivities(
        ctx.db,
        card.id,
        {
          limit: input.limit,
          cursor,
        },
      );

      // Generate presigned URLs for user avatars in activities
      const activitiesWithAvatarUrls = await Promise.all(
        result.activities.map(async (activity) => {
          const updatedActivity = { ...activity };

          // Generate presigned URL for activity user avatar
          if (activity.user?.image) {
            const userAvatarUrl = await generateAvatarUrl(activity.user.image);
            updatedActivity.user = {
              ...activity.user,
              image: userAvatarUrl,
            };
          }

          // Generate presigned URL for member user avatar (if exists)
          if (activity.member?.user?.image) {
            const memberAvatarUrl = await generateAvatarUrl(
              activity.member.user.image,
            );
            updatedActivity.member = {
              ...activity.member,
              user: {
                ...activity.member.user,
                image: memberAvatarUrl,
              },
            };
          }

          return updatedActivity;
        }),
      );

      const mergedActivities = mergeActivities(activitiesWithAvatarUrls);

      return {
        activities: mergedActivities,
        hasMore: result.hasMore,
        nextCursor: result.nextCursor?.toISOString() ?? null,
      };
    }),
  update: protectedProcedure
    .meta({
      openapi: {
        summary: "Update a card",
        method: "PUT",
        path: "/cards/{cardPublicId}",
        description: "Updates a card by its public ID",
        tags: ["Cards"],
        protect: true,
      },
    })
    .input(
      z.object({
        cardPublicId: z.string().min(12),
        title: z.string().min(1).max(2000).optional(),
        description: z.string().optional(),
        index: z.number().optional(),
        listPublicId: z.string().min(12).optional(),
        dueDate: z.date().nullable().optional(),
        priority: z.enum(cardPriorities).nullable().optional(),
      }),
    )
    .output(cardUpdateResponseSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: `User not authenticated`,
          code: "UNAUTHORIZED",
        });

      const card = await cardRepo.getWorkspaceAndCardIdByCardPublicId(
        ctx.db,
        input.cardPublicId,
      );

      if (!card)
        throw new TRPCError({
          message: `Card with public ID ${input.cardPublicId} not found`,
          code: "NOT_FOUND",
        });

      await assertCanEdit(
        ctx.db,
        userId,
        card.workspaceId,
        "card:edit",
        card.createdBy,
      );

      const existingCard = await cardRepo.getByPublicId(
        ctx.db,
        input.cardPublicId,
      );

      let newListId: number | undefined;
      let newList:
        | {
            id: number;
            publicId: string;
            name: string;
            boardId: number;
            index: number;
          }
        | undefined;

      if (input.listPublicId) {
        newList = await listRepo.getByPublicId(ctx.db, input.listPublicId);

        if (!newList)
          throw new TRPCError({
            message: `List with public ID ${input.listPublicId} not found`,
            code: "NOT_FOUND",
          });

        newListId = newList.id;
      }

      if (!existingCard) {
        throw new TRPCError({
          message: `Card with public ID ${input.cardPublicId} not found`,
          code: "NOT_FOUND",
        });
      }

      let result:
        | {
            id: number;
            title: string;
            description: string | null;
            publicId: string;
            dueDate: Date | null;
            priority: CardPriority | null;
          }
        | undefined;

      const previousDueDate = existingCard.dueDate;
      const previousPriority = existingCard.priority;

      if (
        input.title ||
        input.description ||
        input.dueDate !== undefined ||
        input.priority !== undefined
      ) {
        result = await cardRepo.update(
          ctx.db,
          {
            ...(input.title && { title: input.title }),
            ...(input.description && { description: input.description }),
            ...(input.dueDate !== undefined && { dueDate: input.dueDate }),
            ...(input.priority !== undefined && { priority: input.priority }),
          },
          { cardPublicId: input.cardPublicId },
        );
      }

      if (input.index !== undefined || newListId !== undefined) {
        result = await cardRepo.reorder(ctx.db, {
          cardId: existingCard.id,
          newIndex: input.index,
          newListId: newListId,
        });
      }

      if (!result)
        throw new TRPCError({
          message: `Failed to update card`,
          code: "INTERNAL_SERVER_ERROR",
        });

      const activities = [];

      if (input.title && existingCard.title !== input.title) {
        activities.push({
          type: "card.updated.title" as const,
          cardId: result.id,
          createdBy: userId,
          fromTitle: existingCard.title,
          toTitle: input.title,
        });
      }

      if (input.description && existingCard.description !== input.description) {
        activities.push({
          type: "card.updated.description" as const,
          cardId: result.id,
          createdBy: userId,
          fromDescription: existingCard.description ?? undefined,
          toDescription: input.description,
        });

        sendMentionEmails({
          db: ctx.db,
          cardPublicId: input.cardPublicId,
          commentHtml: input.description,
          commenterUserId: userId,
        }).catch((error) => {
          console.error("Failed to send mention emails:", error);
        });
      }

      if (
        input.dueDate !== undefined &&
        previousDueDate?.getTime() !== input.dueDate?.getTime()
      ) {
        let activityType:
          | "card.updated.dueDate.added"
          | "card.updated.dueDate.updated"
          | "card.updated.dueDate.removed";

        if (!previousDueDate) {
          activityType = "card.updated.dueDate.added";
        } else if (!input.dueDate) {
          activityType = "card.updated.dueDate.removed";
        } else {
          activityType = "card.updated.dueDate.updated";
        }

        activities.push({
          type: activityType,
          cardId: result.id,
          createdBy: userId,
          fromDueDate: previousDueDate ?? undefined,
          toDueDate: input.dueDate ?? undefined,
        });
      }

      if (newListId && existingCard.listId !== newListId) {
        activities.push({
          type: "card.updated.list" as const,
          cardId: result.id,
          createdBy: userId,
          fromListId: existingCard.listId,
          toListId: newListId,
        });
      }

      if (activities.length > 0) {
        await cardActivityRepo.bulkCreate(ctx.db, activities);
      }

      // Build changes object for webhook
      const webhookChanges: Record<string, { from: unknown; to: unknown }> = {};
      if (input.title && existingCard.title !== input.title) {
        webhookChanges.title = { from: existingCard.title, to: input.title };
      }
      if (input.description && existingCard.description !== input.description) {
        webhookChanges.description = {
          from: existingCard.description,
          to: input.description,
        };
      }
      if (
        input.dueDate !== undefined &&
        previousDueDate?.getTime() !== input.dueDate?.getTime()
      ) {
        webhookChanges.dueDate = { from: previousDueDate, to: input.dueDate };
      }
      if (input.priority !== undefined && previousPriority !== input.priority) {
        webhookChanges.priority = {
          from: previousPriority,
          to: input.priority,
        };
      }
      const movedToNewList = Boolean(
        newListId && existingCard.listId !== newListId,
      );
      const currentWebhookListPublicId = movedToNewList
        ? input.listPublicId!
        : existingCard.list.publicId;
      const currentWebhookListName = movedToNewList
        ? (newList?.name ?? card.listName)
        : existingCard.list.name;

      if (movedToNewList) {
        webhookChanges.listId = {
          from: existingCard.list.publicId,
          to: input.listPublicId!,
        };
      }

      // Fire webhooks (non-blocking)
      sendWebhooksForWorkspace(
        ctx.db,
        card.workspaceId,
        createCardWebhookPayload(
          movedToNewList ? "card.moved" : "card.updated",
          {
            id: String(result.id),
            publicId: result.publicId,
            title: result.title,
            description: result.description,
            dueDate: result.dueDate,
            priority: result.priority,
            listId: currentWebhookListPublicId,
          },
          {
            boardId: card.boardPublicId,
            boardName: card.boardName,
            listName: currentWebhookListName,
            user: ctx.user
              ? { id: ctx.user.id, name: ctx.user.name }
              : undefined,
            changes:
              Object.keys(webhookChanges).length > 0
                ? webhookChanges
                : undefined,
          },
        ),
      ).catch((error) => {
        console.error("Webhook delivery failed:", error);
      });

      // Emit card and board events for card updates
      const cardWithList = await cardRepo.getCardWithListByPublicId(
        ctx.db,
        input.cardPublicId,
      );
      const listRef = cardWithList ? cardWithList.list : undefined;
      const boardId = listRef ? listRef.boardId : undefined;
      // Card-scoped event so open card pages refresh activity instantly
      emitCardEvent(card.id, {
        scope: "card",
        type: "updated",
        cardId: card.id,
        cardPublicId: input.cardPublicId,
        changes: {
          title: input.title,
          description: input.description,
          listPublicId: input.listPublicId,
          index: input.index,
        },
      });
      if (boardId !== undefined) {
        emitBoardEvent(boardId, {
          scope: "board",
          type: "card.updated",
          boardId,
          cardPublicId: input.cardPublicId,
          listPublicId: input.listPublicId,
          changes: {
            title: input.title,
            description: input.description,
            listPublicId: input.listPublicId,
            index: input.index,
          },
        });
      }

      return result;
    }),
  delete: protectedProcedure
    .meta({
      openapi: {
        summary: "Delete a card",
        method: "DELETE",
        path: "/cards/{cardPublicId}",
        description: "Deletes a card by its public ID",
        tags: ["Cards"],
        protect: true,
      },
    })
    .input(
      z.object({
        cardPublicId: z.string().min(12),
      }),
    )
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: `User not authenticated`,
          code: "UNAUTHORIZED",
        });

      const card = await cardRepo.getWorkspaceAndCardIdByCardPublicId(
        ctx.db,
        input.cardPublicId,
      );

      if (!card)
        throw new TRPCError({
          message: `Card with public ID ${input.cardPublicId} not found`,
          code: "NOT_FOUND",
        });

      await assertCanDelete(
        ctx.db,
        userId,
        card.workspaceId,
        "card:delete",
        card.createdBy,
      );

      // Fetch full card data before delete for webhook
      const fullCard = await cardRepo.getByPublicId(ctx.db, input.cardPublicId);

      // Resolve board id BEFORE deleting (since lookups exclude deleted cards)
      const beforeDeleteCardWithList = await cardRepo.getCardWithListByPublicId(
        ctx.db,
        input.cardPublicId,
      );
      const boardIdForEvent = beforeDeleteCardWithList
        ? beforeDeleteCardWithList.list.boardId
        : undefined;

      const deletedAt = new Date();

      await cardRepo.softDelete(ctx.db, {
        cardId: card.id,
        deletedAt,
        deletedBy: userId,
      });

      await cardActivityRepo.create(ctx.db, {
        type: "card.deleted",
        cardId: card.id,
        createdBy: userId,
      });

      // Fire webhooks (non-blocking)
      if (fullCard) {
        sendWebhooksForWorkspace(
          ctx.db,
          card.workspaceId,
          createCardWebhookPayload(
            "card.deleted",
            {
              id: String(fullCard.id),
              publicId: fullCard.publicId,
              title: fullCard.title,
              description: fullCard.description,
              dueDate: fullCard.dueDate,
              priority: fullCard.priority,
              listId: fullCard.list.publicId,
            },
            {
              boardId: card.boardPublicId,
              boardName: card.boardName,
              listName: fullCard.list.name,
              user: ctx.user
                ? { id: ctx.user.id, name: ctx.user.name }
                : undefined,
            },
          ),
        ).catch((error) => {
          console.error("Webhook delivery failed:", error);
        });
      }

      // Emit card-level and board-level delete events (using board id resolved before delete)
      emitCardEvent(card.id, {
        scope: "card",
        type: "deleted",
        cardId: card.id,
        cardPublicId: input.cardPublicId,
      });
      // Board-level
      if (boardIdForEvent !== undefined) {
        emitBoardEvent(boardIdForEvent, {
          scope: "board",
          type: "card.deleted",
          boardId: boardIdForEvent,
          cardPublicId: input.cardPublicId,
        });
      }

      return { success: true };
    }),
  archive: protectedProcedure
    .meta({
      openapi: {
        summary: "Archive a card",
        method: "POST",
        path: "/cards/{cardPublicId}/archive",
        description:
          "Archives a card, removing it from the board while keeping it active",
        tags: ["Cards"],
        protect: true,
      },
    })
    .input(z.object({ cardPublicId: z.string().min(12) }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: `User not authenticated`,
          code: "UNAUTHORIZED",
        });

      const card = await cardRepo.getWorkspaceAndCardIdByCardPublicId(
        ctx.db,
        input.cardPublicId,
      );

      if (!card)
        throw new TRPCError({
          message: `Card with public ID ${input.cardPublicId} not found`,
          code: "NOT_FOUND",
        });

      if (card.archivedAt)
        throw new TRPCError({
          message: `Card with public ID ${input.cardPublicId} is already archived`,
          code: "BAD_REQUEST",
        });

      await assertCanEdit(
        ctx.db,
        userId,
        card.workspaceId,
        "card:edit",
        card.createdBy,
      );

      const list = await listRepo.getById(ctx.db, card.listId);

      await cardRepo.archive(ctx.db, {
        cardId: card.id,
        archivedAt: new Date(),
        archivedBy: userId,
      });

      await cardActivityRepo.create(ctx.db, {
        type: "card.archived",
        cardId: card.id,
        createdBy: userId,
      });

      if (list) {
        emitBoardEvent(list.boardId, {
          scope: "board",
          type: "card.updated",
          boardId: list.boardId,
          cardPublicId: input.cardPublicId,
        });
      }

      return { success: true };
    }),
  unarchive: protectedProcedure
    .meta({
      openapi: {
        summary: "Unarchive a card",
        method: "POST",
        path: "/cards/{cardPublicId}/unarchive",
        description: "Returns an archived card to the board",
        tags: ["Cards"],
        protect: true,
      },
    })
    .input(z.object({ cardPublicId: z.string().min(12) }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: `User not authenticated`,
          code: "UNAUTHORIZED",
        });

      const card = await cardRepo.getWorkspaceAndCardIdByCardPublicId(
        ctx.db,
        input.cardPublicId,
      );

      if (!card)
        throw new TRPCError({
          message: `Card with public ID ${input.cardPublicId} not found`,
          code: "NOT_FOUND",
        });

      if (!card.archivedAt)
        throw new TRPCError({
          message: `Card with public ID ${input.cardPublicId} is not archived`,
          code: "BAD_REQUEST",
        });

      await assertCanEdit(
        ctx.db,
        userId,
        card.workspaceId,
        "card:edit",
        card.createdBy,
      );

      const targetList = await resolveTargetList(ctx.db, card.listId);

      if (!targetList)
        throw new TRPCError({
          message: `No list available to unarchive card ${input.cardPublicId} into`,
          code: "PRECONDITION_FAILED",
        });

      await cardRepo.unarchive(ctx.db, {
        cardId: card.id,
        listId: targetList.id,
      });

      await cardActivityRepo.create(ctx.db, {
        type: "card.unarchived",
        cardId: card.id,
        createdBy: userId,
      });

      emitBoardEvent(targetList.boardId, {
        scope: "board",
        type: "card.updated",
        boardId: targetList.boardId,
        cardPublicId: input.cardPublicId,
      });

      return { success: true };
    }),
  restore: protectedProcedure
    .meta({
      openapi: {
        summary: "Restore a deleted card",
        method: "POST",
        path: "/cards/{cardPublicId}/restore",
        description: "Restores a previously deleted card back onto the board",
        tags: ["Cards"],
        protect: true,
      },
    })
    .input(z.object({ cardPublicId: z.string().min(12) }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: `User not authenticated`,
          code: "UNAUTHORIZED",
        });

      const card = await cardRepo.getWorkspaceAndCardIdByCardPublicId(
        ctx.db,
        input.cardPublicId,
        { includeDeleted: true },
      );

      if (!card)
        throw new TRPCError({
          message: `Card with public ID ${input.cardPublicId} not found`,
          code: "NOT_FOUND",
        });

      if (!card.deletedAt)
        throw new TRPCError({
          message: `Card with public ID ${input.cardPublicId} is not deleted`,
          code: "BAD_REQUEST",
        });

      await assertCanDelete(
        ctx.db,
        userId,
        card.workspaceId,
        "card:delete",
        card.createdBy,
      );

      const targetList = await resolveTargetList(ctx.db, card.listId);

      if (!targetList)
        throw new TRPCError({
          message: `No list available to restore card ${input.cardPublicId} into`,
          code: "PRECONDITION_FAILED",
        });

      await cardRepo.restore(ctx.db, {
        cardId: card.id,
        listId: targetList.id,
      });

      await cardActivityRepo.create(ctx.db, {
        type: "card.restored",
        cardId: card.id,
        createdBy: userId,
      });

      emitBoardEvent(targetList.boardId, {
        scope: "board",
        type: "card.created",
        boardId: targetList.boardId,
        cardPublicId: input.cardPublicId,
      });

      return { success: true };
    }),
  getArchived: protectedProcedure
    .meta({
      openapi: {
        summary: "Get archived cards for a board",
        method: "GET",
        path: "/boards/{boardPublicId}/archived-cards",
        description: "Retrieves every archived card on a board",
        tags: ["Cards"],
        protect: true,
      },
    })
    .input(z.object({ boardPublicId: z.string().min(12) }))
    .output(z.array(inactiveCardSchema))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: `User not authenticated`,
          code: "UNAUTHORIZED",
        });

      const board = await boardRepo.getWorkspaceAndBoardIdByBoardPublicId(
        ctx.db,
        input.boardPublicId,
      );

      if (!board)
        throw new TRPCError({
          message: `Board with public ID ${input.boardPublicId} not found`,
          code: "NOT_FOUND",
        });

      await assertPermission(ctx.db, userId, board.workspaceId, "card:view");

      const result = await cardRepo.getArchivedByBoardId(ctx.db, board.id);

      return result.map(formatInactiveCard);
    }),
  getDeleted: protectedProcedure
    .meta({
      openapi: {
        summary: "Get deleted cards for a board",
        method: "GET",
        path: "/boards/{boardPublicId}/deleted-cards",
        description: "Retrieves every deleted card on a board",
        tags: ["Cards"],
        protect: true,
      },
    })
    .input(z.object({ boardPublicId: z.string().min(12) }))
    .output(z.array(inactiveCardSchema))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: `User not authenticated`,
          code: "UNAUTHORIZED",
        });

      const board = await boardRepo.getWorkspaceAndBoardIdByBoardPublicId(
        ctx.db,
        input.boardPublicId,
      );

      if (!board)
        throw new TRPCError({
          message: `Board with public ID ${input.boardPublicId} not found`,
          code: "NOT_FOUND",
        });

      await assertPermission(ctx.db, userId, board.workspaceId, "card:view");

      const result = await cardRepo.getDeletedByBoardId(ctx.db, board.id);

      return result.map(formatInactiveCard);
    }),
  getLinks: protectedProcedure
    .meta({
      openapi: {
        summary: "Get linked cards",
        method: "GET",
        path: "/cards/{cardPublicId}/links",
        description:
          "Retrieves every card linked to this card, in both directions",
        tags: ["Cards"],
        protect: true,
      },
    })
    .input(z.object({ cardPublicId: z.string().min(12) }))
    .output(z.array(cardLinkSchema))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: `User not authenticated`,
          code: "UNAUTHORIZED",
        });

      const card = await cardRepo.getWorkspaceAndCardIdByCardPublicId(
        ctx.db,
        input.cardPublicId,
      );

      if (!card)
        throw new TRPCError({
          message: `Card with public ID ${input.cardPublicId} not found`,
          code: "NOT_FOUND",
        });

      await assertPermission(ctx.db, userId, card.workspaceId, "card:view");

      const links = await cardLinkRepo.getByCardId(ctx.db, card.id);

      return links.map((link) => ({
        publicId: link.publicId,
        type: link.type,
        direction: link.direction,
        isCompleted: link.isCompleted,
        card: {
          publicId: link.card.publicId,
          title: link.card.title,
          cardNumber: link.card.cardNumber,
          ticketNumber:
            link.card.cardNumber != null && link.card.cardPrefix
              ? `${link.card.cardPrefix}-${link.card.cardNumber}`
              : null,
          dueDate: link.card.dueDate,
          priority: link.card.priority,
          isArchived: link.card.isArchived,
          list: link.card.list,
          board: link.card.board,
          members: link.card.members,
        },
      }));
    }),
  addLink: protectedProcedure
    .meta({
      openapi: {
        summary: "Link a card to another card",
        method: "POST",
        path: "/cards/{cardPublicId}/links",
        description:
          "Links another card to this card. For subtask links this card is the parent.",
        tags: ["Cards"],
        protect: true,
      },
    })
    .input(
      z.object({
        cardPublicId: z.string().min(12),
        linkedCardPublicId: z.string().min(12),
        type: z.enum(cardLinkTypes),
      }),
    )
    .output(z.object({ publicId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: `User not authenticated`,
          code: "UNAUTHORIZED",
        });

      if (input.cardPublicId === input.linkedCardPublicId)
        throw new TRPCError({
          message: `A card cannot be linked to itself`,
          code: "BAD_REQUEST",
        });

      const card = await cardRepo.getWorkspaceAndCardIdByCardPublicId(
        ctx.db,
        input.cardPublicId,
      );

      if (!card)
        throw new TRPCError({
          message: `Card with public ID ${input.cardPublicId} not found`,
          code: "NOT_FOUND",
        });

      await assertCanEdit(
        ctx.db,
        userId,
        card.workspaceId,
        "card:edit",
        card.createdBy,
      );

      const linkedCard = await cardRepo.getWorkspaceAndCardIdByCardPublicId(
        ctx.db,
        input.linkedCardPublicId,
      );

      if (!linkedCard)
        throw new TRPCError({
          message: `Card with public ID ${input.linkedCardPublicId} not found`,
          code: "NOT_FOUND",
        });

      // Links stay inside one workspace so both ends share a permission boundary.
      if (linkedCard.workspaceId !== card.workspaceId)
        throw new TRPCError({
          message: `Cards can only be linked within the same workspace`,
          code: "BAD_REQUEST",
        });

      const alreadyLinked = await cardLinkRepo.exists(ctx.db, {
        sourceCardId: card.id,
        targetCardId: linkedCard.id,
        type: input.type,
      });

      if (alreadyLinked)
        throw new TRPCError({
          message: `These cards are already linked`,
          code: "BAD_REQUEST",
        });

      if (input.type === "subtask") {
        const wouldLoop = await cardLinkRepo.wouldCreateSubtaskCycle(ctx.db, {
          parentCardId: card.id,
          childCardId: linkedCard.id,
        });

        if (wouldLoop)
          throw new TRPCError({
            message: `That card is already a parent of this card`,
            code: "BAD_REQUEST",
          });
      }

      const link = await cardLinkRepo.create(ctx.db, {
        type: input.type,
        sourceCardId: card.id,
        targetCardId: linkedCard.id,
        createdBy: userId,
      });

      await cardActivityRepo.create(ctx.db, {
        type: "card.updated.link.added",
        cardId: card.id,
        linkedCardId: linkedCard.id,
        createdBy: userId,
      });

      emitCardEvent(card.id, {
        scope: "card",
        type: "updated",
        cardId: card.id,
        cardPublicId: input.cardPublicId,
      });

      return { publicId: link.publicId };
    }),
  removeLink: protectedProcedure
    .meta({
      openapi: {
        summary: "Remove a card link",
        method: "DELETE",
        path: "/cards/{cardPublicId}/links/{linkPublicId}",
        description: "Removes a link between two cards",
        tags: ["Cards"],
        protect: true,
      },
    })
    .input(
      z.object({
        cardPublicId: z.string().min(12),
        linkPublicId: z.string().min(12),
      }),
    )
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: `User not authenticated`,
          code: "UNAUTHORIZED",
        });

      const card = await cardRepo.getWorkspaceAndCardIdByCardPublicId(
        ctx.db,
        input.cardPublicId,
      );

      if (!card)
        throw new TRPCError({
          message: `Card with public ID ${input.cardPublicId} not found`,
          code: "NOT_FOUND",
        });

      await assertCanEdit(
        ctx.db,
        userId,
        card.workspaceId,
        "card:edit",
        card.createdBy,
      );

      const link = await cardLinkRepo.getByPublicId(ctx.db, input.linkPublicId);

      if (!link)
        throw new TRPCError({
          message: `Link with public ID ${input.linkPublicId} not found`,
          code: "NOT_FOUND",
        });

      if (link.sourceCardId !== card.id && link.targetCardId !== card.id)
        throw new TRPCError({
          message: `Link with public ID ${input.linkPublicId} does not belong to this card`,
          code: "BAD_REQUEST",
        });

      await cardLinkRepo.hardDelete(ctx.db, link.id);

      await cardActivityRepo.create(ctx.db, {
        type: "card.updated.link.removed",
        cardId: card.id,
        linkedCardId:
          link.sourceCardId === card.id ? link.targetCardId : link.sourceCardId,
        createdBy: userId,
      });

      emitCardEvent(card.id, {
        scope: "card",
        type: "updated",
        cardId: card.id,
        cardPublicId: input.cardPublicId,
      });

      return { success: true };
    }),
  duplicate: protectedProcedure
    .meta({
      openapi: {
        summary: "Duplicate a card",
        method: "POST",
        path: "/cards/{cardPublicId}/duplicate",
        description: "Duplicates a card to a target list with optional options",
        tags: ["Cards"],
        protect: true,
      },
    })
    .input(
      z.object({
        cardPublicId: z.string().min(12),
        listPublicId: z.string().min(12),
        index: z.number().int().min(0).optional(),
        title: z.string().min(1).max(2000).optional(),
        copyLabels: z.boolean(),
        copyMembers: z.boolean(),
        copyChecklists: z.boolean(),
      }),
    )
    .output(
      z.object({
        publicId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: `User not authenticated`,
          code: "UNAUTHORIZED",
        });

      const sourceCardMeta = await cardRepo.getWorkspaceAndCardIdByCardPublicId(
        ctx.db,
        input.cardPublicId,
      );

      if (!sourceCardMeta)
        throw new TRPCError({
          message: `Card with public ID ${input.cardPublicId} not found`,
          code: "NOT_FOUND",
        });

      await assertPermission(
        ctx.db,
        userId,
        sourceCardMeta.workspaceId,
        "card:create",
      );

      const targetList = await listRepo.getWorkspaceAndListIdByListPublicId(
        ctx.db,
        input.listPublicId,
      );

      if (!targetList)
        throw new TRPCError({
          message: `List with public ID ${input.listPublicId} not found`,
          code: "NOT_FOUND",
        });

      if (targetList.workspaceId !== sourceCardMeta.workspaceId)
        throw new TRPCError({
          message: `Target list must be in the same workspace`,
          code: "BAD_REQUEST",
        });

      const sourceCard = await cardRepo.getWithListAndMembersByPublicId(
        ctx.db,
        input.cardPublicId,
      );

      if (!sourceCard)
        throw new TRPCError({
          message: `Card with public ID ${input.cardPublicId} not found`,
          code: "NOT_FOUND",
        });

      const newCard = await cardRepo.create(ctx.db, {
        title: input.title ?? sourceCard.title,
        description: sourceCard.description ?? "",
        createdBy: userId,
        listId: targetList.id,
        workspaceId: targetList.workspaceId,
        position: "end",
        dueDate: sourceCard.dueDate ?? null,
        priority: sourceCard.priority ?? null,
      });

      if (input.index !== undefined && input.index >= 0) {
        await cardRepo.reorder(ctx.db, {
          cardId: newCard.id,
          newIndex: input.index,
          newListId: targetList.id,
        });
      }

      if (input.copyLabels && sourceCard.labels?.length) {
        const labelPublicIds = sourceCard.labels.map((l) => l.publicId);
        const labels = await labelRepo.getAllByPublicIds(
          ctx.db,
          labelPublicIds,
        );
        if (labels.length) {
          const labelsInsert = labels.map((label) => ({
            cardId: newCard.id,
            labelId: label.id,
          }));
          await cardRepo.bulkCreateCardLabelRelationships(ctx.db, labelsInsert);
          const cardActivitesInsert = labels.map((cardLabel) => ({
            type: "card.updated.label.added" as const,
            cardId: newCard.id,
            labelId: cardLabel.id,
            createdBy: userId,
          }));
          await cardActivityRepo.bulkCreate(ctx.db, cardActivitesInsert);
        }
      }

      if (input.copyMembers && sourceCard.members?.length) {
        const memberPublicIds = sourceCard.members.map((m) => m.publicId);
        const members = await workspaceRepo.getAllMembersByPublicIds(
          ctx.db,
          memberPublicIds,
        );
        if (members.length) {
          const membersInsert = members.map((member) => ({
            cardId: newCard.id,
            workspaceMemberId: member.id,
          }));
          await cardRepo.bulkCreateCardWorkspaceMemberRelationships(
            ctx.db,
            membersInsert,
          );
          const cardActivitesInsert = members.map((member) => ({
            type: "card.updated.member.added" as const,
            cardId: newCard.id,
            workspaceMemberId: member.id,
            createdBy: userId,
          }));
          await cardActivityRepo.bulkCreate(ctx.db, cardActivitesInsert);
        }
      }

      if (input.copyChecklists && sourceCard.checklists?.length) {
        for (const checklist of sourceCard.checklists) {
          const newChecklist = await checklistRepo.create(ctx.db, {
            cardId: newCard.id,
            name: checklist.name,
            createdBy: userId,
          });
          if (!newChecklist?.id) continue;
          if (checklist.items?.length) {
            for (const item of checklist.items) {
              await checklistRepo.createItem(ctx.db, {
                checklistId: newChecklist.id,
                title: item.title,
                createdBy: userId,
                completed: false,
              });
            }
          }
          await cardActivityRepo.create(ctx.db, {
            type: "card.updated.checklist.added",
            cardId: newCard.id,
            toTitle: newChecklist.name,
            createdBy: userId,
          });
        }
      }

      return { publicId: newCard.publicId };
    }),
});
