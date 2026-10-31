const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

// Pull addresses out of a CSV or a plain text list. Duplicates in one upload
// are collapsed so the same row is not queued twice. Two different campaigns
// can still write to the same person.
export function extractEmails(content: string): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const match of content.matchAll(EMAIL_PATTERN)) {
    const email = match[0].toLowerCase();
    if (seen.has(email)) continue;
    seen.add(email);
    ordered.push(email);
  }
  return ordered;
}
