import type { NextPageWithLayout } from "~/pages/_app";
import { getDashboardLayout } from "~/components/Dashboard";
import Popup from "~/components/Popup";
import InactiveCardsView from "~/views/inactive-cards";

const ArchivedCardsPage: NextPageWithLayout = () => {
  return (
    <>
      <InactiveCardsView variant="archived" />
      <Popup />
    </>
  );
};

ArchivedCardsPage.getLayout = (page) => getDashboardLayout(page);

export default ArchivedCardsPage;
