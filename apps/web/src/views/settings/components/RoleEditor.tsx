import { t } from "@lingui/core/macro";
import { useEffect, useState } from "react";
import { HiXMark } from "react-icons/hi2";

import type { Permission } from "@kan/shared";
import {
  permissionCategories,
  MIN_CUSTOM_ROLE_LEVEL,
  MAX_CUSTOM_ROLE_LEVEL,
} from "@kan/shared";

import Button from "~/components/Button";
import Input from "~/components/Input";
import { useModal } from "~/providers/modal";
import { usePopup } from "~/providers/popup";
import { useWorkspace } from "~/providers/workspace";
import { api } from "~/utils/api";

const permissionLabels: Record<Permission, string> = {
  "workspace:view": t`Can view workspace`,
  "workspace:edit": t`Can edit workspace`,
  "workspace:delete": t`Can delete workspace`,
  "workspace:manage": t`Can manage workspace settings`,
  "board:view": t`Can view boards`,
  "board:create": t`Can create boards`,
  "board:edit": t`Can edit boards`,
  "board:delete": t`Can delete boards`,
  "list:view": t`Can view lists`,
  "list:create": t`Can create lists`,
  "list:edit": t`Can edit lists`,
  "list:delete": t`Can delete lists`,
  "card:view": t`Can view cards`,
  "card:create": t`Can create cards`,
  "card:edit": t`Can edit cards`,
  "card:delete": t`Can delete cards`,
  "comment:view": t`Can view comments`,
  "comment:create": t`Can add comments`,
  "comment:edit": t`Can edit comments`,
  "comment:delete": t`Can delete comments`,
  "member:view": t`Can view members`,
  "member:invite": t`Can invite members`,
  "member:edit": t`Can edit member roles and permissions`,
  "member:remove": t`Can remove members`,
  "role:view": t`Can view roles`,
  "role:create": t`Can create roles`,
  "role:edit": t`Can edit roles`,
  "role:delete": t`Can delete roles`,
};

const PRESET_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

interface RoleEditorProps {
  role?: {
    publicId: string;
    name: string;
    description: string | null;
    hierarchyLevel: number;
    isSystem: boolean;
    color: string | null;
  };
}

