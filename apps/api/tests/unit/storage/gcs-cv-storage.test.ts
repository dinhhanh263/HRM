import { describe, it, expect, vi } from 'vitest';
import { Readable } from 'node:stream';
import type { Storage } from '@google-cloud/storage';
import { createGcsCvStorage } from '../../../src/infrastructure/storage/gcs-cv-storage.js';
import { selectDriver } from '../../../src/infrastructure/storage/cv-storage.js';
import { localCvStorage } from '../../../src/infrastructure/storage/local-cv-storage.js';
import { STORAGE_DRIVER } from '../../../src/shared/configs/cv.config.js';

const PDF_MIME = 'application/pdf';
const BUCKET = 'hrm-cv-prod';

function makeMockStorage() {
  const save = vi.fn().mockResolvedValue(undefined);
  const download = vi.fn().mockResolvedValue([Buffer.from('gcs bytes')]);
  const createReadStream = vi.fn(() => Readable.from([Buffer.from('gcs bytes')]));
  const del = vi.fn().mockResolvedValue(undefined);
  const fileApi = { save, download, createReadStream, delete: del };
  const file = vi.fn(() => fileApi);
  const bucket = vi.fn(() => ({ file }));
  const storage = { bucket } as unknown as Storage;
  return { storage, bucket, file, save, download, createReadStream, del };
}

describe('createGcsCvStorage', () => {
  it('fails fast when no bucket is configured', () => {
    expect(() => createGcsCvStorage('')).toThrow(/GCS_BUCKET/);
  });

  it('store() uploads to cv/<uuid>.<ext> and returns the /uploads/cv fileUrl', async () => {
    const m = makeMockStorage();
    const driver = createGcsCvStorage(BUCKET, m.storage);

    const { fileUrl } = await driver.store(Buffer.from('x'), 'résumé.pdf', PDF_MIME);

    expect(m.bucket).toHaveBeenCalledWith(BUCKET);
    const key = m.file.mock.calls[0][0] as string;
    expect(key).toMatch(/^cv\/[0-9a-f-]+\.pdf$/);
    expect(fileUrl).toBe(`/uploads/cv/${key.slice('cv/'.length)}`);
    expect(m.save).toHaveBeenCalledWith(expect.any(Buffer), {
      contentType: PDF_MIME,
      resumable: false,
    });
  });

  it('read() maps fileUrl → object key and returns the downloaded buffer', async () => {
    const m = makeMockStorage();
    const driver = createGcsCvStorage(BUCKET, m.storage);

    const buf = await driver.read('/uploads/cv/abc-123.pdf');

    expect(m.file).toHaveBeenCalledWith('cv/abc-123.pdf');
    expect(buf.toString()).toBe('gcs bytes');
  });

  it('createReadStream() returns the GCS stream with content type by extension', async () => {
    const m = makeMockStorage();
    const driver = createGcsCvStorage(BUCKET, m.storage);

    const { stream, contentType } = await driver.createReadStream('/uploads/cv/abc-123.pdf');

    expect(m.file).toHaveBeenCalledWith('cv/abc-123.pdf');
    expect(contentType).toBe(PDF_MIME);
    expect(stream).toBeInstanceOf(Readable);
  });

  it('remove() deletes with ignoreNotFound so a missing object does not throw', async () => {
    const m = makeMockStorage();
    const driver = createGcsCvStorage(BUCKET, m.storage);

    await driver.remove('/uploads/cv/abc-123.pdf');

    expect(m.file).toHaveBeenCalledWith('cv/abc-123.pdf');
    expect(m.del).toHaveBeenCalledWith({ ignoreNotFound: true });
  });

  it('rejects path-traversal fileUrls before touching the bucket', async () => {
    const m = makeMockStorage();
    const driver = createGcsCvStorage(BUCKET, m.storage);

    await expect(driver.read('/uploads/cv/../secret.pdf')).rejects.toThrow(/Invalid CV fileUrl/);
    await expect(driver.read('/elsewhere/x.pdf')).rejects.toThrow(/Invalid CV fileUrl/);
    expect(m.file).not.toHaveBeenCalled();
  });
});

describe('storage driver selection', () => {
  it('defaults to local when STORAGE_DRIVER is unset (dev/test)', () => {
    expect(STORAGE_DRIVER).toBe('local');
  });

  it('returns the local driver for "local"', () => {
    expect(selectDriver('local')).toBe(localCvStorage);
  });

  it('throws on an unknown driver name instead of falling back to local', () => {
    expect(() => selectDriver('s3')).toThrow(/Unknown STORAGE_DRIVER/);
    expect(() => selectDriver('gcs ')).toThrow(/Unknown STORAGE_DRIVER/);
  });

  it('routes "gcs" through the GCS factory (which then requires a bucket)', () => {
    // No GCS_BUCKET in the test env, so the gcs path must fail fast.
    expect(() => selectDriver('gcs')).toThrow(/GCS_BUCKET/);
  });
});
