import { t } from "@lingui/core/macro";
import { env } from "next-runtime-env";
import { useRef, useState } from "react";
import { HiOutlinePhoto, HiXMark } from "react-icons/hi2";
import { twMerge } from "tailwind-merge";

import Button from "~/components/Button";
import Input from "~/components/Input";

const MAX_SIZE_BYTES = 10 * 1024 * 1024;

export function EditorImageModal({
  workspacePublicId,
  onInsert,
  onClose,
}: {
  workspacePublicId?: string;
  onInsert: (url: string) => void;
  onClose: () => void;
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFile = async (file: File) => {
    if (!workspacePublicId) return;

    if (!file.type.startsWith("image/")) {
      setError(t`Only image files can be uploaded.`);
      return;
    }

    if (file.size > MAX_SIZE_BYTES) {
      setError(t`Image must be smaller than 10MB.`);
      return;
    }

    setError(null);
    setIsUploading(true);

    try {
      const baseUrl = env("NEXT_PUBLIC_BASE_URL") ?? "";
      const response = await fetch(
        `${baseUrl}/api/upload/editor-image?workspacePublicId=${encodeURIComponent(
          workspacePublicId,
        )}`,
        {
          method: "POST",
          headers: {
            "Content-Type": file.type,
            "x-original-filename": encodeURIComponent(file.name),
          },
          body: file,
        },
      );

      if (!response.ok) throw new Error("Upload failed");

      const { url: uploadedUrl } = (await response.json()) as { url: string };

      onInsert(uploadedUrl);
      onClose();
    } catch {
      setError(t`Failed to upload image. Please try again.`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleInsertUrl = () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    if (!/^https?:\/\//.test(trimmed)) {
      setError(t`Please enter a valid image URL.`);
      return;
    }

    onInsert(trimmed);
    onClose();
  };

  return (
    <div>
      <div className="px-5 pt-5">
        <div className="flex w-full items-center justify-between pb-4 text-neutral-900 dark:text-dark-1000">
          <h2 className="text-sm font-medium">{t`Insert image`}</h2>
          <button
            type="button"
            className="rounded p-1 hover:bg-light-300 focus:outline-none dark:hover:bg-dark-300"
            onClick={onClose}
          >
            <HiXMark size={18} className="text-light-900 dark:text-dark-900" />
          </button>
        </div>

        {workspacePublicId && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
              className="hidden"
              disabled={isUploading}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) await uploadFile(file);
              }}
            />
            <button
              type="button"
              disabled={isUploading}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                if (!isUploading) setIsDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setIsDragging(false);
              }}
              onDrop={async (e) => {
                e.preventDefault();
                setIsDragging(false);
                if (isUploading) return;
                const file = e.dataTransfer.files[0];
                if (file) await uploadFile(file);
              }}
              className={twMerge(
                "flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-xs text-light-900 dark:text-dark-900",
                isDragging
                  ? "border-light-500 bg-light-100 dark:border-dark-500 dark:bg-dark-100"
                  : "border-light-600 hover:bg-light-100 dark:border-dark-600 dark:hover:bg-dark-100",
                isUploading && "cursor-not-allowed opacity-60",
              )}
            >
              <HiOutlinePhoto size={20} />
              {isUploading
                ? t`Uploading...`
                : t`Drop an image here, or click to browse`}
            </button>

            <div className="flex items-center gap-3 py-4">
              <span className="h-px flex-1 bg-light-600 dark:bg-dark-600" />
              <span className="text-[11px] uppercase text-light-900 dark:text-dark-900">
                {t`or`}
              </span>
              <span className="h-px flex-1 bg-light-600 dark:bg-dark-600" />
            </div>
          </>
        )}

        <label
          htmlFor="editor-image-url"
          className="mb-2 block text-xs font-medium text-light-900 dark:text-dark-900"
        >
          {t`Image URL`}
        </label>
        <Input
          id="editor-image-url"
          placeholder={t`https://example.com/image.png`}
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleInsertUrl();
            }
          }}
        />
        {error && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>

      <div className="mt-12 flex items-center justify-end border-t border-light-600 px-5 pb-5 pt-5 dark:border-dark-600">
        <div className="space-x-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t`Cancel`}
          </Button>
          <Button
            type="button"
            onClick={handleInsertUrl}
            disabled={!url.trim() || isUploading}
          >
            {t`Insert`}
          </Button>
        </div>
      </div>
    </div>
  );
}
