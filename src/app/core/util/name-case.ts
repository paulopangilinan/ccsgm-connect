/**
 * Normalizes a person's name to proper title casing:
 *   "  john  DELA cruz " -> "John Dela Cruz"
 * Handles hyphens and apostrophes (e.g. "mary-jane o'brien" -> "Mary-Jane O'Brien").
 */
export function toProperCase(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/(^|[\s\-'])([a-z])/g, (_match, sep: string, char: string) => sep + char.toUpperCase());
}
