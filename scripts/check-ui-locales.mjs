import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Script, runInNewContext } from "node:vm";
const root = new URL("../", import.meta.url);
for (const directory of ["web", "web-v2"]) {
  const source = await readFile(new URL(`${directory}/i18n.js`, root), "utf8");
  new Script(source);
  const context = {
    window: { alert() {}, confirm() {}, prompt() {} },
    localStorage: { getItem: () => "en" },
    document: { readyState: "loading", addEventListener() {} },
    MutationObserver: class { disconnect() {} observe() {} },
  };
  runInNewContext(source, context);
  const { translate } = context.window.M365I18n;
  assert.equal(translate("2 分钟前"), "2 min ago");
  assert.equal(translate("在线: 3 • 冷却: 1 • 隔离: 2"), "Online: 3 • Cooling: 1 • Isolated: 2");
  assert.equal(translate("确认重置会话 opaque-id？"), "Reset session opaque-id?");
  assert.equal(translate("2026-10-12"), "2026-10-12");
  assert.equal(translate("用户自定义姓名"), "用户自定义姓名");
  assert.equal(translate("  添加微软账号  "), "  Add Microsoft account  ");
  for (const page of ["index.html", "login.html", "debug.html"]) {
    const html = await readFile(new URL(`${directory}/${page}`, root), "utf8");
    assert.match(html, /<script src="\/i18n\.js" defer><\/script>/u);
    const staticHTML = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/giu, "").replace(/<!--[\s\S]*?-->/gu, "");
    for (const match of staticHTML.matchAll(/>([^<>]+)</gu)) {
      const text = match[1].replace(/&rarr;/gu, "→").replace(/&bull;/gu, "•").replace(/&amp;/gu, "&").replace(/\s+/gu, " ").trim();
      if (/[\u4e00-\u9fff]/u.test(text)) assert.notEqual(translate(text), text, `${directory}/${page}: missing translation: ${text}`);
    }
  }
}
console.log("Chinese/English UI contracts passed for both asset bundles");
