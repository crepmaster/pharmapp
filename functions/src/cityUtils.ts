/**
 * Converts a city display name to a stable lowercase slug.
 *
 * Must stay in sync with MasterDataService.citySlug() in the Flutter shared package.
 * Used for canonical city comparison (cityCode-first) in backend functions and
 * for the Sprint 2D backfill script.
 */
export function citySlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/'/g, "")
    .replace(/é/g, "e")
    .replace(/è/g, "e")
    .replace(/ê/g, "e")
    .replace(/ô/g, "o")
    .replace(/â/g, "a")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o");
}
