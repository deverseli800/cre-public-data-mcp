import * as nycPluto from "../cities/nyc/pluto.js";
import { getBoroughCode } from "../cities/nyc/utils.js";

interface GetPropertyInput {
  city: "nyc" | "philadelphia";
  address: string;
  borough?: string;
}

export async function getProperty(input: GetPropertyInput) {
  if (input.city === "nyc") {
    const boroughCode = input.borough ? getBoroughCode(input.borough) : undefined;
    const property = await nycPluto.getPropertyByAddress(input.address, boroughCode);
    
    if (!property) {
      return { error: "Property not found", city: "nyc", address: input.address };
    }
    return property;
    
  } else {
    return { error: "Philadelphia support not yet implemented" };
  }
}
