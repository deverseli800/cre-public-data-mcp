import * as nycPluto from "../cities/nyc/pluto.js";
import { getBoroughCode } from "../cities/nyc/utils.js";

interface SearchPropertiesInput {
  city: "nyc" | "philadelphia";
  neighborhood?: string;
  borough?: string;
  min_units?: number;
  max_units?: number;
  building_class?: string;
  zoning?: string;
  min_year_built?: number;
  max_year_built?: number;
  limit?: number;
}

export async function searchProperties(input: SearchPropertiesInput) {
  const limit = Math.min(input.limit || 10, 50);

  if (input.city === "nyc") {
    const conditions: string[] = [];
    
    if (input.borough) {
      const code = getBoroughCode(input.borough);
      if (code) conditions.push(`borough='${code}'`);
    }
    
    if (input.min_units) conditions.push(`unitsres >= ${input.min_units}`);
    if (input.max_units) conditions.push(`unitsres <= ${input.max_units}`);
    if (input.building_class) conditions.push(`bldgclass LIKE '${input.building_class.toUpperCase()}%'`);
    if (input.zoning) conditions.push(`zonedist1 LIKE '${input.zoning.toUpperCase()}%'`);
    if (input.min_year_built) conditions.push(`yearbuilt >= ${input.min_year_built}`);
    if (input.max_year_built) conditions.push(`yearbuilt <= ${input.max_year_built}`);
    
    const where = conditions.length > 0 ? conditions.join(" AND ") : "1=1";
    const properties = await nycPluto.queryPluto(where, limit);
    
    return { city: "nyc", count: properties.length, properties };
    
  } else {
    return { error: "Philadelphia support not yet implemented" };
  }
}
