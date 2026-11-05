import { createHash, randomUUID } from "node:crypto";
import type { NeedRecord } from "./types.js";
import { normalize, tokenize } from "./text.js";

const MAX_LEN = 500;

const PATTERNS: [RegExp, string][] = [
  [/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email]"],
  [/\bhttps?:\/\/\S+|\bwww\.\S+/gi, "[link]"],
  [/\b\d{1,3}(\.\d{1,3}){3}\b/g, "[ip]"],
  [/\b\d{17}[\dxX]\b/g, "[id-number]"],
  [/\b(?:\d[ -]?){12,19}\b/g, "[card]"],
  [/(?:\+?\d{1,3}[ -]?)?(?:\(?\d{2,4}\)?[ -]?)?\d{3,4}[ -]?\d{4}\b/g, "[phone]"],
  [/(^|\s)@[\w.-]{2,}/g, "$1[handle]"],
  [/(微信|\bvx|\bwx|\bqq|\btelegram|\btg|\bwhatsapp|\bdiscord)\s*(?:[:：号]\s*[\w.-]{3,}|[\w.-]*\d[\w.-]*)/gi, "$1 [handle]"],
  [/(我叫|我是|名字叫)\s*\S{1,10}/g, "$1 [name]"],
  [/\b(my name is)\s+[\w'-]+(\s+[A-Z][\w'-]*)?/gi, "$1 [name]"],
];

/** Remove anything in the need text that could identify a person */
export function redact(text: string): string {
  let t = text.normalize("NFKC").trim();
  for (const [re, rep] of PATTERNS) t = t.replace(re, rep);
  t = t.replace(/\s+/g, " ");
  return t.length > MAX_LEN ? t.slice(0, MAX_LEN) + "…" : t;
}

/** For grouping similar needs: hash of the normalized token set, word order does not matter */
export function fingerprint(text: string): string {
  const toks = [...new Set(tokenize(text, { stripFillers: true }))].sort();
  return createHash("sha256").update(toks.join("|") || normalize(text)).digest("hex").slice(0, 16);
}

export function makeNeedRecord(input: { need: string; category?: string; platform?: string; budget?: string }, now = new Date()): NeedRecord {
  const need = redact(input.need);
  const clip = (s?: string) => (s ? redact(s).slice(0, 50) : undefined);
  return {
    id: randomUUID(),
    need,
    category: clip(input.category),
    platform: clip(input.platform),
    budget: clip(input.budget),
    day: now.toISOString().slice(0, 10),
    fingerprint: fingerprint(need),
  };
}
