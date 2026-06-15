import { db } from '../../infrastructure/database/client.js';

export const tenantDomainRepository = {
  /**
   * Resolve the tenant that owns an email domain (used by Google SSO).
   * `domain` is matched case-insensitively against the globally-unique
   * `tenant_domains.domain`. Returns the related tenant, or null if the
   * domain is not registered to any tenant.
   */
  async findTenantByDomain(domain: string) {
    const record = await db.tenantDomain.findUnique({
      where: { domain: domain.toLowerCase() },
      include: { tenant: true },
    });
    return record?.tenant ?? null;
  },
};
