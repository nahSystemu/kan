import { TRPCError } from "@trpc/server";
import { z } from "zod";

import * as memberRepo from "@kan/db/repository/member.repo";
import * as permissionRepo from "@kan/db/repository/permission.repo";
import * as workspaceRepo from "@kan/db/repository/workspace.repo";
import type { Permission } from "@kan/shared";
import {
  allPermissions,
  MIN_CUSTOM_ROLE_LEVEL,
  MAX_CUSTOM_ROLE_LEVEL,
} from "@kan/shared";

import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  assertCanManageMember,
  assertPermission,
  getMemberEffectivePermissions,
  getUserPermissions,
} from "../utils/permissions";

const permissionsList = [...allPermissions] as [string, ...string[]];

export const permissionRouter = createTRPCRouter({
  getMyPermissions: protectedProcedure
    .meta({
      openapi: {
        summary: "Get my permissions",
        method: "GET",
        path: "/workspaces/{workspacePublicId}/permissions/me",
        description: "Get the current user's permissions in a workspace",
        tags: ["Permissions"],
        protect: true,
      },
    })
    .input(
      z.object({
        workspacePublicId: z.string().min(12),
      }),
    )
    .output(
      z.object({
        permissions: z.array(z.string()),
        role: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId) {
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });
      }

      const workspace = await workspaceRepo.getByPublicId(
        ctx.db,
        input.workspacePublicId,
      );

      if (!workspace) {
        throw new TRPCError({
          message: "Workspace not found",
          code: "NOT_FOUND",
        });
      }

      const result = await getUserPermissions(ctx.db, userId, workspace.id);

      if (!result) {
        throw new TRPCError({
          message: "You are not a member of this workspace",
          code: "FORBIDDEN",
        });
      }

      return result;
    }),
  getMemberPermissions: protectedProcedure
    .meta({
      openapi: {
        summary: "Get member permissions",
        method: "GET",
        path: "/workspaces/{workspacePublicId}/members/{memberPublicId}/permissions",
        description: "Get a specific member's permissions in a workspace",
        tags: ["Permissions"],
        protect: true,
      },
    })
    .input(
      z.object({
        workspacePublicId: z.string().min(12),
        memberPublicId: z.string().min(12),
      }),
    )
    .output(
      z.object({
        memberPublicId: z.string(),
        role: z.string(),
        permissions: z.array(z.string()),
        overrides: z.array(
          z.object({
            permission: z.string(),
            granted: z.boolean(),
          }),
        ),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId) {
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });
      }

      const workspace = await workspaceRepo.getByPublicId(
        ctx.db,
        input.workspacePublicId,
      );

      if (!workspace) {
        throw new TRPCError({
          message: "Workspace not found",
          code: "NOT_FOUND",
        });
      }

      // Check user has permission to view member permissions
      await assertPermission(ctx.db, userId, workspace.id, "member:view");

      const member = await memberRepo.getByPublicId(
        ctx.db,
        input.memberPublicId,
      );

      if (!member || member.workspaceId !== workspace.id) {
        throw new TRPCError({
          message: "Member not found",
          code: "NOT_FOUND",
        });
      }

      const effectivePermissions = await getMemberEffectivePermissions(
        ctx.db,
        member.id,
        member.roleId ?? null,
        member.role,
      );
      const overrides = await permissionRepo.getMemberPermissionOverrides(
        ctx.db,
        member.id,
      );

      return {
        memberPublicId: member.publicId,
        role: member.role,
        permissions: effectivePermissions,
        overrides: overrides.map((o) => ({
          permission: o.permission,
          granted: o.granted,
        })),
      };
    }),
  grantPermission: protectedProcedure
    .meta({
      openapi: {
        summary: "Grant permission to member",
        method: "POST",
        path: "/workspaces/{workspacePublicId}/members/{memberPublicId}/permissions/grant",
        description: "Grant a specific permission to a member",
        tags: ["Permissions"],
        protect: true,
      },
    })
    .input(
      z.object({
        workspacePublicId: z.string().min(12),
        memberPublicId: z.string().min(12),
        permission: z.enum(permissionsList),
      }),
    )
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId) {
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });
      }

      const workspace = await workspaceRepo.getByPublicId(
        ctx.db,
        input.workspacePublicId,
      );

      if (!workspace) {
        throw new TRPCError({
          message: "Workspace not found",
          code: "NOT_FOUND",
        });
      }

      await assertPermission(ctx.db, userId, workspace.id, "member:edit");

      const member = await memberRepo.getByPublicId(
        ctx.db,
        input.memberPublicId,
      );

      if (!member || member.workspaceId !== workspace.id) {
        throw new TRPCError({
          message: "Member not found",
          code: "NOT_FOUND",
        });
      }

      await assertCanManageMember(ctx.db, userId, workspace.id, member.id);

      await permissionRepo.grantPermission(
        ctx.db,
        member.id,
        input.permission as Permission,
      );

      return { success: true };
    }),
  revokePermission: protectedProcedure
    .meta({
      openapi: {
        summary: "Revoke permission from member",
        method: "POST",
        path: "/workspaces/{workspacePublicId}/members/{memberPublicId}/permissions/revoke",
        description: "Revoke a specific permission from a member",
        tags: ["Permissions"],
        protect: true,
      },
    })
    .input(
      z.object({
        workspacePublicId: z.string().min(12),
        memberPublicId: z.string().min(12),
        permission: z.enum(permissionsList),
      }),
    )
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId) {
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });
      }

      const workspace = await workspaceRepo.getByPublicId(
        ctx.db,
        input.workspacePublicId,
      );

      if (!workspace) {
        throw new TRPCError({
          message: "Workspace not found",
          code: "NOT_FOUND",
        });
      }

      await assertPermission(ctx.db, userId, workspace.id, "member:edit");

      const member = await memberRepo.getByPublicId(
        ctx.db,
        input.memberPublicId,
      );

      if (!member || member.workspaceId !== workspace.id) {
        throw new TRPCError({
          message: "Member not found",
          code: "NOT_FOUND",
        });
      }

      await assertCanManageMember(ctx.db, userId, workspace.id, member.id);

      await permissionRepo.revokePermission(
        ctx.db,
        member.id,
        input.permission as Permission,
      );

      return { success: true };
    }),
  resetMemberPermissions: protectedProcedure
    .meta({
      openapi: {
        summary: "Reset member permissions to role defaults",
        method: "POST",
        path: "/workspaces/{workspacePublicId}/members/{memberPublicId}/permissions/reset",
        description:
          "Clears all custom permission overrides for a member so their effective permissions come only from their role",
        tags: ["Permissions"],
        protect: true,
      },
    })
    .input(
      z.object({
        workspacePublicId: z.string().min(12),
        memberPublicId: z.string().min(12),
      }),
    )
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId) {
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });
      }

      const workspace = await workspaceRepo.getByPublicId(
        ctx.db,
        input.workspacePublicId,
      );

      if (!workspace) {
        throw new TRPCError({
          message: "Workspace not found",
          code: "NOT_FOUND",
        });
      }

      await assertPermission(ctx.db, userId, workspace.id, "member:edit");

      const member = await memberRepo.getByPublicId(
        ctx.db,
        input.memberPublicId,
      );

      if (!member || member.workspaceId !== workspace.id) {
        throw new TRPCError({
          message: "Member not found",
          code: "NOT_FOUND",
        });
      }

      await assertCanManageMember(ctx.db, userId, workspace.id, member.id);

      await permissionRepo.clearMemberPermissionOverrides(ctx.db, member.id);

      return { success: true };
    }),
  resetWorkspaceMemberPermissions: protectedProcedure
    .meta({
      openapi: {
        summary: "Reset all member permission overrides in a workspace",
        method: "POST",
        path: "/workspaces/{workspacePublicId}/members/permissions/reset",
        description:
          "Clears all custom permission overrides for all members in a workspace so their effective permissions come only from their roles",
        tags: ["Permissions"],
        protect: true,
      },
    })
    .input(
      z.object({
        workspacePublicId: z.string().min(12),
      }),
    )
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId) {
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });
      }

      const workspace = await workspaceRepo.getByPublicId(
        ctx.db,
        input.workspacePublicId,
      );

      if (!workspace) {
        throw new TRPCError({
          message: "Workspace not found",
          code: "NOT_FOUND",
        });
      }

      await assertPermission(ctx.db, userId, workspace.id, "member:edit");

      await permissionRepo.clearAllMemberPermissionOverridesForWorkspace(
        ctx.db,
        workspace.id,
      );

      return { success: true };
    }),
  getWorkspaceRoles: protectedProcedure
    .meta({
      openapi: {
        summary: "Get workspace roles",
        method: "GET",
        path: "/workspaces/{workspacePublicId}/roles",
        description: "Get all roles for a workspace",
        tags: ["Permissions"],
        protect: true,
      },
    })
    .input(
      z.object({
        workspacePublicId: z.string().min(12),
      }),
    )
    .output(
      z.object({
        roles: z.array(
          z.object({
            publicId: z.string().min(12),
            name: z.string(),
            description: z.string().nullable(),
            hierarchyLevel: z.number(),
            isSystem: z.boolean(),
            color: z.string().nullable(),
            memberCount: z.number(),
          }),
        ),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId) {
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });
      }

      const workspace = await workspaceRepo.getByPublicId(
        ctx.db,
        input.workspacePublicId,
      );

      if (!workspace) {
        throw new TRPCError({
          message: "Workspace not found",
          code: "NOT_FOUND",
        });
      }

      await assertPermission(ctx.db, userId, workspace.id, "role:view");

      const roles = await permissionRepo.getRolesByWorkspaceId(
        ctx.db,
        workspace.id,
      );

      const rolesWithCounts = await Promise.all(
        roles.map(async (role) => {
          const memberCount = await permissionRepo.getMemberCountByRoleId(
            ctx.db,
            role.id,
          );
          return {
            publicId: role.publicId,
            name: role.name,
            description: role.description ?? null,
            hierarchyLevel: role.hierarchyLevel,
            isSystem: role.isSystem,
            color: role.color ?? null,
            memberCount,
          };
        }),
      );

      return {
        roles: rolesWithCounts,
      };
    }),
  getWorkspaceRolePermissions: protectedProcedure
    .meta({
      openapi: {
        summary: "Get workspace role permissions",
        method: "GET",
        path: "/workspaces/{workspacePublicId}/roles/permissions",
        description:
          "Get all roles for a workspace with their granted permissions",
        tags: ["Permissions"],
        protect: true,
      },
    })
    .input(
      z.object({
        workspacePublicId: z.string().min(12),
      }),
    )
    .output(
      z.object({
        roles: z.array(
          z.object({
            publicId: z.string().min(12),
            name: z.string(),
            permissions: z.array(z.string()),
          }),
        ),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId) {
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });
      }

      const workspace = await workspaceRepo.getByPublicId(
        ctx.db,
        input.workspacePublicId,
      );

      if (!workspace) {
        throw new TRPCError({
          message: "Workspace not found",
          code: "NOT_FOUND",
        });
      }

      await assertPermission(ctx.db, userId, workspace.id, "member:view");

      const roles = await permissionRepo.getRolesByWorkspaceId(
        ctx.db,
        workspace.id,
      );

      const rolesWithPermissions = await Promise.all(
        roles.map(async (role) => {
          const permissionsForRole = await permissionRepo.getPermissionsByRoleId(
            ctx.db,
            role.id,
          );

          return {
            publicId: role.publicId,
            name: role.name,
            permissions: permissionsForRole,
          };
        }),
      );

      return {
        roles: rolesWithPermissions,
      };
    }),
  getRolePermissions: protectedProcedure
    .meta({
      openapi: {
        summary: "Get role permissions",
        method: "GET",
        path: "/workspaces/{workspacePublicId}/roles/{rolePublicId}/permissions",
        description: "Get permissions granted to a specific role in a workspace",
        tags: ["Permissions"],
        protect: true,
      },
    })
    .input(
      z.object({
        workspacePublicId: z.string().min(12),
        rolePublicId: z.string().min(12),
      }),
    )
    .output(
      z.object({
        rolePublicId: z.string(),
        name: z.string(),
        permissions: z.array(z.string()),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId) {
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });
      }

      const workspace = await workspaceRepo.getByPublicId(
        ctx.db,
        input.workspacePublicId,
      );

      if (!workspace) {
        throw new TRPCError({
          message: "Workspace not found",
          code: "NOT_FOUND",
        });
      }

      await assertPermission(ctx.db, userId, workspace.id, "member:view");

      const role = await permissionRepo.getRoleByWorkspaceIdAndPublicId(
        ctx.db,
        workspace.id,
        input.rolePublicId,
      );

      if (!role) {
        throw new TRPCError({
          message: "Role not found",
          code: "NOT_FOUND",
        });
      }

      const permissionsForRole = await permissionRepo.getPermissionsByRoleId(
        ctx.db,
        role.id,
      );

      return {
        rolePublicId: role.publicId,
        name: role.name,
        permissions: permissionsForRole,
      };
    }),
  grantRolePermission: protectedProcedure
    .meta({
      openapi: {
        summary: "Grant permission to role",
        method: "POST",
        path: "/workspaces/{workspacePublicId}/roles/{rolePublicId}/permissions/grant",
        description: "Grant a specific permission to a role",
        tags: ["Permissions"],
        protect: true,
      },
    })
    .input(
      z.object({
        workspacePublicId: z.string().min(12),
        rolePublicId: z.string().min(12),
        permission: z.enum(permissionsList),
      }),
    )
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId) {
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });
      }

      const workspace = await workspaceRepo.getByPublicId(
        ctx.db,
        input.workspacePublicId,
      );

      if (!workspace) {
        throw new TRPCError({
          message: "Workspace not found",
          code: "NOT_FOUND",
        });
      }

      // Require ability to edit members/roles
      await assertPermission(ctx.db, userId, workspace.id, "member:edit");

      const role = await permissionRepo.getRoleByWorkspaceIdAndPublicId(
        ctx.db,
        workspace.id,
        input.rolePublicId,
      );

      if (!role) {
        throw new TRPCError({
          message: "Role not found",
          code: "NOT_FOUND",
        });
      }

      if (role.name === "admin" && role.isSystem) {
        throw new TRPCError({
          message: "Admin role permissions cannot be modified",
          code: "FORBIDDEN",
        });
      }

      // Never allow non-admin roles to manage billing or delete workspace
      if (
        (input.permission === "workspace:manage" ||
          input.permission === "workspace:delete") &&
        role.name !== "admin"
      ) {
        throw new TRPCError({
          message:
            "Only the admin role can manage billing or delete the workspace",
          code: "FORBIDDEN",
        });
      }

      await permissionRepo.grantRolePermission(
        ctx.db,
        role.id,
        input.permission as Permission,
      );

      return { success: true };
    }),
  revokeRolePermission: protectedProcedure
    .meta({
      openapi: {
        summary: "Revoke permission from role",
        method: "POST",
        path: "/workspaces/{workspacePublicId}/roles/{rolePublicId}/permissions/revoke",
        description: "Revoke a specific permission from a role",
        tags: ["Permissions"],
        protect: true,
      },
    })
    .input(
      z.object({
        workspacePublicId: z.string().min(12),
        rolePublicId: z.string().min(12),
        permission: z.enum(permissionsList),
      }),
    )
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId) {
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });
      }

      const workspace = await workspaceRepo.getByPublicId(
        ctx.db,
        input.workspacePublicId,
      );

      if (!workspace) {
        throw new TRPCError({
          message: "Workspace not found",
          code: "NOT_FOUND",
        });
      }

      await assertPermission(ctx.db, userId, workspace.id, "member:edit");

      const role = await permissionRepo.getRoleByWorkspaceIdAndPublicId(
        ctx.db,
        workspace.id,
        input.rolePublicId,
      );

      if (!role) {
        throw new TRPCError({
          message: "Role not found",
          code: "NOT_FOUND",
        });
      }

      if (role.name === "admin" && role.isSystem) {
        throw new TRPCError({
          message: "Admin role permissions cannot be modified",
          code: "FORBIDDEN",
        });
      }

      await permissionRepo.revokeRolePermission(
        ctx.db,
        role.id,
        input.permission as Permission,
      );

      return { success: true };
    }),
  createRole: protectedProcedure
    .meta({
      openapi: {
        summary: "Create a custom role",
        method: "POST",
        path: "/workspaces/{workspacePublicId}/roles",
        description: "Create a new custom role in a workspace",
        tags: ["Permissions"],
        protect: true,
      },
    })
    .input(
      z.object({
        workspacePublicId: z.string().min(12),
        name: z.string().min(1).max(64),
        description: z.string().max(255).optional(),
        hierarchyLevel: z
          .number()
          .int()
          .min(MIN_CUSTOM_ROLE_LEVEL)
          .max(MAX_CUSTOM_ROLE_LEVEL),
        color: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .optional(),
        permissions: z.array(z.enum(permissionsList)),
      }),
    )
    .output(
      z.object({
        publicId: z.string(),
        name: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId) {
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });
      }

      const workspace = await workspaceRepo.getByPublicId(
        ctx.db,
        input.workspacePublicId,
      );

      if (!workspace) {
        throw new TRPCError({
          message: "Workspace not found",
          code: "NOT_FOUND",
        });
      }

      await assertPermission(ctx.db, userId, workspace.id, "role:create");

      // Check name uniqueness
      const existing = await permissionRepo.getRoleByWorkspaceIdAndName(
        ctx.db,
        workspace.id,
        input.name,
      );

      if (existing) {
        throw new TRPCError({
          message: `A role named "${input.name}" already exists in this workspace`,
          code: "CONFLICT",
        });
      }

      // Filter out dangerous permissions for non-admin custom roles
      const filteredPermissions = (input.permissions as Permission[]).filter(
        (p) => p !== "workspace:manage" && p !== "workspace:delete",
      );

      const role = await permissionRepo.createRole(ctx.db, {
        workspaceId: workspace.id,
        name: input.name,
        description: input.description ?? "",
        hierarchyLevel: input.hierarchyLevel,
        isSystem: false,
        permissions: filteredPermissions,
      });

      if (!role) {
        throw new TRPCError({
          message: "Failed to create role",
          code: "INTERNAL_SERVER_ERROR",
        });
      }

      // Set color if provided
      if (input.color) {
        await permissionRepo.updateRole(ctx.db, role.id, {
          color: input.color,
        });
      }

      return {
        publicId: role.publicId,
        name: role.name,
      };
    }),
  updateRole: protectedProcedure
    .meta({
      openapi: {
        summary: "Update a role",
        method: "PATCH",
        path: "/workspaces/{workspacePublicId}/roles/{rolePublicId}",
        description: "Update a custom role in a workspace",
        tags: ["Permissions"],
        protect: true,
      },
    })
    .input(
      z.object({
        workspacePublicId: z.string().min(12),
        rolePublicId: z.string().min(12),
        name: z.string().min(1).max(64).optional(),
        description: z.string().max(255).optional(),
        hierarchyLevel: z
          .number()
          .int()
          .min(MIN_CUSTOM_ROLE_LEVEL)
          .max(MAX_CUSTOM_ROLE_LEVEL)
          .optional(),
        color: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .nullable()
          .optional(),
      }),
    )
    .output(
      z.object({
        publicId: z.string(),
        name: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId) {
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });
      }

      const workspace = await workspaceRepo.getByPublicId(
        ctx.db,
        input.workspacePublicId,
      );

      if (!workspace) {
        throw new TRPCError({
          message: "Workspace not found",
          code: "NOT_FOUND",
        });
      }

      await assertPermission(ctx.db, userId, workspace.id, "role:edit");

      const role = await permissionRepo.getRoleByWorkspaceIdAndPublicId(
        ctx.db,
        workspace.id,
        input.rolePublicId,
      );

      if (!role) {
        throw new TRPCError({
          message: "Role not found",
          code: "NOT_FOUND",
        });
      }

      // System roles: cannot change name or hierarchy level
      if (role.isSystem) {
        if (input.name && input.name !== role.name) {
          throw new TRPCError({
            message: "System role name cannot be changed",
            code: "FORBIDDEN",
          });
        }
        if (
          input.hierarchyLevel &&
          input.hierarchyLevel !== role.hierarchyLevel
        ) {
          throw new TRPCError({
            message: "System role hierarchy level cannot be changed",
            code: "FORBIDDEN",
          });
        }
      }

      // Check name uniqueness if changing name
      if (input.name && input.name !== role.name) {
        const existing = await permissionRepo.getRoleByWorkspaceIdAndName(
          ctx.db,
          workspace.id,
          input.name,
        );
        if (existing) {
          throw new TRPCError({
            message: `A role named "${input.name}" already exists in this workspace`,
            code: "CONFLICT",
          });
        }
      }

      const updateData: {
        name?: string;
        description?: string;
        hierarchyLevel?: number;
        color?: string | null;
      } = {};

      if (input.name) updateData.name = input.name;
      if (input.description !== undefined)
        updateData.description = input.description;
      if (input.hierarchyLevel !== undefined)
        updateData.hierarchyLevel = input.hierarchyLevel;
      if (input.color !== undefined) updateData.color = input.color;

      const updated = await permissionRepo.updateRole(
        ctx.db,
        role.id,
        updateData,
      );

      if (!updated) {
        throw new TRPCError({
          message: "Failed to update role",
          code: "INTERNAL_SERVER_ERROR",
        });
      }

      return {
        publicId: updated.publicId,
        name: updated.name,
      };
    }),
  deleteRole: protectedProcedure
    .meta({
      openapi: {
        summary: "Delete a custom role",
        method: "DELETE",
        path: "/workspaces/{workspacePublicId}/roles/{rolePublicId}",
        description:
          "Delete a custom role and reassign its members to a fallback role",
        tags: ["Permissions"],
        protect: true,
      },
    })
    .input(
      z.object({
        workspacePublicId: z.string().min(12),
        rolePublicId: z.string().min(12),
        fallbackRolePublicId: z.string().min(12).optional(),
      }),
    )
    .output(z.object({ success: z.boolean(), reassignedCount: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId) {
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });
      }

      const workspace = await workspaceRepo.getByPublicId(
        ctx.db,
        input.workspacePublicId,
      );

      if (!workspace) {
        throw new TRPCError({
          message: "Workspace not found",
          code: "NOT_FOUND",
        });
      }

      await assertPermission(ctx.db, userId, workspace.id, "role:delete");

      const role = await permissionRepo.getRoleByWorkspaceIdAndPublicId(
        ctx.db,
        workspace.id,
        input.rolePublicId,
      );

      if (!role) {
        throw new TRPCError({
          message: "Role not found",
          code: "NOT_FOUND",
        });
      }

      if (role.isSystem) {
        throw new TRPCError({
          message: "System roles cannot be deleted",
          code: "FORBIDDEN",
        });
      }

      // Determine fallback role
      let fallbackRole;
      if (input.fallbackRolePublicId) {
        fallbackRole = await permissionRepo.getRoleByWorkspaceIdAndPublicId(
          ctx.db,
          workspace.id,
          input.fallbackRolePublicId,
        );
        if (!fallbackRole) {
          throw new TRPCError({
            message: "Fallback role not found",
            code: "NOT_FOUND",
          });
        }
        if (fallbackRole.id === role.id) {
          throw new TRPCError({
            message: "Fallback role cannot be the role being deleted",
            code: "BAD_REQUEST",
          });
        }
      } else {
        // Default to "member" system role
        fallbackRole = await permissionRepo.getRoleByWorkspaceIdAndName(
          ctx.db,
          workspace.id,
          "member",
        );
        if (!fallbackRole) {
          throw new TRPCError({
            message: "Default member role not found",
            code: "INTERNAL_SERVER_ERROR",
          });
        }
      }

      const reassignedCount = await permissionRepo.getMemberCountByRoleId(
        ctx.db,
        role.id,
      );

      await permissionRepo.deleteRole(ctx.db, role.id, fallbackRole.id);

      return { success: true, reassignedCount };
    }),
});
