import { useRouter } from "next/router";
import { t } from "@lingui/core/macro";
import { useState } from "react";
import { HiArrowLeft } from "react-icons/hi2";

import type { Permission } from "@kan/shared";
import {
  permissionCategories,
  MIN_CUSTOM_ROLE_LEVEL,
  MAX_CUSTOM_ROLE_LEVEL,
} from "@kan/shared";

import Button from "~/components/Button";
import Input from "~/components/Input";
import { PageHead } from "~/components/PageHead";
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

export function RoleCreateView() {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { showPopup } = usePopup();
  const utils = api.useUtils();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [hierarchyLevel, setHierarchyLevel] = useState(50);
  const [color, setColor] = useState<string | null>(null);
  const [selectedPermissions, setSelectedPermissions] = useState<Permission[]>(
    [],
  );

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
      showPopup({
        header: t`Role created`,
        message: t`The role has been created successfully.`,
        icon: "success",
      });
      void router.push("/roles");
    },
    onError: (error) => {
      showPopup({
        header: t`Unable to create role`,
        message: error.message,
        icon: "error",
      });
    },
  });

  const handlePermissionToggle = (permission: Permission, checked: boolean) => {
    if (checked) {
      setSelectedPermissions((prev) => [...prev, permission]);
    } else {
      setSelectedPermissions((prev) => prev.filter((p) => p !== permission));
    }
  };

  const handleCreate = () => {
    if (!workspace.publicId || !name.trim()) return;

    createMutation.mutate({
      workspacePublicId: workspace.publicId,
      name,
      description,
      hierarchyLevel,
      color: color ?? undefined,
      permissions: selectedPermissions,
    });
  };

  return (
    <div className="mb-16 md:mb-24">
      <PageHead title={t`Create role`} />

      <div className="m-auto h-full max-w-[1100px] p-6 px-5 md:px-28 md:py-12">
        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/roles")}
            className="rounded p-1.5 text-light-900 hover:bg-light-300 dark:text-dark-900 dark:hover:bg-dark-300"
          >
            <HiArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-[14px] font-bold text-neutral-900 dark:text-dark-1000">
            {t`Create role`}
          </h1>
        </div>

        {/* Role details section */}
        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700 dark:text-dark-900">
              {t`Name`}
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t`Role name`}
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
            <input
              type="range"
              min={MIN_CUSTOM_ROLE_LEVEL}
              max={MAX_CUSTOM_ROLE_LEVEL}
              value={hierarchyLevel}
              onChange={(e) => setHierarchyLevel(Number(e.target.value))}
              className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-light-300 accent-blue-600 dark:bg-dark-300"
            />
            <div className="mt-1 flex justify-between text-[10px] text-neutral-400 dark:text-dark-800">
              <span>{t`Lower priority`}</span>
              <span className="font-medium text-neutral-600 dark:text-dark-900">
                {hierarchyLevel}
              </span>
              <span>{t`Higher priority`}</span>
            </div>
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
                      color === c
                        ? `0 0 0 2px white, 0 0 0 4px ${c}`
                        : "none",
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Permissions section */}
        <div className="mb-8">
          <h2 className="mb-4 text-[14px] font-bold text-neutral-900 dark:text-dark-1000">
            {t`Permissions`}
          </h2>
          <div className="overflow-hidden rounded-md border border-light-300 dark:border-dark-300">
            {Object.values(permissionCategories).map((category) => (
              <div key={category.label}>
                <div className="bg-light-100 px-4 py-2 text-xs font-semibold text-light-900 dark:bg-dark-200 dark:text-dark-900">
                  {category.label}
                </div>
                {category.permissions.map((permission) => {
                  const checked = selectedPermissions.includes(permission);

                  return (
                    <label
                      key={permission}
                      className="flex cursor-pointer items-center gap-3 border-t border-light-200 px-4 py-2.5 hover:bg-light-50 dark:border-dark-400 dark:hover:bg-dark-200"
                    >
                      <input
                        type="checkbox"
                        className="h-[16px] w-[16px] appearance-none rounded-md border border-light-500 bg-transparent outline-none ring-0 checked:bg-blue-600 focus:shadow-none focus:ring-0 focus:ring-offset-0 focus-visible:outline-none dark:border-dark-500 dark:hover:border-dark-500 disabled:opacity-60"
                        checked={checked}
                        disabled={createMutation.isPending}
                        onChange={(e) =>
                          handlePermissionToggle(permission, e.target.checked)
                        }
                      />
                      <div className="flex flex-col">
                        <span className="text-sm text-neutral-900 dark:text-dark-1000">
                          {permission}
                        </span>
                        <span className="text-xs text-neutral-500 dark:text-dark-800">
                          {permissionLabels[permission]}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Create button */}
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={handleCreate}
            isLoading={createMutation.isPending}
            disabled={!name.trim() || createMutation.isPending}
          >
            {t`Create role`}
          </Button>
        </div>
      </div>
    </div>
  );
}
