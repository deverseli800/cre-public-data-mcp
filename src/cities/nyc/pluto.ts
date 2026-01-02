const PLUTO_ENDPOINT = "https://data.cityofnewyork.us/resource/64uk-42ks.json";

// Logging helper (uses stderr so it doesn't interfere with MCP stdio)
function log(message: string, data?: unknown) {
  console.error(`[PLUTO] ${message}`, data !== undefined ? JSON.stringify(data, null, 2) : '');
}

export interface NYCProperty {
  bbl: string;
  borough: string;
  block: string;
  lot: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  units: number;
  year_built: number | null;
  building_class: string;
  owner: string;
  zoning: string;
  lot_area: number;
  building_area: number;
  // Assessment data
  assessed_land: number;
  assessed_total: number;
  exempt_total: number;
  zola_url: string;
  city: "nyc";
}

export async function queryPluto(where: string, limit = 10): Promise<NYCProperty[]> {
  const params = new URLSearchParams({
    "$where": where,
    "$limit": limit.toString(),
  });

  const url = `${PLUTO_ENDPOINT}?${params}`;
  log(`Querying PLUTO API:`, { where, limit, url });

  const response = await fetch(url);
  log(`Response status: ${response.status}`);
  
  if (!response.ok) {
    const errorText = await response.text();
    log(`API Error response:`, errorText);
    throw new Error(`PLUTO API error: ${response.status} - ${errorText}`);
  }
  
  const data = await response.json() as Record<string, unknown>[];
  log(`Results count: ${data.length}`);
  
  if (data.length > 0) {
    log(`First result raw:`, data[0]);
  }
  
  const mapped = data.map((row) => {
    const borocode = String(row.borocode || "");
    const block = String(row.block || "");
    const lot = String(row.lot || "");
    
    // Generate ZOLA URL: https://zola.planninglabs.nyc/l/lot/{borocode}/{block}/{lot}
    const zola_url = borocode && block && lot 
      ? `https://zola.planninglabs.nyc/l/lot/${borocode}/${block}/${lot}`
      : "";
    
    return {
      bbl: String(row.bbl || "").split(".")[0],
      borough: String(row.borough || ""),
      block,
      lot,
      address: String(row.address || ""),
      latitude: row.latitude ? parseFloat(String(row.latitude)) : null,
      longitude: row.longitude ? parseFloat(String(row.longitude)) : null,
      units: parseInt(String(row.unitsres || "0")) || 0,
      year_built: row.yearbuilt ? parseInt(String(row.yearbuilt)) : null,
      building_class: String(row.bldgclass || ""),
      owner: String(row.ownername || ""),
      zoning: String(row.zonedist1 || ""),
      lot_area: parseInt(String(row.lotarea || "0")) || 0,
      building_area: parseInt(String(row.bldgarea || "0")) || 0,
      // Assessment data from NYC Finance
      assessed_land: parseFloat(String(row.assessland || "0")) || 0,
      assessed_total: parseFloat(String(row.assesstot || "0")) || 0,
      exempt_total: parseFloat(String(row.exempttot || "0")) || 0,
      zola_url,
      city: "nyc" as const,
    };
  });
  
  return mapped;
}

export async function getPropertyByBBL(
  borough: string, 
  block: string, 
  lot: string
): Promise<NYCProperty | null> {
  log(`getPropertyByBBL called:`, { borough, block, lot });
  
  const b = block.replace(/^0+/, "") || "0";
  const l = lot.replace(/^0+/, "") || "0";
  
  log(`Normalized BBL:`, { borough, block: b, lot: l });
  
  const results = await queryPluto(
    `borocode='${borough}' AND block='${b}' AND lot='${l}'`, 
    1
  );
  return results[0] || null;
}

/**
 * Normalize address to match PLUTO format.
 * PLUTO uses: "522 EAST 5 STREET" (no ordinal suffixes like "5th")
 */
