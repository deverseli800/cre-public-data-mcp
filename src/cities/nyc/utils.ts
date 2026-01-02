// Logging helper
function log(message: string, data?: unknown) {
  console.error(`[NYC Utils] ${message}`, data !== undefined ? JSON.stringify(data) : '');
}

// Map various borough names/abbreviations to numeric codes (for borocode field)
export const BOROUGH_CODES: Record<string, string> = {
  // Full names
  "manhattan": "1",
  "bronx": "2",
  "the bronx": "2",
  "brooklyn": "3",
  "queens": "4",
  "staten island": "5",
  // PLUTO abbreviations
  "mn": "1",
  "bx": "2",
  "bk": "3",
  "qn": "4",
  "si": "5",
  // Common abbreviations
  "nyc": "1",  // Default to Manhattan if just "nyc"
  "new york": "1",
  // Numeric strings (pass through)
  "1": "1",
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
};

export const BOROUGH_NAMES: Record<string, string> = {
  "1": "Manhattan",
  "2": "Bronx",
  "3": "Brooklyn",
  "4": "Queens",
  "5": "Staten Island",
  "MN": "Manhattan",
  "BX": "Bronx",
  "BK": "Brooklyn",
  "QN": "Queens",
  "SI": "Staten Island",
};

export function getBoroughCode(name: string): string | undefined {
  const normalized = name.toLowerCase().trim();
  const code = BOROUGH_CODES[normalized];
  log(`getBoroughCode: "${name}" -> "${normalized}" -> code: ${code}`);
  return code;
}

export function getBoroughName(code: string): string | undefined {
  return BOROUGH_NAMES[code];
}
