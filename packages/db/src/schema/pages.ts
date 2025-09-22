import { relations, sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  index,
  uniqueIndex,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { users } from "./users";
import { workspaces } from "./workspaces";

export const pageVisibilityStatuses = ["private", "public"] as const;
export type PageVisibilityStatus = (typeof pageVisibilityStatuses)[number];
export const pageVisibilityEnum = pgEnum(
  "page_visibility",
  pageVisibilityStatuses,
);

export const pages = pgTable(
  "page",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    publicId: varchar("publicId", { length: 12 }).notNull().unique(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    // Optional slug to allow friendly URLs; kept nullable for backward compatibility
    slug: varchar("slug", { length: 255 }),
    workspaceId: bigint("workspaceId", { mode: "number" })
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    createdBy: uuid("createdBy").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt"),
    deletedAt: timestamp("deletedAt"),
    deletedBy: uuid("deletedBy").references(() => users.id, {
      onDelete: "set null",
    }),
    visibility: pageVisibilityEnum("visibility").notNull().default("private"),
  },
  (table) => [
    index("page_visibility_idx").on(table.visibility),
    // Keep a composite index to support workspace+slug lookups if needed (non-unique)
    index("page_workspace_slug_idx").on(table.workspaceId, table.slug),
    // Global uniqueness for slugs on non-deleted rows (case-insensitive ensured by API lower-casing)
    uniqueIndex("unique_page_slug_global")
      .on(table.slug)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
).enableRLS();

export const pagesRelations = relations(pages, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [pages.createdBy],
    references: [users.id],
    relationName: "pagesCreatedByUser",
  }),
  deletedBy: one(users, {
    fields: [pages.deletedBy],
    references: [users.id],
    relationName: "pagesDeletedByUser",
  }),
  workspace: one(workspaces, {
    fields: [pages.workspaceId],
    references: [workspaces.id],
    relationName: "pagesWorkspace",
  }),
  tags: many(pageTags),
  pageLabelJoins: many(pagesToLabels),
}));

export const pageTags = pgTable("page_tag", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  publicId: varchar("publicId", { length: 12 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  colourCode: varchar("colourCode", { length: 12 }),
  pageId: bigint("pageId", { mode: "number" })
    .notNull()
    .references(() => pages.id, { onDelete: "cascade" }),
  createdBy: uuid("createdBy").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt"),
  deletedAt: timestamp("deletedAt"),
  deletedBy: uuid("deletedBy").references(() => users.id, {
    onDelete: "set null",
  }),
}).enableRLS();

export const pageTagsRelations = relations(pageTags, ({ one }) => ({
  page: one(pages, {
    fields: [pageTags.pageId],
    references: [pages.id],
    relationName: "pageTagsPage",
  }),
  createdBy: one(users, {
    fields: [pageTags.createdBy],
    references: [users.id],
    relationName: "pageTagsCreatedByUser",
  }),
  deletedBy: one(users, {
    fields: [pageTags.deletedBy],
    references: [users.id],
    relationName: "pageTagsDeletedByUser",
  }),
}));

// Reusable Page Labels (workspace-scoped), plus join table for assignments to pages
export const pageLabels = pgTable("page_label", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  publicId: varchar("publicId", { length: 12 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  colourCode: varchar("colourCode", { length: 12 }),
  workspaceId: bigint("workspaceId", { mode: "number" })
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  createdBy: uuid("createdBy").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt"),
  deletedAt: timestamp("deletedAt"),
  deletedBy: uuid("deletedBy").references(() => users.id, {
    onDelete: "set null",
  }),
}).enableRLS();

export const pageLabelsRelations = relations(pageLabels, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [pageLabels.workspaceId],
    references: [workspaces.id],
    relationName: "pageLabelsWorkspace",
  }),
  createdBy: one(users, {
    fields: [pageLabels.createdBy],
    references: [users.id],
    relationName: "pageLabelsCreatedByUser",
  }),
  deletedBy: one(users, {
    fields: [pageLabels.deletedBy],
    references: [users.id],
    relationName: "pageLabelsDeletedByUser",
  }),
  pageLabelJoins: many(pagesToLabels),
}));

export const pagesToLabels = pgTable(
  "_page_labels",
  {
    pageId: bigint("pageId", { mode: "number" })
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    labelId: bigint("labelId", { mode: "number" })
      .notNull()
      .references(() => pageLabels.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.pageId, t.labelId] })],
).enableRLS();

export const pagesToLabelsRelations = relations(pagesToLabels, ({ one }) => ({
  page: one(pages, {
    fields: [pagesToLabels.pageId],
    references: [pages.id],
    relationName: "pagesToLabelsPage",
  }),
  label: one(pageLabels, {
    fields: [pagesToLabels.labelId],
    references: [pageLabels.id],
    relationName: "pagesToLabelsLabel",
  }),
}));
