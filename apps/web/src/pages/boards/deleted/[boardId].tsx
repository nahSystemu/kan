import type { NextPageWithLayout } from "~/pages/_app";
import { getDashboardLayout } from "~/components/Dashboard";
import Popup from "~/components/Popup";
import InactiveCardsView from "~/views/inactive-cards";

const DeletedCardsPage: NextPageWithLayout = () => {
  return (
    <>
      <InactiveCardsView variant="deleted" />
      <Popup />
    </>
  );
};

DeletedCardsPage.getLayout = (page) => getDashboardLayout(page);

export default DeletedCardsPage;
