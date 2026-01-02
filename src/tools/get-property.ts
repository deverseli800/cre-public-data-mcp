import * as nycPluto from "../cities/nyc/pluto.js";
import { getBoroughCode } from "../cities/nyc/utils.js";

// Logging helper
function log(message: string, data?: unknown) {
  console.error(`[get_property] ${message}`, data !== undefined ? JSON.stringify(data) : '');
}

interface GetPropertyInput {
  city: "nyc" | "philadelphia";
  address: string;
  borough?: string;
}

export async function getProperty(input: GetPropertyInput) {
  log(`Called with input:`, input);
  
  if (input.city === "nyc") {
    let boroughCode: string | undefined;
    
    if (input.borough) {
      boroughCode = getBoroughCode(input.borough);
      log(`Borough "${input.borough}" mapped to code: ${boroughCode}`);
      
      if (!boroughCode) {
        log(`WARNING: Unknown borough "${input.borough}", searching all boroughs`);
      }
    }
    
    const property = await nycPluto.getPropertyByAddress(input.address, boroughCode);
    
    if (!property) {
      log(`Property not found for address: ${input.address}, borough code: ${boroughCode}`);
      return { error: "Property not found", city: "nyc", address: input.address, borough: input.borough };
    }
    
    log(`Found property:`, property);
    return property;
    
  } else {
    return { error: "Philadelphia support not yet implemented" };
  }
}
