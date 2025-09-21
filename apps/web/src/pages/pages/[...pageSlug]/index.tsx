import type React from "react";
import { useRouter } from "next/router";

import type { NextPageWithLayout } from "~/pages/_app";
import { getDashboardLayout } from "~/components/Dashboard";
import Popup from "~/components/Popup";
import { api } from "~/utils/api";
import PageView from "~/views/page";

// This route serves /pages/<custom-slug>. If the slug is not found or the page is private and the user lacks access,
// the API will return appropriate errors. When found and authorized, we render the existing PageView by passing the
// resolved pagePublicId to it.

const PageBySlug: NextPageWithLayout = () => {
  const router = useRouter();
  const slugParam = Array.isArray(router.query.pageSlug)
    ? router.query.pageSlug[0]
    : router.query.pageSlug;
  const pageSlug = typeof slugParam === "string" ? slugParam : "";

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const { data, isLoading } = api.page.bySlug.useQuery(
    { pageSlug },
    { enabled: !!pageSlug, retry: false },
  );

  const resolvedPublicId =
    (data as { publicId?: string } | undefined)?.publicId ?? "";

  // While loading or slug not resolved yet, show nothing (PageView will fetch when an id is ready)
  if (!pageSlug) return null;
  if (isLoading) return null;

  return (
    <>
      <PageView pagePublicIdOverride={resolvedPublicId} />
      <Popup />
    </>
  );
};

PageBySlug.getLayout = (page) => getDashboardLayout(page);

export default PageBySlug;
