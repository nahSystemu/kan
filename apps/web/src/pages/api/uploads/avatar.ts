/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import fs from "fs";
import type { Fields, Files } from "formidable";
import type { NextApiRequest, NextApiResponse } from "next";
import formidable from "formidable";

import type { StorageDriver } from "@kan/shared/storage";
import { createNextApiContext } from "@kan/api/trpc";
import { inferContentType, LocalStorageDriver } from "@kan/shared/storage";

import { env } from "~/env";

export const config = {
  api: { bodyParser: false },
};

const allowedContentTypes = ["image/jpeg", "image/png", "image/webp"];
const maxSizeBytes = 10 * 1024 * 1024; // 10MB

interface SafeFile {
  filepath: string;
  size?: number;
  originalFilename?: string | null;
  mimetype?: string | null;
}

interface UploadFiles {
  file?: SafeFile | SafeFile[];
}

function isSafeFile(v: unknown): v is SafeFile {
  if (!v || typeof v !== "object") return false;
  const obj = v as { filepath?: unknown };
  return typeof obj.filepath === "string";
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ key: string } | { error: string }>,
) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const { user } = await createNextApiContext(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    if (env.STORAGE_DRIVER !== "local") {
      return res.status(400).json({ error: "Local storage is not enabled" });
    }

    const parsed = await parseForm(req);
    const candidate = parsed.files.file;
    const first = Array.isArray(candidate) ? candidate[0] : candidate;
    if (!first || !isSafeFile(first)) {
      return res.status(400).json({ error: "Missing file" });
    }
    const fileObj: SafeFile = first;

    if ((fileObj.size ?? 0) > maxSizeBytes) {
      return res.status(413).json({ error: "File too large" });
    }

    const originalName = (() => {
      const name = fileObj.originalFilename ?? "avatar.jpg";
      const parts = String(name).split("/");
      return parts[parts.length - 1] ?? "avatar.jpg";
    })();
    const ext = (() => {
      const idx = originalName.lastIndexOf(".");
      return idx >= 0 ? originalName.substring(idx + 1) : "jpg";
    })();
    const ctCandidate = fileObj.mimetype ?? undefined;
    const contentType: string =
      ctCandidate && allowedContentTypes.includes(ctCandidate)
        ? ctCandidate
        : inferContentType(ext);

    if (!allowedContentTypes.includes(contentType)) {
      return res.status(400).json({ error: "Invalid content type" });
    }

    const buffer = await fs.promises.readFile(fileObj.filepath);

    const driver: StorageDriver = LocalStorageDriver();
    const { key }: { key: string } = await driver.put({
      type: "avatars",
      userId: user.id,
      buffer,
      ext,
      contentType,
    });
    // Client will build URL via helper; return key only
    return res.status(200).json({ key });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: (e as Error).message });
  }
}

function parseForm(req: NextApiRequest) {
  const form = formidable({ maxFileSize: maxSizeBytes, multiples: false });
  return new Promise<{ fields: Fields; files: UploadFiles }>(
    (resolve, reject) => {
      form.parse(req, (err: unknown, fields: Fields, files: Files) => {
        if (err) reject(err as Error);
        else
          resolve({
            fields,
            files: files as unknown as UploadFiles,
          });
      });
    },
  );
}
