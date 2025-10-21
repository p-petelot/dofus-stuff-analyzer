/**
 * Shared text utilities used across the application.
 *
 * Keeping the helpers here avoids duplicating the same regex based operations
 * in multiple modules and keeps the Next.js page lean.
 */

export function slugify(value) {
  if (!value) return "";
  return value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

export function humanizeBackgroundName(value) {
  if (!value) return "";
  return value
    .toString()
    .replace(/\.png$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripHtml(value) {
  if (!value) return "";
  return value.replace(/<[^>]*>/g, " ");
}

export function normalizeWhitespace(value) {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeSearchText(value) {
  if (!value) {
    return "";
  }
  return normalizeWhitespace(String(value))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
