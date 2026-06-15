import { db } from '../../infrastructure/database/client.js';

export const tenantRepository = {
  async findBySlug(slug: string) {
    return db.tenant.findUnique({
      where: { slug },
    });
  },

  async findById(id: string) {
    return db.tenant.findUnique({
      where: { id },
    });
  },
};
