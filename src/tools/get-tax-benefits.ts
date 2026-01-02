import * as nycTaxBenefits from "../cities/nyc/tax-benefits.js";
import * as nycPluto from "../cities/nyc/pluto.js";
import { getBoroughCode } from "../cities/nyc/utils.js";

function log(message: string, data?: unknown) {
  console.error(`[get_tax_benefits] ${message}`, data !== undefined ? JSON.stringify(data) : '');
}

interface GetTaxBenefitsInput {
  city: "nyc" | "philadelphia";
  // Option 1: By address
  address?: string;
  borough?: string;
  // Option 2: By BBL components
  borough_code?: string;
  block?: string;
  lot?: string;
}

export async function getTaxBenefits(input: GetTaxBenefitsInput) {
  log(`Called with input:`, input);

  if (input.city === "nyc") {
    let boroughCode: string | undefined;
    let block: string | undefined;
    let lot: string | undefined;

    // If we have direct BBL components, use those
    if (input.borough_code && input.block && input.lot) {
      boroughCode = input.borough_code;
      block = input.block;
      lot = input.lot;
      log(`Using provided BBL components:`, { boroughCode, block, lot });
    } 
    // Otherwise, look up by address first
    else if (input.address) {
      const mappedBorough = input.borough ? getBoroughCode(input.borough) : undefined;
      log(`Looking up property by address:`, { address: input.address, borough: mappedBorough });
      
      const property = await nycPluto.getPropertyByAddress(input.address, mappedBorough);
      
      if (!property) {
        return { 
          error: "Property not found - cannot look up tax benefits without valid BBL", 
          city: "nyc", 
          address: input.address 
        };
      }

      // Get borough code from the property
      // PLUTO returns borough as "MN", "BK", etc. - need to convert
      boroughCode = getBoroughCode(property.borough) || property.borough;
      block = property.block;
      lot = property.lot;
      
      log(`Found property:`, { address: property.address, boroughCode, block, lot });
    } else {
      return { 
        error: "Must provide either address+borough or borough_code+block+lot", 
        city: "nyc" 
      };
    }

    // Ensure we have valid BBL components
    if (!boroughCode || !block || !lot) {
      return { 
        error: "Could not determine BBL for property", 
        city: "nyc",
        borough_code: boroughCode,
        block,
        lot
      };
    }

    // Query tax benefits
    const benefits = await nycTaxBenefits.getTaxBenefitsByBBL(boroughCode, block, lot);
    
    return {
      city: "nyc",
      ...benefits,
      // Add human-readable summary
      summary: generateSummary(benefits),
    };

  } else {
    return { error: "Philadelphia tax benefits not yet implemented" };
  }
}

function generateSummary(benefits: nycTaxBenefits.TaxBenefits): string {
  const parts: string[] = [];

  if (benefits.exemptions.length === 0 && benefits.abatements.length === 0) {
    return "No tax exemptions or abatements found for this property.";
  }

  if (benefits.has_421a) {
    parts.push("421a tax exemption (new construction incentive)");
  }
  if (benefits.has_j51) {
    parts.push("J-51 exemption/abatement (rehabilitation incentive)");
  }
  if (benefits.has_icap) {
    parts.push("ICAP/ICIP (industrial/commercial incentive)");
  }
  if (benefits.has_star) {
    parts.push("STAR (school tax relief)");
  }

  if (benefits.exemptions.length > 0) {
    const uniqueExemptions = [...new Set(benefits.exemptions.map(e => e.exemption_description))];
    parts.push(`${uniqueExemptions.length} exemption type(s): ${uniqueExemptions.slice(0, 5).join(", ")}`);
  }

  if (benefits.abatements.length > 0) {
    const uniqueAbatements = [...new Set(benefits.abatements.map(a => a.abatement_description))];
    parts.push(`${uniqueAbatements.length} abatement type(s): ${uniqueAbatements.slice(0, 5).join(", ")}`);
  }

  if (benefits.total_abatement_amount > 0) {
    parts.push(`Total abatement: $${benefits.total_abatement_amount.toLocaleString()}`);
  }

  return parts.join(". ") + ".";
}
