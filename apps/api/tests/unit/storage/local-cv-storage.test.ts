import { describe, it, expect } from 'vitest';
import { localCvStorage } from '../../../src/infrastructure/storage/local-cv-storage.js';

const PDF_MIME = 'application/pdf';

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

describe('localCvStorage', () => {
  it('should round-trip a stored file: store → read returns the same bytes', async () => {
    const buffer = Buffer.from('%PDF-1.4 fake cv bytes');
    const { fileUrl } = await localCvStorage.store(buffer, 'résumé final.pdf', PDF_MIME);

    expect(fileUrl).toMatch(/^\/uploads\/cv\/[0-9a-f-]+\.pdf$/);
    const read = await localCvStorage.read(fileUrl);
    expect(read.equals(buffer)).toBe(true);

    await localCvStorage.remove(fileUrl);
  });

  it('should stream stored bytes with the right content type', async () => {
    const buffer = Buffer.from('stream me');
    const { fileUrl } = await localCvStorage.store(buffer, 'cv.pdf', PDF_MIME);

    const { stream, contentType } = await localCvStorage.createReadStream(fileUrl);
    expect(contentType).toBe(PDF_MIME);
    expect((await streamToBuffer(stream)).equals(buffer)).toBe(true);

    await localCvStorage.remove(fileUrl);
  });

  it('should reject path-traversal fileUrls instead of reading them', async () => {
    await expect(localCvStorage.read('/uploads/cv/../../../etc/passwd')).rejects.toThrow();
    await expect(localCvStorage.read('/uploads/cv/sub/dir.pdf')).rejects.toThrow();
    await expect(localCvStorage.read('/somewhere/else/x.pdf')).rejects.toThrow();
  });

  it('should not throw when removing a file that does not exist', async () => {
    await expect(
      localCvStorage.remove('/uploads/cv/00000000-0000-0000-0000-000000000000.pdf')
    ).resolves.toBeUndefined();
  });
});
