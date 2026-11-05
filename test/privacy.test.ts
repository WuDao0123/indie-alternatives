import { test } from "node:test";
import assert from "node:assert/strict";
import { redact, fingerprint, makeNeedRecord } from "../src/privacy.js";

test("redacts email, phone, link, handle, name (Chinese)", () => {
  const out = redact("我叫张三，邮箱 zhang@example.com，电话 138-1234-5678，微信 abc12345，看 https://x.com/foo 或 @someone");
  for (const leak of ["张三", "zhang@example.com", "1234-5678", "abc12345", "https://x.com", "@someone"]) {
    assert.ok(!out.includes(leak), `泄露 ${leak}: ${out}`);
  }
  assert.ok(out.includes("[email]") && out.includes("[phone]") && out.includes("[link]"));
});

test("ordinary need text is left alone", () => {
  const t = "能把 2024 年的 PDF 发票批量转成 Excel 的工具，每月 10 美元以内";
  assert.equal(redact(t), t.normalize("NFKC"));
});

test("record has only need fields, day precision", () => {
  const r = makeNeedRecord({ need: "会议录音自动转纪要" }, new Date("2026-11-05T03:55:53Z"));
  assert.deepEqual(Object.keys(r).filter((k) => (r as any)[k] !== undefined).sort(), ["day", "fingerprint", "id", "need"]);
  assert.equal(r.day, "2026-11-05");
});

test("same need in different word order has same fingerprint", () => {
  assert.equal(fingerprint("有没有工具能 自动整理 会议纪要"), fingerprint("会议纪要 自动整理"));
  assert.notEqual(fingerprint("会议纪要自动整理"), fingerprint("宠物医院预约"));
});

test("redacts English personal info", () => {
  const out = redact("My name is John Smith, email john@example.com, call +1 415-555-0132, discord: johnny_s, see www.example.com");
  for (const leak of ["John", "Smith", "john@example.com", "555-0132", "johnny_s", "www.example.com"]) {
    assert.ok(!out.includes(leak), `leaked ${leak}: ${out}`);
  }
});

test("English need text is left alone", () => {
  for (const t of ["A discord bot that summarizes channels", "Online editor for signal processing", "Telegram channel analytics under $10/month"]) {
    assert.equal(redact(t), t);
  }
});
