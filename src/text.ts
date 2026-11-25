export const esc = (value: unknown) =>
  String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Text without ==mark== delimiters, for speech and word counts. */
export const plain = (text: string) => text.replace(/==/g, "");

/** The sum of a list of numbers. */
export const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

export const round3 = (n: number) => Math.round(n * 1000) / 1000;

export type MarkedWord = { w: string; marked: boolean };

/** Words of a text, each knowing whether it sits inside a ==mark==, which may span several words. */
export const markedWords = (text: string): MarkedWord[] => {
  let inside = false;
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((raw) => {
      let w = raw;
      if (w.startsWith("==")) {
        inside = true;
        w = w.slice(2);
      }
      const marked = inside;
      if (w.endsWith("==")) {
        inside = false;
        w = w.slice(0, -2);
      }
      return { w, marked };
    });
};

/** Lower-case letters and digits only, to match written words against spoken ones. */
export const normalizeWord = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
