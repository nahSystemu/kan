import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";

import type { dbClient } from "@kan/db/client";
import type { NotificationType } from "@kan/db/schema";
import { notifications, users, workspaces } from "@kan/db/schema";
import { generateUID } from "@kan/shared/utils";

type NotificationPayload = Record<string, unknown>;

export const bulkCreateForMembers = async (
  db: dbClient,
  notificationsInput: {
    workspaceId: number;
    workspaceMemberId: number;
    userId: string | null;
    createdBy: string;
    type: NotificationType;
    entityPublicId?: string;
    payload?: NotificationPayload;
    redirectPath?: string | null;
  }[],
) => {
  const values = notificationsInput
    .filter((item) => !!item.userId)
    .map((item) => ({
      publicId: generateUID(),
      workspaceId: item.workspaceId,
      workspaceMemberId: item.workspaceMemberId,
      userId: item.userId,
      createdBy: item.createdBy,
      type: item.type,
      entityPublicId: item.entityPublicId,
      payload: item.payload ?? null,
      redirectPath: item.redirectPath,
    }));

  if (values.length === 0) return [];

  const result = await db.insert(notifications).values(values).returning({
    id: notifications.id,
    publicId: notifications.publicId,
  });

  return result;
};

export const listByUser = async (
  db: dbClient,
  args: {
    userId: string;
    workspaceId?: number;
    limit: number;
    cursor?: Date;
  },
) => {
  const limit = Math.min(Math.max(args.limit, 1), 50);

  const rows = await db
    .select({
      publicId: notifications.publicId,
      type: notifications.type,
      entityPublicId: notifications.entityPublicId,
      payload: notifications.payload,
      redirectPath: notifications.redirectPath,
      createdAt: notifications.createdAt,
      readAt: notifications.readAt,
      seenAt: notifications.seenAt,
      workspacePublicId: workspaces.publicId,
      workspaceName: workspaces.name,
      createdById: users.id,
      createdByName: users.name,
      createdByEmail: users.email,
      createdByImage: users.image,
    })
    .from(notifications)
    .innerJoin(workspaces, eq(notifications.workspaceId, workspaces.id))
    .leftJoin(users, eq(notifications.createdBy, users.id))
    .where(
      and(
        eq(notifications.userId, args.userId),
        args.workspaceId
          ? eq(notifications.workspaceId, args.workspaceId)
          : undefined,
        args.cursor ? lt(notifications.createdAt, args.cursor) : undefined,
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  return {
    items,
    nextCursor: hasMore ? (rows[limit - 1]?.createdAt ?? null) : null,
  };
};

export const getUnreadAndUnseenCounts = async (
  db: dbClient,
  args: { userId: string; workspaceId?: number },
) => {
  const unreadCountResult = await db
    .select({
      value: sql<number>`COUNT(*)`.mapWith(Number),
    })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, args.userId),
        args.workspaceId
          ? eq(notifications.workspaceId, args.workspaceId)
          : undefined,
        isNull(notifications.readAt),
      ),
    );

  const hasUnseenResult = await db
    .select({ value: notifications.publicId })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, args.userId),
        args.workspaceId
          ? eq(notifications.workspaceId, args.workspaceId)
          : undefined,
        isNull(notifications.seenAt),
      ),
    )
    .limit(1);

  return {
    unreadCount: unreadCountResult[0]?.value ?? 0,
    hasUnseen: hasUnseenResult.length > 0,
  };
};

export const markRead = async (
  db: dbClient,
  args: { notificationPublicId: string; userId: string },
) => {
  const [result] = await db
    .update(notifications)
    .set({ readAt: new Date(), seenAt: new Date() })
    .where(
      and(
        eq(notifications.publicId, args.notificationPublicId),
        eq(notifications.userId, args.userId),
        isNull(notifications.readAt),
      ),
    )
    .returning({ publicId: notifications.publicId });

  return { success: !!result };
};

export const markSeen = async (
  db: dbClient,
  args: { userId: string; workspaceId?: number },
) => {
  const result = await db
    .update(notifications)
    .set({ seenAt: new Date() })
    .where(
      and(
        eq(notifications.userId, args.userId),
        args.workspaceId
          ? eq(notifications.workspaceId, args.workspaceId)
          : undefined,
        isNull(notifications.seenAt),
      ),
    );

  return { updated: result.rowCount ?? 0 };
};

export const markAllRead = async (
  db: dbClient,
  args: { userId: string; workspaceId?: number },
) => {
  const result = await db
    .update(notifications)
    .set({ readAt: new Date(), seenAt: new Date() })
    .where(
      and(
        eq(notifications.userId, args.userId),
        args.workspaceId
          ? eq(notifications.workspaceId, args.workspaceId)
          : undefined,
        isNull(notifications.readAt),
      ),
    );

  return { updated: result.rowCount ?? 0 };
};
