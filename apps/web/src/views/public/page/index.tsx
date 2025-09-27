import { useRouter } from "next/router";
import { t } from "@lingui/core/macro";

import Avatar from "../../../components/Avatar";
import Editor from "../../../components/Editor";
import { PageHead } from "../../../components/PageHead";
import PatternedBackground from "../../../components/PatternedBackground";
import Popup from "../../../components/Popup";
import ThemeToggle from "../../../components/ThemeToggle";
import { usePopup } from "../../../providers/popup";
import { api } from "../../../utils/api";
import { getAvatarUrl } from "../../../utils/helpers";

export default function PublicPageView() {
  const router = useRouter();
  const { showPopup } = usePopup();

  // Slug comes from /p/[...pageSlug] (or legacy param name 'pageId')
  const routeSlugOrId = Array.isArray(router.query.pageSlug)
    ? router.query.pageSlug[0]
    : (router.query.pageSlug ??
      (Array.isArray(router.query.pageId)
        ? router.query.pageId[0]
        : router.query.pageId));
  const pageSlug = typeof routeSlugOrId === "string" ? routeSlugOrId : "";

  const {
    data: page,
    isLoading,
    isError,
  } = api.page.bySlug.useQuery(
    { pageSlug },
    { enabled: router.isReady && !!pageSlug, retry: false },
  );

  const visibility = (page as { visibility?: string } | undefined)?.visibility;
  const isNonPublic = !!page && visibility !== "public";
  // Derive authors list strictly from relation; no legacy createdBy fallback
  const authors = (() => {
    const rel = (
      page as unknown as
        | {
            authors?: {
              member?: {
                user?: {
                  name?: string | null;
                  email?: string | null;
                  image?: string | null;
                } | null;
              } | null;
            }[];
          }
        | undefined
    )?.authors;
    const users = Array.isArray(rel)
      ? rel
          .map((a) => a.member?.user ?? null)
          .filter(Boolean)
          .map((u) => ({
            name: (u as { name?: string | null }).name ?? null,
            email: (u as { email?: string | null }).email ?? null,
            image: (u as { image?: string | null }).image ?? null,
          }))
      : [];
    return users;
  })();

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

  const LockClosedIcon = (props: React.SVGProps<SVGSVGElement>) => (
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
        d="M16.5 10.5V9a4.5 4.5 0 10-9 0v1.5M5.25 10.5h13.5a1.5 1.5 0 011.5 1.5v6a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-6a1.5 1.5 0 011.5-1.5z"
      />
    </svg>
  );

  const CopyLink = () => {
    if (!pageSlug) return null;
    return (
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(
              `${window.location.origin}/p/${pageSlug}`,
            );
            showPopup({
              header: t`Link copied`,
              icon: "success",
              message: t`Page URL copied to clipboard`,
            });
          } catch (error) {
            console.error(error);
          }
        }}
        className="rounded p-1.5 transition-all hover:bg-light-200 dark:hover:bg-dark-100"
        aria-label={`Copy page URL`}
      >
        <LinkIcon className="h-4 w-4 text-light-900 dark:text-dark-900" />
      </button>
    );
  };

  return (
    <>
      <PageHead title={`${page?.title ?? "Page"}`} />

      <div className="relative flex h-screen flex-col bg-light-100 px-4 pt-4 dark:bg-dark-50">
        <div className="relative h-full overflow-hidden rounded-md border pb-8 dark:border-dark-200">
          <PatternedBackground />

          <div className="z-10 flex w-full justify-between p-8">
            {isLoading || !router.isReady ? (
              <div className="flex space-x-2">
                <div className="h-[2.3rem] w-[150px] animate-pulse rounded-[5px] bg-light-200 dark:bg-dark-100" />
              </div>
            ) : isError || (!page && !!pageSlug) || isNonPublic ? (
              <h1 className="font-bold leading-[2.3rem] tracking-tight text-neutral-900 dark:text-dark-1000 sm:text-[1.2rem]">
                {t`Page not found`}
              </h1>
            ) : (
              <h1 className="font-bold leading-[2.3rem] tracking-tight text-neutral-900 focus:ring-0 focus-visible:outline-none dark:text-dark-1000 sm:text-[1.2rem]">
                {page?.title}
              </h1>
            )}

            {page && (
              <div className="z-10 flex items-center space-x-2">
                <div className="inline-flex cursor-default items-center justify-center whitespace-nowrap rounded-md border-[1px] border-light-300 bg-light-50 px-3 py-2 text-sm font-semibold text-light-950 shadow-sm dark:border-dark-300 dark:bg-dark-50 dark:text-dark-950">
                  <span className="mr-2">
                    <LockClosedIcon className="h-4 w-4" />
                  </span>
                  {t`View only`}
                </div>
              </div>
            )}
          </div>

          <div className="scrollbar-w-none scrollbar-track-rounded-[4px] scrollbar-thumb-rounded-[4px] scrollbar-h-[8px] relative h-[95%] w-full overflow-y-auto overscroll-contain p-6 scrollbar scrollbar-track-light-200 scrollbar-thumb-light-400 dark:scrollbar-track-dark-100 dark:scrollbar-thumb-dark-300">
            {isLoading || !router.isReady ? (
              <div className="mx-auto h-[500px] w-full max-w-[800px] animate-pulse rounded-md bg-light-200 dark:bg-dark-100" />
            ) : isError || (!page && !!pageSlug) || isNonPublic ? (
              <div className="z-10 flex h-full w-full flex-col items-center justify-center space-y-8 pb-[150px]">
                <div className="flex flex-col items-center">
                  <LockClosedIcon className="h-10 w-10 text-light-800 dark:text-dark-800" />
                  <p className="mb-2 mt-4 text-[14px] font-bold text-light-1000 dark:text-dark-950">
                    {t`Page not found`}
                  </p>
                  <p className="text-[14px] text-light-900 dark:text-dark-900">
                    {t`This page is private or does not exist`}
                  </p>
                </div>
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                <a
                  className="rounded-md border border-light-300 bg-light-50 px-4 py-2 text-sm text-light-950 shadow-sm dark:border-dark-300 dark:bg-dark-50 dark:text-dark-900"
                  href="/"
                >
                  {t`Go home`}
                </a>
              </div>
            ) : (
              <div className="mx-auto w-full max-w-4xl">
                {/* Page description/content */}
                <div className="rounded-md border border-light-300 bg-light-50 p-4 shadow-sm dark:border-dark-300 dark:bg-dark-50">
                  <Editor
                    content={page?.description ?? ""}
                    readOnly
                    workspaceMembers={[]}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
        {/* Footer with theme toggle and copy link */}
        <div className="flex h-[54px] items-center justify-center">
          <div className="absolute left-[1rem] flex items-center gap-1">
            <ThemeToggle />
            <CopyLink />
          </div>
          {/* Meta information in footer center */}
          {page && !isError && !isNonPublic && (
            <div className="flex max-w-[85%] items-center gap-4 text-xs">
              {/* Author */}
              <div className="flex items-center">
                <span className="mr-2 text-light-800 dark:text-dark-800">
                  {t`Authors`}:
                </span>
                {authors.length > 0 ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="isolate -space-x-1 overflow-hidden">
                      {authors.slice(0, 3).map((u, idx) => (
                        <Avatar
                          key={(u.email ?? u.name ?? "") + String(idx)}
                          imageUrl={u.image ? getAvatarUrl(u.image) : undefined}
                          name={u.name ?? u.email ?? ""}
                          email={u.email ?? ""}
                          size="xs"
                        />
                      ))}
                    </span>
                    <span className="text-light-1000 dark:text-dark-1000">
                      {authors
                        .slice(0, 2)
                        .map((u) => u.name ?? u.email ?? t`Unknown`)
                        .join(", ")}
                      {authors.length > 2 ? ` +${authors.length - 2}` : ""}
                    </span>
                  </span>
                ) : (
                  <span className="text-light-900 dark:text-dark-900">N/A</span>
                )}
              </div>
              {/* Tags */}
              <div className="hidden items-center sm:flex">
                <span className="mr-2 text-light-800 dark:text-dark-800">
                  {t`Tags`}:
                </span>
                <span className="flex items-center gap-1">
                  {(() => {
                    const allTags =
                      page.pageLabelJoins.length > 0
                        ? page.pageLabelJoins.map((j) => j.label)
                        : page.tags;
                    const shown = allTags.slice(0, 3);
                    const more = Math.max(0, allTags.length - shown.length);
                    return (
                      <>
                        {shown.map((tag) => (
                          <span
                            key={tag.publicId}
                            className="inline-flex items-center rounded-full border border-light-300 bg-light-50 px-2 py-[2px] text-[10px] text-light-950 dark:border-dark-300 dark:bg-dark-50 dark:text-dark-900"
                          >
                            <span
                              className="mr-1 inline-block h-2 w-2 rounded-full"
                              style={{
                                backgroundColor: tag.colourCode ?? "#64748b",
                              }}
                            />
                            {tag.name}
                          </span>
                        ))}
                        {allTags.length === 0 && (
                          <span className="text-light-900 dark:text-dark-900">{t`None`}</span>
                        )}
                        {more > 0 && (
                          <span className="text-light-800 dark:text-dark-800">
                            +{more}
                          </span>
                        )}
                      </>
                    );
                  })()}
                </span>
              </div>
              {/* Last updated */}
              <div className="flex items-center">
                <span className="mr-2 text-light-800 dark:text-dark-800">
                  {t`Last updated`}:
                </span>
                <span className="text-light-1000 dark:text-dark-1000">
                  {(() => {
                    const d = (page.updatedAt ?? page.createdAt) as
                      | string
                      | Date
                      | undefined;
                    if (!d) return t`Unknown`;
                    try {
                      return new Date(d).toLocaleString();
                    } catch {
                      return String(d);
                    }
                  })()}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
      <Popup />
    </>
  );
}
