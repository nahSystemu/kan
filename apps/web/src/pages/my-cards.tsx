import type { NextPageWithLayout } from "./_app";
import { getDashboardLayout } from "~/components/Dashboard";
import Popup from "~/components/Popup";
import MyCardsView from "~/views/my-cards";

const MyCardsPage: NextPageWithLayout = () => {
  return (
    <>
      <MyCardsView />
      <Popup />
    </>
  );
};

MyCardsPage.getLayout = (page) => getDashboardLayout(page);

export default MyCardsPage;
