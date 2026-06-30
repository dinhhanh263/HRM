import { NotFoundError } from '../../shared/errors/index.js';
import type { CreateCompanyInput, UpdateCompanyInput, ListCompaniesInput } from '../../app/validators/sales-company.validator.js';
import { companyRepository } from './company.repository.js';
import { toCompanyDto } from './mappers.js';

function nullable(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

export const companyService = {
  async list(tenantId: string, input: ListCompaniesInput) {
    const { data, total } = await companyRepository.list(tenantId, {
      search: input.search,
      page: input.page,
      limit: input.limit,
    });
    return { items: data.map(toCompanyDto), total, page: input.page, limit: input.limit };
  },

  async get(tenantId: string, id: string) {
    const row = await companyRepository.findById(tenantId, id);
    if (!row) throw new NotFoundError('Không tìm thấy công ty');
    return toCompanyDto(row);
  },

  async create(tenantId: string, input: CreateCompanyInput) {
    const created = await companyRepository.create({
      tenantId,
      name: input.name.trim(),
      taxCode: nullable(input.taxCode),
      industry: nullable(input.industry),
      size: nullable(input.size),
      website: nullable(input.website),
      address: nullable(input.address),
    });
    return toCompanyDto(created);
  },

  async update(tenantId: string, id: string, input: UpdateCompanyInput) {
    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.taxCode !== undefined) data.taxCode = nullable(input.taxCode);
    if (input.industry !== undefined) data.industry = nullable(input.industry);
    if (input.size !== undefined) data.size = nullable(input.size);
    if (input.website !== undefined) data.website = nullable(input.website);
    if (input.address !== undefined) data.address = nullable(input.address);

    const updated = await companyRepository.update(tenantId, id, data);
    if (!updated) throw new NotFoundError('Không tìm thấy công ty');
    return toCompanyDto(updated);
  },
};
