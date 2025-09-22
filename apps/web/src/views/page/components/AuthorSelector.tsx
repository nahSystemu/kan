import { t } from "@lingui/core/macro";
import Avatar from "~/components/Avatar";
import CheckboxDropdown from "~/components/CheckboxDropdown";
import { usePopup } from "~/providers/popup";
import { api } from "~/utils/api";

interface AuthorSelectorProps {
  pagePublicId: string;
  members: {
    key: string;
    value: string;
    selected: boolean;
    leftIcon: React.ReactNode;
    imageUrl: string | undefined;
  }[];
  isLoading?: boolean;
}

export default function AuthorSelector({ pagePublicId, members, isLoading }: AuthorSelectorProps) {
  const utils = api.useUtils();
  const { showPopup } = usePopup();

  // Temporary cast while types propagate across packages
  const addOrRemoveAuthor = ((api.page as unknown as { addOrRemoveAuthor: { useMutation: typeof api.page.update.useMutation } }).addOrRemoveAuthor).useMutation({
    onMutate: async (_update) => {
      await utils.page.byId.cancel();
      const prevById = utils.page.byId.getData({ pagePublicId });
      return { prevById };
    },
    onError: () => {
      showPopup({
        header: t`Unable to update authors`,
        message: t`Please try again later, or contact customer support.`,
        icon: "error",
      });
    },
    onSettled: async () => {
      try {
        await utils.page.byId.invalidate({ pagePublicId });
      } catch {
        /* ignore */
      }
    },
  });

  const selectedAuthors = members.filter((m) => m.selected);

  return (
    <CheckboxDropdown
      items={members}
      handleSelect={(_, member) => {
        const payload = {
          pagePublicId,
          workspaceMemberPublicId: String(member.key),
        } as unknown as never;
        addOrRemoveAuthor.mutate(payload);
      }}
      createNewItemLabel={t`Invite author`}
      asChild
    >
      <div className="flex h-full w-full items-center rounded-[5px] border-[1px] border-light-50 py-1 pl-2 text-left text-sm text-neutral-900 hover:border-light-300 hover:bg-light-200 dark:border-dark-50 dark:text-dark-1000 dark:hover:border-dark-200 dark:hover:bg-dark-100">
        {isLoading ? (
          <div className="h-5 w-[120px] animate-pulse rounded bg-light-200 dark:bg-dark-300" />
        ) : selectedAuthors.length ? (
          <div className="isolate flex justify-end -space-x-1 overflow-hidden">
            {selectedAuthors.map(({ value, imageUrl }) => (
              <Avatar key={value} size="sm" name={value} imageUrl={imageUrl} email={value} />
            ))}
          </div>
        ) : (
          <span className="text-xs text-light-800 dark:text-dark-900">{t`Add author`}</span>
        )}
      </div>
    </CheckboxDropdown>
  );
}
