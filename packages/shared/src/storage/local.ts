import fs from "fs";
import path from "path";
import type { ReadStream } from "fs";

import type { StorageDriver } from ".";
import { ensureDir, getBaseDir, inferContentType, userShardedKey } from ".";

export const LocalStorageDriver = (): StorageDriver => {
  const baseDir = getBaseDir();

  function sanitizeKeyWithType(keyWithType: string) {
    const norm = path.posix.normalize(keyWithType).replace(/^\.\//, "");
    // Disallow path traversal
    if (norm.includes("..")) throw new Error("Invalid path");
    return norm;
  }

  function fullPathFor(keyWithType: string) {
    const norm = sanitizeKeyWithType(keyWithType);
    return path.join(baseDir, norm);
  }

  return {
    async put({ type, userId, buffer, ext, contentType: _contentType, now }) {
      const { key, withType } = userShardedKey(type, userId, ext, now);
      const filePath = fullPathFor(withType);
      ensureDir(path.dirname(filePath));
      await fs.promises.writeFile(filePath, buffer);
      return { key, fullPath: filePath };
    },

    async getStream(keyWithType: string) {
      const filePath = fullPathFor(keyWithType);
      const stat = await fs.promises.stat(filePath);
      const stream: ReadStream = fs.createReadStream(filePath);
      const ext = path.extname(filePath).slice(1);
      const contentType = inferContentType(ext);
      return { stream, size: stat.size, mtime: stat.mtime, contentType };
    },

    async delete(keyWithType: string) {
      const filePath = fullPathFor(keyWithType);
      try {
        await fs.promises.unlink(filePath);
      } catch (e) {
        console.warn("Error deleting file:", e);
      }
    },

    resolvePath(keyWithType: string) {
      return fullPathFor(keyWithType);
    },
  };
};
