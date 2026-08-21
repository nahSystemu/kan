import { relations } from "drizzle-orm";
import {
  bigint,
  bigserial,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { users } from "./users";
import { cards, comments } from "./cards";

export const notificationTypes = [
  "card.member.added",
  "card.comment.added",
  "comment.mention",
] as const;

export type NotificationType = (typeof notificationTypes)[number];

export const notificationTypeEnum = pgEnum(
  "notification_type",
  notificationTypes,
);

export const notifications = pgTable("notification", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  publicId: varchar("publicId", { length: 12 }).notNull().unique(),
  userId: uuid("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: notificationTypeEnum("type").notNull(),
  cardId: bigint("cardId", { mode: "number" }).references(() => cards.id, {
    onDelete: "cascade",
  }),
  commentId: bigint("commentId", { mode: "number" }).references(
    () => comments.id,
    { onDelete: "cascade" },
  ),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  readAt: timestamp("readAt"),
  deletedAt: timestamp("deletedAt"),
});

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
    relationName: "notificationsUser",
  }),
  card: one(cards, {
    fields: [notifications.cardId],
    references: [cards.id],
    relationName: "notificationsCard",
  }),
  comment: one(comments, {
    fields: [notifications.commentId],
    references: [comments.id],
    relationName: "notificationsComment",
  }),
}));
