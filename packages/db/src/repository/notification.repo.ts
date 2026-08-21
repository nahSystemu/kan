import { and, desc, eq, isNull, or } from "drizzle-orm";

import type { dbClient } from "@kan/db/client";
import {
  cards,
  comments,
  notifications,
  type NotificationType,
} from "@kan/db/schema";
import { generateUID } from "@kan/shared/utils";

export const create = async (
  db: dbClient,
  input: {
    userId: string;
    type: NotificationType;
    cardId?: number;
    commentId?: number;
  },
) => {
  const [result] = await db
    .insert(notifications)
    .values({
      publicId: generateUID(),
      userId: input.userId,
      type: input.type,
      cardId: input.cardId,
      commentId: input.commentId,
    })
    .returning({ id: notifications.id });

  return result;
};

export const bulkCreate = async (
  db: dbClient,
  inputs: {
    userId: string;
    type: NotificationType;
    cardId?: number;
    commentId?: number;
  }[],
) => {
  if (inputs.length === 0) return [];
  const rows = inputs.map((n) => ({ ...n, publicId: generateUID() }));
  const results = await db
    .insert(notifications)
    .values(rows)
    .returning({ id: notifications.id });
  return results;
};

export const listForUser = async (
  db: dbClient,
  userId: string,
  args: { status?: "all" | "read" | "unread"; limit?: number },
) => {
  const status = args.status ?? "all";
  const limit = args.limit ?? 50;

  const readFilter =
    status === "all"
      ? undefined
      : status === "read"
        ? isNull(notifications.readAt).not()
        : isNull(notifications.readAt);

  const rows = await db
    .select({
      publicId: notifications.publicId,
      type: notifications.type,
      createdAt: notifications.createdAt,
      readAt: notifications.readAt,
      cardPublicId: cards.publicId,
      cardTitle: cards.title,
      commentPublicId: comments.publicId,
    })
    .from(notifications)
    .leftJoin(cards, eq(notifications.cardId, cards.id))
    .leftJoin(comments, eq(notifications.commentId, comments.id))
    .where(
      and(eq(notifications.userId, userId), isNull(notifications.deletedAt), readFilter),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(limit);

  return rows;
};

export const markRead = async (db: dbClient, userId: string, publicId: string) => {
  const [result] = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.publicId, publicId),
        eq(notifications.userId, userId),
        isNull(notifications.deletedAt),
      ),
    )
    .returning({ publicId: notifications.publicId, readAt: notifications.readAt });
  return result;
};

export const markAllRead = async (db: dbClient, userId: string) => {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt), isNull(notifications.deletedAt)));
  return { success: true } as const;
};

export const markReadByCardPublicId = async (
  db: dbClient,
  userId: string,
  cardPublicId: string,
) => {
  // Resolve card ID first
  const card = await db.query.cards.findFirst({
    columns: { id: true },
    where: and(eq(cards.publicId, cardPublicId), isNull(cards.deletedAt)),
  });
  if (!card) return { success: false } as const;

  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.cardId, card.id),
        isNull(notifications.readAt),
        isNull(notifications.deletedAt),
      ),
    );
  return { success: true } as const;
};

export const clear = async (
  db: dbClient,
  userId: string,
  scope: "all" | "read" | "unread" = "all",
) => {
  const scopeFilter =
    scope === "all"
      ? undefined
      : scope === "read"
        ? isNull(notifications.readAt).not()
        : isNull(notifications.readAt);

  await db
    .update(notifications)
    .set({ deletedAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.deletedAt), scopeFilter));
  return { success: true } as const;
};
