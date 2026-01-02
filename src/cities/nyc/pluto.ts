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
  
  const mapped = data.map((row) => ({
    bbl: String(row.bbl || "").split(".")[0],
    borough: String(row.borough || ""),
    block: String(row.block || ""),
    lot: String(row.lot || ""),
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
    city: "nyc" as const,
  }));
  
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
    `borough='${borough}' AND block='${b}' AND lot='${l}'`, 
    1
  );
  return results[0] || null;
}

/**
 * Normalize address to match PLUTO format.
 * PLUTO uses: "522 EAST 5 STREET" (no ordinal suffixes like "5th")
 */
function normalizeAddress(address: string): string {
  let normalized = address.toUpperCase();
  
  log(`Normalizing address - input:`, normalized);
  
  // Remove ordinal suffixes: 1st, 2nd, 3rd, 4th, 5th, etc.
  // "5TH" -> "5", "1ST" -> "1", "2ND" -> "2", "3RD" -> "3"
  normalized = normalized.replace(/(\d+)(ST|ND|RD|TH)\b/g, '$1');
  log(`After removing ordinals:`, normalized);
  
  // Normalize street type abbreviations to full words (PLUTO uses full words)
  normalized = normalized.replace(/\bST\b\.?$/g, 'STREET');
  normalized = normalized.replace(/\bAVE\b\.?$/g, 'AVENUE');
  normalized = normalized.replace(/\bBLVD\b\.?$/g, 'BOULEVARD');
  normalized = normalized.replace(/\bPL\b\.?$/g, 'PLACE');
  normalized = normalized.replace(/\bDR\b\.?$/g, 'DRIVE');
  normalized = normalized.replace(/\bLN\b\.?$/g, 'LANE');
  normalized = normalized.replace(/\bCT\b\.?$/g, 'COURT');
  normalized = normalized.replace(/\bRD\b\.?$/g, 'ROAD');
  log(`After expanding abbreviations:`, normalized);
  
  // Escape single quotes for SQL
  normalized = normalized.replace(/'/g, "''");
  
  log(`Final normalized address:`, normalized);
  return normalized;
}

/**
 * Extract just the street number from an address for more flexible matching
 */
function extractStreetNumber(address: string): string | null {
  const match = address.match(/^(\d+)/);
  return match ? match[1] : null;
}

/**
 * Extract street name components for matching
 */
function extractStreetName(address: string): string | null {
  // Remove street number and normalize
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
  
  // First try exact match with normalized address
  let where = `upper(address) LIKE '%${normalized}%'`;
  if (boroughCode) {
    where += ` AND borocode='${boroughCode}'`;
  }
  
  log(`First query WHERE clause:`, where);
  let results = await queryPluto(where, 5);
  
  // If no results, try a more flexible search using street number and partial street name
  if (results.length === 0) {
    log(`No results from first query, trying flexible search...`);
    
    const streetNumber = extractStreetNumber(address);
    const streetName = extractStreetName(address);
    
    log(`Extracted components:`, { streetNumber, streetName });
    
    if (streetNumber && streetName) {
      // Extract key parts of street name (e.g., "EAST 5" from "EAST 5 STREET")
      const streetNameParts = streetName.split(/\s+/).slice(0, 2).join(' ');
      log(`Street name parts:`, streetNameParts);
      
      where = `upper(address) LIKE '${streetNumber} ${streetNameParts}%'`;
      if (boroughCode) {
        where += ` AND borocode='${boroughCode}'`;
      }
      
      log(`Second query WHERE clause:`, where);
      results = await queryPluto(where, 5);
    }
  }
  
  log(`Final results count:`, results.length);
  if (results.length > 0) {
    log(`Returning first result:`, results[0]);
  }
  
  // Return best match (first result)
  return results[0] || null;
}
