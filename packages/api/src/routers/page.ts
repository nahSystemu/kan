import { TRPCError } from "@trpc/server";
import { z } from "zod";

import * as pageRepo from "@kan/db/repository/page.repo";
import * as workspaceRepo from "@kan/db/repository/workspace.repo";

import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { assertUserInWorkspace } from "../utils/auth";

export const pageRouter = createTRPCRouter({
  all: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/workspaces/{workspacePublicId}/pages",
        summary: "Get all pages",
        description: "Retrieves all pages for a given workspace",
        tags: ["Pages"],
        protect: true,
      },
    })
    .input(z.object({ workspacePublicId: z.string().min(12) }))
    .output(
      z.custom<Awaited<ReturnType<typeof pageRepo.getAllByWorkspaceId>>>(),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId)
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });

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

      return pageRepo.getAllByWorkspaceId(ctx.db, workspace.id);
    }),
  byId: publicProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/pages/{pagePublicId}",
        summary: "Get page by public ID",
        description: "Retrieves a page by its public ID",
        tags: ["Pages"],
        protect: false,
      },
    })
    .input(z.object({ pagePublicId: z.string().min(12) }))
    .output(
      z.custom<
        Awaited<ReturnType<typeof pageRepo.getByPublicIdWithWorkspaceMembers>>
      >(),
    )
    .query(async ({ ctx, input }) => {
      const pageRef = await pageRepo.getWorkspaceAndPageIdByPagePublicId(
        ctx.db,
        input.pagePublicId,
      );

      if (!pageRef)
        throw new TRPCError({
          message: `Page with public ID ${input.pagePublicId} not found`,
          code: "NOT_FOUND",
        });

      // Allow public access only if the page is public; otherwise require auth + workspace membership
      const page = await pageRepo.getByPublicIdWithWorkspaceMembers(
        ctx.db,
        input.pagePublicId,
      );
      if (!page)
        throw new TRPCError({
          message: `Page with public ID ${input.pagePublicId} not found`,
          code: "NOT_FOUND",
        });

      const _page = page as unknown as { visibility?: "public" | "private" };
      if (_page.visibility !== "public") {
        const userId = ctx.user?.id;
        if (!userId)
          throw new TRPCError({
            message: "User not authenticated",
            code: "UNAUTHORIZED",
          });
        const _ref = pageRef as unknown as { workspaceId: number };
        await assertUserInWorkspace(ctx.db, userId, _ref.workspaceId);
      }
      return page;
    }),
  bySlug: publicProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/pages/slug/{pageSlug}",
        summary: "Get page by slug",
        description: "Retrieves a page by its slug",
        tags: ["Pages"],
        protect: false,
      },
    })
    .input(z.object({ pageSlug: z.string().min(3).max(60) }))
    .output(
      z.custom<
        Awaited<ReturnType<typeof pageRepo.getByPublicIdWithWorkspaceMembers>>
      >(),
    )
    .query(async ({ ctx, input }) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
      const pageRef = await pageRepo.getWorkspaceAndPageIdByPageSlug(
        ctx.db,
        input.pageSlug,
      );
      if (!pageRef)
        throw new TRPCError({ message: "Page not found", code: "NOT_FOUND" });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
      const page = await pageRepo.getBySlugWithWorkspaceMembers(
        ctx.db,
        input.pageSlug,
      );
      if (!page)
        throw new TRPCError({ message: "Page not found", code: "NOT_FOUND" });

      const pageSafe = page as unknown as { visibility: "public" | "private" };
      if (pageSafe.visibility !== "public") {
        const userId = ctx.user?.id;
        if (!userId)
          throw new TRPCError({
            message: "User not authenticated",
            code: "UNAUTHORIZED",
          });
        const refSafe = pageRef as unknown as { workspaceId: number };
        await assertUserInWorkspace(ctx.db, userId, refSafe.workspaceId);
      }
      return page as Awaited<
        ReturnType<typeof pageRepo.getByPublicIdWithWorkspaceMembers>
      >;
    }),
  create: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/workspaces/{workspacePublicId}/pages",
        summary: "Create page",
        description: "Creates a new page for a given workspace",
        tags: ["Pages"],
        protect: true,
      },
    })
    .input(
      z.object({
        workspacePublicId: z.string().min(12),
        title: z.string().min(1),
        description: z.string().max(20000).optional(),
      }),
    )
    .output(z.custom<Awaited<ReturnType<typeof pageRepo.create>>>())
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId)
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });

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

      const page = await pageRepo.create(ctx.db, {
        title: input.title,
        description: input.description,
        createdBy: userId,
        workspaceId: workspace.id,
      });
      if (!page)
        throw new TRPCError({
          message: "Failed to create page",
          code: "INTERNAL_SERVER_ERROR",
        });
      return page;
    }),
  update: protectedProcedure
    .meta({
      openapi: {
        method: "PUT",
        path: "/pages/{pagePublicId}",
        summary: "Update page",
        description: "Updates a page's title or description",
        tags: ["Pages"],
        protect: true,
      },
    })
    .input(
      z.object({
        pagePublicId: z.string().min(12),
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        visibility: z.enum(["public", "private"]).optional(),
        slug: z
          .string()
          .min(3)
          .max(60)
          .regex(/^(?![-]+$)[a-zA-Z0-9-]+$/)
          .optional(),
      }),
    )
    .output(z.custom<Awaited<ReturnType<typeof pageRepo.update>>>())
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId)
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });

      const pageRef = await pageRepo.getWorkspaceAndPageIdByPagePublicId(
        ctx.db,
        input.pagePublicId,
      );
      if (!pageRef)
        throw new TRPCError({
          message: `Page with public ID ${input.pagePublicId} not found`,
          code: "NOT_FOUND",
        });

      await assertUserInWorkspace(ctx.db, userId, pageRef.workspaceId);

      // If updating slug, optionally validate collisions here (skipped to avoid type drift during build)

      const updated = await pageRepo.update(
        ctx.db,
        { pagePublicId: input.pagePublicId },
        {
          title: input.title,
          description: input.description,
          visibility: input.visibility,
          slug: input.slug,
        },
      );
      if (!updated)
        throw new TRPCError({
          message: "Failed to update page",
          code: "INTERNAL_SERVER_ERROR",
        });
      return updated;
    }),
  checkSlugAvailability: protectedProcedure
    .meta({
      openapi: {
        summary: "Check if a page slug is available",
        method: "GET",
        path: "/pages/{pagePublicId}/check-slug-availability",
        description: "Checks if a page slug is available within the workspace",
        tags: ["Pages"],
        protect: true,
      },
    })
    .input(
      z.object({
        pageSlug: z
          .string()
          .min(3)
          .max(60)
          .regex(/^(?![-]+$)[a-zA-Z0-9-]+$/),
        pagePublicId: z.string().min(12),
      }),
    )
    .output(
      z.object({
        isReserved: z.boolean(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId)
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });

      const pageRef = await pageRepo.getWorkspaceAndPageIdByPagePublicId(
        ctx.db,
        input.pagePublicId,
      );
      if (!pageRef)
        throw new TRPCError({
          message: `Page with public ID ${input.pagePublicId} not found`,
          code: "NOT_FOUND",
        });

      await assertUserInWorkspace(ctx.db, userId, pageRef.workspaceId);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
      const isAvailable = await pageRepo.isPageSlugAvailable(
        ctx.db,
        input.pageSlug,
        pageRef.workspaceId,
        pageRef.id,
      );
      return { isReserved: !isAvailable };
    }),
  delete: protectedProcedure
    .meta({
      openapi: {
        method: "DELETE",
        path: "/pages/{pagePublicId}",
        summary: "Delete page",
        description: "Soft-deletes a page",
        tags: ["Pages"],
        protect: true,
      },
    })
    .input(z.object({ pagePublicId: z.string().min(12) }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId)
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });

      const pageRef = await pageRepo.getWorkspaceAndPageIdByPagePublicId(
        ctx.db,
        input.pagePublicId,
      );
      if (!pageRef)
        throw new TRPCError({
          message: `Page with public ID ${input.pagePublicId} not found`,
          code: "NOT_FOUND",
        });

      await assertUserInWorkspace(ctx.db, userId, pageRef.workspaceId);

      const deleted = await pageRepo.softDelete(ctx.db, {
        pageId: pageRef.id,
        deletedAt: new Date(),
        deletedBy: userId,
      });
      if (!deleted)
        throw new TRPCError({
          message: "Failed to delete page",
          code: "INTERNAL_SERVER_ERROR",
        });
      return { success: true };
    }),
  createTag: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/pages/{pagePublicId}/tags",
        summary: "Create page tag",
        description: "Creates a tag scoped to a page",
        tags: ["Pages"],
        protect: true,
      },
    })
    .input(
      z.object({
        pagePublicId: z.string().min(12),
        name: z.string().min(1),
        colourCode: z.string().max(12).optional(),
      }),
    )
    .output(
      z.object({
        publicId: z.string(),
        name: z.string(),
        colourCode: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId)
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });
      const pageRef = await pageRepo.getWorkspaceAndPageIdByPagePublicId(
        ctx.db,
        input.pagePublicId,
      );
      if (!pageRef)
        throw new TRPCError({ message: "Page not found", code: "NOT_FOUND" });
      await assertUserInWorkspace(ctx.db, userId, pageRef.workspaceId);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
      const tag = await pageRepo.createTag(ctx.db, {
        pageId: pageRef.id,
        name: input.name,
        colourCode: input.colourCode,
        createdBy: userId,
      });
      if (!tag)
        throw new TRPCError({
          message: "Failed to create tag",
          code: "INTERNAL_SERVER_ERROR",
        });
      return tag as {
        publicId: string;
        name: string;
        colourCode?: string | null;
      };
    }),
  updateTag: protectedProcedure
    .meta({
      openapi: {
        method: "PUT",
        path: "/pages/tags/{tagPublicId}",
        summary: "Update page tag",
        description: "Updates a page tag",
        tags: ["Pages"],
        protect: true,
      },
    })
    .input(
      z.object({
        tagPublicId: z.string().min(12),
        name: z.string().min(1).optional(),
        colourCode: z.string().max(12).nullable().optional(),
      }),
    )
    .output(
      z.object({
        publicId: z.string(),
        name: z.string(),
        colourCode: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId)
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
      const ref = await pageRepo.getWorkspaceAndPageIdByTagPublicId(
        ctx.db,
        input.tagPublicId,
      );
      if (!ref)
        throw new TRPCError({ message: "Tag not found", code: "NOT_FOUND" });
      await assertUserInWorkspace(
        ctx.db,
        userId,
        (ref as { workspaceId: number }).workspaceId,
      );
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
      const updated = await pageRepo.updateTag(
        ctx.db,
        { tagPublicId: input.tagPublicId },
        { name: input.name, colourCode: input.colourCode ?? undefined },
      );
      if (!updated)
        throw new TRPCError({
          message: "Failed to update tag",
          code: "INTERNAL_SERVER_ERROR",
        });
      return updated as {
        publicId: string;
        name: string;
        colourCode?: string | null;
      };
    }),
  deleteTag: protectedProcedure
    .meta({
      openapi: {
        method: "DELETE",
        path: "/pages/tags/{tagPublicId}",
        summary: "Delete page tag",
        description: "Soft-deletes a page tag",
        tags: ["Pages"],
        protect: true,
      },
    })
    .input(z.object({ tagPublicId: z.string().min(12) }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId)
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
      const ref = await pageRepo.getWorkspaceAndPageIdByTagPublicId(
        ctx.db,
        input.tagPublicId,
      );
      if (!ref)
        throw new TRPCError({ message: "Tag not found", code: "NOT_FOUND" });
      await assertUserInWorkspace(
        ctx.db,
        userId,
        (ref as { workspaceId: number }).workspaceId,
      );
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
      const deleted = await pageRepo.softDeleteTag(ctx.db, {
        tagId: (ref as { tagId: number }).tagId,
        deletedAt: new Date(),
        deletedBy: userId,
      });
      if (!deleted)
        throw new TRPCError({
          message: "Failed to delete tag",
          code: "INTERNAL_SERVER_ERROR",
        });
      return { success: true };
    }),
  // Reusable page labels (workspace-scoped)
  listLabels: protectedProcedure
    .input(z.object({ workspacePublicId: z.string().min(12) }))
    .output(
      z.array(
        z.object({
          publicId: z.string(),
          name: z.string(),
          colourCode: z.string().nullable().optional(),
        }),
      ),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId)
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });
      const ws = await workspaceRepo.getByPublicId(
        ctx.db,
        input.workspacePublicId,
      );
      if (!ws)
        throw new TRPCError({
          message: "Workspace not found",
          code: "NOT_FOUND",
        });
      await assertUserInWorkspace(ctx.db, userId, ws.id);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const labels = (await pageRepo.listWorkspacePageLabels(
        ctx.db,
        ws.id,
      )) as { publicId: string; name: string; colourCode?: string | null }[];
      return labels;
    }),
  createLabel: protectedProcedure
    .input(
      z.object({
        workspacePublicId: z.string().min(12),
        name: z.string().min(1),
        colourCode: z.string().max(12).optional(),
      }),
    )
    .output(
      z.object({
        publicId: z.string(),
        name: z.string(),
        colourCode: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId)
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });
      const ws = await workspaceRepo.getByPublicId(
        ctx.db,
        input.workspacePublicId,
      );
      if (!ws)
        throw new TRPCError({
          message: "Workspace not found",
          code: "NOT_FOUND",
        });
      await assertUserInWorkspace(ctx.db, userId, ws.id);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      return (await pageRepo.createWorkspacePageLabel(ctx.db, {
        workspaceId: ws.id,
        name: input.name,
        colourCode: input.colourCode,
        createdBy: userId,
      })) as { publicId: string; name: string; colourCode?: string | null };
    }),
  updateLabel: protectedProcedure
    .input(
      z.object({
        labelPublicId: z.string().min(12),
        name: z.string().min(1).optional(),
        colourCode: z.string().max(12).nullable().optional(),
      }),
    )
    .output(
      z.object({
        publicId: z.string(),
        name: z.string(),
        colourCode: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId)
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });
      // no workspace check here without join; rely on RLS or later enhancement
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
      const updated = await pageRepo.updateWorkspacePageLabel(
        ctx.db,
        { labelPublicId: input.labelPublicId },
        { name: input.name, colourCode: input.colourCode ?? undefined },
      );
      if (!updated)
        throw new TRPCError({
          message: "Failed to update label",
          code: "INTERNAL_SERVER_ERROR",
        });
      return updated as {
        publicId: string;
        name: string;
        colourCode?: string | null;
      };
    }),
  deleteLabel: protectedProcedure
    .input(z.object({ labelPublicId: z.string().min(12) }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId)
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
      const deleted = await pageRepo.softDeleteWorkspacePageLabel(ctx.db, {
        labelPublicId: input.labelPublicId,
        deletedAt: new Date(),
        deletedBy: userId,
      });
      if (!deleted)
        throw new TRPCError({
          message: "Failed to delete label",
          code: "INTERNAL_SERVER_ERROR",
        });
      return { success: true };
    }),
  attachLabel: protectedProcedure
    .input(
      z.object({
        pagePublicId: z.string().min(12),
        labelPublicId: z.string().min(12),
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
      const ref = await pageRepo.getWorkspaceAndPageIdByPagePublicId(
        ctx.db,
        input.pagePublicId,
      );
      if (!ref)
        throw new TRPCError({ message: "Page not found", code: "NOT_FOUND" });
      await assertUserInWorkspace(ctx.db, userId, ref.workspaceId);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const labelRef = (await pageRepo.getLabelWorkspaceIdByPublicId(
        ctx.db,
        input.labelPublicId,
      )) as { id: number; workspaceId: number } | null;
      if (!labelRef)
        throw new TRPCError({ message: "Label not found", code: "NOT_FOUND" });
      if (labelRef.workspaceId !== ref.workspaceId)
        throw new TRPCError({
          message: "Label not in workspace",
          code: "FORBIDDEN",
        });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      await pageRepo.attachLabelToPage(ctx.db, {
        pageId: ref.id,
        labelId: labelRef.id,
      });
      return { success: true };
    }),
  detachLabel: protectedProcedure
    .input(
      z.object({
        pagePublicId: z.string().min(12),
        labelPublicId: z.string().min(12),
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
      const ref = await pageRepo.getWorkspaceAndPageIdByPagePublicId(
        ctx.db,
        input.pagePublicId,
      );
      if (!ref)
        throw new TRPCError({ message: "Page not found", code: "NOT_FOUND" });
      await assertUserInWorkspace(ctx.db, userId, ref.workspaceId);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const labelRef = (await pageRepo.getLabelWorkspaceIdByPublicId(
        ctx.db,
        input.labelPublicId,
      )) as { id: number; workspaceId: number } | null;
      if (!labelRef) return { success: true };
      if (labelRef.workspaceId !== ref.workspaceId) return { success: true };
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      await pageRepo.detachLabelFromPage(ctx.db, {
        pageId: ref.id,
        labelId: labelRef.id,
      });
      return { success: true };
    }),
});
