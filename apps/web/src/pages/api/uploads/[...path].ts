/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import fs from "fs";
import path from "path";
import type { NextApiRequest, NextApiResponse } from "next";

import type { StorageDriver } from "@kan/shared/storage";
import {
  getBaseDir,
  inferContentType,
  LocalStorageDriver,
} from "@kan/shared/storage";

import { env } from "~/env";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // Public GET for avatars/attachments
  if (req.method !== "GET" && req.method !== "HEAD")
    return res.status(405).end();

  if (env.STORAGE_DRIVER !== "local") {
    return res.status(404).end();
  }

  const parts = req.query.path;
  const arr: string[] = Array.isArray(parts)
    ? parts
    : typeof parts === "string"
      ? parts.split("/")
      : [];
  if (arr.length < 2) return res.status(400).end();

  const [type, ...rest] = arr;
  if (type !== "avatars" && type !== "attachments")
    return res.status(400).end();
  const keyWithType = path.posix.join(type, ...rest);

  try {
    const driver: StorageDriver = LocalStorageDriver();
    const fullPath: string = driver.resolvePath(keyWithType);

    // Security: ensure path stays within base dir
    const baseDir = path.normalize(getBaseDir() as string);
    const normalized = path.normalize(fullPath);
    if (!normalized.startsWith(baseDir)) return res.status(403).end();

    const stat = await fs.promises.stat(fullPath as fs.PathLike);
    const ext = path.extname(fullPath).slice(1);
    const contentType: string = inferContentType(ext);

    // Caching
    const etag = `W/"${stat.size}-${stat.mtime.getTime()}"`;
    res.setHeader("ETag", etag);
    res.setHeader("Last-Modified", stat.mtime.toUTCString());
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", contentType);

    // Conditional GET
    const inm = req.headers["if-none-match"];
    const ims = req.headers["if-modified-since"];
    if (
      (inm && inm === etag) ||
      (ims && new Date(ims).getTime() >= stat.mtime.getTime())
    ) {
      return res.status(304).end();
    }

    if (req.method === "HEAD") {
      res.setHeader("Content-Length", stat.size.toString());
      return res.status(200).end();
    }

    const range = req.headers.range;
    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      if (match) {
        const start = match[1] ? parseInt(match[1], 10) : 0;
        const end = match[2] ? parseInt(match[2], 10) : stat.size - 1;
        if (start >= stat.size || end >= stat.size || start > end) {
          res.setHeader("Content-Range", `bytes */${stat.size}`);
          return res.status(416).end();
        }
        res.status(206);
        res.setHeader("Content-Range", `bytes ${start}-${end}/${stat.size}`);
        res.setHeader("Content-Length", (end - start + 1).toString());
        const stream = fs.createReadStream(fullPath as fs.PathLike, {
          start,
          end,
        });
        stream.pipe(res);
        return;
      }
    }

    res.setHeader("Content-Length", stat.size.toString());
    const stream = fs.createReadStream(fullPath as fs.PathLike);
    stream.pipe(res);
  } catch {
    return res.status(404).end();
  }
}
