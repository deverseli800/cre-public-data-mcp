const SALES_ENDPOINT = "https://data.cityofnewyork.us/resource/usep-8jbt.json";

export interface NYCSale {
  borough: string;
  block: string;
  lot: string;
  address: string;
  apartment_number: string;
  sale_price: number;
  sale_date: string;
  building_class: string;
  neighborhood: string;
  units: number;
  sqft: number;
  year_built: number | null;
  zola_url: string;
  // Enriched from PLUTO
  latitude?: number | null;
  longitude?: number | null;
  owner?: string;
  zoning?: string;
  city: "nyc";
}

export async function querySales(
  where: string, 
  limit = 10
): Promise<NYCSale[]> {
  const params = new URLSearchParams({
    "$where": where,
    "$limit": limit.toString(),
    "$order": "sale_date DESC",
  });

  const response = await fetch(`${SALES_ENDPOINT}?${params}`);
  if (!response.ok) throw new Error(`Rolling Sales API error: ${response.status}`);
  
  const data = await response.json() as Record<string, unknown>[];
  return data.map((row) => {
    const borough = String(row.borough || "");
    const block = String(row.block || "");
    const lot = String(row.lot || "");
    
    // Generate ZOLA URL: https://zola.planninglabs.nyc/l/lot/{borocode}/{block}/{lot}
    // Sales data uses numeric borough codes (1-5)
    const zola_url = borough && block && lot 
      ? `https://zola.planninglabs.nyc/l/lot/${borough}/${block}/${lot}`
      : "";
    
    return {
      borough,
      block,
      lot,
      address: String(row.address || ""),
      apartment_number: String(row.apartment_number || ""),
      sale_price: parseFloat(String(row.sale_price || "0")) || 0,
      sale_date: String(row.sale_date || "").split("T")[0],
      building_class: String(row.building_class_at_time_of_sale || row.building_class_at_present || ""),
      neighborhood: String(row.neighborhood || ""),
      units: parseInt(String(row.residential_units || "0")) || 0,
      sqft: parseInt(String(row.gross_square_feet || "0")) || 0,
      year_built: row.year_built ? parseInt(String(row.year_built)) : null,
      zola_url,
      city: "nyc" as const,
    };
  });
}

export async function getSalesByBBL(
  borough: string,
  block: string,
  lot: string,
  limit = 50
): Promise<NYCSale[]> {
  const b = block.replace(/^0+/, "") || "0";
  const l = lot.replace(/^0+/, "") || "0";
  const where = `borough='${borough}' AND block='${b}' AND lot='${l}'`;
  return querySales(where, limit);
}
