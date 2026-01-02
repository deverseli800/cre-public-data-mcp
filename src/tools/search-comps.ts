import * as nycSales from "../cities/nyc/rolling-sales.js";
import * as nycPluto from "../cities/nyc/pluto.js";
import { getBoroughCode, getBoroughName } from "../cities/nyc/utils.js";
import { getCompatibleNeighborhoods, areNeighborhoodsCompatible } from "../cities/nyc/neighborhoods.js";

function log(message: string, data?: unknown) {
  console.error(`[search_comps] ${message}`, data !== undefined ? JSON.stringify(data, null, 2) : '');
}

interface SearchCompsInput {
  city: "nyc" | "philadelphia";
  address: string;
  borough: string;
  limit?: number;
  // Optional overrides
  building_class?: string;  // Override auto-detected building class
  include_adjacent_neighborhoods?: boolean;  // Default: true
}

interface CompResult {
  address: string;
  sale_price: number;
  sale_date: string;
  neighborhood: string;
  building_class: string;
  units_total: number;
  sqft: number;
  year_built: number | null;
  price_per_unit: number | null;
  price_per_sqft: number | null;
  zola_url: string;
  is_same_neighborhood: boolean;
  is_adjacent_neighborhood: boolean;
  similarity_score: number;
}

export async function searchComps(input: SearchCompsInput) {
  log(`Called with input:`, input);

  if (input.city !== "nyc") {
    return { error: "Comparable sales search only implemented for NYC" };
  }

  const limit = Math.min(input.limit || 10, 50);
  const includeAdjacent = input.include_adjacent_neighborhoods !== false;

  // Step 1: Look up the subject property
  const boroughCode = getBoroughCode(input.borough);
  if (!boroughCode) {
    return { error: `Invalid borough: ${input.borough}` };
  }

  log(`Looking up subject property:`, { address: input.address, boroughCode });
  const subject = await nycPluto.getPropertyByAddress(input.address, boroughCode);
  
  if (!subject) {
    return { 
      error: "Subject property not found", 
      city: "nyc", 
      address: input.address,
      borough: input.borough 
    };
  }

  log(`Found subject:`, subject);

  // Step 2: Determine the subject's neighborhood by looking at nearby sales
  const subjectNeighborhood = await determineNeighborhood(
    subject.borough, 
    subject.block, 
    subject.lot
  );

  if (!subjectNeighborhood) {
    return { 
      error: "Could not determine neighborhood for subject property. No recent sales found nearby.",
      city: "nyc",
      subject: {
        address: subject.address,
        building_class: subject.building_class,
        units: subject.units_total || subject.units,
        year_built: subject.year_built,
      }
    };
  }

  log(`Determined subject neighborhood: ${subjectNeighborhood}`);

  // Step 3: Get building class (use override or subject's class)
  const buildingClass = input.building_class || subject.building_class;
  // Get building class category (first letter: C=walk-up, D=elevator, etc.)
  const buildingClassCategory = buildingClass.charAt(0);

  log(`Building class: ${buildingClass} (category: ${buildingClassCategory})`);

  // Step 4: Build search criteria for comps
  const compatibleNeighborhoods = includeAdjacent 
    ? getCompatibleNeighborhoods(subjectNeighborhood)
    : [subjectNeighborhood.toUpperCase()];

  log(`Searching neighborhoods:`, compatibleNeighborhoods);

  // Build WHERE clause for sales query
  const conditions: string[] = [
    "sale_price > 100000",  // Filter out nominal sales
    `borough='${boroughCode}'`,  // Same borough required
    `building_class_at_time_of_sale LIKE '${buildingClassCategory}%'`,  // Same building type
    "(apartment_number IS NULL OR apartment_number = '')",  // Whole buildings only
  ];

  // Add neighborhood filter
  if (compatibleNeighborhoods.length > 0) {
    const neighborhoodConditions = compatibleNeighborhoods
      .map(n => `neighborhood LIKE '%${n.replace(/'/g, "''")}%'`)
      .join(" OR ");
    conditions.push(`(${neighborhoodConditions})`);
  }

  const where = conditions.join(" AND ");
  log(`Sales query WHERE:`, where);

  // Fetch more than needed so we can filter and rank
  const sales = await nycSales.querySales(where, limit * 3);
  log(`Found ${sales.length} potential comps`);

  // Step 5: Enrich and score each comp
  const comps: CompResult[] = [];

  for (const sale of sales) {
    // Skip the subject property itself
    if (sale.block === subject.block && sale.lot === subject.lot) {
      continue;
    }

    // Get PLUTO data for additional info
    let plutoData = null;
    try {
      plutoData = await nycPluto.getPropertyByBBL(sale.borough, sale.block, sale.lot);
    } catch {
      // Continue without PLUTO enrichment
    }

    const units_total = plutoData?.units_total || sale.units || 0;
    const sqft = sale.sqft || 0;
    const year_built = plutoData?.year_built || sale.year_built;

    // Calculate metrics
    const price_per_unit = units_total > 0 ? Math.round(sale.sale_price / units_total) : null;
    const price_per_sqft = sqft > 0 ? Math.round(sale.sale_price / sqft) : null;

    // Determine neighborhood relationship
    const is_same_neighborhood = sale.neighborhood.toUpperCase().includes(subjectNeighborhood.toUpperCase()) ||
      subjectNeighborhood.toUpperCase().includes(sale.neighborhood.toUpperCase());
    const is_adjacent_neighborhood = !is_same_neighborhood && 
      areNeighborhoodsCompatible(subjectNeighborhood, sale.neighborhood);

    // Calculate similarity score (higher = more similar)
    const similarity_score = calculateSimilarityScore(
      subject,
      {
        building_class: sale.building_class,
        units: units_total,
        year_built,
        sqft,
      },
      is_same_neighborhood,
      is_adjacent_neighborhood
    );

    comps.push({
      address: sale.address,
      sale_price: sale.sale_price,
      sale_date: sale.sale_date,
      neighborhood: sale.neighborhood,
      building_class: sale.building_class,
      units_total,
      sqft,
      year_built,
      price_per_unit,
      price_per_sqft,
      zola_url: sale.zola_url,
      is_same_neighborhood,
      is_adjacent_neighborhood,
      similarity_score,
    });
  }

  // Sort by similarity score (descending) and take top N
  comps.sort((a, b) => b.similarity_score - a.similarity_score);
  const topComps = comps.slice(0, limit);

  // Calculate average metrics from comps
  const avgPricePerUnit = calculateAverage(topComps.map(c => c.price_per_unit).filter(Boolean) as number[]);
  const avgPricePerSqft = calculateAverage(topComps.map(c => c.price_per_sqft).filter(Boolean) as number[]);

  return {
    city: "nyc",
    subject: {
      address: subject.address,
      borough: getBoroughName(boroughCode) || subject.borough,
      neighborhood: subjectNeighborhood,
      building_class: subject.building_class,
      units: subject.units,
      units_total: subject.units_total,
      year_built: subject.year_built,
      sqft: subject.building_area,
      zola_url: subject.zola_url,
    },
    search_criteria: {
      building_class_category: buildingClassCategory,
      neighborhoods_searched: compatibleNeighborhoods,
      include_adjacent: includeAdjacent,
    },
    summary: {
      comps_found: topComps.length,
      avg_price_per_unit: avgPricePerUnit,
      avg_price_per_sqft: avgPricePerSqft,
      implied_value_by_unit: subject.units_total && avgPricePerUnit 
        ? Math.round(subject.units_total * avgPricePerUnit) 
        : null,
      implied_value_by_sqft: subject.building_area && avgPricePerSqft
        ? Math.round(subject.building_area * avgPricePerSqft)
        : null,
    },
    comps: topComps,
  };
}

