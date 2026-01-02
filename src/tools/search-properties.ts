import * as nycPluto from "../cities/nyc/pluto.js";
import { getBoroughCode } from "../cities/nyc/utils.js";

// Logging helper
function log(message: string, data?: unknown) {
  console.error(`[search_properties] ${message}`, data !== undefined ? JSON.stringify(data) : '');
}

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
  log(`Called with input:`, input);
  
  const limit = Math.min(input.limit || 10, 50);

  if (input.city === "nyc") {
    const conditions: string[] = [];
    
    if (input.borough) {
      const code = getBoroughCode(input.borough);
      log(`Borough "${input.borough}" mapped to code: ${code}`);
      if (code) {
        conditions.push(`borocode='${code}'`);
      } else {
        log(`WARNING: Unknown borough "${input.borough}", not filtering by borough`);
      }
    }
    
    if (input.min_units) conditions.push(`unitsres >= ${input.min_units}`);
    if (input.max_units) conditions.push(`unitsres <= ${input.max_units}`);
    if (input.building_class) conditions.push(`bldgclass LIKE '${input.building_class.toUpperCase()}%'`);
    if (input.zoning) conditions.push(`zonedist1 LIKE '${input.zoning.toUpperCase()}%'`);
    if (input.min_year_built) conditions.push(`yearbuilt >= ${input.min_year_built}`);
    if (input.max_year_built) conditions.push(`yearbuilt <= ${input.max_year_built}`);
    
    const where = conditions.length > 0 ? conditions.join(" AND ") : "1=1";
    log(`Final WHERE clause: ${where}`);
    
    const properties = await nycPluto.queryPluto(where, limit);
    
    log(`Found ${properties.length} properties`);
    return { city: "nyc", count: properties.length, properties };
    
  } else {
    return { error: "Philadelphia support not yet implemented" };
  }
}
