/* Readability: the Flesch–Kincaid grade level. No AI, just counting.
 *
 *   GradeLevel = 0.39 × (words / sentences) + 11.8 × (syllables / words) − 15.59
 *
 * The formula only sees sentence and word length. It cannot see conceptual difficulty,
 * jargon or organisation, so treat it as a target to measure against, not as truth.
 */

function countSyllables(word) {
  // Hyphenated words: sum the parts. Digits count as one syllable.
  if (word.includes('-')) return word.split('-').reduce((n, p) => n + (p ? countSyllables(p) : 0), 0);
  const w = word.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!w) return 0;
  if (/^\d+$/.test(w)) return 1;
  if (w.length <= 3) return 1;
  const stripped = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const groups = stripped.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

const WORD_RE = /[A-Za-z0-9][A-Za-z0-9'’-]*/g;

function words(text) {
  return text.match(WORD_RE) || [];
}

// A colon also ends a "sentence": "Help everyone have a voice: it means..." reads as two short chunks.
function countSentences(text) {
  const parts = text.split(/[.!?:]+["'”’)\]]*(?:\s+|$)/).filter((s) => /[A-Za-z0-9]/.test(s));
  return Math.max(1, parts.length);
}

/** @returns {{grade:number|null, words:number, sentences:number, syllables:number}} */
function fleschKincaid(text) {
  const ws = words(text);
  if (ws.length === 0) return { grade: null, words: 0, sentences: 0, syllables: 0 };
  const sentences = countSentences(text);
  const syllables = ws.reduce((n, w) => n + countSyllables(w), 0);
  const grade = 0.39 * (ws.length / sentences) + 11.8 * (syllables / ws.length) - 15.59;
  return { grade: Math.round(grade * 10) / 10, words: ws.length, sentences, syllables };
}

/** The certified text as it would read if passed: deleted (struck-out) spans removed. */
function operativeText(fullText) {
  return fullText.replace(/\[DELETED: [^\]]*\]/g, ' ').replace(/[ \t]+/g, ' ');
}
