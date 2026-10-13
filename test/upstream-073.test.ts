import { env, SELF } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyAccountFailure } from "../src/account-routing";
import { CHAT_FIRST_OUTPUT_TIMEOUT_MS, ChatHubAttemptError, syntheticUpstreamFailureCode, sendSocketFrame } from "../src/chathub";
import { publicFailure, upstreamFailureStatus, responsesLiteCustomTools, responseFunctionCallEvents, selectAccountWithRecovery } from "../src/openai";
import { CitationMarkerStreamFilter, stripEntityTags, stripInternalCitationMarkers } from "../src/public-citations";
import { addSLAMetric, LATENCY_BUCKETS_MS, parseSLAState, slaSnapshot } from "../src/sla-metrics";
import { SSEPreflight } from "../src/sse-preflight";
import { parseRetryAfter } from "../src/upstream-errors";
import type { OAuthTokenSet } from "../src/types";

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
const account = (): OAuthTokenSet => ({ accessToken: "offline-073", refreshToken: "offline-073", expiresAt: Date.now() + 3_600_000,
  oid: crypto.randomUUID(), tid: crypto.randomUUID(), email: "offline@example.test", displayName: "Offline regression" });
const summary = { total: 0, online: 0, cooldown: 0, expired: 0 };

describe("upstream v0.7.3 compatibility", () => {
  it("uses 40s by default and preserves explicit administrator settings", async () => {
    expect(CHAT_FIRST_OUTPUT_TIMEOUT_MS).toBe(40_000);
    const state = env.TENANTS.getByName(`timeout-073-${crypto.randomUUID()}`);
    expect((await state.runtimeConfiguration()).firstOutputTimeoutMs).toBe(40_000);
    await state.setRuntimeConfiguration({ firstOutputTimeoutMs: 75_000 });
    expect((await state.runtimeConfiguration()).firstOutputTimeoutMs).toBe(75_000);
  });

  it("classifies canonical expired-token and write-timeout signals without rotating for invalid client secrets", () => {
    expect(classifyAccountFailure(new Error("token_expired"))?.kind).toBe("auth");
    expect(classifyAccountFailure(new Error("WS_WRITE_TIMEOUT"))?.kind).toBe("transient");
    expect(classifyAccountFailure(new Error("AADSTS7000215 invalid_client"))).toBeNull();
    expect(publicFailure(new Error("WS_WRITE_TIMEOUT")).code).toBe("upstream_write_timeout");
    expect(upstreamFailureStatus(new Error("WS_WRITE_TIMEOUT"))).toBe(504);
    expect(upstreamFailureStatus(new Error("WS_DIAL_FAILED:422"))).toBe(422);
    expect(() => sendSocketFrame({ send: () => { throw new Error("write timeout at https://private.example/?access_token=secret"); } }, "payload")).toThrow("WS_WRITE_TIMEOUT");
  });

  it("removes entity markup at every possible chunk boundary while preserving code fences, HTML and trailing text", () => {
    const raw = "before\n```ts\nconst n = 1;\n```\nafter <Organization id=\"x\">NodeLoc</Organization> and <Product>Copilot</Product>.\n```json\n{}\n```\nfinal <div>HTML</div>";
    const expected = stripEntityTags(raw);
    expect(expected).toContain("after NodeLoc and Copilot.");
    expect(expected).toContain("```json\n{}\n```\nfinal <div>HTML</div>");
    for (let cut = 0; cut <= raw.length; cut += 1) {
      const filter = new CitationMarkerStreamFilter();
      expect(filter.push(raw.slice(0, cut)) + filter.push(raw.slice(cut)) + filter.flush()).toBe(expected);
    }
    expect(stripInternalCitationMarkers("<File>report.md</File><cite>turn0search1</cite>")).toBe("report.md");
  });

  it("keeps malformed or incomplete entity markup bounded without dropping ordinary text", () => {
    const filter = new CitationMarkerStreamFilter();
    const raw = "<Organization " + "x".repeat(2_000);
    expect(filter.push(raw) + filter.flush()).toBe(raw);
    expect(stripEntityTags("<div>text</div><OrganizationX>keep</OrganizationX>")).toContain("<OrganizationX>");
  });

  it("recognizes whole canned non-answers and preserves prose quoting or explaining one", () => {
    const canned = "Sorry, I wasn't able to respond to that. Is there something else I can help with?";
    expect(syntheticUpstreamFailureCode(canned)).toBe("CHAT_UPSTREAM_CONTENT_BLOCKED");
    expect(syntheticUpstreamFailureCode("抱歉，我现在无法回答。")).toBe("CHAT_UPSTREAM_CONTENT_BLOCKED");
    expect(syntheticUpstreamFailureCode(`The service sometimes says: ${canned}`)).toBeNull();
    expect(syntheticUpstreamFailureCode("I wasn't able to respond to that because I was offline yesterday.")).toBeNull();
  });

  it("propagates bounded Retry-After durations through error wrapping and persisted account health", async () => {
    const now = Date.now();
    expect(parseRetryAfter("60", now)).toBe(60_000);
    expect(parseRetryAfter(new Date(now + 120_000).toUTCString(), now)).toBeGreaterThan(119_000);
    expect(parseRetryAfter("secret-url", now)).toBe(0);
    expect(parseRetryAfter("999999999", now)).toBe(86_400_000);
    const error = new ChatHubAttemptError(new Error("WS_DIAL_FAILED:429"), false, false, 120_000);
    expect(new ChatHubAttemptError(error, false).retryAfterMs).toBe(120_000);
    const state = env.TENANTS.getByName(`retry-073-${crypto.randomUUID()}`);
    const added = await state.upsertAccount(account());
    const selected = await state.selectAccount();
    const health = await state.reportAccountFailure(added.id, "rate_limit", selected!.routeEpoch, error.retryAfterMs);
    expect(health.retryAfterMs).toBe(120_000);
    expect((await state.accountAvailability(added.id)).retryAfterMs).toBeGreaterThan(119_000);
    expect((await state.slaMetrics()).accounts).toMatchObject({ total: 1, cooldown: 1, expired: 0, isolated: 0 });
  });

  it("counts ordinary aggregate-only successes and semantic HTTP-200 failures in SLA metrics, then resets atomically", async () => {
    const state = env.TENANTS.getByName(`sla-073-${crypto.randomUUID()}`);
    for (let index = 0; index < 64; index += 1) await state.recordRequestAggregate({ requestId: crypto.randomUUID(), status: 200, durationMs: 100, endpoint: "responses" });
    const error = { requestId: crypto.randomUUID(), status: 200, semanticStatus: "error" as const, durationMs: 10_000, endpoint: "messages" };
    await state.recordRequest(error); await state.recordRequest(error);
    const metrics = await state.slaMetrics();
    expect(metrics.requests).toBe(65); expect(metrics.errors).toBe(1);
    expect(metrics.success_rate).toBe(64 / 65);
    expect(metrics.latency_ms.p95).toBe(100);
    expect(metrics.per_endpoint).toHaveLength(2);
    expect((await state.listRequestMetrics()).length).toBe(1);
    await state.resetRequestStats();
    expect((await state.slaMetrics()).requests).toBe(0);
  });

  it("uses bounded histograms and fixed endpoint dimensions, with honest percentile metadata", () => {
    const state = parseSLAState("");
    for (let index = 0; index < 100; index += 1) addSLAMetric(state, index * 100, index === 0, `untrusted-${index}@example.test`, 1000);
    const metrics = slaSnapshot(state, summary, 2000);
    expect(metrics.latency_method).toBe("histogram_upper_bound");
    expect(metrics.uptime_seconds).toBeNull();
    expect(metrics.latency_ms.p95).toBe(9900);
    expect(metrics.per_endpoint).toHaveLength(1);
    expect(state.total.buckets).toHaveLength(LATENCY_BUCKETS_MS.length);
    expect(JSON.stringify(state)).not.toContain("example.test");
    expect(parseSLAState('{"since":1,"total":{"requests":-1}}').total.requests).toBe(0);
  });

  it("protects the upstream metrics endpoint with administrator authentication", async () => {
    const response = await SELF.fetch("https://example.test/api/metrics");
    expect(response.status).toBe(401);
    expect((await response.json<{ error: { code: string } }>()).error.code).toBe("auth_error");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("does not duplicate the input of a namespaced Codex custom tool in the added and delta frames", () => {
    const tools = responsesLiteCustomTools([{ type: "additional_tools", role: "developer", tools: [{ type: "namespace", name: "functions", tools: [
      { type: "custom", name: "exec", description: "Run code", format: { type: "text" } },
    ] }] }]);
    expect(tools).toHaveLength(1);
    const events = responseFunctionCallEvents({ id: "call_item", type: "custom_tool_call", call_id: "call_1", name: "exec", input: "text('hello')" }, { name: "exec", arguments: "{}" });
    expect(events[0]).toMatchObject({ type: "response.output_item.added", item: { input: "" } });
    expect(events[1]).toMatchObject({ delta: "text('hello')" });
  });

  it("withholds transport-only opening frames so an early failure can retain its status", async () => {
    const gate = new SSEPreflight();
    const chunks: Uint8Array[] = [];
    const controller = { enqueue: (value: Uint8Array) => chunks.push(value) } as ReadableStreamDefaultController<Uint8Array>;
    gate.enqueue(controller, new TextEncoder().encode("role"), true);
    expect(chunks).toHaveLength(0);
    const outcome = gate.ready.catch((cause) => cause.message);
    expect(gate.fail(new Error("WS_DIAL_FAILED:503"))).toBe(true);
    expect(await outcome).toBe("WS_DIAL_FAILED:503");
    gate.enqueue(controller, new TextEncoder().encode("error"));
    expect(chunks).toHaveLength(0);
  });

  it("keeps startup and semantic frame order, and uses SSE failure after commitment", async () => {
    const gate = new SSEPreflight();
    const chunks: Uint8Array[] = [];
    const controller = { enqueue: (value: Uint8Array) => chunks.push(value) } as ReadableStreamDefaultController<Uint8Array>;
    for (const [value, startup] of [["role", true], ["code fence", false], ["tail", false]] as const) gate.enqueue(controller, new TextEncoder().encode(value), startup);
    await gate.ready;
    expect(chunks.map((value) => new TextDecoder().decode(value))).toEqual(["role", "code fence", "tail"]);
    expect(gate.fail(new Error("WS_WRITE_TIMEOUT"))).toBe(false);
  });

  it.each(["chat/completions", "messages"])("returns HTTP 422 instead of an empty HTTP-200 stream for early upstream rejection: %s", async (endpoint) => {
    const state = env.TENANTS.getByName(env.TENANT_NAME || "default");
    await state.upsertAccount(account());
    const apiKey = (await state.createAPIKey("offline-073", 1)).key;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("sensitive upstream body must not be echoed", { status: 422 }));
    const response = await SELF.fetch(`https://example.test/v1/${endpoint}`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, "x-api-key": apiKey },
      body: JSON.stringify({ model: "gpt-5.6-sol", stream: true, max_tokens: 100, messages: [{ role: "user", content: "Hello" }] }),
    });
    expect(response.status).toBe(422);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    const body = await response.text();
    expect(response.headers.get("X-M365-Error-Code")).toBe("upstream_request_rejected");
    expect(body).toContain("Microsoft ChatHub rejected the request");
    expect(body).not.toContain("sensitive upstream body");
    expect(body).not.toContain("offline-073");
  });

  it("waits for imminent cooldown recovery with jitter and supports cancellation", async () => {
    vi.useFakeTimers();
    const selected = { accountId: "active", sequence: 1, egress: "direct" as const, routeEpoch: 1, token: account() };
    const selectAccount = vi.fn().mockResolvedValueOnce(null).mockResolvedValue(selected);
    const state = { selectAccount, accountPoolStatus: async () => ({ total: 1, available: 0, cooling: 1, isolated: 0, retryAfterMs: 400 }) };
    const pending = selectAccountWithRecovery(state, "", Date.now() + 60_000);
    await vi.advanceTimersByTimeAsync(399);
    expect(selectAccount).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(300);
    expect(await pending).toBe(selected);
    const abort = new AbortController(); abort.abort();
    await expect(selectAccountWithRecovery(state, "", Date.now() + 60_000, abort.signal)).rejects.toThrow("REQUEST_ABORTED");
  });

  it("does not wait for a long cooldown or scan isolated accounts", async () => {
    const selectAccount = vi.fn().mockResolvedValue(null);
    const state = { selectAccount, accountPoolStatus: async () => ({ total: 2, available: 0, cooling: 1, isolated: 1, retryAfterMs: 60_000 }) };
    expect(await selectAccountWithRecovery(state, "", Date.now() + 60_000)).toBeNull();
    expect(selectAccount).toHaveBeenCalledTimes(1);
  });

  it.each(["chat/completions", "responses", "messages"])("preserves consecutive code fences and following text on the real SSE endpoint: %s", async (endpoint) => {
    const text = "before\n```ts\nconst n = 1;\n```\nafter first\n```json\n{}\n```\nTAIL_073 <Organization>NodeLoc</Organization>";
    const expected = stripEntityTags(text);
    let invocations = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const pair = new WebSocketPair(); const socket = pair[1]; socket.accept(); let handshaken = false;
      socket.addEventListener("message", () => {
        if (!handshaken) { handshaken = true; socket.send("{}\u001e"); return; }
        invocations += 1;
        socket.send(JSON.stringify({ type: 2, item: { result: { message: text } } }) + "\u001e" + JSON.stringify({ type: 3 }) + "\u001e");
      });
      return new Response(null, { status: 101, webSocket: pair[0] });
    });
    const state = env.TENANTS.getByName(env.TENANT_NAME || "default");
    await state.upsertAccount(account());
    const apiKey = (await state.createAPIKey("fences-073", 1)).key;
    const response = await SELF.fetch(`https://example.test/v1/${endpoint}`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, "x-api-key": apiKey },
      body: JSON.stringify({ model: "gpt-5.6-sol", stream: true, max_tokens: 100,
        messages: [{ role: "user", content: "Show two code examples and a tail marker." }], input: "Show two code examples and a tail marker." }),
    });
    expect(response.status).toBe(200);
    const wire = await response.text();
    const data = wire.split("\n").filter((line) => line.startsWith("data: {")).map((line) => JSON.parse(line.slice(6)));
    const streamed = data.map((item) => endpoint === "responses" ? item.type === "response.output_text.delta" ? item.delta : ""
      : endpoint === "messages" ? item.delta?.text ?? "" : item.choices?.[0]?.delta?.content ?? "").join("");
    expect(streamed).toBe(expected);
    expect(invocations).toBe(1);
    expect(wire).not.toContain("response.failed");
  });
});
