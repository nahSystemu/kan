import { TRPCError } from "@trpc/server";
import { z } from "zod";

import * as notificationRepo from "@kan/db/repository/notification.repo";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const notificationRouter = createTRPCRouter({
  list: protectedProcedure
    .meta({
      openapi: {
        summary: "List notifications",
        method: "GET",
        path: "/notifications",
        tags: ["Notifications"],
        protect: true,
      },
    })
    .input(
      z.object({
        status: z.enum(["all", "read", "unread"]).optional(),
        limit: z.number().min(1).max(100).optional(),
      }),
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });
      const rows = await notificationRepo.listForUser(ctx.db, userId, {
        status: input.status,
        limit: input.limit,
      });
      return rows;
    }),

  markRead: protectedProcedure
    .meta({
      openapi: {
        summary: "Mark notification read",
        method: "PUT",
        path: "/notifications/{notificationPublicId}/read",
        tags: ["Notifications"],
        protect: true,
      },
    })
    .input(z.object({ notificationPublicId: z.string().min(12) }))
    .output(z.object({ publicId: z.string(), readAt: z.date() }).optional())
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });
      return notificationRepo.markRead(ctx.db, userId, input.notificationPublicId);
    }),

  markAllRead: protectedProcedure
    .meta({
      openapi: {
        summary: "Mark all notifications read",
        method: "PUT",
        path: "/notifications/read-all",
        tags: ["Notifications"],
        protect: true,
      },
    })
    .input(z.void())
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx }) => {
      const userId = ctx.user?.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });
      return notificationRepo.markAllRead(ctx.db, userId);
    }),

  markByCard: protectedProcedure
    .meta({
      openapi: {
        summary: "Mark notifications for a card",
        method: "PUT",
        path: "/notifications/cards/{cardPublicId}/read",
        tags: ["Notifications"],
        protect: true,
      },
    })
    .input(z.object({ cardPublicId: z.string().min(12) }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });
      return notificationRepo.markReadByCardPublicId(ctx.db, userId, input.cardPublicId);
    }),

  clear: protectedProcedure
    .meta({
      openapi: {
        summary: "Clear notifications",
        method: "DELETE",
        path: "/notifications",
        tags: ["Notifications"],
        protect: true,
      },
    })
    .input(z.object({ scope: z.enum(["all", "read", "unread"]).optional() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });
      return notificationRepo.clear(ctx.db, userId, input.scope);
    }),
});
