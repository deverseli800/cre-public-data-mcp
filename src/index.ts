#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { searchSales } from "./tools/search-sales.js";
import { getProperty } from "./tools/get-property.js";
import { getSaleHistory } from "./tools/get-sale-history.js";
import { searchProperties } from "./tools/search-properties.js";

const server = new Server(
  { name: "property-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "search_sales",
      description: "Search for recent property sales in NYC or Philadelphia. Filter by neighborhood, price range, building type, and more. Returns sales enriched with property details.",
      inputSchema: {
        type: "object" as const,
        properties: {
          city: { 
            type: "string", 
            enum: ["nyc", "philadelphia"],
            description: "City to search (required)"
          },
          neighborhood: { 
            type: "string", 
            description: "Neighborhood name, e.g., 'EAST VILLAGE', 'CENTER CITY', 'UNIVERSITY CITY'" 
          },
          borough: { 
            type: "string", 
            enum: ["manhattan", "bronx", "brooklyn", "queens", "staten island"],
            description: "NYC only: borough to search"
          },
          min_price: { type: "number", description: "Minimum sale price" },
          max_price: { type: "number", description: "Maximum sale price" },
          min_units: { type: "number", description: "Minimum residential units" },
          max_units: { type: "number", description: "Maximum residential units" },
          building_class: { 
            type: "string", 
            description: "Building class: C=walk-up, D=elevator, R=condo (NYC). Philadelphia uses category codes." 
          },
          date_from: { type: "string", description: "Sales on or after this date (YYYY-MM-DD)" },
          date_to: { type: "string", description: "Sales on or before this date (YYYY-MM-DD)" },
          whole_buildings_only: { 
            type: "boolean", 
            description: "Exclude individual unit sales (default: true)" 
          },
          limit: { type: "number", description: "Max results (default: 10, max: 50)" }
        },
        required: ["city"]
      }
    },
    {
      name: "get_property",
      description: "Get detailed property information from NYC PLUTO or Philadelphia OPA database. Includes owner, units, year built, zoning, and coordinates.",
      inputSchema: {
        type: "object" as const,
        properties: {
          city: { 
            type: "string", 
            enum: ["nyc", "philadelphia"],
            description: "City (required)"
          },
          address: { type: "string", description: "Street address to search" },
          borough: { type: "string", description: "NYC only: borough name" }
        },
        required: ["city", "address"]
      }
    },
    {
      name: "get_sale_history",
      description: "Get all recorded sales for a specific property in NYC or Philadelphia.",
      inputSchema: {
        type: "object" as const,
        properties: {
          city: { 
            type: "string", 
            enum: ["nyc", "philadelphia"],
            description: "City (required)"
          },
          address: { type: "string", description: "Street address" },
          borough: { type: "string", description: "NYC only: borough name" }
        },
        required: ["city", "address"]
      }
    },
    {
      name: "search_properties",
      description: "Search NYC or Philadelphia property database for properties (not sales) matching criteria.",
      inputSchema: {
        type: "object" as const,
        properties: {
          city: { 
            type: "string", 
            enum: ["nyc", "philadelphia"],
            description: "City (required)"
          },
          neighborhood: { type: "string" },
          borough: { type: "string", description: "NYC only" },
          min_units: { type: "number" },
          max_units: { type: "number" },
          building_class: { type: "string" },
          zoning: { type: "string", description: "Zoning district, e.g., 'R7', 'CMX'" },
          min_year_built: { type: "number" },
          max_year_built: { type: "number" },
          limit: { type: "number" }
        },
        required: ["city"]
      }
    }
  ]
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result;
    switch (name) {
      case "search_sales":
        result = await searchSales(args as unknown as Parameters<typeof searchSales>[0]);
        break;
      case "get_property":
        result = await getProperty(args as unknown as Parameters<typeof getProperty>[0]);
        break;
      case "get_sale_history":
        result = await getSaleHistory(args as unknown as Parameters<typeof getSaleHistory>[0]);
        break;
      case "search_properties":
        result = await searchProperties(args as unknown as Parameters<typeof searchProperties>[0]);
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Property MCP server running (NYC + Philadelphia)");
}

main().catch(console.error);
