import { on } from "events";
import { tracked, TRPCError } from "@trpc/server";
import { z } from "zod";

import * as cardRepo from "@kan/db/repository/card.repo";
import * as cardActivityRepo from "@kan/db/repository/cardActivity.repo";
import * as cardCommentRepo from "@kan/db/repository/cardComment.repo";
import * as labelRepo from "@kan/db/repository/label.repo";
import * as listRepo from "@kan/db/repository/list.repo";
import * as workspaceRepo from "@kan/db/repository/workspace.repo";

//

import { cardTopic, emitBoardEvent, emitCardEvent, eventBus } from "../events";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { assertUserInWorkspace } from "../utils/auth";

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
        title: z.string().min(1),
        description: z.string().max(10000),
        listPublicId: z.string().min(12),
        labelPublicIds: z.array(z.string().min(12)),
        memberPublicIds: z.array(z.string().min(12)),
        position: z.enum(["start", "end"]),
      }),
    )
    .output(z.custom<Awaited<ReturnType<typeof cardRepo.create>>>())
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

      await assertUserInWorkspace(ctx.db, userId, list.workspaceId);

      if (!userId)
        throw new TRPCError({
          message: `User not authenticated`,
          code: "UNAUTHORIZED",
        });

      const newCard = await cardRepo.create(ctx.db, {
        title: input.title,
        description: input.description,
        createdBy: userId,
        listId: list.id,
        position: input.position,
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
    .output(z.custom<Awaited<ReturnType<typeof cardCommentRepo.create>>>())
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

      await assertUserInWorkspace(ctx.db, userId, card.workspaceId);

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

      // Emit card-level event
      {
        emitCardEvent(card.id, {
          scope: "card",
          type: "comment.added",
          cardId: card.id,
          cardPublicId: input.cardPublicId,
          commentPublicId: newComment.publicId,
          comment: newComment.comment,
        });
      }

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
    .output(z.custom<Awaited<ReturnType<typeof cardCommentRepo.update>>>())
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

      await assertUserInWorkspace(ctx.db, userId, card.workspaceId);

      const existingComment = await cardCommentRepo.getByPublicId(
        ctx.db,
        input.commentPublicId,
      );

      if (!existingComment)
        throw new TRPCError({
          message: `Comment with public ID ${input.commentPublicId} not found`,
          code: "NOT_FOUND",
        });

      if (existingComment.createdBy !== userId)
        throw new TRPCError({
          message: `You do not have permission to update this comment`,
          code: "FORBIDDEN",
        });

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

      {
        emitCardEvent(card.id, {
          scope: "card",
          type: "comment.updated",
          cardId: card.id,
          cardPublicId: input.cardPublicId,
          commentPublicId: updatedComment.publicId,
          comment: updatedComment.comment,
        });
      }

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
    .output(z.custom<Awaited<ReturnType<typeof cardCommentRepo.softDelete>>>())
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

      await assertUserInWorkspace(ctx.db, userId, card.workspaceId);

      const existingComment = await cardCommentRepo.getByPublicId(
        ctx.db,
        input.commentPublicId,
      );

      if (!existingComment)
        throw new TRPCError({
          message: `Comment with public ID ${input.commentPublicId} not found`,
          code: "NOT_FOUND",
        });

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

      {
        emitCardEvent(card.id, {
          scope: "card",
          type: "comment.deleted",
          cardId: card.id,
          cardPublicId: input.cardPublicId,
          commentPublicId: existingComment.publicId,
        });
      }

      return deletedComment;
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

      await assertUserInWorkspace(ctx.db, userId, card.workspaceId);

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

      await assertUserInWorkspace(ctx.db, userId, card.workspaceId);

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
    .output(
      z.custom<
        Awaited<ReturnType<typeof cardRepo.getWithListAndMembersByPublicId>>
      >(),
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

        await assertUserInWorkspace(ctx.db, userId, card.workspaceId);
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

      return result;
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
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        index: z.number().optional(),
        listPublicId: z.string().min(12).optional(),
      }),
    )
    .output(z.custom<Awaited<ReturnType<typeof cardRepo.update>>>())
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

      await assertUserInWorkspace(ctx.db, userId, card.workspaceId);

      const existingCard = await cardRepo.getByPublicId(
        ctx.db,
        input.cardPublicId,
      );

      let newListId: number | undefined;

      if (input.listPublicId) {
        const newList = await listRepo.getByPublicId(
          ctx.db,
          input.listPublicId,
        );

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
          }
        | undefined;

      if (input.title || input.description) {
        result = await cardRepo.update(
          ctx.db,
          {
            ...(input.title && { title: input.title }),
            ...(input.description && { description: input.description }),
          },
          { cardPublicId: input.cardPublicId },
        );
      }

      if (input.index !== undefined) {
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

      await assertUserInWorkspace(ctx.db, userId, card.workspaceId);

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
        type: "card.archived",
        cardId: card.id,
        createdBy: userId,
      });

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
});
