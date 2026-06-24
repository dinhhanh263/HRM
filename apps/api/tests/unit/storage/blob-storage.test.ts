import { describe, it, expect } from 'vitest';
import { createBlobStorage } from '../../../src/infrastructure/storage/blob-storage.js';

const config = {
  urlPrefix: '/uploads/payment',
  subdir: 'payment',
  storageDir: 'storage/test-payment',
  allowed: [
    { mime: 'image/jpeg', ext: '.jpg' },
    { mime: 'image/png', ext: '.png' },
    { mime: 'application/pdf', ext: '.pdf' },
  ],
};

const local = createBlobStorage(config, 'local');

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

describe('createBlobStorage (local, payment config)', () => {
  it('round-trips an image: store → read same bytes, fileUrl carries the prefix + ext', async () => {
    const buffer = Buffer.from('\x89PNG fake bill bytes');
    const { fileUrl } = await local.store(buffer, 'hoá đơn taxi.png', 'image/png');

    expect(fileUrl).toMatch(/^\/uploads\/payment\/[0-9a-f-]+\.png$/);
    expect((await local.read(fileUrl)).equals(buffer)).toBe(true);

    await local.remove(fileUrl);
  });

  it('streams with the right content type derived from the extension', async () => {
    const buffer = Buffer.from('jpeg bytes');
    const { fileUrl } = await local.store(buffer, 'bill.jpg', 'image/jpeg');
    const { stream, contentType } = await local.createReadStream(fileUrl);
    expect(contentType).toBe('image/jpeg');
    expect((await streamToBuffer(stream)).equals(buffer)).toBe(true);
    await local.remove(fileUrl);
  });

  it('falls back to MIME→ext when the original name has no usable extension', async () => {
    const { fileUrl } = await local.store(Buffer.from('x'), 'scan-no-ext', 'application/pdf');
    expect(fileUrl).toMatch(/\.pdf$/);
    await local.remove(fileUrl);
  });

  it('rejects path-traversal / foreign fileUrls', async () => {
    await expect(local.read('/uploads/payment/../../../etc/passwd')).rejects.toThrow();
    await expect(local.read('/uploads/payment/sub/dir.png')).rejects.toThrow();
    await expect(local.read('/uploads/cv/x.pdf')).rejects.toThrow();
  });

  it('remove is best-effort: missing file never throws', async () => {
    await expect(
      local.remove('/uploads/payment/00000000-0000-0000-0000-000000000000.png'),
    ).resolves.toBeUndefined();
  });

  it('throws on an unknown driver name (no silent local fallback)', () => {
    expect(() => createBlobStorage(config, 's3')).toThrow();
  });
});
