import Link from "next/link";
import { useState } from "react";
import { twMerge } from "tailwind-merge";

import type { KeyboardShortcut } from "~/providers/keyboard-shortcuts";
import LottieIcon from "~/components/LottieIcon";
import { useIsMobile } from "~/hooks/useMediaQuery";
import { useKeyboardShortcut } from "~/providers/keyboard-shortcuts";

const Button: React.FC<{
  href: string;
  current: boolean;
  name: string;
  json: object;
  isCollapsed?: boolean;
  onCloseSideNav?: () => void;
  keyboardShortcut: KeyboardShortcut;
  badgeCount?: number;
  showIndicator?: boolean;
}> = ({
  href,
  current,
  name,
  json,
  isCollapsed = false,
  keyboardShortcut,
  onCloseSideNav,
  badgeCount,
  showIndicator,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [index, setIndex] = useState(0);
  const isMobile = useIsMobile();
  const { keys: shortcutKeys } = useKeyboardShortcut(keyboardShortcut);

  const handleMouseEnter = () => {
    setIsHovered(true);
    setIndex((index) => index + 1);
  };

  const handleClick = () => {
    if (onCloseSideNav && isMobile) {
      onCloseSideNav();
    }
  };

  const showBadge = typeof badgeCount === "number" && badgeCount > 0;
  const showDot = !showBadge && showIndicator;

  return (
    <Link
      href={href}
      onMouseEnter={handleMouseEnter}
      onClick={handleClick}
      className={twMerge(
        "group flex h-[34px] items-center rounded-md p-1.5 text-sm font-normal leading-6 hover:bg-light-200 hover:text-light-1000 dark:hover:bg-dark-200 dark:hover:text-dark-1000",
        isCollapsed ? "md:justify-center" : "justify-between",
        current
          ? "bg-light-200 text-light-1000 dark:bg-dark-200 dark:text-dark-1000"
          : "text-neutral-600 dark:bg-dark-100 dark:text-dark-900",
      )}
      title={isCollapsed ? name : undefined}
    >
      <div
        className={twMerge(
          "flex items-center",
          isCollapsed
            ? "justify-start gap-x-3 md:justify-center md:gap-x-0"
            : "gap-x-3",
        )}
      >
        <div className="relative">
          <LottieIcon index={index} json={json} isPlaying={isHovered} />
          {(showBadge || showDot) && (
            <span
              className={twMerge(
                "absolute -right-1.5 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#6366f1] text-[9px] font-semibold text-white shadow-sm dark:bg-[#a855f7]",
                showDot && "h-2.5 w-2.5 text-transparent",
              )}
            >
              {showBadge ? (
                <span className="leading-none">{badgeCount}</span>
              ) : null}
            </span>
          )}
        </div>
        <span className={twMerge(isCollapsed && "md:hidden")}>{name}</span>
      </div>
      {!isCollapsed && (
        <div className="hidden md:group-hover:inline-flex">{shortcutKeys}</div>
      )}
    </Link>
  );
};

export default Button;
