/** Explicit, serial candidate-environment probes. Never logs keys, prompts or
 * upstream response bodies; this file does not launch agents or run tools. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const configuredURL = process.env.M365_GATEWAY_URL;
const key = process.env.M365_API_KEY;
if (!configuredURL || !key) throw new Error("Set M365_GATEWAY_URL and M365_API_KEY for an explicit candidate environment");
const base = new URL(configuredURL);
if (base.username || base.password || base.search || base.hash) throw new Error("Gateway URL must not contain credentials, query or fragment");
if (base.protocol !== "https:" && !(base.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(base.hostname))) throw new Error("Use HTTPS or a loopback candidate");
const model = process.env.M365_TEST_MODEL || "gpt-5.6-reasoning";
const paths = ["chat/completions", "responses", "messages"];
const records = [];
for (const path of paths) {
  const marker = `TAIL_${randomUUID().replaceAll("-", "")}`;
  const prompt = `Return exactly this text, preserving both fenced code blocks and the final marker:\n\nBefore\n\n\`\`\`js\nconst n = 1;\n\`\`\`\n\nBetween\n\n\`\`\`json\n{"ok":true}\n\`\`\`\n\n${marker}`;
  const started = Date.now();
  const response = await fetch(new URL(`/v1/${path}`, base), {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "x-api-key": key, "Content-Type": "application/json", "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, stream: true, max_tokens: 1_024, ...(path === "responses" ? { input: prompt } : { messages: [{ role: "user", content: prompt }] }) }),
    signal: AbortSignal.timeout(120_000),
  });
  let bytes = 0;
  let carry = ""; let text = ""; let terminal = false; let failed = !response.ok;
  const decoder = new TextDecoder();
  const reader = response.body?.getReader();
  if (reader && response.ok) {
    try {
      for (;;) {
        const chunk = await reader.read(); if (chunk.done) break;
        bytes += chunk.value.byteLength;
        assert.ok(bytes <= 2 * 1_024 * 1_024, "probe response exceeded bound");
        carry += decoder.decode(chunk.value, { stream: true });
        let boundary;
        while ((boundary = carry.indexOf("\n\n")) >= 0) {
          const frame = carry.slice(0, boundary); carry = carry.slice(boundary + 2);
          const raw = frame.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
          if (!raw) continue;
          if (raw === "[DONE]") { if (path === "chat/completions") terminal = true; continue; }
          const data = JSON.parse(raw);
          failed ||= Boolean(data.error || data.type === "error" || data.type === "response.failed" || data.type === "response.incomplete");
          if (path === "responses") { if (data.type === "response.output_text.delta") text += data.delta || ""; if (data.type === "response.completed") terminal = true; }
          else if (path === "messages") { text += data.delta?.text || ""; if (data.type === "message_stop") terminal = true; }
          else text += data.choices?.[0]?.delta?.content || "";
        }
      }
    } finally { await reader.cancel().catch(() => {}); }
  } else await reader?.cancel().catch(() => {});
  const fences = (text.match(/```/gu) || []).length;
  const passed = !failed && terminal && fences === 4 && text.trimEnd().endsWith(marker);
  records.push({ endpoint: path, status: response.status, duration_ms: Date.now() - started, terminal, nonempty: Boolean(text.trim()), fences, tail_preserved: text.includes(marker), passed });
  // Respect the gateway's serial upstream boundary even when the configured
  // candidate uses an older version without the durable FIFO gate.
  if (path !== paths.at(-1)) await new Promise((resolve) => setTimeout(resolve, 1_100));
}
console.log(JSON.stringify({ execution_mode: "serial", probes: records, passed: records.every((record) => record.passed) }, null, 2));
if (records.some((record) => !record.passed)) process.exitCode = 1;
