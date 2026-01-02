# Property MCP Server

An MCP (Model Context Protocol) server for querying property data in New York City and Philadelphia. Allows Claude Desktop users to ask natural language questions about property sales and ownership.

## Features

- **search_sales** - Search recent property sales with filters (neighborhood, price, building type, etc.)
- **get_property** - Get detailed property information by address
- **get_sale_history** - Get all recorded sales for a specific property
- **search_properties** - Search property database for properties matching criteria

## Data Sources

### NYC
- **Rolling Sales API** - Last 12 months of property sales
- **PLUTO API** - Property tax lot data for all NYC parcels

### Philadelphia (Coming Soon)
- **RTT Summary** - Real estate transfer tax records
- **OPA Properties** - Property assessment data

## Installation

```bash
npm install -g @probdb/property-mcp
```

## Configuration

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "property": {
      "command": "property-mcp"
    }
  }
}
```

Or use npx (no install needed):

```json
{
  "mcpServers": {
    "property": {
      "command": "npx",
      "args": ["-y", "@probdb/property-mcp"]
    }
  }
}
```

## Example Queries

**NYC:**
- "Find 5 recent multifamily sales in the East Village"
- "What's the owner of 100 Gold Street in Manhattan?"
- "Show me elevator buildings sold for over $5M in Harlem this year"

**Philadelphia:**
- "Find 5 recent sales over $1M in Center City Philadelphia"
- "Who bought 1500 Market Street in Philadelphia?"

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run locally
node dist/index.js
```

## License

MIT
