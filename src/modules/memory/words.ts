// Pure text helpers, shared by the server's recall and the memory graph in the browser.

// Lower case, with anything not a letter or a digit as one space, padded so a name can
// be found as whole words.
export const plain = (text: string) =>
  ` ${text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;

const STOP = new Set(
  "the and for with that this what when where who whom how did does was were are you your have has had about from they them their there then than not but can will would could should into onto our out all any just also more most some such only own same very too its it's i'm i've let tell said say".split(
    " ",
  ),
);

// The words worth matching on, once each, at most `max` of them.
export function wordsOf(text: string, max = 12) {
  const words = plain(text)
    .trim()
    .split(" ")
    // "or" and "and" would read as operators in a search.
    .filter((word) => word.length >= 3 && !STOP.has(word) && word !== "or");
  return [...new Set(words)].slice(0, max);
}
