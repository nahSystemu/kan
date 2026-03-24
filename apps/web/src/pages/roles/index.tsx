import type { NextPageWithLayout } from "~/pages/_app";
import { getDashboardLayout } from "~/components/Dashboard";
import Popup from "~/components/Popup";
import RolesSettings from "~/views/settings/RolesSettings";

const RolesPage: NextPageWithLayout = () => {
  return (
    <>
      <RolesSettings />
      <Popup />
    </>
  );
};

RolesPage.getLayout = (page) => getDashboardLayout(page);

export default RolesPage;
