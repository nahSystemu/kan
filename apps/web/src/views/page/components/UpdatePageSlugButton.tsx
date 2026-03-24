import { env } from "next-runtime-env";

const UpdatePageSlugButton = ({
  handleOnClick,
  pageSlug,
  isLoading,
  href: hrefProp,
}: {
  handleOnClick: () => void;
  pageSlug: string;
  isLoading: boolean;
  href?: string;
}) => {
  // Always render the button; if parts are missing, show placeholders so users can open the modal

  if (isLoading) {
    return (
      <div className="hidden h-[36px] w-[225px] animate-pulse rounded-full bg-light-200 dark:bg-dark-100 xl:flex" />
    );
  }

  const baseUrl = env("NEXT_PUBLIC_BASE_URL");
  const href = hrefProp ?? `${baseUrl}/pages/${pageSlug}`;

  return (
    <button
      onClick={handleOnClick}
      className="hidden cursor-pointer items-center gap-2 rounded-full border-[1px] bg-light-50 p-1 pl-4 pr-1 text-sm text-light-950 hover:bg-light-100 dark:border-dark-600 dark:bg-dark-50 dark:text-dark-900 dark:hover:bg-dark-100 xl:flex"
    >
      <div className="flex items-center">
        <span>
          {env("NEXT_PUBLIC_KAN_ENV") === "cloud" ? "kan.bn" : baseUrl}
        </span>
        <div className="mx-1.5 h-4 w-px rotate-[20deg] bg-gray-300 dark:bg-dark-600"></div>
        <span>pages</span>
        <div className="mx-1.5 h-4 w-px rotate-[20deg] bg-gray-300 dark:bg-dark-600"></div>
        <span>{pageSlug}</span>
      </div>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-light-200 dark:hover:bg-dark-200"
        aria-label="Open page URL"
      >
        {/* Inline link icon */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          strokeWidth={1.5}
          stroke="currentColor"
          className="h-[13px] w-[13px]"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13.5 6.75H15a4.5 4.5 0 110 9h-1.5M10.5 15.75H9A4.5 4.5 0 119 6.75h1.5m-3 4.5h9"
          />
        </svg>
      </a>
    </button>
  );
};

export default UpdatePageSlugButton;
