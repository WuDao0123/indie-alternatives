/** Lightweight tokenizer for mixed text: words for Latin scripts, bigrams for CJK */

const CJK = /[㐀-鿿豈-﫿]/;

// conversational filler words in queries; stripping them improves matching
const FILLERS = [
  "有没有", "有什么", "有啥", "有哪些", "推荐", "一下", "一个", "一款", "什么", "哪个", "好用",
  "工具", "软件", "应用", "产品", "网站", "app", "可以", "能够", "能", "帮我", "帮忙", "我想", "我要",
  "想要", "需要", "用来", "用于", "怎么", "如何", "的", "吗", "呢", "么", "吧", "和", "或者", "并且",
];
const EN_STOP = new Set([
  "a", "an", "the", "is", "are", "there", "any", "tool", "tools", "app", "apps", "that", "can", "to",
  "for", "me", "i", "my", "want", "need", "something", "which", "what", "help", "with", "of", "and", "or",
  "do", "does", "lets", "let", "some", "good", "best", "software",
]);

export function normalize(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

// single CJK chars ignored when computing coverage
const STOP_CHARS = new Set([..."我你他她它们的了在上下把个找些这那是就都也还给让被对从到"]);

export interface Token {
  text: string;
  start: number;
  end: number;
}

export interface Analyzed {
  tokens: Token[];
  /** Positions of meaningful characters (for coverage) */
  content: Set<number>;
}

export function analyze(text: string, { stripFillers = false } = {}): Analyzed {
  let t = normalize(text);
  if (stripFillers) for (const f of FILLERS) t = t.split(f).join(" ".repeat(f.length));
  const tokens: Token[] = [];
  const content = new Set<number>();
  const re = /[a-z0-9][a-z0-9.+#-]*|[㐀-鿿豈-﫿]+/g;
  for (const m of t.matchAll(re)) {
    const w = m[0];
    const at = m.index!;
    if (CJK.test(w[0])) {
      for (let i = 0; i < w.length; i++) if (!STOP_CHARS.has(w[i])) content.add(at + i);
      if (w.length === 1) tokens.push({ text: w, start: at, end: at + 1 });
      else for (let i = 0; i < w.length - 1; i++) tokens.push({ text: w.slice(i, i + 2), start: at + i, end: at + i + 2 });
    } else {
      const clean = w.replace(/[.\-]+$/, "");
      if (!clean || (stripFillers && EN_STOP.has(clean))) continue;
      for (let i = 0; i < clean.length; i++) content.add(at + i);
      tokens.push({ text: stem(clean), start: at, end: at + clean.length });
      // also index the parts of hyphenated words: "no-code" → "no", "code"; "self-hosted" → "self", "host"
      if (clean.includes("-")) {
        let off = at;
        for (const part of clean.split("-")) {
          if (part.length >= 2 && !(stripFillers && EN_STOP.has(part))) tokens.push({ text: stem(part), start: off, end: off + part.length });
          off += part.length + 1;
        }
      }
    }
  }
  return { tokens, content };
}

export function tokenize(text: string, opts: { stripFillers?: boolean } = {}): string[] {
  return analyze(text, opts).tokens.map((t) => t.text);
}

/** Light English stemming so "beautify / beautifier / beautiful", "record / recording / recorder" and "schedule / scheduling" meet */
const SUFFIXES: [string, string][] = [
  ["ifiers", ""], ["ifier", ""], ["ified", ""], ["ifies", ""], ["ifying", ""], ["ify", ""], ["iful", ""], ["ful", ""],
  ["ations", "ate"], ["ation", "ate"], ["ators", "ate"], ["ator", "ate"], ["ings", ""], ["ing", ""], ["ers", ""], ["er", ""], ["ies", "y"], ["ed", ""], ["es", "e"], ["s", ""],
];
function stem(w: string): string {
  if (w.length <= 3 || /\d/.test(w)) return w;
  for (const [suf, rep] of SUFFIXES) {
    if (!w.endsWith(suf) || (suf === "s" && w.endsWith("ss"))) continue;
    const base = w.slice(0, -suf.length) + rep;
    if (base.length >= 3) { w = base; break; }
  }
  return w.length > 3 && w.endsWith("e") ? w.slice(0, -1) : w;
}
