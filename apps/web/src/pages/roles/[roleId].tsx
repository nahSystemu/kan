import { useRouter } from "next/router";

import type { NextPageWithLayout } from "~/pages/_app";
import { getDashboardLayout } from "~/components/Dashboard";
import Popup from "~/components/Popup";
import { RoleEditView } from "~/views/settings/components/RoleEditView";

const RoleEditPage: NextPageWithLayout = () => {
  const router = useRouter();
  const { roleId } = router.query;

  if (!roleId || typeof roleId !== "string") {
    return null;
  }

  return (
    <>
      <RoleEditView rolePublicId={roleId} />
      <Popup />
    </>
  );
};

RoleEditPage.getLayout = (page) => getDashboardLayout(page);

export default RoleEditPage;
