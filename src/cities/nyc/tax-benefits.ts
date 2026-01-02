// NYC Tax Benefits - Exemptions and Abatements
// Data sources:
// - Property Exemption Detail: https://data.cityofnewyork.us/resource/muvi-b6kx.json
// - Property Abatement Detail: https://data.cityofnewyork.us/resource/rgyu-ii48.json

const EXEMPTION_ENDPOINT = "https://data.cityofnewyork.us/resource/muvi-b6kx.json";
const ABATEMENT_ENDPOINT = "https://data.cityofnewyork.us/resource/rgyu-ii48.json";

function log(message: string, data?: unknown) {
  console.error(`[TAX_BENEFITS] ${message}`, data !== undefined ? JSON.stringify(data, null, 2) : '');
}

export interface TaxExemption {
  bbl: string;
  tax_year: string;
  exemption_code: string;
  exemption_description: string;
  exempt_value: number;
  percent_exempt: number | null;
}

export interface TaxAbatement {
  bbl: string;
  tax_year: string;
  abatement_code: string;
  abatement_description: string;
  abatement_amount: number;
  benefit_start_date: string | null;
  benefit_end_date: string | null;
}

export interface TaxBenefits {
  bbl: string;
  exemptions: TaxExemption[];
  abatements: TaxAbatement[];
  has_421a: boolean;
  has_j51: boolean;
  has_icap: boolean;
  has_star: boolean;
  total_exemption_value: number;
  total_abatement_amount: number;
}

/**
 * Query Property Exemption Detail dataset by BBL
 */
async function queryExemptions(bbl: string): Promise<TaxExemption[]> {
  // BBL format: 10-digit string (borough + block + lot)
  const params = new URLSearchParams({
    "bbl": bbl,
    "$limit": "100",
    "$order": "taxyear DESC"
  });

  const url = `${EXEMPTION_ENDPOINT}?${params}`;
  log(`Querying exemptions:`, url);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      log(`Exemption API error: ${response.status}`);
      return [];
    }

    const data = await response.json() as Record<string, unknown>[];
    log(`Exemptions found: ${data.length}`);

    return data.map((row) => ({
      bbl: String(row.bbl || ""),
      tax_year: String(row.taxyear || row.tax_year || ""),
      exemption_code: String(row.exmptcode || row.exemption_code || ""),
      exemption_description: String(row.exmptdesc || row.exemption_description || row.exmptname || ""),
      exempt_value: parseFloat(String(row.exmpttot || row.exempt_value || "0")) || 0,
      percent_exempt: row.pctexmpt ? parseFloat(String(row.pctexmpt)) : null,
    }));
  } catch (error) {
    log(`Exemption query error:`, error);
    return [];
  }
}

/**
 * Query Property Abatement Detail dataset by BBL
 */
async function queryAbatements(bbl: string): Promise<TaxAbatement[]> {
  const params = new URLSearchParams({
    "bbl": bbl,
    "$limit": "100",
    "$order": "taxyear DESC"
  });

  const url = `${ABATEMENT_ENDPOINT}?${params}`;
  log(`Querying abatements:`, url);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      log(`Abatement API error: ${response.status}`);
      return [];
    }

    const data = await response.json() as Record<string, unknown>[];
    log(`Abatements found: ${data.length}`);

    return data.map((row) => ({
      bbl: String(row.bbl || ""),
      tax_year: String(row.taxyear || row.tax_year || ""),
      abatement_code: String(row.apts_code || row.abatement_code || row.abatmtcode || ""),
      abatement_description: String(row.apts_desc || row.abatement_description || row.abatmtname || ""),
      abatement_amount: parseFloat(String(row.curabttot || row.abatement_amount || "0")) || 0,
      benefit_start_date: row.benstrtdt ? String(row.benstrtdt).split("T")[0] : null,
      benefit_end_date: row.benenddt ? String(row.benenddt).split("T")[0] : null,
    }));
  } catch (error) {
    log(`Abatement query error:`, error);
    return [];
  }
}

/**
 * Format BBL from borough code, block, and lot
 * BBL is a 10-digit number: 1 digit borough + 5 digit block + 4 digit lot
 */
export function formatBBL(boroughCode: string, block: string, lot: string): string {
  const b = boroughCode.padStart(1, '0');
  const blk = block.padStart(5, '0');
  const lt = lot.padStart(4, '0');
  return `${b}${blk}${lt}`;
}

/**
 * Get all tax benefits (exemptions and abatements) for a property by BBL
 */
export async function getTaxBenefitsByBBL(
  boroughCode: string,
  block: string,
  lot: string
): Promise<TaxBenefits> {
  const bbl = formatBBL(boroughCode, block, lot);
  log(`Getting tax benefits for BBL: ${bbl}`, { boroughCode, block, lot });

  const [exemptions, abatements] = await Promise.all([
    queryExemptions(bbl),
    queryAbatements(bbl)
  ]);

  // Check for specific benefit types
  const allCodes = [
    ...exemptions.map(e => e.exemption_code.toUpperCase()),
    ...abatements.map(a => a.abatement_code.toUpperCase()),
    ...exemptions.map(e => e.exemption_description.toUpperCase()),
    ...abatements.map(a => a.abatement_description.toUpperCase()),
  ].join(' ');

  const has_421a = allCodes.includes('421A') || allCodes.includes('421-A');
  const has_j51 = allCodes.includes('J51') || allCodes.includes('J-51');
  const has_icap = allCodes.includes('ICAP') || allCodes.includes('ICIP');
  const has_star = allCodes.includes('STAR');

  // Calculate totals (for most recent tax year)
  const total_exemption_value = exemptions.reduce((sum, e) => sum + e.exempt_value, 0);
  const total_abatement_amount = abatements.reduce((sum, a) => sum + a.abatement_amount, 0);

  const result: TaxBenefits = {
    bbl,
    exemptions,
    abatements,
    has_421a,
    has_j51,
    has_icap,
    has_star,
    total_exemption_value,
    total_abatement_amount,
  };

  log(`Tax benefits result:`, { 
    bbl, 
    exemption_count: exemptions.length, 
    abatement_count: abatements.length,
    has_421a, has_j51, has_icap, has_star
  });

  return result;
}