export function RoleEditor({ role }: RoleEditorProps) {
  const isEditing = !!role;
  const { closeModal } = useModal();
  const { workspace } = useWorkspace();
  const { showPopup } = usePopup();
  const utils = api.useUtils();

  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [hierarchyLevel, setHierarchyLevel] = useState(
    role?.hierarchyLevel ?? 50,
  );
  const [color, setColor] = useState<string | null>(role?.color ?? null);
  const [selectedPermissions, setSelectedPermissions] = useState<Permission[]>(
    [],
  );
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);

  // Load current role permissions when editing
  const { data: permissionsData, isLoading: isLoadingPermissions } =
    api.permission.getWorkspaceRolePermissions.useQuery(
      { workspacePublicId: workspace.publicId },
      {
        enabled: isEditing && !!workspace.publicId,
      },
    );

  useEffect(() => {
    if (!permissionsData || permissionsLoaded) return;
    const editingRole = permissionsData.roles.find(
      (r: { publicId: string }) => r.publicId === role?.publicId,
    );
    if (editingRole) {
      setSelectedPermissions(editingRole.permissions as Permission[]);
    }
    setPermissionsLoaded(true);
  }, [permissionsData, permissionsLoaded, role?.publicId]);

  const invalidateRoles = async () => {
    if (!workspace.publicId) return;
    await utils.permission.getWorkspaceRoles.invalidate({
      workspacePublicId: workspace.publicId,
    });
    await utils.permission.getWorkspaceRolePermissions.invalidate({
      workspacePublicId: workspace.publicId,
    });
  };

  const createMutation = api.permission.createRole.useMutation({
    onSuccess: async () => {
      await invalidateRoles();
      closeModal();
      showPopup({
        header: t`Role created`,
        message: t`The role has been created successfully.`,
        icon: "success",
      });
    },
    onError: (error) => {
      showPopup({
        header: t`Unable to create role`,
        message: error.message,
        icon: "error",
      });
    },
  });

  const updateMutation = api.permission.updateRole.useMutation({
    onSuccess: async () => {
      await invalidateRoles();
      closeModal();
      showPopup({
        header: t`Role updated`,
        message: t`The role has been updated successfully.`,
        icon: "success",
      });
    },
    onError: (error) => {
      showPopup({
        header: t`Unable to update role`,
        message: error.message,
        icon: "error",
      });
    },
  });

  const grantMutation = api.permission.grantRolePermission.useMutation();
  const revokeMutation = api.permission.revokeRolePermission.useMutation();

  const isBusy =
    createMutation.isPending ||
    updateMutation.isPending ||
    grantMutation.isPending ||
    revokeMutation.isPending;

  const handlePermissionToggle = (permission: Permission, checked: boolean) => {
    if (role) {
      // When editing, immediately grant/revoke on the server
      if (checked) {
        setSelectedPermissions((prev) => [...prev, permission]);
        grantMutation.mutate({
          workspacePublicId: workspace.publicId,
          rolePublicId: role.publicId,
          permission,
        });
      } else {
        setSelectedPermissions((prev) => prev.filter((p) => p !== permission));
        revokeMutation.mutate({
          workspacePublicId: workspace.publicId,
          rolePublicId: role.publicId,
          permission,
        });
      }
    } else {
      // When creating, just track locally
      if (checked) {
        setSelectedPermissions((prev) => [...prev, permission]);
      } else {
        setSelectedPermissions((prev) => prev.filter((p) => p !== permission));
      }
    }
  };

  const handleSubmit = () => {
    if (!workspace.publicId || !name.trim()) return;

    if (role) {
      updateMutation.mutate({
        workspacePublicId: workspace.publicId,
        rolePublicId: role.publicId,
        name: name !== role.name ? name : undefined,
        description,
        hierarchyLevel:
          !role.isSystem && hierarchyLevel !== role.hierarchyLevel
            ? hierarchyLevel
            : undefined,
        color,
      });
    } else {
      createMutation.mutate({
        workspacePublicId: workspace.publicId,
        name,
        description,
        hierarchyLevel,
        color: color ?? undefined,
        permissions: selectedPermissions,
      });
    }
  };

  const isSystemRole = role?.isSystem ?? false;

  return (
    <div className="max-h-[80vh] overflow-y-auto">
      <div className="px-5 pt-5">
        <div className="flex w-full items-center justify-between pb-4">
          <h2 className="text-sm font-bold text-neutral-900 dark:text-dark-1000">
            {isEditing ? t`Edit role` : t`Create role`}
          </h2>
          <button
            type="button"
            className="rounded p-1 hover:bg-light-300 focus:outline-none dark:hover:bg-dark-300"
            onClick={() => closeModal()}
          >
            <HiXMark
              size={18}
              className="text-light-900 dark:text-dark-900"
            />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700 dark:text-dark-900">
              {t`Name`}
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t`Role name`}
              disabled={isSystemRole}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700 dark:text-dark-900">
              {t`Description`}
            </label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t`Optional description`}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700 dark:text-dark-900">
              {t`Hierarchy level`}
              <span className="ml-1 font-normal text-neutral-400 dark:text-dark-800">
                ({MIN_CUSTOM_ROLE_LEVEL}–{MAX_CUSTOM_ROLE_LEVEL})
              </span>
            </label>
            {isSystemRole ? (
              <p className="text-sm text-neutral-500 dark:text-dark-900">
                {hierarchyLevel}
                <span className="ml-2 text-xs text-neutral-400 dark:text-dark-800">
                  ({t`System role level cannot be changed`})
                </span>
              </p>
            ) : (
              <input
                type="range"
                min={MIN_CUSTOM_ROLE_LEVEL}
                max={MAX_CUSTOM_ROLE_LEVEL}
                value={hierarchyLevel}
                onChange={(e) => setHierarchyLevel(Number(e.target.value))}
                className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-light-300 accent-blue-600 dark:bg-dark-300"
              />
            )}
            {!isSystemRole && (
              <div className="mt-1 flex justify-between text-[10px] text-neutral-400 dark:text-dark-800">
                <span>{t`Lower priority`}</span>
                <span className="font-medium text-neutral-600 dark:text-dark-900">
                  {hierarchyLevel}
                </span>
                <span>{t`Higher priority`}</span>
              </div>
            )}
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium text-neutral-700 dark:text-dark-900">
              {t`Color`}
            </label>
            <div className="flex items-center gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(color === c ? null : c)}
                  className="h-6 w-6 rounded-full border-2 transition-all"
                  style={{
                    backgroundColor: c,
                    borderColor: color === c ? c : "transparent",
                    boxShadow:
                      color === c ? `0 0 0 2px white, 0 0 0 4px ${c}` : "none",
                  }}
                />
              ))}
            </div>
          </div>

          {/* Permissions section */}
          <div>
            <label className="mb-2 block text-xs font-medium text-neutral-700 dark:text-dark-900">
              {t`Permissions`}
            </label>
            {isEditing && isLoadingPermissions ? (
              <div className="py-4 text-center text-sm text-neutral-500 dark:text-dark-800">
                {t`Loading permissions...`}
              </div>
            ) : (
              <div className="rounded-md border border-light-300 dark:border-dark-300">
                {Object.values(permissionCategories).map((category) => (
                  <div key={category.label}>
                    <div className="bg-light-100 px-3 py-1.5 text-xs font-semibold text-light-900 dark:bg-dark-200 dark:text-dark-900">
                      {category.label}
                    </div>
                    {category.permissions.map((permission) => {
                      const checked =
                        selectedPermissions.includes(permission);

                      return (
                        <label
                          key={permission}
                          className="flex cursor-pointer items-center gap-3 border-t border-light-200 px-3 py-2 hover:bg-light-50 dark:border-dark-400 dark:hover:bg-dark-200"
                        >
                          <input
                            type="checkbox"
                            className="h-[16px] w-[16px] appearance-none rounded-md border border-light-500 bg-transparent outline-none ring-0 checked:bg-blue-600 focus:shadow-none focus:ring-0 focus:ring-offset-0 focus-visible:outline-none dark:border-dark-500 dark:hover:border-dark-500 disabled:opacity-60"
                            checked={checked}
                            disabled={isBusy}
                            onChange={(e) =>
                              handlePermissionToggle(
                                permission,
                                e.target.checked,
                              )
                            }
                          />
                          <span className="text-sm text-light-900 dark:text-dark-900">
                            {permissionLabels[permission]}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-end border-t border-light-600 px-5 pb-5 pt-5 dark:border-dark-600">
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => closeModal()}>
            {t`Cancel`}
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            isLoading={createMutation.isPending || updateMutation.isPending}
            disabled={!name.trim() || isBusy}
          >
            {isEditing ? t`Save changes` : t`Create role`}
          </Button>
        </div>
      </div>
    </div>
  );
}
