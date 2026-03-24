import { createContext, useContext, useState } from "react";

interface PopupContextType {
  isOpen: boolean;
  showPopup: (params: {
    header?: string;
    message: string;
    icon?: string;
    type?: "success" | "error" | "info";
  }) => void;
  hidePopup: () => void;
  popupHeader: string;
  popupMessage: string;
  popupIcon: string;
}

interface Props {
  children: React.ReactNode;
}

const PopupContext = createContext<PopupContextType | undefined>(undefined);

export const PopupProvider: React.FC<Props> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [popupHeader, setPopupHeader] = useState("");
  const [popupMessage, setPopupMessage] = useState("");
  const [popupIcon, setPopupIcon] = useState("");

  const showPopup = ({
    header,
    message,
    icon,
    type,
  }: {
    header?: string;
    message: string;
    icon?: string;
    type?: "success" | "error" | "info";
  }) => {
    setIsOpen(true);
    setPopupHeader(header ?? (type === "error" ? "Error" : type === "success" ? "Success" : ""));
    setPopupMessage(message);
    setPopupIcon(icon ?? type ?? "");
  };

  const hidePopup = () => {
    setIsOpen(false);
  };

  return (
    <PopupContext.Provider
      value={{
        isOpen,
        showPopup,
        hidePopup,
        popupHeader,
        popupMessage,
        popupIcon,
      }}
    >
      {children}
    </PopupContext.Provider>
  );
};

export const usePopup = () => {
  const context = useContext(PopupContext);
  if (context === undefined) {
    throw new Error("usePopup must be used within a PopupProvider");
  }
  return context;
};
