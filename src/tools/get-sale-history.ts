import * as nycSales from "../cities/nyc/rolling-sales.js";
import * as nycPluto from "../cities/nyc/pluto.js";
import { getBoroughCode } from "../cities/nyc/utils.js";

interface GetSaleHistoryInput {
  city: "nyc" | "philadelphia";
  address: string;
  borough?: string;
}

export async function getSaleHistory(input: GetSaleHistoryInput) {
  if (input.city === "nyc") {
    // First find the BBL via PLUTO
    const boroughCode = input.borough ? getBoroughCode(input.borough) : undefined;
    const property = await nycPluto.getPropertyByAddress(input.address, boroughCode);
    
    if (!property) {
      return { error: "Property not found", city: "nyc", address: input.address };
    }
    
    // Query sales by BBL
    const sales = await nycSales.getSalesByBBL(property.borough, property.block, property.lot, 50);
    
    return {
      city: "nyc",
      address: property.address,
      bbl: property.bbl,
      count: sales.length,
      sales: sales.sort((a, b) => 
        new Date(b.sale_date).getTime() - new Date(a.sale_date).getTime()
      ),
    };
    
  } else {
    return { error: "Philadelphia support not yet implemented" };
  }
}
