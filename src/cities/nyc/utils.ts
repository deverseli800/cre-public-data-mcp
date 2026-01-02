export const BOROUGH_CODES: Record<string, string> = {
  "manhattan": "1",
  "bronx": "2",
  "brooklyn": "3",
  "queens": "4",
  "staten island": "5",
};

export const BOROUGH_NAMES: Record<string, string> = {
  "1": "Manhattan",
  "2": "Bronx",
  "3": "Brooklyn",
  "4": "Queens",
  "5": "Staten Island",
};

export function getBoroughCode(name: string): string | undefined {
  return BOROUGH_CODES[name.toLowerCase().trim()];
}

export function getBoroughName(code: string): string | undefined {
  return BOROUGH_NAMES[code];
}
