import { and, eq, isNull, ne } from "drizzle-orm";

import type { dbClient } from "@kan/db/client";
import {
  pageLabels,
  pages,
  pagesToLabels,
  pageTags,
  workspaceMembers,
} from "@kan/db/schema";
import { generateUID } from "@kan/shared/utils";

export const create = async (
  db: dbClient,
  pageInput: {
    title: string;
    description?: string;
    createdBy: string;
    workspaceId: number;
  },
) => {
  const [result] = await db
    .insert(pages)
    .values({
      publicId: generateUID(),
      title: pageInput.title,
      description: pageInput.description,
      createdBy: pageInput.createdBy,
      workspaceId: pageInput.workspaceId,
    })
    .returning({
      id: pages.id,
      publicId: pages.publicId,
      title: pages.title,
      description: pages.description,
      workspaceId: pages.workspaceId,
    });

  return result;
};

export const update = async (
  db: dbClient,
  args: { pagePublicId: string },
  pageInput: {
    title?: string;
    description?: string;
    visibility?: "public" | "private";
    slug?: string;
  },
) => {
  const [result] = await db
    .update(pages)
    .set({
      ...(pageInput.title !== undefined ? { title: pageInput.title } : {}),
      ...(pageInput.description !== undefined
        ? { description: pageInput.description }
        : {}),
      ...(pageInput.visibility !== undefined
        ? { visibility: pageInput.visibility }
        : {}),
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore slug exists on pages; type cache may be stale before build
      ...(pageInput.slug !== undefined ? { slug: pageInput.slug } : {}),
    })
    .where(and(eq(pages.publicId, args.pagePublicId), isNull(pages.deletedAt)))
    .returning({
      id: pages.id,
      publicId: pages.publicId,
      title: pages.title,
      description: pages.description,
      visibility: pages.visibility,
      workspaceId: pages.workspaceId,
    });

  return result;
};

export const softDelete = async (
  db: dbClient,
  args: { pageId: number; deletedAt: Date; deletedBy: string },
) => {
  const [result] = await db
    .update(pages)
    .set({ deletedAt: args.deletedAt, deletedBy: args.deletedBy })
    .where(and(eq(pages.id, args.pageId), isNull(pages.deletedAt)))
    .returning({ id: pages.id });

  return result;
};

export const getAllByWorkspaceId = (db: dbClient, workspaceId: number) => {
  return db.query.pages.findMany({
    columns: {
      publicId: true,
      title: true,
      createdAt: true,
      visibility: true,
    },
    with: {
      tags: {
        columns: { publicId: true, name: true, colourCode: true },
        where: isNull(pageTags.deletedAt),
      },
      pageLabelJoins: {
        columns: {},
        with: {
          label: {
            columns: { publicId: true, name: true, colourCode: true },
          },
        },
      },
    },
    where: and(eq(pages.workspaceId, workspaceId), isNull(pages.deletedAt)),
    orderBy: (fields, { desc }) => [desc(fields.createdAt)],
  });
};

export const getByPublicIdWithWorkspaceMembers = (
  db: dbClient,
  pagePublicId: string,
) => {
  return db.query.pages.findFirst({
    columns: {
      id: true,
      publicId: true,
      title: true,
      description: true,
      visibility: true,
      createdAt: true,
      updatedAt: true,
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore slug exists on pages; type cache may be stale before build
      slug: true,
    },
    with: {
      createdBy: {
        columns: { id: true, name: true, email: true, image: true },
      },
      workspace: {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore slug exists on workspace; type cache may be stale before build
        columns: { id: true, publicId: true, slug: true },
        with: {
          members: {
            columns: { publicId: true, email: true, role: true, status: true },
            where: isNull(workspaceMembers.deletedAt),
            with: {
              user: {
                columns: { id: true, name: true, email: true, image: true },
              },
            },
          },
        },
      },
      tags: {
        columns: { publicId: true, name: true, colourCode: true },
        where: isNull(pageTags.deletedAt),
      },
      pageLabelJoins: {
        columns: {},
        with: {
          label: {
            columns: { publicId: true, name: true, colourCode: true },
          },
        },
      },
    },
    where: and(eq(pages.publicId, pagePublicId), isNull(pages.deletedAt)),
  });
};

