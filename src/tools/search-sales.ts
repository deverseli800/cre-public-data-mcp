import * as nycSales from "../cities/nyc/rolling-sales.js";
import * as nycPluto from "../cities/nyc/pluto.js";
import { getBoroughCode } from "../cities/nyc/utils.js";

interface SearchSalesInput {
  city: "nyc" | "philadelphia";
  neighborhood?: string;
  borough?: string;
  min_price?: number;
  max_price?: number;
  min_units?: number;
  max_units?: number;
  building_class?: string;
  date_from?: string;
  date_to?: string;
  whole_buildings_only?: boolean;
  limit?: number;
}

export async function searchSales(input: SearchSalesInput) {
  const limit = Math.min(input.limit || 10, 50);

  if (input.city === "nyc") {
    return searchNYCSales(input, limit);
  } else {
    return { error: "Philadelphia support not yet implemented" };
  }
}

async function searchNYCSales(input: SearchSalesInput, limit: number) {
  const conditions: string[] = ["sale_price > 0"];
  
  if (input.neighborhood) {
    const escapedNeighborhood = input.neighborhood.replace(/'/g, "''").toUpperCase();
    conditions.push(`neighborhood LIKE '%${escapedNeighborhood}%'`);
  }
  
  if (input.borough) {
    const code = getBoroughCode(input.borough);
    if (code) conditions.push(`borough='${code}'`);
  }
  
  if (input.min_price) conditions.push(`sale_price >= ${input.min_price}`);
  if (input.max_price) conditions.push(`sale_price <= ${input.max_price}`);
  
  if (input.building_class) {
    conditions.push(`building_class_at_time_of_sale LIKE '${input.building_class.toUpperCase()}%'`);
  }
  
  if (input.date_from) conditions.push(`sale_date >= '${input.date_from}'`);
  if (input.date_to) conditions.push(`sale_date <= '${input.date_to}'`);
  
  if (input.whole_buildings_only !== false) {
    conditions.push(`(apartment_number IS NULL OR apartment_number = '')`);
  }

  const where = conditions.join(" AND ");
  const sales = await nycSales.querySales(where, limit);
  
  // Enrich with PLUTO data
  const enriched = await Promise.all(
    sales.map(async (sale) => {
      try {
        const pluto = await nycPluto.getPropertyByBBL(sale.borough, sale.block, sale.lot);
        return {
          ...sale,
          latitude: pluto?.latitude,
          longitude: pluto?.longitude,
          owner: pluto?.owner,
          zoning: pluto?.zoning,
        };
      } catch {
        return sale;
      }
    })
  );
  
  // Filter by units if specified (PLUTO has better unit data)
  let filtered = enriched;
  if (input.min_units) {
    filtered = filtered.filter(s => (s.units || 0) >= input.min_units!);
  }
  if (input.max_units) {
    filtered = filtered.filter(s => (s.units || 0) <= input.max_units!);
  }
  
  return { city: "nyc", count: filtered.length, sales: filtered };
}
