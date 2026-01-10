# NYC Property Data MCP Server

A Model Context Protocol (MCP) server that provides Claude with access to NYC public property data. Query property details, sales history, comparable sales, tax benefits, and rent stabilization analysis using natural language.

**No API keys required** - all data sources are free and public.

## Features

- 🏢 **Property Lookup** - Get detailed property info including owner, units, year built, zoning, and assessed values
- 💰 **Sales Search** - Find recent property sales with price per unit and price per sqft calculations
- 📊 **Comparable Sales** - Find similar properties for valuation analysis with implied value estimates
- 🏛️ **Tax Benefits** - Look up 421a, J-51, ICAP, STAR and other exemptions/abatements
- 🏠 **Rent Stabilization Analysis** - Automatic analysis of likely rent-stabilized units based on year built, unit count, and tax benefits

## Data Sources

| Dataset | Source | Description |
|---------|--------|-------------|
| PLUTO | NYC Open Data | Property tax lot data - owner, units, zoning, assessments |
| Rolling Sales | NYC Open Data | Last 12 months of property sales |
| Property Exemptions | NYC Open Data | Tax exemptions by property |
| Property Abatements | NYC Open Data | Tax abatements (421a, J-51, etc.) |

## Installation

### Prerequisites

- Node.js 18+
- Claude Desktop app

### Install from npm

```bash
npm install -g cre-property-mcp
```

### Or clone and build locally

```bash
git clone https://github.com/deverseli800/cre-public-data-mcp.git
cd cre-public-data-mcp
npm install
npm run build
```

## Configuration

### Claude Desktop Setup

Edit the Claude Desktop configuration file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

#### If installed globally via npm:

```json
{
  "mcpServers": {
    "property": {
      "command": "property-mcp"
    }
  }
}
```

#### If running from local build:

```json
{
  "mcpServers": {
    "property": {
      "command": "node",
      "args": ["/path/to/property-mcp/dist/index.js"]
    }
  }
}
```

#### Zero-install with npx:

```json
{
  "mcpServers": {
    "property": {
      "command": "npx",
      "args": ["-y", "cre-property-mcp"]
    }
  }
}
```

After editing, **quit Claude Desktop completely** (Cmd+Q on macOS) and reopen.

## Running Locally

### Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# The server runs via stdio (used by Claude Desktop)
# For testing, you can run directly:
node dist/index.js
```

### Viewing Logs

The server logs to stderr, which Claude Desktop captures:

```bash
# macOS
tail -f ~/Library/Logs/Claude/mcp-server-property.log

