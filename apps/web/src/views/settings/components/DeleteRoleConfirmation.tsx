import { t } from "@lingui/core/macro";
import { useState } from "react";

import Button from "~/components/Button";
import { useModal } from "~/providers/modal";
import { usePopup } from "~/providers/popup";
import { useWorkspace } from "~/providers/workspace";
import { api } from "~/utils/api";

export function DeleteRoleConfirmation() {
  const { closeModal, entityId, entityLabel } = useModal();
  const { workspace } = useWorkspace();
  const { showPopup } = usePopup();
  const utils = api.useUtils();

  const { data: rolesData } = api.permission.getWorkspaceRoles.useQuery(
    { workspacePublicId: workspace.publicId },
    { enabled: !!workspace.publicId },
  );

  const roleToDelete = rolesData?.roles.find((r) => r.publicId === entityId);
  const fallbackOptions = (rolesData?.roles ?? []).filter(
    (r) => r.publicId !== entityId,
  );

  const [fallbackRolePublicId, setFallbackRolePublicId] = useState<string>("");

  const deleteMutation = api.permission.deleteRole.useMutation({
    onSuccess: async (data) => {
      await utils.permission.getWorkspaceRoles.invalidate({
        workspacePublicId: workspace.publicId,
      });
      closeModal();
      showPopup({
        header: t`Role deleted`,
        message:
          data.reassignedCount > 0
            ? t`The role has been deleted and ${String(data.reassignedCount)} member(s) have been reassigned.`
            : t`The role has been deleted.`,
        icon: "success",
      });
    },
    onError: (error) => {
      showPopup({
        header: t`Unable to delete role`,
        message: error.message,
        icon: "error",
      });
    },
  });

  const handleDelete = () => {
    if (!workspace.publicId || !entityId) return;

    deleteMutation.mutate({
      workspacePublicId: workspace.publicId,
      rolePublicId: entityId,
      fallbackRolePublicId: fallbackRolePublicId || undefined,
    });
  };

  return (
    <div className="p-5">
      <div className="flex w-full flex-col justify-between pb-4">
        <h2 className="text-md pb-4 font-medium text-neutral-900 dark:text-dark-1000">
          {t`Delete role "${entityLabel}"?`}
        </h2>
        <p className="mb-4 text-sm text-light-900 dark:text-dark-900">
          {roleToDelete && roleToDelete.memberCount > 0
            ? t`This role has ${String(roleToDelete.memberCount)} member(s). They will be reassigned to the fallback role below.`
            : t`This role will be permanently deleted. This action cannot be undone.`}
        </p>

        {roleToDelete && roleToDelete.memberCount > 0 && (
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700 dark:text-dark-900">
              {t`Reassign members to`}
            </label>
            <select
              value={fallbackRolePublicId}
              onChange={(e) => setFallbackRolePublicId(e.target.value)}
              className="w-full rounded-md border-0 bg-white/5 py-1.5 text-sm shadow-sm ring-1 ring-inset ring-light-600 focus:ring-2 focus:ring-inset focus:ring-light-700 dark:bg-dark-300 dark:text-dark-1000 dark:ring-dark-700 dark:focus:ring-dark-700"
            >
              <option value="">{t`Member (default)`}</option>
              {fallbackOptions.map((r) => (
                <option key={r.publicId} value={r.publicId}>
                  {r.name.charAt(0).toUpperCase() + r.name.slice(1)}
                  {r.isSystem ? ` (${t`System`})` : ""}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div className="mt-5 flex justify-end space-x-2 sm:mt-6">
        <Button size="sm" variant="secondary" onClick={() => closeModal()}>
          {t`Cancel`}
        </Button>
        <Button
          size="sm"
          variant="danger"
          onClick={handleDelete}
          isLoading={deleteMutation.isPending}
        >
          {t`Delete role`}
        </Button>
      </div>
    </div>
  );
}
