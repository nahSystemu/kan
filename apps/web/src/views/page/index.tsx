import { useRouter } from "next/router";
import { t } from "@lingui/core/macro";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

import Avatar from "~/components/Avatar";
import Button from "~/components/Button";
import CheckboxDropdown from "~/components/CheckboxDropdown";
import Dropdown from "~/components/Dropdown";
import Editor from "~/components/Editor";
import Modal from "~/components/modal";
import { PageHead } from "~/components/PageHead";
import { useModal } from "~/providers/modal";
// Inline icons to avoid repo-wide react-icons JSX typing issues
import { usePopup } from "~/providers/popup";
import { api } from "~/utils/api";
import { getAvatarUrl } from "~/utils/helpers";
import TagSelector from "./components/TagSelector";
import UpdatePageSlugButton from "./components/UpdatePageSlugButton";
import { UpdatePageSlugForm } from "./components/UpdatePageSlugForm";

interface FormValues {
  pageId: string;
  title: string;
  description: string;
}

export default function PageView({
  pagePublicIdOverride,
}: { pagePublicIdOverride?: string } = {}) {
  const router = useRouter();
  const { showPopup } = usePopup();
  const { openModal, isOpen, modalContentType } = useModal();

  // Accept either /pages/[pageId] or /pages/[...pageSlug] route params
  const routePageId = Array.isArray(router.query.pageId)
    ? router.query.pageId[0]
    : router.query.pageId;
  const routePageSlug = Array.isArray(router.query.pageSlug)
    ? router.query.pageSlug[0]
    : router.query.pageSlug;
  const pageId = pagePublicIdOverride ?? routePageId ?? routePageSlug;
  const pid = typeof pageId === "string" ? pageId : "";
  const isPotentialPublicId = /^[A-Za-z0-9]{12}$/.test(pid);
  interface WorkspaceMember {
    publicId: string;
    user: { id: string; name: string | null; image: string | null } | null;
    email: string;
  }

  interface PageData {
    publicId?: string;
    title?: string;
    description?: string;
    visibility?: "public" | "private";
    slug?: string | null;
    createdAt?: string | Date;
    updatedAt?: string | Date | null;
    createdBy?: {
      id: string;
      name: string | null;
      email: string | null;
      image: string | null;
    } | null;
    tags?: {
      publicId: string;
      name: string;
      colourCode: string | null | undefined;
    }[];
    pageLabelJoins?: {
      label: {
        publicId: string;
        name: string;
        colourCode: string | null | undefined;
      };
    }[];
    workspace?: {
      members: WorkspaceMember[];
      slug?: string | null;
      publicId?: string;
    };
  }

  // Load by ID if it looks like a publicId; otherwise load by slug
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const pageByIdQuery = api.page.byId.useQuery(
    { pagePublicId: pid },
    {
      enabled: !!pid && isPotentialPublicId,
      retry: false,
      refetchOnWindowFocus: false,
    },
  ) as unknown as { data?: unknown; isLoading: boolean };
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const pageBySlugQuery = api.page.bySlug.useQuery(
    { pageSlug: pid },
    {
      enabled: !!pid && !isPotentialPublicId,
      retry: false,
      refetchOnWindowFocus: false,
    },
  ) as unknown as { data?: unknown; isLoading: boolean };

  const page = (
    isPotentialPublicId ? pageByIdQuery.data : pageBySlugQuery.data
  ) as PageData | undefined;
  const isLoading = isPotentialPublicId
    ? pageByIdQuery.isLoading
    : pageBySlugQuery.isLoading;
  const hasPage = !!page;

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const updatePage = api.page.update.useMutation({
    onError: () => {
      showPopup({
        header: t`Unable to update page`,
        message: t`Please try again later, or contact customer support.`,
        icon: "error",
      });
    },
  });

  const utils = api.useUtils();
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const deletePage = api.page.delete.useMutation({
    onSuccess: async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        await utils.page.byId.invalidate({ pagePublicId: pid });
      } catch {
        /* noop */
      }
      // Navigate back to pages list
      void router.push("/pages");
    },
    onError: () => {
      showPopup({
        header: t`Unable to delete page`,
        message: t`Please try again later, or contact customer support.`,
        icon: "error",
      });
    },
  });
  const p: PageData = (page ?? {}) as unknown as PageData;
  const isPublic = p.visibility === "public";
  const resolvedPublicId = isPotentialPublicId ? pid : (p.publicId ?? "");
  const [showMeta, setShowMeta] = useState(false);

  // Inline link icon (to avoid repo-wide react-icons JSX typing issues)
  const LinkIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
      {...props}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.5 6.75H15a4.5 4.5 0 110 9h-1.5M10.5 15.75H9A4.5 4.5 0 119 6.75h1.5m-3 4.5h9"
      />
    </svg>
  );

  const { register, handleSubmit, setValue } = useForm<FormValues>({
    defaultValues: {
      pageId: pid,
      title: "",
      description: "",
    },
  });

  useEffect(() => {
    if (!page) return;
    const pdata: PageData = page as unknown as PageData;
    setValue("title", String(pdata.title ?? ""));
    setValue("description", String(pdata.description ?? ""));
  }, [page, setValue]);

  const onSubmit = (values: FormValues) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    updatePage.mutate({
      pagePublicId: resolvedPublicId,
      title: values.title,
      description: values.description,
    });
  };

  if (!pid) return <></>;

  return (
    <>
      <div className="p-auto mx-auto flex h-full w-full flex-col">
        <PageHead title={`${p.title ?? "Page"}`} />
        <div className="p-6 md:p-8">
          <div className="mb-8 flex w-full items-center justify-between md:mt-6">
            {isLoading && (
              <div className="flex space-x-2">
                <div className="h-[2.3rem] w-[150px] animate-pulse rounded-[5px] bg-light-300 dark:bg-dark-300" />
                <div className="h-[2.3rem] w-[300px] animate-pulse rounded-[5px] bg-light-300 dark:bg-dark-300" />
              </div>
            )}
            {hasPage && (
              <div className="flex w-full items-center justify-between gap-4">
                <div className="flex w-full items-center gap-3">
                  <form onSubmit={handleSubmit(onSubmit)} className="flex-1">
                    <input
                      type="text"
                      id="title"
                      {...register("title")}
                      onBlur={handleSubmit(onSubmit)}
                      className="block w-full border-0 bg-transparent p-0 py-0 font-bold tracking-tight text-neutral-900 focus:ring-0 dark:text-dark-1000 sm:text-[1.2rem]"
                    />
                  </form>
                </div>
                <div className="flex items-center gap-2">
                  <UpdatePageSlugButton
                    handleOnClick={() => openModal("UPDATE_PAGE_SLUG")}
                    pageSlug={p.slug ?? ""}
                    isLoading={!page}
                    href={p.slug ? `/pages/${p.slug}` : `/pages/${pid}`}
                  />
                  <CheckboxDropdown
                    items={[
                      {
                        key: "public",
                        value: t`Public`,
                        selected: isPublic,
                        leftIcon: (
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            strokeWidth={1.5}
                            stroke="currentColor"
                            className="h-4 w-4"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M2.036 12.322a1.012 1.012 0 010-.644C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                          </svg>
                        ),
                      },
                      {
                        key: "private",
                        value: t`Private`,
                        selected: !isPublic,
                        leftIcon: (
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            strokeWidth={1.5}
                            stroke="currentColor"
                            className="h-4 w-4"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.86-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.5a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
                            />
                          </svg>
                        ),
                      },
                    ]}
                    handleSelect={(_group, item) => {
                      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
                      updatePage.mutate(
                        {
                          pagePublicId: resolvedPublicId,
                          visibility: item.key as "public" | "private",
                        },
                        {
                          onSuccess: async () => {
                            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
                            await utils.page.byId.invalidate({
                              pagePublicId: resolvedPublicId,
                            });
                          },
                        } as unknown as undefined,
                      );
                    }}
                    menuSpacing="md"
                    position="right"
                  >
                    <Button
                      variant="secondary"
                      iconLeft={
                        isPublic ? (
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            strokeWidth={1.5}
                            stroke="currentColor"
                            className="h-4 w-4"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M2.036 12.322a1.012 1.012 0 010-.644C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                          </svg>
                        ) : (
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            strokeWidth={1.5}
                            stroke="currentColor"
                            className="h-4 w-4"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.86-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.5a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
                            />
                          </svg>
                        )
                      }
                    >
                      {t`Visibility`}
                    </Button>
                  </CheckboxDropdown>
                </div>
                {isPublic && (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const shareUrl = p.slug
                          ? `${window.location.origin}/pages/${p.slug}`
                          : `${window.location.origin}/p/${resolvedPublicId || pid}`;
                        await navigator.clipboard.writeText(shareUrl);
                        showPopup({
                          header: t`Link copied`,
                          message: t`Page URL copied to clipboard`,
                          icon: "success",
                        });
                      } catch (error) {
                        console.error(error);
                      }
                    }}
                    className="rounded p-2 transition-all hover:bg-light-200 dark:hover:bg-dark-100"
                    aria-label={t`Copy public link`}
                    title={t`Copy public link`}
                  >
                    <LinkIcon className="h-4 w-4 text-light-900 dark:text-dark-900" />
                  </button>
                )}
                <Dropdown
                  items={[
                    {
                      label: t`Delete`,
                      action: () => {
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
                        deletePage.mutate({ pagePublicId: resolvedPublicId });
                      },
                    },
                  ]}
                >
                  <svg
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="5.25" r="1.25" />
                    <circle cx="12" cy="12" r="1.25" />
                    <circle cx="12" cy="18.75" r="1.25" />
                  </svg>
                </Dropdown>
              </div>
            )}
          </div>

          {hasPage && (
            <>
              {/* Divider: line — arrow — line */}
              <div className="mx-auto mb-2 w-full max-w-4xl">
                <div className="flex items-center gap-2">
                  <div className="h-px flex-1 bg-light-600 dark:bg-dark-600" />
                  <button
                    type="button"
                    onClick={() => setShowMeta((v) => !v)}
                    aria-expanded={showMeta}
                    aria-controls="page-meta"
                    className="rounded-full p-1 text-light-900 hover:bg-light-200 hover:text-neutral-900 dark:text-dark-900 dark:hover:bg-dark-200 dark:hover:text-dark-1000"
                    title={showMeta ? t`Hide info` : t`Show info`}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      strokeWidth={2}
                      stroke="currentColor"
                      className={`h-4 w-4 transition-transform ${showMeta ? "rotate-180" : "rotate-0"}`}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                      />
                    </svg>
                  </button>
                  <div className="h-px flex-1 bg-light-600 dark:bg-dark-600" />
                </div>
              </div>

              {/* Collapsible meta panel as left-aligned list */}
              <div
                id="page-meta"
                className={`mx-auto mb-4 w-full max-w-4xl transition-all duration-200 ${showMeta ? "max-h-[600px] overflow-visible" : "max-h-0 overflow-hidden"}`}
                aria-hidden={!showMeta}
              >
                <ul className="flex flex-col gap-3 pl-0 text-sm text-light-900 dark:text-dark-900">
                  {/* Author row */}
                  <li className="flex items-center gap-2">
                    <span className="text-xs tracking-wide text-light-800 dark:text-dark-800">
                      {t`Author`}:
                    </span>
                    <div className="flex items-center gap-2">
                      <Avatar
                        size="xs"
                        name={p.createdBy?.name ?? "User"}
                        email={p.createdBy?.email ?? ""}
                        imageUrl={
                          p.createdBy?.image
                            ? getAvatarUrl(p.createdBy.image)
                            : undefined
                        }
                      />
                      <span className="font-medium">
                        {p.createdBy?.name ?? t`Unknown author`}
                      </span>
                    </div>
                  </li>
                  {/* Tags row */}
                  <li className="min-w-0 max-w-full">
                    <div className="flex items-center gap-2">
                      <span className="text-xs tracking-wide text-light-800 dark:text-dark-800">
                        {t`Tags`}:
                      </span>
                      <div className="min-w-0 flex-1">
                        <TagSelector
                          pagePublicId={resolvedPublicId}
                          workspacePublicId={
                            (p.workspace as unknown as { publicId?: string })
                              .publicId ?? ""
                          }
                          labels={
                            (
                              (
                                p as unknown as {
                                  pageLabelJoins?: {
                                    label: {
                                      publicId: string;
                                      name: string;
                                      colourCode: string | null | undefined;
                                    };
                                  }[];
                                }
                              ).pageLabelJoins ?? []
                            ).map((j) => j.label) as {
                              publicId: string;
                              name: string;
                              colourCode: string | null | undefined;
                            }[]
                          }
                        />
                      </div>
                    </div>
                  </li>
                  {/* Updated date row */}
                  <li>
                    <span className="text-xs tracking-wide text-light-800 dark:text-dark-800">
                      {t`Last updated`}:
                    </span>{" "}
                    <span className="font-medium">
                      {(() => {
                        const d = p.updatedAt ?? p.createdAt;
                        if (!d) return t`Unknown`;
                        const date = new Date(d);
                        if (Number.isNaN(date.getTime())) return t`Unknown`;
                        return date.toLocaleString();
                      })()}
                    </span>
                  </li>
                </ul>
              </div>
              <div className="mx-auto mb-10 flex w-full max-w-4xl flex-col justify-between">
                <form
                  onSubmit={handleSubmit(onSubmit)}
                  className="w-full space-y-6"
                >
                  <div className="mt-2">
                    <Editor
                      content={String(p.description ?? "")}
                      onChange={(e) => setValue("description", e)}
                      onBlur={() => handleSubmit(onSubmit)()}
                      workspaceMembers={p.workspace?.members ?? []}
                    />
                  </div>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
      <Modal
        modalSize="sm"
        isVisible={isOpen && modalContentType === "UPDATE_PAGE_SLUG"}
      >
        <UpdatePageSlugForm
          pagePublicId={resolvedPublicId || pid}
          pageSlug={p.slug ?? ""}
        />
      </Modal>
    </>
  );
}