/**
 * Determine the neighborhood for a property by looking at nearby sales
 */
async function determineNeighborhood(
  borough: string, 
  block: string, 
  lot: string
): Promise<string | null> {
  // First try: Sales on the exact property
  const exactSales = await nycSales.getSalesByBBL(borough, block, lot, 1);
  if (exactSales.length > 0 && exactSales[0].neighborhood) {
    return exactSales[0].neighborhood;
  }

  // Second try: Sales on the same block
  const boroughCode = getBoroughCode(borough) || borough;
  const blockSales = await nycSales.querySales(
    `borough='${boroughCode}' AND block='${block}' AND sale_price > 0`,
    5
  );
  
  if (blockSales.length > 0) {
    // Return most common neighborhood on the block
    const neighborhoods = blockSales.map(s => s.neighborhood).filter(Boolean);
    if (neighborhoods.length > 0) {
      return mostCommon(neighborhoods);
    }
  }

  // Third try: Sales on adjacent blocks
  const blockNum = parseInt(block);
  if (!isNaN(blockNum)) {
    const adjacentBlocks = [blockNum - 1, blockNum + 1].filter(b => b > 0);
    
    for (const adjBlock of adjacentBlocks) {
      const adjSales = await nycSales.querySales(
        `borough='${boroughCode}' AND block='${adjBlock}' AND sale_price > 0`,
        3
      );
      
      if (adjSales.length > 0) {
        const neighborhoods = adjSales.map(s => s.neighborhood).filter(Boolean);
        if (neighborhoods.length > 0) {
          return mostCommon(neighborhoods);
        }
      }
    }
  }

  return null;
}

