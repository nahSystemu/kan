/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import fs from "fs";
import type { Fields, Files } from "formidable";
import type { NextApiRequest, NextApiResponse } from "next";
import formidable from "formidable";

import { createNextApiContext } from "@kan/api/trpc";
import { inferContentType, LocalStorageDriver } from "@kan/shared/storage";

import { env } from "~/env";

export const config = {
  api: { bodyParser: false },
};

const allowedContentTypes = ["image/jpeg", "image/png", "image/webp"];
const maxSizeBytes = 20 * 1024 * 1024; // 20MB

interface SafeFile {
  filepath: string;
  size: number;
  originalFilename?: string;
  mimetype?: string;
}

function isSafeFile(file: unknown): file is SafeFile {
  if (!file || typeof file !== "object") return false;
  const f = file as Partial<SafeFile>;
  return (
    typeof f.filepath === "string" &&
    typeof f.size === "number" &&
    (typeof f.originalFilename === "string" ||
      typeof f.originalFilename === "undefined") &&
    (typeof f.mimetype === "string" || typeof f.mimetype === "undefined")
  );
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
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
    // Narrow file value without relying on formidable.File error-any type
    const raw = parsed.files["file" as keyof Files] as unknown;
    const picked = Array.isArray(raw) ? (raw as unknown[])[0] : raw;
    if (!picked) return res.status(400).json({ error: "Missing file" });
    if (!isSafeFile(picked))
      return res.status(400).json({ error: "Invalid file payload" });
    const fileObj = picked;

    if (fileObj.size > maxSizeBytes) {
      return res.status(413).json({ error: "File too large" });
    }

    const originalName =
      (fileObj.originalFilename ?? "attachment").split("/").pop() ??
      "attachment";
    let ext: string;
    if (originalName.includes(".")) {
      const parts = originalName.split(".");
      const maybe = parts[parts.length - 1];
      ext = typeof maybe === "string" && maybe.length > 0 ? maybe : "bin";
    } else {
      ext = "bin";
    }
    const contentType: string =
      fileObj.mimetype && allowedContentTypes.includes(fileObj.mimetype)
        ? fileObj.mimetype
        : inferContentType(ext);

    const buffer = await fs.promises.readFile(fileObj.filepath);

    const driver = LocalStorageDriver();
    const { key } = await driver.put({
      type: "attachments",
      userId: user.id,
      buffer,
      ext,
      contentType,
    });

    return res.status(200).json({ key });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Internal Server Error";
    console.error(e);
    return res.status(500).json({ error: message });
  }
}

function parseForm(req: NextApiRequest) {
  const form = formidable({ maxFileSize: maxSizeBytes, multiples: false });
  return new Promise<{ fields: Fields; files: Files }>((resolve, reject) => {
    form.parse(req, (err: unknown, fields: Fields, files: Files) => {
      if (err) reject(err as Error);
      else resolve({ fields, files });
    });
  });
}
