import { useRouter } from "next/router";
import { t } from "@lingui/core/macro";

// Static import to reuse the existing public page view without dynamic typing issues
import { authClient } from "@kan/auth/client";

import { getDashboardLayout } from "~/components/Dashboard";
import Popup from "~/components/Popup";
import { api } from "~/utils/api";
import PageView from "~/views/page";
import PublicPageView from "~/views/public/page";

export default function PageBySlug() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const isClient = typeof window !== "undefined";

  const slugParam = Array.isArray(router.query.pageSlug)
    ? router.query.pageSlug[0]
    : router.query.pageSlug;
  const pageSlug = typeof slugParam === "string" ? slugParam : "";

  const { data, isLoading, isError } = api.page.bySlug.useQuery(
    { pageSlug },
    { enabled: !!pageSlug, retry: false },
  );

  if (!pageSlug || isLoading) return null;

  const resolvedPublicId = data?.publicId;

  // Unauthenticated and slug lookup failed -> show a simple not-found message
  if (!session?.user && isError) {
    return (
      <div className="relative flex h-screen flex-col bg-light-100 px-4 pt-4 dark:bg-dark-50">
        <div className="relative h-full overflow-hidden rounded-md border pb-8 dark:border-dark-200">
          <div className="z-10 flex h-full w-full flex-col items-center justify-center space-y-6 p-8">
            <h1 className="text-[1.2rem] font-bold leading-[2.3rem] tracking-tight text-neutral-900 dark:text-dark-1000">
              {t`Page not found`}
            </h1>
            <p className="text-[14px] text-light-900 dark:text-dark-900">
              {t`This page is private or does not exist`}
            </p>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              className="rounded-md border border-light-300 bg-light-50 px-4 py-2 text-sm text-light-950 shadow-sm dark:border-dark-300 dark:bg-dark-50 dark:text-dark-900"
            >
              {t`Go home`}
            </a>
          </div>
        </div>
      </div>
    );
  }

  // If authenticated, render the full dashboard experience
  if (session?.user) {
    return getDashboardLayout(
      <>
        <PageView pagePublicIdOverride={resolvedPublicId} />
        <Popup />
      </>,
    );
  }

  // Otherwise, reuse the dedicated public page view
  if (!isClient) return null;
  return <PublicPageView pagePublicIdOverride={resolvedPublicId} />;
}
