import { t } from "@lingui/core/macro";

import Button from "~/components/Button";
import Modal from "~/components/modal";
import { PageHead } from "~/components/PageHead";
import PatternedBackground from "~/components/PatternedBackground";
import { useModal } from "~/providers/modal";
import { useWorkspace } from "~/providers/workspace";
import { api } from "~/utils/api";
import { NewPageForm } from "./components/NewPageForm";
import { PagesList } from "./components/PagesList";

export default function WorkspacePagesView() {
  const { workspace } = useWorkspace();
  const { openModal, isOpen, modalContentType } = useModal();
  // Keep utils in this view for potential future actions
  api.useUtils();

  return (
    <div className="relative flex h-full flex-col">
      <PatternedBackground />
      <div className="z-10 m-auto h-full w-10/12 p-6 px-5 md:px-20 md:py-12">
        <PageHead title={`${t`Pages`} | ${workspace.name}`} />
        <div className="relative z-10 mb-8 flex w-full items-center justify-between">
          <h1 className="font-bold tracking-tight text-neutral-900 dark:text-dark-1000 sm:text-[1.2rem]">
            {t`Pages`}
          </h1>
          <Button
            type="button"
            variant="primary"
            onClick={() => openModal("NEW_PAGE")}
            iconLeft={
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M12 5v14M5 12h14"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            }
          >
            {t`New`}
          </Button>
        </div>

        <Modal
          modalSize="sm"
          isVisible={isOpen && modalContentType === "NEW_PAGE"}
        >
          <NewPageForm />
        </Modal>

        <PagesList />
      </div>
    </div>
  );
}
