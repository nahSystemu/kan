import { TRPCError } from "@trpc/server";
import { z } from "zod";

import * as notificationRepo from "@kan/db/repository/notification.repo";
import * as workspaceRepo from "@kan/db/repository/workspace.repo";
import { notificationTypes } from "@kan/db/schema";

import { createTRPCRouter, protectedProcedure } from "../trpc";
import { assertUserInWorkspace } from "../utils/auth";

const notificationItemSchema = z.object({
  publicId: z.string(),
  type: z.enum(notificationTypes),
  entityPublicId: z.string().nullable(),
  payload: z.record(z.unknown()).optional(),
  redirectPath: z.string().nullable(),
  createdAt: z.date(),
  readAt: z.date().nullable(),
  seenAt: z.date().nullable(),
  workspace: z.object({
    publicId: z.string(),
    name: z.string(),
  }),
  createdBy: z
    .object({
      id: z.string(),
      name: z.string().nullable(),
      email: z.string().nullable(),
      image: z.string().nullable(),
    })
    .nullable(),
});

export const notificationRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        workspacePublicId: z.string().min(12).max(12).optional(),
        cursor: z.date().optional(),
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .output(
      z.object({
        items: z.array(notificationItemSchema),
        nextCursor: z.date().nullable(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });

      let workspaceId: number | undefined;

      if (input.workspacePublicId) {
        const workspace = await workspaceRepo.getByPublicId(
          ctx.db,
          input.workspacePublicId,
        );

        if (!workspace)
          throw new TRPCError({
            message: `Workspace with public ID ${input.workspacePublicId} not found`,
            code: "NOT_FOUND",
          });

        await assertUserInWorkspace(ctx.db, userId, workspace.id);

        workspaceId = workspace.id;
      }

      const result = await notificationRepo.listByUser(ctx.db, {
        userId,
        workspaceId,
        limit: input.limit,
        cursor: input.cursor,
      });

      const items = result.items.map((item) => ({
        publicId: item.publicId,
        type: item.type,
        entityPublicId: item.entityPublicId ?? null,
        payload: item.payload ? (item.payload as Record<string, unknown>) : {},
        redirectPath: item.redirectPath ?? null,
        createdAt: item.createdAt,
        readAt: item.readAt,
        seenAt: item.seenAt,
        workspace: {
          publicId: item.workspacePublicId,
          name: item.workspaceName,
        },
        createdBy: item.createdById
          ? {
              id: item.createdById,
              name: item.createdByName ?? null,
              email: item.createdByEmail ?? null,
              image: item.createdByImage ?? null,
            }
          : null,
      }));

      return {
        items,
        nextCursor: result.nextCursor,
      };
    }),
  unreadCount: protectedProcedure
    .input(
      z.object({
        workspacePublicId: z.string().min(12).max(12).optional(),
      }),
    )
    .output(
      z.object({
        unreadCount: z.number(),
        hasUnseen: z.boolean(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });

      let workspaceId: number | undefined;

      if (input.workspacePublicId) {
        const workspace = await workspaceRepo.getByPublicId(
          ctx.db,
          input.workspacePublicId,
        );

        if (!workspace)
          throw new TRPCError({
            message: `Workspace with public ID ${input.workspacePublicId} not found`,
            code: "NOT_FOUND",
          });

        await assertUserInWorkspace(ctx.db, userId, workspace.id);

        workspaceId = workspace.id;
      }

      return notificationRepo.getUnreadAndUnseenCounts(ctx.db, {
        userId,
        workspaceId,
      });
    }),
  markRead: protectedProcedure
    .input(
      z.object({
        notificationPublicId: z.string().min(12),
      }),
    )
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });

      return notificationRepo.markRead(ctx.db, {
        notificationPublicId: input.notificationPublicId,
        userId,
      });
    }),
  markAllRead: protectedProcedure
    .input(
      z.object({
        workspacePublicId: z.string().min(12).max(12).optional(),
      }),
    )
    .output(z.object({ updated: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });

      let workspaceId: number | undefined;

      if (input.workspacePublicId) {
        const workspace = await workspaceRepo.getByPublicId(
          ctx.db,
          input.workspacePublicId,
        );

        if (!workspace)
          throw new TRPCError({
            message: `Workspace with public ID ${input.workspacePublicId} not found`,
            code: "NOT_FOUND",
          });

        await assertUserInWorkspace(ctx.db, userId, workspace.id);

        workspaceId = workspace.id;
      }

      return notificationRepo.markAllRead(ctx.db, {
        userId,
        workspaceId,
      });
    }),
  markSeen: protectedProcedure
    .input(
      z.object({
        workspacePublicId: z.string().min(12).max(12).optional(),
      }),
    )
    .output(z.object({ updated: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId)
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });

      let workspaceId: number | undefined;

      if (input.workspacePublicId) {
        const workspace = await workspaceRepo.getByPublicId(
          ctx.db,
          input.workspacePublicId,
        );

        if (!workspace)
          throw new TRPCError({
            message: `Workspace with public ID ${input.workspacePublicId} not found`,
            code: "NOT_FOUND",
          });

        await assertUserInWorkspace(ctx.db, userId, workspace.id);

        workspaceId = workspace.id;
      }

      return notificationRepo.markSeen(ctx.db, {
        userId,
        workspaceId,
      });
    }),
});
