import { catalogSeed } from "./catalog.seed";
import { catalogTokens } from "./catalog.schema";
import type { CatalogDevice, CatalogQuery } from "./catalog.types";

// Development adapter; the public query contract is shared with MongoDatabase.
export class JsonCatalogRepository {
  constructor(private rows: CatalogDevice[] = catalogSeed.devices) {}
  async getCatalogDevice(id: string) { return structuredClone(this.rows.find(row => row.id === id && row.active !== false) || null); }
  async searchCatalog(query: CatalogQuery) {
    const search = catalogTokens(query.search || "");
    const active = this.rows.filter(row => row.active !== false);
    const rows = active.filter(row => {
      const tokens = catalogTokens([row.displayName, row.category, catalogSeed.categories.find(category => category.id === row.category)?.name,
        row.subcategory, row.brand, row.model, ...row.aliases].filter(Boolean).join(" "));
      return (!query.search?.trim() || (search.length > 0 && search.every(token => tokens.includes(token)))) &&
        (!query.category || row.category === query.category) && (!query.subcategory || row.subcategory === query.subcategory) &&
        (!query.brand || row.brand === query.brand) && (!query.model || row.model === query.model);
    }).sort((a, b) => a.displayName < b.displayName ? -1 : a.displayName > b.displayName ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const facet = active.filter(row => !query.category || row.category === query.category);
    return structuredClone({ devices: rows.slice((query.page - 1) * query.limit, query.page * query.limit), total: rows.length,
      page: query.page, limit: query.limit, brands: [...new Set(facet.map(row => row.brand).filter((brand): brand is string => Boolean(brand)))].sort(),
      subcategories: [...new Set(facet.map(row => row.subcategory))].sort() });
  }
}
