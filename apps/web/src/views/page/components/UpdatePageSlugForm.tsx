import { zodResolver } from "@hookform/resolvers/zod";
import { t } from "@lingui/core/macro";
import { env } from "next-runtime-env";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import Button from "~/components/Button";
import { useDebounce } from "~/hooks/useDebounce";
import { useModal } from "~/providers/modal";
import { usePopup } from "~/providers/popup";
import { api } from "~/utils/api";

export function UpdatePageSlugForm({
  pagePublicId,
  pageSlug,
}: {
  pagePublicId: string;
  pageSlug: string;
}) {
  const { closeModal } = useModal();
  const { showPopup } = usePopup();
  const utils = api.useUtils();

  const schema = z.object({
    slug: z
      .string()
      .min(3, { message: t`Page URL must be at least 3 characters long` })
      .max(60, { message: t`Page URL cannot exceed 60 characters` })
      .regex(/^(?![-]+$)[a-zA-Z0-9-]+$/, {
        message: t`Page URL can only contain letters, numbers, and hyphens`,
      }),
  });

  type FormValues = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    formState: { isDirty, errors },
    watch,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: { slug: pageSlug },
    mode: "onChange",
  });

  const slug = watch("slug");
  const [debouncedSlug] = useDebounce(slug, 500);

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
  const updatePageSlug = api.page.update.useMutation({
    onError: () => {
      showPopup({
        header: t`Unable to update page URL`,
        message: t`Please try again later, or contact customer support.`,
        icon: "error",
      });
    },
    onSettled: async () => {
      closeModal();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await utils.page.byId.invalidate({ pagePublicId });
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
  const checkPageSlugAvailability = api.page.checkSlugAvailability.useQuery(
    { pageSlug: debouncedSlug, pagePublicId },
    {
      enabled: !!debouncedSlug && debouncedSlug !== pageSlug && !errors.slug,
    },
  );
  const isPageSlugAvailable = (
    checkPageSlugAvailability as unknown as {
      data?: { isReserved: boolean } | undefined;
    }
  ).data;
  const isReserved = Boolean(isPageSlugAvailable?.isReserved);

  useEffect(() => {
    const nameElement: HTMLElement | null =
      document.querySelector<HTMLElement>("#page-slug");
    if (nameElement) nameElement.focus();
  }, []);

  const onSubmit = (data: FormValues) => {
    if (!isPageSlugAvailable) return;
    if (isPageSlugAvailable.isReserved) return;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    updatePageSlug.mutate({ pagePublicId, slug: data.slug });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="px-5 pt-5">
        <div className="flex w-full items-center justify-between pb-4">
          <h2 className="text-sm font-bold text-neutral-900 dark:text-dark-1000">
            {t`Edit page URL`}
          </h2>
          <button
            type="button"
            className="rounded p-1 hover:bg-light-200 focus:outline-none dark:hover:bg-dark-300"
            onClick={(e) => {
              e.preventDefault();
              closeModal();
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              strokeWidth={2}
              stroke="currentColor"
              className="h-5 w-5 text-light-900 dark:text-dark-900"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="flex w-full flex-col gap-1">
          <div className="relative flex">
            <div className="flex shrink-0 items-center rounded-l-md border border-r-0 border-light-600 px-3 text-sm dark:border-dark-700 dark:text-dark-1000 sm:text-sm/6">
              {`${env("NEXT_PUBLIC_KAN_ENV") === "cloud" ? "kan.bn" : env("NEXT_PUBLIC_BASE_URL")}/pages/`}
            </div>
            <input
              id="page-slug"
              className="block w-full rounded-md border-0 bg-dark-300 bg-white/5 py-1.5 text-sm shadow-sm ring-1 ring-inset ring-light-600 placeholder:text-dark-800 focus:ring-2 focus:ring-inset focus:ring-light-700 dark:text-dark-1000 dark:ring-dark-700 dark:focus:ring-dark-700 sm:leading-6"
              onKeyDown={async (e: React.KeyboardEvent) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  await handleSubmit(onSubmit)();
                }
              }}
              {...register("slug")}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {Boolean(errors.slug?.message) || isReserved ? (
                <svg
                  className="h-4 w-4 text-red-500"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    fillRule="evenodd"
                    d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25Zm-1.72 6.97a.75.75 0 1 0-1.06 1.06L10.94 12l-1.72 1.72a.75.75 0 1 0 1.06 1.06L12 13.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L13.06 12l1.72-1.72a.75.75 0 1 0-1.06-1.06L12 10.94 10.28 9.22Z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : (
                <svg
                  className="h-4 w-4 dark:text-dark-1000"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    fillRule="evenodd"
                    d="M12 2.25a9.75 9.75 0 1 0 0 19.5 9.75 9.75 0 0 0 0-19.5Zm4.28 7.28a.75.75 0 0 0-1.06-1.06L11 12.69l-2.22-2.22a.75.75 0 1 0-1.06 1.06l2.75 2.75a.75.75 0 0 0 1.06 0l4.75-4.75Z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </div>
          </div>
          {(errors.slug?.message ??
            (isReserved
              ? t`This page URL has already been taken`
              : undefined)) && (
            <div className="text-xs text-red-500">
              {errors.slug?.message ?? t`This page URL has already been taken`}
            </div>
          )}
        </div>
      </div>
      <div className="mt-12 flex items-center justify-end border-t border-light-600 px-5 pb-5 pt-5 dark:border-dark-600">
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            href="/settings?tab=workspace"
            onClick={closeModal}
          >
            {t`Edit workspace URL`}
          </Button>
          {(() => {
            const isMutating = Boolean(
              (updatePageSlug as unknown as { isPending?: boolean }).isPending,
            );
            const isChecking = Boolean(
              (checkPageSlugAvailability as unknown as { isPending?: boolean })
                .isPending,
            );
            const disableUpdate =
              !isDirty ||
              isMutating ||
              Boolean(errors.slug?.message) ||
              isReserved ||
              isChecking;
            return (
              <Button
                type="submit"
                isLoading={isMutating}
                disabled={disableUpdate}
              >
                {t`Update`}
              </Button>
            );
          })()}
        </div>
      </div>
    </form>
  );
}
