import type { IssuingEntity } from '@prisma/client';
import { issuingEntityRepository } from '../repositories/issuing-entity.repository.js';
import {
  storeEntityLogo,
  deleteEntityLogo,
  createEntityLogoReadStream,
} from '../../infrastructure/storage/entity-logo-storage.js';
import { ENTITY_LOGO_ALLOWED_MIME } from '../../shared/configs/entity-logo.config.js';
import { NotFoundError, BadRequestError } from '../../shared/errors/index.js';
import type {
  IssuingEntityDto,
  CreateIssuingEntityRequest,
  UpdateIssuingEntityRequest,
} from '@hrm/shared';

function toDto(e: IssuingEntity): IssuingEntityDto {
  return {
    id: e.id,
    name: e.name,
    address: e.address,
    taxCode: e.taxCode,
    phone: e.phone,
    logoUrl: e.logoUrl,
    isDefault: e.isDefault,
    active: e.active,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

// Verify a buffer is a genuine PNG or JPEG by its magic bytes — the client MIME
// header is untrusted. PNG: 89 50 4E 47 0D 0A 1A 0A; JPEG: starts FF D8 FF.
function isPngOrJpeg(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47;
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  return isPng || isJpeg;
}

// Trim a string field to null when blank — keeps optional columns clean.
function clean(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export const issuingEntityService = {
  /** List the tenant's entities; `activeOnly` for the PR dropdown. */
  async list(tenantId: string, activeOnly = false): Promise<IssuingEntityDto[]> {
    const rows = await issuingEntityRepository.findAll(tenantId, activeOnly);
    return rows.map(toDto);
  },

  async getById(id: string, tenantId: string): Promise<IssuingEntityDto> {
    const entity = await issuingEntityRepository.findById(id, tenantId);
    if (!entity) throw new NotFoundError('Issuing entity not found');
    return toDto(entity);
  },

  async create(tenantId: string, input: CreateIssuingEntityRequest): Promise<IssuingEntityDto> {
    const name = clean(input.name);
    if (!name) {
      throw new BadRequestError('Tên pháp nhân là bắt buộc', 'ISSUING_ENTITY_NAME_REQUIRED');
    }
    const created = await issuingEntityRepository.createEntity(tenantId, {
      tenantId,
      name,
      address: clean(input.address),
      taxCode: clean(input.taxCode),
      phone: clean(input.phone),
      isDefault: input.isDefault ?? false,
    });
    return toDto(created);
  },

  async update(
    id: string,
    tenantId: string,
    input: UpdateIssuingEntityRequest,
  ): Promise<IssuingEntityDto> {
    const existing = await issuingEntityRepository.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Issuing entity not found');

    // Only patch the fields the caller actually sent; treat blank strings as null.
    const data: Parameters<typeof issuingEntityRepository.updateEntity>[2] = {};
    if (input.name !== undefined) {
      const name = clean(input.name);
      if (!name) {
        throw new BadRequestError('Tên pháp nhân là bắt buộc', 'ISSUING_ENTITY_NAME_REQUIRED');
      }
      data.name = name;
    }
    if (input.address !== undefined) data.address = clean(input.address);
    if (input.taxCode !== undefined) data.taxCode = clean(input.taxCode);
    if (input.phone !== undefined) data.phone = clean(input.phone);
    if (input.isDefault !== undefined) data.isDefault = input.isDefault;
    if (input.active !== undefined) data.active = input.active;

    const updated = await issuingEntityRepository.updateEntity(id, tenantId, data);
    return toDto(updated);
  },

  /** Soft-hide (active=false). Keeps the row so PR snapshots stay intact. */
  async remove(id: string, tenantId: string): Promise<void> {
    const existing = await issuingEntityRepository.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Issuing entity not found');
    await issuingEntityRepository.updateEntity(id, tenantId, { active: false });
  },

  /** Store an uploaded logo, set logoUrl, and best-effort delete the old file. */
  async setLogo(
    id: string,
    tenantId: string,
    file: { buffer: Buffer; originalName: string; mimeType: string },
  ): Promise<IssuingEntityDto> {
    const existing = await issuingEntityRepository.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Issuing entity not found');

    // Defence-in-depth: the client-supplied MIME header can be spoofed, so verify
    // the actual file content via its magic bytes (PNG / JPEG signatures). pdfkit
    // only embeds genuine PNG/JPEG, so this also protects the PO PDF render path.
    if (!ENTITY_LOGO_ALLOWED_MIME.some((a) => a.mime === file.mimeType) || !isPngOrJpeg(file.buffer)) {
      throw new BadRequestError('Chỉ chấp nhận ảnh PNG hoặc JPEG', 'ENTITY_LOGO_UNSUPPORTED_TYPE');
    }

    const stored = await storeEntityLogo(file.buffer, file.originalName, file.mimeType);
    const updated = await issuingEntityRepository.setLogoUrl(id, tenantId, stored.fileUrl);
    if (existing.logoUrl && existing.logoUrl !== stored.fileUrl) {
      await deleteEntityLogo(existing.logoUrl);
    }
    return toDto(updated);
  },

  /** Clear the logo + best-effort remove the file. */
  async clearLogo(id: string, tenantId: string): Promise<IssuingEntityDto> {
    const existing = await issuingEntityRepository.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Issuing entity not found');
    const updated = await issuingEntityRepository.setLogoUrl(id, tenantId, null);
    if (existing.logoUrl) {
      await deleteEntityLogo(existing.logoUrl);
    }
    return toDto(updated);
  },

  /** Open a read stream for the entity's logo (tenant-scoped). */
  async getLogoStream(id: string, tenantId: string) {
    const entity = await issuingEntityRepository.findById(id, tenantId);
    if (!entity || !entity.logoUrl) {
      throw new NotFoundError('Logo not found');
    }
    const { stream, contentType } = await createEntityLogoReadStream(entity.logoUrl);
    return { stream, contentType };
  },
};
