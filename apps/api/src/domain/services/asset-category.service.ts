import { assetCategoryRepository } from '../repositories/asset-category.repository.js';
import { toCategoryDto } from '../assets/mappers.js';
import { NotFoundError, ConflictError } from '../../shared/errors/index.js';
import type {
  AssetCategoryDto,
  CreateAssetCategoryInput,
  UpdateAssetCategoryInput,
} from '@hrm/shared';

export const assetCategoryService = {
  async list(tenantId: string): Promise<AssetCategoryDto[]> {
    const categories = await assetCategoryRepository.findAll(tenantId);
    return categories.map(toCategoryDto);
  },

  async create(tenantId: string, input: CreateAssetCategoryInput): Promise<AssetCategoryDto> {
    const duplicate = await assetCategoryRepository.findByCode(input.code, tenantId);
    if (duplicate) {
      throw new ConflictError('Asset category code already exists', 'ASSET_CATEGORY_CODE_TAKEN');
    }

    const created = await assetCategoryRepository.create({
      tenantId,
      name: input.name,
      code: input.code,
      description: input.description ?? null,
      icon: input.icon ?? null,
    });

    return toCategoryDto(created);
  },

  async update(
    id: string,
    tenantId: string,
    input: UpdateAssetCategoryInput,
  ): Promise<AssetCategoryDto> {
    const existing = await assetCategoryRepository.findById(id, tenantId);
    if (!existing) {
      throw new NotFoundError('Asset category not found');
    }

    // code is immutable after creation — referenced by assets and used as the unique key.
    const updated = await assetCategoryRepository.update(id, {
      name: input.name,
      description: input.description,
      icon: input.icon,
    });

    return toCategoryDto(updated);
  },

  async remove(id: string, tenantId: string): Promise<void> {
    const existing = await assetCategoryRepository.findById(id, tenantId);
    if (!existing) {
      throw new NotFoundError('Asset category not found');
    }

    const assetCount = await assetCategoryRepository.countAssets(id);
    if (assetCount > 0) {
      throw new ConflictError(
        'Cannot delete a category that still has assets',
        'ASSET_CATEGORY_IN_USE',
      );
    }

    await assetCategoryRepository.delete(id);
  },
};
