import type { NextPageWithLayout } from "~/pages/_app";
import { getDashboardLayout } from "~/components/Dashboard";
import Popup from "~/components/Popup";
import PageView from "~/views/page";

const PageDetail: NextPageWithLayout = () => {
  return (
    <>
      <PageView />
      <Popup />
    </>
  );
};
PageDetail.getLayout = (page) => getDashboardLayout(page);

export default PageDetail;
