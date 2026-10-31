export type Word = { text: string; start: number; end: number; punc: boolean };
export type Line = { words: Word[]; start: number; end: number };

const PUNCT = /[,.;:!?]$/;

/**
 * Distributes a line of narration over its clip duration.
 *
 * There is no forced alignment here: word starts are allocated by weight
 * (characters, plus a beat for punctuation) across the measured length of the
 * recorded clip. Because every clip is one short sentence recorded on its own,
 * this stays tight enough for karaoke highlighting.
 */
export const timeWords = (text: string, duration: number, opts: { lead?: number; tail?: number } = {}): Word[] => {
  const lead = opts.lead ?? 0.04;
  const tail = opts.tail ?? 0.1;
  const span = Math.max(0.4, duration - lead - tail);
  const raw = text.split(/\s+/).filter(Boolean);

  const weights = raw.map((word) => {
    const letters = word.replace(/[^A-Za-z0-9']/g, '').length;
    return Math.max(1.6, letters * 0.62 + 0.9) + (PUNCT.test(word) ? 1.5 : 0);
  });
  const total = weights.reduce((a, b) => a + b, 0);

  let cursor = lead;
  return raw.map((word, i) => {
    const len = (weights[i] / total) * span;
    const start = cursor;
    cursor += len;
    return { text: word, start, end: cursor, punc: PUNCT.test(word) };
  });
};

/** Groups timed words into short on-screen lines of at most `maxWords` / `maxChars`. */
export const toLines = (words: Word[], maxWords = 4, maxChars = 24): Line[] => {
  const lines: Line[] = [];
  let current: Word[] = [];
  const flush = () => {
    if (!current.length) return;
    lines.push({ words: current, start: current[0].start, end: current[current.length - 1].end });
    current = [];
  };

  for (const word of words) {
    const chars = current.reduce((n, w) => n + w.text.length + 1, 0) + word.text.length;
    if (current.length >= maxWords || chars > maxChars) flush();
    current.push(word);
  }
  flush();
  return lines;
};

export const buildCaptions = (text: string, duration: number, maxWords = 4, maxChars = 24) =>
  toLines(timeWords(text, duration), maxWords, maxChars);
