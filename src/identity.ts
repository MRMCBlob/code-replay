import type { Commit, Identity } from "./types.js";

/** True when the identity has nothing to match on. */
export function isEmptyIdentity(id: Identity): boolean {
  return id.emails.length === 0 && id.names.length === 0;
}

/**
 * Does this commit belong to "me" — either as the author, or named in a
 * Co-authored-by trailer? Email match is preferred; name match is used as a
 * fallback (and for co-authors) since trailers carry "Name <email>".
 */
export function matchesIdentity(c: Commit, id: Identity): boolean {
  const emails = id.emails.map((e) => e.toLowerCase()).filter(Boolean);
  const names = id.names.map((nm) => nm.toLowerCase()).filter((nm) => nm.length > 1);

  const authorEmail = c.authorEmail.toLowerCase();
  if (emails.includes(authorEmail)) return true;

  const authorName = c.authorName.toLowerCase();
  if (emails.length === 0 && names.includes(authorName)) return true;

  for (const raw of c.coauthors) {
    const co = raw.toLowerCase();
    if (emails.some((e) => co.includes(`<${e}>`) || co.includes(e))) return true;
    if (emails.length === 0 && names.some((nm) => co.includes(nm))) return true;
  }
  return false;
}

/** Keep only commits that belong to the given identity. */
export function filterByIdentity(commits: Commit[], id: Identity): Commit[] {
  if (isEmptyIdentity(id)) return commits;
  return commits.filter((c) => matchesIdentity(c, id));
}