export const getBySlugWithWorkspaceMembers = (db: dbClient, slug: string) => {
  return db.query.pages.findFirst({
    columns: {
      id: true,
      publicId: true,
      title: true,
      description: true,
      visibility: true,
      createdAt: true,
      updatedAt: true,
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore slug exists on pages; type cache may be stale before build
      slug: true,
    },
    with: {
      createdBy: {
        columns: { id: true, name: true, email: true, image: true },
      },
      workspace: {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore slug exists on workspace; type cache may be stale before build
        columns: { id: true, publicId: true, slug: true },
        with: {
          members: {
            columns: { publicId: true, email: true, role: true, status: true },
            where: isNull(workspaceMembers.deletedAt),
            with: {
              user: {
                columns: { id: true, name: true, email: true, image: true },
              },
            },
          },
        },
      },
      tags: {
        columns: { publicId: true, name: true, colourCode: true },
        where: isNull(pageTags.deletedAt),
      },
      pageLabelJoins: {
        columns: {},
        with: {
          label: {
            columns: { publicId: true, name: true, colourCode: true },
          },
        },
      },
    },
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore slug exists on pages; type cache may be stale before build
    where: and(eq(pages.slug, slug), isNull(pages.deletedAt)),
  });
};

export const getWorkspaceAndPageIdByPagePublicId = async (
  db: dbClient,
  pagePublicId: string,
) => {
  const result = await db.query.pages.findFirst({
    columns: { id: true, workspaceId: true },
    where: eq(pages.publicId, pagePublicId),
  });

  return result ? { id: result.id, workspaceId: result.workspaceId } : null;
};

export const isPageSlugAvailable = async (
  db: dbClient,
  slug: string,
  workspaceId: number,
  excludePageId?: number,
) => {
  const conditions = [
    eq(pages.workspaceId, workspaceId),
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore slug exists on pages; type cache may be stale before build
    eq(pages.slug, slug),
    isNull(pages.deletedAt),
  ];
  if (excludePageId) conditions.push(ne(pages.id, excludePageId));

  const existing = await db.query.pages.findFirst({
    columns: { id: true },
    where: and(...conditions),
  });
  return !existing;
};

export const getWorkspaceAndPageIdByPageSlug = async (
  db: dbClient,
  slug: string,
) => {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore slug exists on pages; type cache may be stale before build
  const result = await db.query.pages.findFirst({
    columns: { id: true, workspaceId: true },
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore slug exists on pages; type cache may be stale before build
    where: and(eq(pages.slug, slug), isNull(pages.deletedAt)),
  });
  return result ? { id: result.id, workspaceId: result.workspaceId } : null;
};

export const createTag = async (
  db: dbClient,
  input: {
    pageId: number;
    name: string;
    colourCode?: string | null;
    createdBy: string;
  },
) => {
  const [result] = await db
    .insert(pageTags)
    .values({
      publicId: generateUID(),
      name: input.name,
      colourCode: input.colourCode ?? null,
      pageId: input.pageId,
      createdBy: input.createdBy,
    })
    .returning({
      publicId: pageTags.publicId,
      name: pageTags.name,
      colourCode: pageTags.colourCode,
    });
  return result;
};

export const getTagByPublicId = (db: dbClient, tagPublicId: string) => {
  return db.query.pageTags.findFirst({
    columns: { id: true, pageId: true },
    where: eq(pageTags.publicId, tagPublicId),
  });
};

export const getWorkspaceAndPageIdByTagPublicId = async (
  db: dbClient,
  tagPublicId: string,
) => {
  const tag = await db.query.pageTags.findFirst({
    columns: { id: true },
    where: eq(pageTags.publicId, tagPublicId),
    with: {
      page: {
        columns: { id: true, workspaceId: true },
      },
    },
  });
  return tag
    ? { tagId: tag.id, pageId: tag.page.id, workspaceId: tag.page.workspaceId }
    : null;
};

