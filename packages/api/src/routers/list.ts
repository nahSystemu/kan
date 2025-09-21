import { TRPCError } from "@trpc/server";
import { z } from "zod";

import * as boardRepo from "@kan/db/repository/board.repo";
import * as cardRepo from "@kan/db/repository/card.repo";
import * as activityRepo from "@kan/db/repository/cardActivity.repo";
import * as listRepo from "@kan/db/repository/list.repo";

import { emitBoardEvent } from "../events";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { assertUserInWorkspace } from "../utils/auth";

export const listRouter = createTRPCRouter({
  create: protectedProcedure
    .meta({
      openapi: {
        summary: "Create a list",
        method: "POST",
        path: "/lists",
        description: "Creates a new list for a given board",
        tags: ["Lists"],
        protect: true,
      },
    })
    .input(
      z.object({
        name: z.string().min(1),
        boardPublicId: z.string().min(12),
      }),
    )
    .output(z.custom<Awaited<ReturnType<typeof listRepo.create>>>())
    .mutation(async ({ ctx, input }) => {
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

      await assertUserInWorkspace(ctx.db, userId, board.workspaceId);

      const result = await listRepo.create(ctx.db, {
        name: input.name,
        createdBy: userId,
        boardId: board.id,
      });

      if (!result)
        throw new TRPCError({
          message: `Failed to create list`,
          code: "INTERNAL_SERVER_ERROR",
        });

      // Emit board event for list creation
      emitBoardEvent(board.id, {
        scope: "board",
        type: "list.created",
        boardId: board.id,
        listPublicId: result.publicId,
        name: result.name,
      });

      return result;
    }),
  delete: protectedProcedure
    .meta({
      openapi: {
        summary: "Delete a list",
        method: "DELETE",
        path: "/lists/{listPublicId}",
        description: "Deletes a list by its public ID",
        tags: ["Lists"],
        protect: true,
      },
    })
    .input(
      z.object({
        listPublicId: z.string().min(12),
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

      const deletedAt = new Date();

      const deletedList = await listRepo.softDeleteById(ctx.db, {
        listId: list.id,
        deletedAt,
        deletedBy: userId,
      });

      if (!deletedList)
        throw new TRPCError({
          message: `Failed to delete list`,
          code: "INTERNAL_SERVER_ERROR",
        });

      const deletedCards = await cardRepo.softDeleteAllByListIds(ctx.db, {
        listIds: [list.id],
        deletedAt,
        deletedBy: userId,
      });

      if (!Array.isArray(deletedCards))
        throw new TRPCError({
          message: `Failed to delete cards`,
          code: "INTERNAL_SERVER_ERROR",
        });

      const activities = deletedCards.map((card) => ({
        type: "card.archived" as const,
        createdBy: userId,
        cardId: card.id,
      }));

      if (activities.length) await activityRepo.bulkCreate(ctx.db, activities);

      // Emit board event for list deletion
      emitBoardEvent(deletedList.boardId, {
        scope: "board",
        type: "list.deleted",
        boardId: deletedList.boardId,
        listPublicId: input.listPublicId,
      });

      return { success: true };
    }),
  update: protectedProcedure
    .meta({
      openapi: {
        summary: "Update a list",
        method: "PUT",
        path: "/lists/{listPublicId}",
        description: "Updates a list by its public ID",
        tags: ["Lists"],
        protect: true,
      },
    })
    .input(
      z.object({
        listPublicId: z.string().min(12),
        name: z.string().min(1).optional(),
        index: z.number().optional(),
      }),
    )
    .output(
      z.custom<
        | Awaited<ReturnType<typeof listRepo.update>>
        | Awaited<ReturnType<typeof listRepo.reorder>>
      >(),
    )
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

      let result: { name: string; publicId: string } | undefined;

      if (input.name) {
        result = await listRepo.update(
          ctx.db,
          { name: input.name },
          { listPublicId: input.listPublicId },
        );
      }

      if (input.index !== undefined) {
        result = await listRepo.reorder(ctx.db, {
          listPublicId: input.listPublicId,
          newIndex: input.index,
        });
      }

      if (!result)
        throw new TRPCError({
          message: `Failed to update list`,
          code: "INTERNAL_SERVER_ERROR",
        });

      // Emit board event for list update
      const listDetails = await listRepo.getByPublicId(
        ctx.db,
        input.listPublicId,
      );
      if (listDetails) {
        emitBoardEvent(listDetails.boardId, {
          scope: "board",
          type: "list.updated",
          boardId: listDetails.boardId,
          listPublicId: input.listPublicId,
          name: input.name,
          index: input.index,
        });
      }

      return result;
    }),
});