function normalizeAddress(address: string): string {
  let normalized = address.toUpperCase().trim();
  
  // Remove ordinal suffixes: 1st, 2nd, 3rd, 4th, 5th, etc.
  // "5TH" -> "5", "1ST" -> "1", "2ND" -> "2", "3RD" -> "3"
  normalized = normalized.replace(/(\d+)(ST|ND|RD|TH)\b/g, '$1');
  
  // Expand "E" and "W" directionals (PLUTO uses EAST/WEST)
  normalized = normalized.replace(/\bE\b\.?\s+/g, 'EAST ');
  normalized = normalized.replace(/\bW\b\.?\s+/g, 'WEST ');
  normalized = normalized.replace(/\bN\b\.?\s+/g, 'NORTH ');
  normalized = normalized.replace(/\bS\b\.?\s+/g, 'SOUTH ');
  
  // Normalize street type abbreviations to full words (PLUTO uses full words)
  normalized = normalized.replace(/\bST\b\.?$/g, 'STREET');
  normalized = normalized.replace(/\bAVE\b\.?$/g, 'AVENUE');
  normalized = normalized.replace(/\bBLVD\b\.?$/g, 'BOULEVARD');
  normalized = normalized.replace(/\bPL\b\.?$/g, 'PLACE');
  normalized = normalized.replace(/\bDR\b\.?$/g, 'DRIVE');
  normalized = normalized.replace(/\bLN\b\.?$/g, 'LANE');
  normalized = normalized.replace(/\bCT\b\.?$/g, 'COURT');
  normalized = normalized.replace(/\bRD\b\.?$/g, 'ROAD');
  
  // Escape single quotes for SQL
  normalized = normalized.replace(/'/g, "''");
  
  return normalized;
}

/**
 * Extract street number from address
 */
function extractStreetNumber(address: string): string | null {
  const match = address.match(/^(\d+)/);
  return match ? match[1] : null;
}

/**
 * Extract street name (everything after the number)
 */
function extractStreetName(address: string): string | null {
  const normalized = normalizeAddress(address);
  const match = normalized.match(/^\d+\s+(.+)$/);
  return match ? match[1] : null;
}

export async function getPropertyByAddress(
  address: string,
  boroughCode?: string
): Promise<NYCProperty | null> {
  log(`getPropertyByAddress called:`, { address, boroughCode });
  
  const normalized = normalizeAddress(address);
  const streetNumber = extractStreetNumber(address);
  const streetName = extractStreetName(address);
  
  log(`Parsed address:`, { normalized, streetNumber, streetName, boroughCode });
  
  // Build WHERE clause - match from START of address (no leading %)
  // This prevents "522" from matching "1522"
  let where = `upper(address) LIKE '${normalized}%'`;
  if (boroughCode) {
    where += ` AND borocode='${boroughCode}'`;
  }
  
  log(`Query 1 - exact match WHERE:`, where);
  let results = await queryPluto(where, 5);
  
  // If no results with exact match, try with street number and partial name
  if (results.length === 0 && streetNumber && streetName) {
    // Get first two words of street name (e.g., "EAST 5" from "EAST 5 STREET")
    const streetNameParts = streetName.split(/\s+/).slice(0, 2).join(' ');
    
    where = `upper(address) LIKE '${streetNumber} ${streetNameParts}%'`;
    if (boroughCode) {
      where += ` AND borocode='${boroughCode}'`;
    }
    
    log(`Query 2 - partial match WHERE:`, where);
    results = await queryPluto(where, 5);
  }
  
  // If still no results and we have a borough filter, try without it
  // (in case the user specified wrong borough)
  if (results.length === 0 && boroughCode) {
    where = `upper(address) LIKE '${normalized}%'`;
    log(`Query 3 - without borough filter WHERE:`, where);
    results = await queryPluto(where, 5);
    
    if (results.length > 0) {
      log(`Found ${results.length} results without borough filter. Boroughs found:`, 
        results.map(r => r.borough));
    }
  }
  
  log(`Final results count: ${results.length}`);
  if (results.length > 0) {
    log(`Returning:`, results[0]);
  }
  
  return results[0] || null;
}
