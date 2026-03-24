import { Listbox, Transition } from "@headlessui/react";
import { t } from "@lingui/core/macro";
import { Fragment, useEffect, useMemo, useState } from "react";

import { colours } from "@kan/shared/constants";

import Badge from "~/components/Badge";
import Button from "~/components/Button";
import CheckboxDropdown from "~/components/CheckboxDropdown";
import Modal from "~/components/modal";
import { useModal } from "~/providers/modal";
import { usePopup } from "~/providers/popup";
import { api } from "~/utils/api";

interface TagSelectorProps {
  pagePublicId: string;
  workspacePublicId: string;
  labels: {
    publicId: string;
    name: string;
    colourCode: string | null | undefined;
  }[]; // labels already attached to this page
}

interface Label {
  publicId: string;
  name: string;
  colourCode: string | null | undefined;
}

export default function TagSelector({
  pagePublicId,
  workspacePublicId,
  labels,
}: TagSelectorProps) {
  const utils = api.useUtils();
  const { showPopup } = usePopup();
  const { isOpen, modalContentType, openModal, closeModal } = useModal();
  const [name, setName] = useState("");
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  interface Colour {
    name: string;
    code: string;
  }
  const [selectedColour, setSelectedColour] = useState<Colour>(
    colours[0] as Colour,
  );

  // Workspace labels query
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const { data: workspaceLabels } = api.page.listLabels.useQuery(
    { workspacePublicId },
    { enabled: !!workspacePublicId },
  );

  // Create label (workspace-scoped) then attach to the page
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
  const createLabel = api.page.createLabel.useMutation({
    onError: () =>
      showPopup({
        header: t`Unable to create tag`,
        message: t`Please try again later, or contact customer support.`,
        icon: "error",
      }),
    onSuccess: async (created) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        await utils.page.listLabels.invalidate({ workspacePublicId });
        const c = created as unknown as Label;
        if (c.publicId) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          await attachLabel.mutateAsync({
            pagePublicId,
            labelPublicId: c.publicId,
          });
        }
      } finally {
        await invalidatePage();
        closeModal();
        setName("");
      }
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
  const deleteLabel = api.page.deleteLabel.useMutation({
    onError: () =>
      showPopup({
        header: t`Unable to delete tag`,
        message: t`Please try again later, or contact customer support.`,
        icon: "error",
      }),
    onSettled: async () => {
      await invalidatePage();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await utils.page.listLabels.invalidate({ workspacePublicId });
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const updateLabel = api.page.updateLabel.useMutation({
    onError: () =>
      showPopup({
        header: t`Unable to update tag`,
        message: t`Please try again later, or contact customer support.`,
        icon: "error",
      }),
    onSettled: async () => {
      await invalidatePage();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await utils.page.listLabels.invalidate({ workspacePublicId });
      setEditingTagId(null);
      closeModal();
      setName("");
    },
  });

  // Attach/detach
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const attachLabel = api.page.attachLabel.useMutation({
    onError: () =>
      showPopup({
        header: t`Unable to add tag`,
        message: t`Please try again later, or contact customer support.`,
        icon: "error",
      }),
    onSettled: async () => {
      await invalidatePage();
    },
  });
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const detachLabel = api.page.detachLabel.useMutation({
    onError: () =>
      showPopup({
        header: t`Unable to remove tag`,
        message: t`Please try again later, or contact customer support.`,
        icon: "error",
      }),
    onSettled: async () => {
      await invalidatePage();
    },
  });

  const invalidatePage = async () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    await utils.page.byId.invalidate({ pagePublicId });
  };

  const handleCreate = () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    createLabel.mutate({
      workspacePublicId,
      name,
      colourCode: selectedColour.code || undefined,
    });
  };
  const items = useMemo(
    () =>
      ((workspaceLabels ?? []) as Label[]).map((l) => ({
        key: l.publicId,
        value: l.name,
        selected: labels.some((al) => al.publicId === l.publicId),
        leftIcon: (
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: l.colourCode ?? "#94a3b8" }}
          />
        ),
      })),
    [workspaceLabels, labels],
  );

  // Keep selected labels for chip display (all are selected since tags belong to the page)
  const selectedLabels = (
    items as {
      key: string;
      value: string;
      selected: boolean;
      leftIcon: JSX.Element;
    }[]
  ).filter((i) => i.selected);

  // Keep edit modal state in sync when opening
  useEffect(() => {
    if (!editingTagId) return;
    const label = ((workspaceLabels ?? []) as Label[]).find(
      (t) => t.publicId === editingTagId,
    );
    if (label) {
      setName(label.name);
      const fallbackCode = colours[0]?.code ?? selectedColour.code;
      const chosen =
        colours.find((x) => x.code === (label.colourCode ?? fallbackCode)) ??
        selectedColour;
      setSelectedColour(chosen);
    }
  }, [editingTagId, selectedColour, workspaceLabels]);

  return (
    <div className="flex flex-wrap items-center gap-1">
      <CheckboxDropdown
        items={items}
        handleSelect={(_g, item) => {
          const isSelected = labels.some((al) => al.publicId === item.key);
          if (isSelected) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            detachLabel.mutate({ pagePublicId, labelPublicId: item.key });
          } else {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            attachLabel.mutate({ pagePublicId, labelPublicId: item.key });
          }
        }}
        handleEdit={(id) => {
          setEditingTagId(id);
          openModal("EDIT_PAGE_TAG");
        }}
        handleCreate={() => openModal("NEW_PAGE_TAG")}
        createNewItemLabel={t`Create new tag`}
        asChild
      >
        {selectedLabels.length ? (
          <div className="flex flex-wrap gap-x-0.5">
            {selectedLabels.map((label) => (
              <Badge
                key={label.key}
                value={label.value}
                iconLeft={label.leftIcon}
              />
            ))}
            <Badge
              value={t`Add tag`}
              iconLeft={
                <svg
                  className="h-3.5 w-3.5"
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
            />
          </div>
        ) : (
          <div className="flex h-full w-full items-center rounded-[5px] border-[1px] border-light-50 pl-2 text-left text-sm text-neutral-900 hover:border-light-300 hover:bg-light-200 dark:border-dark-50 dark:text-dark-1000 dark:hover:border-dark-200 dark:hover:bg-dark-100">
            <svg
              className="h-5 w-5 pr-2"
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
            {t`Add tag`}
          </div>
        )}
      </CheckboxDropdown>

      {/* Create Tag Modal */}
      <Modal
        modalSize="sm"
        isVisible={isOpen && modalContentType === "NEW_PAGE_TAG"}
      >
        <div className="space-y-3 p-2">
          <h3 className="text-sm font-medium text-light-1000 dark:text-dark-1000">{t`New Tag`}</h3>
          <input
            type="text"
            placeholder={t`Tag name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-light-300 bg-light-50 p-2 text-sm text-light-1000 focus:outline-none focus:ring-2 focus:ring-light-600 dark:border-dark-300 dark:bg-dark-50 dark:text-dark-1000 dark:focus:ring-dark-600"
          />
          <div className="relative mt-1">
            <Listbox
              value={selectedColour}
              onChange={(c: Colour) => setSelectedColour(c)}
            >
              {({ open }: { open: boolean }) => (
                <>
                  <Listbox.Button className="relative block w-full rounded-md border-0 bg-white/5 px-4 py-1.5 text-left shadow-sm ring-1 ring-inset ring-light-600 focus:ring-2 focus:ring-inset focus:ring-light-600 dark:bg-dark-300 dark:text-dark-1000 dark:ring-dark-700 dark:focus:ring-dark-700 sm:text-sm sm:leading-6">
                    <span className="flex items-center">
                      <span
                        style={{ backgroundColor: selectedColour.code }}
                        className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
                      />
                      <span className="ml-3 block truncate">
                        {selectedColour.name}
                      </span>
                    </span>
                    <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                      <svg
                        className="h-5 w-5 text-gray-400"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        aria-hidden="true"
                      >
                        <path
                          d="M6 9l6 6 6-6"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </Listbox.Button>
                  <Transition
                    show={Boolean(open)}
                    as={Fragment}
                    leave="transition ease-in duration-100"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                  >
                    <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-light-50 py-2 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none dark:bg-dark-300 sm:text-sm">
                      {colours.map((colour, index) => (
                        <Listbox.Option
                          key={`colours_create_${index}`}
                          className="relative cursor-default select-none px-2 text-neutral-900 dark:text-dark-1000"
                          value={colour as Colour}
                        >
                          {() => (
                            <div className="flex items-center rounded-[5px] p-2 hover:bg-light-200 dark:hover:bg-dark-400">
                              <span
                                style={{ backgroundColor: colour.code }}
                                className="ml-2 inline-block h-2 w-2 flex-shrink-0 rounded-full"
                                aria-hidden="true"
                              />
                              <span className="ml-3 block truncate font-normal">
                                {colour.name}
                              </span>
                            </div>
                          )}
                        </Listbox.Option>
                      ))}
                    </Listbox.Options>
                  </Transition>
                </>
              )}
            </Listbox>
          </div>
          <div className="flex items-center justify-end pt-1">
            <Button onClick={handleCreate} disabled={!name}>
              {t`Create`}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Tag Modal */}
      <Modal
        modalSize="sm"
        isVisible={isOpen && modalContentType === "EDIT_PAGE_TAG"}
      >
        <div className="space-y-3 p-2">
          <h3 className="text-sm font-medium text-light-1000 dark:text-dark-1000">{t`Edit Tag`}</h3>
          <input
            type="text"
            placeholder={t`Tag name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-light-300 bg-light-50 p-2 text-sm text-light-1000 focus:outline-none focus:ring-2 focus:ring-light-600 dark:border-dark-300 dark:bg-dark-50 dark:text-dark-1000 dark:focus:ring-dark-600"
          />
          <div className="relative mt-1">
            <Listbox
              value={selectedColour}
              onChange={(c: Colour) => setSelectedColour(c)}
            >
              {({ open }: { open: boolean }) => (
                <>
                  <Listbox.Button className="relative block w-full rounded-md border-0 bg-white/5 px-4 py-1.5 text-left shadow-sm ring-1 ring-inset ring-light-600 focus:ring-2 focus:ring-inset focus:ring-light-600 dark:bg-dark-300 dark:text-dark-1000 dark:ring-dark-700 dark:focus:ring-dark-700 sm:text-sm sm:leading-6">
                    <span className="flex items-center">
                      <span
                        style={{ backgroundColor: selectedColour.code }}
                        className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
                      />
                      <span className="ml-3 block truncate">
                        {selectedColour.name}
                      </span>
                    </span>
                    <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                      <svg
                        className="h-5 w-5 text-gray-400"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        aria-hidden="true"
                      >
                        <path
                          d="M6 9l6 6 6-6"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </Listbox.Button>
                  <Transition
                    show={Boolean(open)}
                    as={Fragment}
                    leave="transition ease-in duration-100"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                  >
                    <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-light-50 py-2 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none dark:bg-dark-300 sm:text-sm">
                      {colours.map((colour, index) => (
                        <Listbox.Option
                          key={`colours_edit_${index}`}
                          className="relative cursor-default select-none px-2 text-neutral-900 dark:text-dark-1000"
                          value={colour as Colour}
                        >
                          {() => (
                            <div className="flex items-center rounded-[5px] p-2 hover:bg-light-200 dark:hover:bg-dark-400">
                              <span
                                style={{ backgroundColor: colour.code }}
                                className="ml-2 inline-block h-2 w-2 flex-shrink-0 rounded-full"
                                aria-hidden="true"
                              />
                              <span className="ml-3 block truncate font-normal">
                                {colour.name}
                              </span>
                            </div>
                          )}
                        </Listbox.Option>
                      ))}
                    </Listbox.Options>
                  </Transition>
                </>
              )}
            </Listbox>
          </div>
          <div className="flex items-center justify-between pt-1">
            <Button
              variant="secondary"
              onClick={() => {
                if (!editingTagId) return;
                // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
                deleteLabel.mutate({ labelPublicId: editingTagId });
              }}
            >
              {t`Delete`}
            </Button>
            <Button
              onClick={() => {
                if (!editingTagId) return;
                // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
                updateLabel.mutate({
                  labelPublicId: editingTagId,
                  name,
                  colourCode: selectedColour.code,
                });
              }}
              disabled={!name}
            >
              {t`Save`}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