export const updateTag = async (
  db: dbClient,
  args: { tagPublicId: string },
  input: { name?: string; colourCode?: string | null },
) => {
  const [result] = await db
    .update(pageTags)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.colourCode !== undefined
        ? { colourCode: input.colourCode }
        : {}),
    })
    .where(
      and(eq(pageTags.publicId, args.tagPublicId), isNull(pageTags.deletedAt)),
    )
    .returning({
      publicId: pageTags.publicId,
      name: pageTags.name,
      colourCode: pageTags.colourCode,
    });
  return result;
};

export const softDeleteTag = async (
  db: dbClient,
  args: { tagId: number; deletedAt: Date; deletedBy: string },
) => {
  const [result] = await db
    .update(pageTags)
    .set({ deletedAt: args.deletedAt, deletedBy: args.deletedBy })
    .where(and(eq(pageTags.id, args.tagId), isNull(pageTags.deletedAt)))
    .returning({ id: pageTags.id });
  return result;
};

// Workspace-level reusable labels for pages
export const listWorkspacePageLabels = async (
  db: dbClient,
  workspaceId: number,
) => {
  return db.query.pageLabels.findMany({
    columns: { publicId: true, name: true, colourCode: true },
    where: and(
      eq(pageLabels.workspaceId, workspaceId),
      isNull(pageLabels.deletedAt),
    ),
  });
};

export const createWorkspacePageLabel = async (
  db: dbClient,
  input: {
    workspaceId: number;
    name: string;
    colourCode?: string | null;
    createdBy: string;
  },
) => {
  const [result] = await db
    .insert(pageLabels)
    .values({
      publicId: generateUID(),
      name: input.name,
      colourCode: input.colourCode ?? null,
      workspaceId: input.workspaceId,
      createdBy: input.createdBy,
    })
    .returning({
      publicId: pageLabels.publicId,
      name: pageLabels.name,
      colourCode: pageLabels.colourCode,
    });
  return result;
};

export const updateWorkspacePageLabel = async (
  db: dbClient,
  args: { labelPublicId: string },
  input: { name?: string; colourCode?: string | null },
) => {
  const [result] = await db
    .update(pageLabels)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.colourCode !== undefined
        ? { colourCode: input.colourCode }
        : {}),
    })
    .where(
      and(
        eq(pageLabels.publicId, args.labelPublicId),
        isNull(pageLabels.deletedAt),
      ),
    )
    .returning({
      publicId: pageLabels.publicId,
      name: pageLabels.name,
      colourCode: pageLabels.colourCode,
    });
  return result;
};

export const softDeleteWorkspacePageLabel = async (
  db: dbClient,
  args: { labelPublicId: string; deletedAt: Date; deletedBy: string },
) => {
  const [result] = await db
    .update(pageLabels)
    .set({ deletedAt: args.deletedAt, deletedBy: args.deletedBy })
    .where(
      and(
        eq(pageLabels.publicId, args.labelPublicId),
        isNull(pageLabels.deletedAt),
      ),
    )
    .returning({ id: pageLabels.id });
  return result;
};

export const getLabelWorkspaceIdByPublicId = (
  db: dbClient,
  labelPublicId: string,
) => {
  return db.query.pageLabels.findFirst({
    columns: { id: true, workspaceId: true },
    where: and(
      eq(pageLabels.publicId, labelPublicId),
      isNull(pageLabels.deletedAt),
    ),
  });
};

export const attachLabelToPage = async (
  db: dbClient,
  args: { pageId: number; labelId: number },
) => {
  const [result] = await db
    .insert(pagesToLabels)
    .values({ pageId: args.pageId, labelId: args.labelId })
    .returning({
      pageId: pagesToLabels.pageId,
      labelId: pagesToLabels.labelId,
    });
  return result;
};

export const detachLabelFromPage = async (
  db: dbClient,
  args: { pageId: number; labelId: number },
) => {
  const [result] = await db
    .delete(pagesToLabels)
    .where(
      and(
        eq(pagesToLabels.pageId, args.pageId),
        eq(pagesToLabels.labelId, args.labelId),
      ),
    )
    .returning({
      pageId: pagesToLabels.pageId,
      labelId: pagesToLabels.labelId,
    });
  return result;
};
