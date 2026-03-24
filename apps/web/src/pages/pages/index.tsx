import type { NextPageWithLayout } from "../_app";
import { getDashboardLayout } from "~/components/Dashboard";
import Popup from "~/components/Popup";
import WorkspacePagesView from "~/views/pages";

const WorkspacePages: NextPageWithLayout = () => {
  return (
    <>
      <WorkspacePagesView />
      <Popup />
    </>
  );
};

WorkspacePages.getLayout = (page) => getDashboardLayout(page);

export default WorkspacePages;
