const PLUTO_ENDPOINT = "https://data.cityofnewyork.us/resource/64uk-42ks.json";

// Logging helper (uses stderr so it doesn't interfere with MCP stdio)
function log(message: string, data?: unknown) {
  console.error(`[PLUTO] ${message}`, data !== undefined ? JSON.stringify(data, null, 2) : '');
}

export interface RentInfo {
  likely_stabilized: boolean;
  stabilization_reasons: string[];
  confidence: "high" | "medium" | "low";
  notes: string[];
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
  units_total: number;
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
  // Rent regulation info
  rent_info: RentInfo;
  city: "nyc";
}

/**
 * Calculate rent stabilization likelihood based on property characteristics.
 * 
 * NYC Rent Stabilization applies to:
 * 1. Buildings with 6+ units built before January 1, 1974
 * 2. Buildings built before February 1, 1947 (with 6+ units) - tenants who moved in after June 30, 1971
 * 3. Buildings receiving 421a or J-51 tax benefits (regardless of age/size)
 * 
 * Note: This is an ESTIMATE. Units can be deregulated through:
 * - High-rent vacancy decontrol (pre-2019 for rents over $2,774)
 * - Owner occupancy
 * - Substantial rehabilitation
 * - Condo/co-op conversion
 */
function calculateRentInfo(params: {
  year_built: number | null;
  units: number;
  building_class: string;
  owner: string;
  has_421a?: boolean;
  has_j51?: boolean;
}): RentInfo {
  const { year_built, units, building_class, owner, has_421a, has_j51 } = params;
  
  const reasons: string[] = [];
  const notes: string[] = [];
  let likely_stabilized = false;
  let confidence: "high" | "medium" | "low" = "low";
  
  // Check for NYCHA (public housing - not rent stabilized, has its own rules)
  const isNYCHA = owner.toUpperCase().includes('NYCHA') || 
                  owner.toUpperCase().includes('NEW YORK CITY HOUSING AUTHORITY') ||
                  owner.toUpperCase().includes('NYC HOUSING AUTHORITY');
  
  if (isNYCHA) {
    return {
      likely_stabilized: false,
      stabilization_reasons: [],
      confidence: "high",
      notes: ["NYCHA public housing - subject to federal regulations, not rent stabilization"],
    };
  }
  
  // Check for condo/co-op (building class starts with R)
  const isCondoCoop = building_class.toUpperCase().startsWith('R');
  if (isCondoCoop) {
    notes.push("Condo/co-op building - individual units typically not rent stabilized unless sponsor-owned rentals");
  }
  
  // Rule 1: Pre-1974 buildings with 6+ units
  if (year_built && year_built < 1974 && units >= 6 && !isCondoCoop) {
    likely_stabilized = true;
    reasons.push(`Pre-1974 building (${year_built}) with ${units} units`);
    confidence = "medium";
    
    // Pre-1947 buildings have additional protections
    if (year_built < 1947) {
      notes.push("Pre-1947 building may have some rent-controlled units (tenants since before July 1971)");
    }
  }
  
  // Rule 2: Tax benefit recipients (421a, J-51)
  if (has_421a) {
    likely_stabilized = true;
    reasons.push("Receives 421a tax exemption - units must be rent stabilized during benefit period");
    confidence = "high";
    notes.push("421a stabilization expires when tax benefit ends - check benefit end date");
  }
  
  if (has_j51) {
    likely_stabilized = true;
    reasons.push("Receives J-51 tax abatement - units must be rent stabilized during benefit period");
    confidence = "high";
    notes.push("J-51 stabilization may extend beyond benefit period under certain conditions");
  }
  
  // Add general notes
  if (likely_stabilized) {
    notes.push("Individual units may be deregulated through high-rent vacancy, owner occupancy, or substantial rehab");
    notes.push("Verify with DHCR or NYC tax bills for definitive unit counts");
  } else if (units >= 6 && year_built && year_built >= 1974) {
    notes.push(`Built ${year_built} - after 1974 cutoff. May be stabilized if receiving tax benefits (421a/J-51)`);
  } else if (units > 0 && units < 6) {
    notes.push(`Only ${units} units - below 6-unit threshold for mandatory stabilization. May be stabilized if receiving tax benefits`);
  }
  
  // Adjust confidence if we couldn't determine key factors
  if (!year_built && units < 6) {
    confidence = "low";
    notes.push("Unable to determine year built - stabilization status uncertain");
  }
  
  return {
    likely_stabilized,
    stabilization_reasons: reasons,
    confidence,
    notes,
  };
}

/**
 * Enhanced rent info calculation that includes tax benefit data
 */
export function calculateRentInfoWithTaxBenefits(
  property: NYCProperty,
  taxBenefits: { has_421a: boolean; has_j51: boolean }
): RentInfo {
  return calculateRentInfo({
    year_built: property.year_built,
    units: property.units_total || property.units,
    building_class: property.building_class,
    owner: property.owner,
    has_421a: taxBenefits.has_421a,
    has_j51: taxBenefits.has_j51,
  });
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
    
    const units = parseInt(String(row.unitsres || "0")) || 0;
    const units_total = parseInt(String(row.unitstotal || "0")) || 0;
    const year_built = row.yearbuilt ? parseInt(String(row.yearbuilt)) : null;
    const building_class = String(row.bldgclass || "");
    const owner = String(row.ownername || "");
    
    // Calculate rent stabilization info
    const rent_info = calculateRentInfo({
      year_built,
      units: units_total || units,
      building_class,
      owner,
    });
    
    return {
      bbl: String(row.bbl || "").split(".")[0],
      borough: String(row.borough || ""),
      block,
      lot,
      address: String(row.address || ""),
      latitude: row.latitude ? parseFloat(String(row.latitude)) : null,
      longitude: row.longitude ? parseFloat(String(row.longitude)) : null,
      units,
      units_total,
      year_built,
      building_class,
      owner,
      zoning: String(row.zonedist1 || ""),
      lot_area: parseInt(String(row.lotarea || "0")) || 0,
      building_area: parseInt(String(row.bldgarea || "0")) || 0,
      // Assessment data from NYC Finance
      assessed_land: parseFloat(String(row.assessland || "0")) || 0,
      assessed_total: parseFloat(String(row.assesstot || "0")) || 0,
      exempt_total: parseFloat(String(row.exempttot || "0")) || 0,
      zola_url,
      rent_info,
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
