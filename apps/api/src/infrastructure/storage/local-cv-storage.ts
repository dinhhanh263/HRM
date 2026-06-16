/**
 * Local-disk CV storage driver. Default in development and tests so neither
 * needs cloud credentials. Files land under CV_STORAGE_DIR with random-UUID
 * names so user-supplied filenames can never cause path traversal or collisions.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import * as path from 'node:path';
import { CV_STORAGE_DIR, CV_URL_PREFIX } from '../../shared/configs/cv.config.js';
import type { CvStorageDriver, StoredFile, CvReadStream } from './cv-storage.types.js';
import { safeExt, contentTypeFromUrl } from './cv-mime.js';

/**
 * Resolve a stored fileUrl back to an absolute disk path, rejecting anything
 * that isn't a bare filename under CV_URL_PREFIX (no slashes / traversal).
 */
function resolveDiskPath(fileUrl: string): string | null {
  const prefix = `${CV_URL_PREFIX}/`;
  if (!fileUrl.startsWith(prefix)) return null;
  const name = fileUrl.slice(prefix.length);
  if (!name || name.includes('/') || name.includes('..')) return null;
  return path.join(path.resolve(process.cwd(), CV_STORAGE_DIR), name);
}

function requirePath(fileUrl: string): string {
  const diskPath = resolveDiskPath(fileUrl);
  if (!diskPath) throw new Error(`Invalid CV fileUrl: ${fileUrl}`);
  return diskPath;
}

export const localCvStorage: CvStorageDriver = {
  async store(buffer: Buffer, originalName: string, mimeType: string): Promise<StoredFile> {
    const dir = path.resolve(process.cwd(), CV_STORAGE_DIR);
    await mkdir(dir, { recursive: true });
    const storedName = `${randomUUID()}${safeExt(originalName, mimeType)}`;
    await writeFile(path.join(dir, storedName), buffer);
    return { fileUrl: `${CV_URL_PREFIX}/${storedName}` };
  },

  async read(fileUrl: string): Promise<Buffer> {
    return readFile(requirePath(fileUrl));
  },

  async createReadStream(fileUrl: string): Promise<CvReadStream> {
    const diskPath = requirePath(fileUrl);
    return { stream: createReadStream(diskPath), contentType: contentTypeFromUrl(fileUrl) };
  },

  async remove(fileUrl: string): Promise<void> {
    const diskPath = resolveDiskPath(fileUrl);
    if (!diskPath) return;
    try {
      await unlink(diskPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  },
};
