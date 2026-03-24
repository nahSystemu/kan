import { useRouter } from "next/router";
import { t } from "@lingui/core/macro";
import { HiOutlinePlusSmall, HiOutlinePencil, HiOutlineTrash } from "react-icons/hi2";

import { PageHead } from "~/components/PageHead";
import Button from "~/components/Button";
import Modal from "~/components/modal";
import { useModal } from "~/providers/modal";
import { useWorkspace } from "~/providers/workspace";
import { api } from "~/utils/api";
import { DeleteRoleConfirmation } from "./components/DeleteRoleConfirmation";

export default function RolesSettings() {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { openModal, isOpen, modalContentType } = useModal();

  const isAdmin = workspace.role === "admin";

  const { data, isLoading } = api.permission.getWorkspaceRoles.useQuery(
    { workspacePublicId: workspace.publicId },
    { enabled: !!workspace.publicId },
  );

  const roles = data?.roles ?? [];
  const systemRoles = roles.filter((r) => r.isSystem);
  const customRoles = roles.filter((r) => !r.isSystem);

  return (
    <>
      <PageHead title={t`Settings | Roles`} />

      <div className="m-auto h-full max-w-[1100px] p-6 px-5 md:px-28 md:py-12">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[14px] font-bold text-neutral-900 dark:text-dark-1000">
            {t`Workspace roles`}
          </h2>
          {isAdmin && (
            <Button
              size="sm"
              onClick={() => void router.push("/roles/new")}
              iconLeft={<HiOutlinePlusSmall className="h-4 w-4" />}
            >
              {t`Create role`}
            </Button>
          )}
        </div>
        <p className="mb-6 text-sm text-neutral-500 dark:text-dark-900">
          {t`Manage roles for this workspace. System roles cannot be deleted but their permissions can be edited on the Permissions page.`}
        </p>

        {isAdmin ? (
          <div className="overflow-x-auto rounded-md border border-light-300 bg-light-50 dark:border-dark-300 dark:bg-dark-100">
            <table className="min-w-full table-fixed divide-y divide-light-600 text-left text-sm dark:divide-dark-600">
              <thead className="rounded-t-lg bg-light-300 dark:bg-dark-300">
                <tr>
                  <th className="w-1/3 rounded-tl-lg px-4 py-3 text-left text-xs font-semibold tracking-wide text-light-900 dark:text-dark-900">
                    {t`Role`}
                  </th>
                  <th className="w-1/4 px-4 py-3 text-left text-xs font-semibold tracking-wide text-light-900 dark:text-dark-900">
                    {t`Description`}
                  </th>
                  <th className="w-1/6 px-4 py-3 text-center text-xs font-semibold tracking-wide text-light-900 dark:text-dark-900">
                    {t`Members`}
                  </th>
                  <th className="w-1/6 px-4 py-3 text-center text-xs font-semibold tracking-wide text-light-900 dark:text-dark-900">
                    {t`Level`}
                  </th>
                  <th className="w-1/6 rounded-tr-lg px-4 py-3 text-right text-xs font-semibold tracking-wide text-light-900 dark:text-dark-900">
                    {t`Actions`}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-light-600 bg-light-50 dark:divide-dark-600 dark:bg-dark-100">
                {isLoading &&
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-4 py-3">
                        <div className="h-4 w-24 animate-pulse rounded bg-light-200 dark:bg-dark-200" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="h-4 w-32 animate-pulse rounded bg-light-200 dark:bg-dark-200" />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="mx-auto h-4 w-8 animate-pulse rounded bg-light-200 dark:bg-dark-200" />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="mx-auto h-4 w-8 animate-pulse rounded bg-light-200 dark:bg-dark-200" />
                      </td>
                      <td className="px-4 py-3" />
                    </tr>
                  ))}

                {!isLoading && systemRoles.length > 0 && (
                  <tr className="bg-light-100 dark:bg-dark-200">
                    <td
                      colSpan={5}
                      className="px-4 py-2 text-xs font-semibold tracking-wide text-light-900 dark:text-dark-900"
                    >
                      {t`System roles`}
                    </td>
                  </tr>
                )}

                {!isLoading &&
                  systemRoles.map((role) => (
                    <RoleRow
                      key={role.publicId}
                      role={role}
                      onEdit={() =>
                        void router.push(`/roles/${role.publicId}`)
                      }
                    />
                  ))}

                {!isLoading && customRoles.length > 0 && (
                  <tr className="bg-light-100 dark:bg-dark-200">
                    <td
                      colSpan={5}
                      className="px-4 py-2 text-xs font-semibold tracking-wide text-light-900 dark:text-dark-900"
                    >
                      {t`Custom roles`}
                    </td>
                  </tr>
                )}

                {!isLoading &&
                  customRoles.map((role) => (
                    <RoleRow
                      key={role.publicId}
                      role={role}
                      onEdit={() =>
                        void router.push(`/roles/${role.publicId}`)
                      }
                      onDelete={() =>
                        openModal("DELETE_ROLE", role.publicId, role.name)
                      }
                    />
                  ))}

                {!isLoading && roles.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-6 text-center text-sm text-neutral-500 dark:text-dark-800"
                    >
                      {t`No roles found.`}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-neutral-500 dark:text-dark-900">
            {t`You need to be an admin to manage workspace roles.`}
          </p>
        )}
      </div>

      <Modal
        modalSize="sm"
        isVisible={isOpen && modalContentType === "DELETE_ROLE"}
      >
        <DeleteRoleConfirmation />
      </Modal>
    </>
  );
}

function RoleRow({
  role,
  onEdit,
  onDelete,
}: {
  role: {
    publicId: string;
    name: string;
    description: string | null;
    hierarchyLevel: number;
    isSystem: boolean;
    color: string | null;
    memberCount: number;
  };
  onEdit: () => void;
  onDelete?: () => void;
}) {
  return (
    <tr>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {role.color && (
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ backgroundColor: role.color }}
            />
          )}
          <span className="text-sm font-medium text-neutral-900 dark:text-dark-1000">
            {role.name.charAt(0).toUpperCase() + role.name.slice(1)}
          </span>
          {role.isSystem && (
            <span className="inline-flex items-center rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-400 ring-1 ring-inset ring-blue-500/20">
              {t`System`}
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-neutral-500 dark:text-dark-900">
        {role.description ?? "—"}
      </td>
      <td className="px-4 py-3 text-center text-sm text-neutral-500 dark:text-dark-900">
        {role.memberCount}
      </td>
      <td className="px-4 py-3 text-center text-sm text-neutral-500 dark:text-dark-900">
        {role.hierarchyLevel}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="rounded p-1 text-light-900 hover:bg-light-300 dark:text-dark-900 dark:hover:bg-dark-300"
          >
            <HiOutlinePencil className="h-4 w-4" />
          </button>
          {!role.isSystem && onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="rounded p-1 text-light-900 hover:bg-red-100 hover:text-red-500 dark:text-dark-900 dark:hover:bg-red-900/20 dark:hover:text-red-400"
            >
              <HiOutlineTrash className="h-4 w-4" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
