import type { NextPageWithLayout } from "~/pages/_app";
import { getDashboardLayout } from "~/components/Dashboard";
import Popup from "~/components/Popup";
import { RoleCreateView } from "~/views/settings/components/RoleCreateView";

const RoleCreatePage: NextPageWithLayout = () => {
  return (
    <>
      <RoleCreateView />
      <Popup />
    </>
  );
};

RoleCreatePage.getLayout = (page) => getDashboardLayout(page);

export default RoleCreatePage;