/**
 * Calculate similarity score between subject and comp
 */
function calculateSimilarityScore(
  subject: { building_class: string; units: number; units_total: number; year_built: number | null; building_area: number },
  comp: { building_class: string; units: number; year_built: number | null; sqft: number },
  isSameNeighborhood: boolean,
  isAdjacentNeighborhood: boolean
): number {
  let score = 0;

  // Neighborhood: same = 30 points, adjacent = 15 points
  if (isSameNeighborhood) score += 30;
  else if (isAdjacentNeighborhood) score += 15;

  // Building class: exact match = 25 points, same category = 15 points
  if (subject.building_class === comp.building_class) {
    score += 25;
  } else if (subject.building_class.charAt(0) === comp.building_class.charAt(0)) {
    score += 15;
  }

  // Unit count similarity: closer = more points (max 20)
  const subjectUnits = subject.units_total || subject.units || 0;
  const compUnits = comp.units || 0;
  if (subjectUnits > 0 && compUnits > 0) {
    const unitRatio = Math.min(subjectUnits, compUnits) / Math.max(subjectUnits, compUnits);
    score += Math.round(unitRatio * 20);
  }

  // Year built similarity: closer = more points (max 15)
  if (subject.year_built && comp.year_built) {
    const yearDiff = Math.abs(subject.year_built - comp.year_built);
    if (yearDiff <= 5) score += 15;
    else if (yearDiff <= 10) score += 12;
    else if (yearDiff <= 20) score += 8;
    else if (yearDiff <= 30) score += 4;
  }

  // Size similarity: closer = more points (max 10)
  const subjectSqft = subject.building_area || 0;
  const compSqft = comp.sqft || 0;
  if (subjectSqft > 0 && compSqft > 0) {
    const sizeRatio = Math.min(subjectSqft, compSqft) / Math.max(subjectSqft, compSqft);
    score += Math.round(sizeRatio * 10);
  }

  return score;
}

/**
 * Find most common item in array
 */
function mostCommon(arr: string[]): string {
  const counts = new Map<string, number>();
  for (const item of arr) {
    counts.set(item, (counts.get(item) || 0) + 1);
  }
  let maxCount = 0;
  let maxItem = arr[0];
  for (const [item, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      maxItem = item;
    }
  }
  return maxItem;
}

/**
 * Calculate average of numbers
 */
function calculateAverage(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}
