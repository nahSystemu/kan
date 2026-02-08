import { relations } from "drizzle-orm";
import {
  bigint,
  bigserial,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { users } from "./users";
import { workspaceMembers, workspaces } from "./workspaces";

export const notificationTypes = ["card.assigned"] as const;
export type NotificationType = (typeof notificationTypes)[number];
export const notificationTypeEnum = pgEnum(
  "notification_type",
  notificationTypes,
);

export const notifications = pgTable("notification", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  publicId: varchar("publicId", { length: 12 }).notNull().unique(),
  workspaceId: bigint("workspaceId", { mode: "number" })
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  workspaceMemberId: bigint("workspaceMemberId", { mode: "number" })
    .notNull()
    .references(() => workspaceMembers.id, { onDelete: "cascade" }),
  userId: uuid("userId").references(() => users.id, {
    onDelete: "set null",
  }),
  createdBy: uuid("createdBy").references(() => users.id, {
    onDelete: "set null",
  }),
  type: notificationTypeEnum("type").notNull(),
  entityPublicId: varchar("entityPublicId", { length: 255 }),
  payload: jsonb("payload"),
  redirectPath: text("redirectPath"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  readAt: timestamp("readAt"),
  seenAt: timestamp("seenAt"),
}).enableRLS();

export const notificationsRelations = relations(notifications, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [notifications.workspaceId],
    references: [workspaces.id],
    relationName: "notificationsWorkspace",
  }),
  workspaceMember: one(workspaceMembers, {
    fields: [notifications.workspaceMemberId],
    references: [workspaceMembers.id],
    relationName: "notificationsWorkspaceMember",
  }),
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
    relationName: "notificationsUser",
  }),
  createdByUser: one(users, {
    fields: [notifications.createdBy],
    references: [users.id],
    relationName: "notificationsCreatedByUser",
  }),
}));
