/*
 * Store-asset harness — listing copy extractor.
 *
 * The CWS listing copy (title, summary, description, "what's new") lives in a
 * human-edited STORE_LISTING.md so it stays reviewable in git. This pulls the
 * relevant `##` sections out into a single copy-paste-ready description.md in
 * the output dir, and flags fields that exceed CWS length limits — so the
 * person pasting into the dashboard doesn't discover a 133-char summary there.
 */

const fs = require('fs');

// CWS dashboard limits (chars). Summary == "short description".
const LIMITS = { title: 75, summary: 132 };

/**
 * Split a markdown doc into `## Heading` → body sections.
 * @param {string} md
 * @returns {Array<{heading: string, body: string}>}
 */
function splitSections(md) {
  const lines = md.split(/\r?\n/);
  const out = [];
  let cur = null;
  for (const line of lines) {
    const m = /^##\s+(.*)$/.exec(line);
    if (m) {
      cur = { heading: m[1].trim(), body: '' };
      out.push(cur);
    } else if (cur) {
      cur.body += line + '\n';
    }
  }
  return out.map((s) => ({ heading: s.heading, body: s.body.trim() }));
}

/** Find the first section whose heading contains `kw` (case-insensitive). */
function findSection(sections, kw) {
  const lc = kw.toLowerCase();
  const hit = sections.find((s) => s.heading.toLowerCase().includes(lc));
  return hit ? hit.body : '';
}

/**
 * @param {string} mdPath
 * @returns {{title:string, summary:string, description:string, whatsNew:string, category:string, warnings:string[]}}
 */
function extractListing(mdPath) {
  if (!fs.existsSync(mdPath)) throw new Error(`extractListing: ${mdPath} not found`);
  const sections = splitSections(fs.readFileSync(mdPath, 'utf8'));

  const fields = {
    title: findSection(sections, 'title'),
    summary: findSection(sections, 'summary'),
    description: findSection(sections, 'description'),
    whatsNew: findSection(sections, "what's new") || findSection(sections, 'whats new'),
    category: findSection(sections, 'category'),
  };

  const warnings = [];
  for (const [k, max] of Object.entries(LIMITS)) {
    const firstLine = (fields[k] || '').split('\n')[0].trim();
    if (firstLine.length > max) {
      warnings.push(`${k} is ${firstLine.length} chars (CWS max ${max})`);
    }
  }
  return { ...fields, warnings };
}

/**
 * Render the extracted fields into a single copy-paste doc.
 * @param {ReturnType<typeof extractListing>} listing
 * @returns {string}
 */
function renderDescriptionDoc(listing) {
  const block = (label, body) => `## ${label}\n\n${body || '(missing)'}\n`;
  return [
    '# Store listing — copy/paste fields',
    '',
    '> Generated from STORE_LISTING.md by `npm run capture:store`. Edit the',
    '> source markdown, not this file.',
    '',
    block('Title', listing.title),
    block('Summary (short description)', listing.summary),
    block('Description', listing.description),
    block("What's new", listing.whatsNew),
    block('Category', listing.category),
    listing.warnings.length ? `> ⚠️ ${listing.warnings.join('; ')}\n` : '',
  ].join('\n');
}

module.exports = { extractListing, renderDescriptionDoc, splitSections };
