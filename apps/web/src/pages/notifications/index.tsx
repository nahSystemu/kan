import type { NextPageWithLayout } from "../_app";
import { getDashboardLayout } from "../../components/Dashboard";
import Popup from "../../components/Popup";
import NotificationsView from "../../views/notifications";

const NotificationsPage: NextPageWithLayout = () => {
  return (
    <>
      <NotificationsView />
      <Popup />
    </>
  );
};

NotificationsPage.getLayout = (page) => getDashboardLayout(page);

export default NotificationsPage;
