import { zodResolver } from "@hookform/resolvers/zod";
import { t } from "@lingui/core/macro";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { HiXMark } from "react-icons/hi2";
import { z } from "zod";

import Button from "~/components/Button";
import Input from "~/components/Input";
import { useModal } from "~/providers/modal";
import { useWorkspace } from "~/providers/workspace";
import { api } from "~/utils/api";

const schema = z.object({
  title: z
    .string()
    .min(1, { message: t`Page title is required` })
    .max(200, { message: t`Page title cannot exceed 200 characters` }),
  workspacePublicId: z.string(),
  description: z.string().optional(),
});

type NewPageInput = z.infer<typeof schema>;

export function NewPageForm() {
  const utils = api.useUtils();
  const { closeModal } = useModal();
  const { workspace } = useWorkspace();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<NewPageInput>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      description: "",
      workspacePublicId: workspace.publicId || "",
    },
  });

  const refetchPages = () =>
    utils.page.all.refetch({ workspacePublicId: workspace.publicId });

  const createPage = api.page.create.useMutation({
    onSuccess: async () => {
      closeModal();
      await refetchPages();
    },
  });

  const onSubmit = (data: NewPageInput) => {
    createPage.mutate({
      workspacePublicId: data.workspacePublicId,
      title: data.title,
      description: data.description || undefined,
    });
  };

  useEffect(() => {
    const titleElement: HTMLElement | null =
      document.querySelector<HTMLElement>("#title");
    if (titleElement) titleElement.focus();
  }, []);

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="px-5 pt-5">
        <div className="text-neutral-9000 flex w-full items-center justify-between pb-4 dark:text-dark-1000">
          <h2 className="text-sm font-bold">{t`New page`}</h2>
          <button
            type="button"
            className="rounded p-1 hover:bg-light-300 focus:outline-none dark:hover:bg-dark-300"
            onClick={(e) => {
              e.preventDefault();
              closeModal();
            }}
          >
            <HiXMark size={18} className="dark:text-dark-9000 text-light-900" />
          </button>
        </div>
        <Input
          id="title"
          placeholder={t`Title`}
          {...register("title", { required: true })}
          errorMessage={errors.title?.message}
        />
        <input type="hidden" {...register("workspacePublicId")} />
      </div>
      <div className="mt-6 flex items-center justify-end border-t border-light-600 px-5 pb-5 pt-5 dark:border-dark-600">
        <Button
          type="submit"
          isLoading={createPage.isPending}
        >{t`Create page`}</Button>
      </div>
    </form>
  );
}
