/**
 * Build a base-aware URL for static assets shipped under `public/`.
 * Returns `${BASE_URL}${path}` with no double slashes, so it works in dev
 * (BASE_URL="/") and on GitHub Pages project sites (BASE_URL="/repo-name/").
 */
export function dataUrl(path: string): string {
  const base = import.meta.env.BASE_URL ?? "/";
  const cleanPath = path.replace(/^\/+/, "");
  return `${base}${base.endsWith("/") ? "" : "/"}${cleanPath}`;
}