# Or check Claude Desktop's developer console
```

## Tools Reference

### `get_property`

Get detailed property information by address.

**Parameters:**
- `city` (required): `"nyc"`
- `address` (required): Street address
- `borough`: NYC borough (`manhattan`, `bronx`, `brooklyn`, `queens`, `staten_island`)

**Example:**
```
"Look up 522 East 5th Street Manhattan"
```

**Returns:**
- Address, BBL, coordinates
- Owner name
- Units (residential and total)
- Year built, building class, zoning
- Assessed values (land, total, exempt)
- ZOLA map link
- Rent stabilization analysis

---

### `search_sales`

Search for recent property sales with filters.

**Parameters:**
- `city` (required): `"nyc"`
- `borough`: NYC borough
- `neighborhood`: e.g., `"EAST VILLAGE"`, `"HARLEM"`
- `min_price` / `max_price`: Price range
- `min_units` / `max_units`: Unit count range
- `building_class`: `"C"` (walk-up), `"D"` (elevator), etc.
- `date_from` / `date_to`: Date range (YYYY-MM-DD)
- `whole_buildings_only`: Exclude unit sales (default: true)
- `limit`: Max results (default: 10, max: 50)

**Example:**
```
"Find 5 recent elevator building sales over $5M in the East Village"
```

**Returns:**
- Sale price, date, address
- Units, sqft, year built
- **price_per_unit** and **price_per_sqft** calculations
- Owner, zoning
- ZOLA map link

---

### `search_comps`

Find comparable sales for valuation analysis.

**Parameters:**
- `city` (required): `"nyc"`
- `address` (required): Subject property address
- `borough` (required): Subject property borough
- `limit`: Number of comps (default: 10)
- `building_class`: Override auto-detected class
- `include_adjacent_neighborhoods`: Include nearby areas (default: true)

**Example:**
```
"Find comparable sales for 522 East 5th Street Manhattan"
```

**Returns:**
- Subject property details
- Ranked comparable sales with similarity scores
- Average price per unit and price per sqft
- **Implied values** for subject property

---

### `get_sale_history`

Get all recorded sales for a specific property.

**Parameters:**
- `city` (required): `"nyc"`
- `address` (required): Street address
- `borough`: NYC borough

**Example:**
```
"What's the sale history for 100 Gold Street Manhattan?"
```

---

### `search_properties`

Search for properties (not sales) matching criteria.

**Parameters:**
- `city` (required): `"nyc"`
- `borough`: NYC borough
- `min_units` / `max_units`: Unit count range
- `building_class`: Building type
- `zoning`: Zoning district (e.g., `"R7"`, `"C6"`)
- `min_year_built` / `max_year_built`: Year range
- `limit`: Max results

**Example:**
```
"Find walk-up buildings with 10+ units in Brooklyn built before 1940"
```

---

### `get_tax_benefits`

Look up tax exemptions and abatements for a property.

**Parameters:**
- `city` (required): `"nyc"`
- `address`: Street address
- `borough`: NYC borough
- Or: `borough_code`, `block`, `lot` (direct BBL lookup)

**Example:**
```
"What tax benefits does 522 East 5th Street Manhattan have?"
```

**Returns:**
- All exemptions with codes and values
- All abatements with amounts and dates
- Flags: `has_421a`, `has_j51`, `has_icap`, `has_star`
- Human-readable summary

---

## Rent Stabilization Analysis

Every property lookup includes a `rent_info` object with stabilization analysis:

```json
{
  "rent_info": {
    "likely_stabilized": true,
    "stabilization_reasons": [
      "Pre-1974 building (1900) with 10 units",
      "Receives J-51 tax abatement"
    ],
    "confidence": "high",
    "notes": [
      "Individual units may be deregulated through high-rent vacancy",
      "Verify with DHCR for definitive unit counts"
    ]
  }
}
```

**Stabilization Rules Applied:**
- Buildings with 6+ units built before January 1, 1974
- Buildings receiving 421a tax exemption
- Buildings receiving J-51 tax abatement
- NYCHA buildings excluded (federal rules apply)
- Condo/co-op buildings noted separately

## Example Queries

```
"Look up the property at 100 Gold Street in Manhattan"

"Find 10 recent multifamily sales in Williamsburg over $2M"

"What's the sale history for 123 E 7th Street Manhattan?"

"Find comparable sales for 522 East 5th Street Manhattan"

"Does 200 East 10th Street Manhattan have any tax abatements?"

"Search for elevator buildings with 20+ units in Harlem"

"Find walk-up buildings in the East Village built before 1920"
```

## Building Classes

| Code | Description |
|------|-------------|
| A | One-family dwellings |
| B | Two-family dwellings |
| C | Walk-up apartments |
| D | Elevator apartments |
| R | Condominiums |
| S | Residences - multiple use |

## Limitations

- **NYC Rolling Sales** only contains the last 12 months of sales
- **Rent stabilization** analysis is an estimate - verify with DHCR for official status
- **Tax benefits** data may lag behind current status

## Troubleshooting

### "Property not found"
- Check address format (e.g., "522 East 5th Street" not "522 E 5th St")
- Verify borough is correct
- Try without apartment/unit numbers

### "No sales found"
- Expand date range
- Try broader neighborhood search
- Check if building class filter is too restrictive

### Server not connecting
- Quit Claude Desktop completely (Cmd+Q) and reopen
- Check config file JSON syntax
- Verify node path in config

### View logs
```bash
tail -f ~/Library/Logs/Claude/mcp-server-property.log
```

## Contributing

Contributions welcome! Areas of interest:
- Philadelphia data source implementation
- Additional NYC data sources (ACRIS, HPD violations)
- Performance optimizations
- Additional analysis tools

## License

MIT

## Acknowledgments

Data provided by:
- [NYC Open Data](https://opendata.cityofnewyork.us/)
- [NYC Department of Finance](https://www.nyc.gov/site/finance/)
- [NYC Department of City Planning (PLUTO)](https://www.nyc.gov/site/planning/)
