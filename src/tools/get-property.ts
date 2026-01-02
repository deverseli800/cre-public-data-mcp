import * as nycPluto from "../cities/nyc/pluto.js";
import * as nycTaxBenefits from "../cities/nyc/tax-benefits.js";
import { getBoroughCode } from "../cities/nyc/utils.js";

// Logging helper
function log(message: string, data?: unknown) {
  console.error(`[get_property] ${message}`, data !== undefined ? JSON.stringify(data) : '');
}

interface GetPropertyInput {
  city: "nyc" | "philadelphia";
  address: string;
  borough?: string;
  include_tax_benefits?: boolean;  // Default: true - fetch tax benefits for enhanced rent info
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
    
    // Fetch tax benefits for enhanced rent info (default: true)
    const includeTaxBenefits = input.include_tax_benefits !== false;
    
    if (includeTaxBenefits && property.block && property.lot) {
      try {
        // Get borough code from property for tax benefits lookup
        const propertyBoroughCode = getBoroughCode(property.borough) || boroughCode;
        
        if (propertyBoroughCode) {
          log(`Fetching tax benefits for enhanced rent info...`);
          const taxBenefits = await nycTaxBenefits.getTaxBenefitsByBBL(
            propertyBoroughCode,
            property.block,
            property.lot
          );
          
          // If we found tax benefits, recalculate rent_info with that data
          if (taxBenefits.has_421a || taxBenefits.has_j51) {
            log(`Found tax benefits: 421a=${taxBenefits.has_421a}, J-51=${taxBenefits.has_j51}`);
            
            const enhancedRentInfo = nycPluto.calculateRentInfoWithTaxBenefits(
              property,
              { has_421a: taxBenefits.has_421a, has_j51: taxBenefits.has_j51 }
            );
            
            return {
              ...property,
              rent_info: enhancedRentInfo,
              tax_benefits_summary: {
                has_421a: taxBenefits.has_421a,
                has_j51: taxBenefits.has_j51,
                has_icap: taxBenefits.has_icap,
                total_abatement: taxBenefits.total_abatement_amount,
              },
            };
          }
        }
      } catch (error) {
        log(`Error fetching tax benefits:`, error);
        // Continue without tax benefits enhancement
      }
    }
    
    return property;
    
  } else {
    return { error: "Philadelphia support not yet implemented" };
  }
}
