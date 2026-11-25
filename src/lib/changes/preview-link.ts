/**
 * The full address of the page that shows a pending preview as cards, built from `AUTH_URL` (the
 * site's own address). Null when `AUTH_URL` is not set or the preview has no changeset.
 */
export function pendingPreviewUrl(changesetId: number | null, base = process.env.AUTH_URL): string | null {
  if (!changesetId || !base) return null;
  return `${base.replace(/\/+$/, "")}/admin/changes/pending/${changesetId}`;
}
