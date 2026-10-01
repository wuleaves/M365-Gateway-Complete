import type { TenantState } from "./tenant-state";
import type { Env, OAuthTokenSet } from "./types";

const SUBSTRATE = "https://substrate.office.com";
const M365_CLOUD_SCOPE = "https://m365.cloud.microsoft/v2/.default";
const MAX_UPSTREAM_JSON_BYTES = 2 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 30_000;
const PLUGIN_CACHE_TTL_MS = 5 * 60_000;

export interface MicrosoftServiceResult {
  status: number;
  accountId: string;
  data: unknown;
  cache?: "HIT" | "MISS";
}

interface PluginCacheEntry {
  expiresAt: number;
  data: unknown;
}

const pluginCache = new Map<string, PluginCacheEntry>();

function tenant(env: Env): DurableObjectStub<TenantState> {
  return env.TENANTS.getByName(env.TENANT_NAME || "default");
}

function safeIdentifier(value: string, maximum = 256): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum || !/^[A-Za-z0-9_.:@-]+$/u.test(normalized)) {
    throw new Error("INVALID_SERVICE_IDENTIFIER");
  }
  return normalized;
}

async function boundedJSON(response: Response): Promise<unknown> {
  const declared = Number.parseInt(response.headers.get("Content-Length") ?? "0", 10);
  if (Number.isFinite(declared) && declared > MAX_UPSTREAM_JSON_BYTES) throw new Error("SERVICE_RESPONSE_TOO_LARGE");
  if (!response.body) return {};
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;
      total += value.byteLength;
      if (total > MAX_UPSTREAM_JSON_BYTES) {
        await reader.cancel("bounded Microsoft JSON response exceeded").catch(() => undefined);
        throw new Error("SERVICE_RESPONSE_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes) || "{}") as unknown;
  } catch {
    throw new Error("SERVICE_INVALID_RESPONSE");
  }
}

async function microsoftJSON(
  url: string,
  token: OAuthTokenSet,
  method: string,
  body?: unknown,
  cloud = false,
): Promise<{ status: number; data: unknown }> {
  const headers = new Headers({
    Authorization: `Bearer ${token.accessToken}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  });
  if (cloud) {
    headers.set("Origin", "https://m365.cloud.microsoft");
    headers.set("Referer", "https://m365.cloud.microsoft/");
    headers.set("X-Requested-With", "XMLHttpRequest");
  } else {
    headers.set("x-anchormailbox", `Oid:${token.oid}@${token.tid}`);
    headers.set("x-routingparameter-sessionkey", token.oid);
    headers.set("x-scenario", "OfficeWebIncludedCopilot");
    headers.set("x-clientrequestid", crypto.randomUUID());
  }
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    throw new Error("SERVICE_UNAVAILABLE");
  }
  return { status: response.status, data: await boundedJSON(response) };
}

async function substrateAccount(env: Env): Promise<{ accountId: string; token: OAuthTokenSet }> {
  const selected = await tenant(env).selectAccount();
  if (!selected) throw new Error("NO_HEALTHY_ACCOUNT");
  return { accountId: selected.accountId, token: selected.token };
}

async function cloudAccount(env: Env): Promise<{ accountId: string; token: OAuthTokenSet }> {
  const selected = await tenant(env).serviceAccessToken(M365_CLOUD_SCOPE);
  if (!selected) throw new Error("NO_HEALTHY_ACCOUNT");
  return selected;
}

export async function memoryService(
  env: Env,
  resource: "flags" | "instructions" | "settings" | "instruction",
  method: string,
  body?: unknown,
  instructionId = "",
): Promise<MicrosoftServiceResult> {
  const selected = await substrateAccount(env);
  const variants = "?variants=feature.EnablePersonalization";
  const target = resource === "flags"
    ? `${SUBSTRATE}/m365Copilot/PersonalizationUserFlags${variants}`
    : resource === "instructions"
      ? `${SUBSTRATE}/m365Copilot/CustomInstructions${variants}`
      : resource === "instruction"
        ? `${SUBSTRATE}/m365Copilot/CustomInstructions/${encodeURIComponent(safeIdentifier(instructionId))}${variants}`
        : `${SUBSTRATE}/puds/v1/me/settings/copilot`;
  const result = await microsoftJSON(target, selected.token, method, body);
  return { ...result, accountId: selected.accountId };
}

export async function pluginService(env: Env): Promise<MicrosoftServiceResult> {
  const selected = await substrateAccount(env);
  const cached = pluginCache.get(selected.accountId);
  if (cached && cached.expiresAt > Date.now()) {
    return { status: 200, accountId: selected.accountId, data: cached.data, cache: "HIT" };
  }
  const result = await microsoftJSON(
    `${SUBSTRATE}/m365Copilot/EventListener/Client?EventId=ExecuteAction`,
    selected.token,
    "GET",
  );
  if (result.status === 200) pluginCache.set(selected.accountId, { expiresAt: Date.now() + PLUGIN_CACHE_TTL_MS, data: result.data });
  return { ...result, accountId: selected.accountId, cache: "MISS" };
}

function conversationList(value: unknown): Record<string, unknown>[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const store = (value as Record<string, unknown>).store;
  if (!store || typeof store !== "object" || Array.isArray(store)) return [];
  const history = (store as Record<string, unknown>).conversationPageHistoryList;
  if (!history || typeof history !== "object" || Array.isArray(history)) return [];
  const rawChats = (history as Record<string, unknown>).chats;
  if (!Array.isArray(rawChats)) return [];
  return rawChats.slice(0, 500).flatMap((raw) => {
    let value = raw;
    if (typeof raw === "string" && raw.length <= 512 * 1024) {
      try { value = JSON.parse(raw) as unknown; } catch { return []; }
    }
    return value && typeof value === "object" && !Array.isArray(value)
      ? [value as Record<string, unknown>]
      : [];
  });
}

async function cloudAction(env: Env, action: string, state: Record<string, unknown>): Promise<MicrosoftServiceResult> {
  const selected = await cloudAccount(env);
  const result = await microsoftJSON(
    "https://m365.cloud.microsoft/chat",
    selected.token,
    "POST",
    { action, state, ...state },
    true,
  );
  return { ...result, accountId: selected.accountId };
}

export async function listCloudConversations(env: Env): Promise<MicrosoftServiceResult> {
  const result = await cloudAction(env, "RefreshNavPane", {});
  return { ...result, data: { conversations: result.status >= 200 && result.status < 300 ? conversationList(result.data) : [] } };
}

export async function deleteCloudConversation(env: Env, conversationId: string): Promise<MicrosoftServiceResult> {
  const id = safeIdentifier(conversationId, 512);
  return cloudAction(env, "DeleteConversation", {
    conversationId: id,
    conversationPageHistoryList: { chats: [] },
  });
}

function timestamp(value: unknown): number {
  const time = typeof value === "number" ? value : typeof value === "string"
    ? (/^\d{10,13}$/u.test(value) ? Number(value) : Date.parse(value)) : Number.NaN;
  return Number.isFinite(time) && time > 0 ? time < 10_000_000_000 ? time * 1_000 : time : 0;
}

export function conversationActivityTime(item: Record<string, unknown>): number {
  for (const key of ["lastUpdatedTime", "updatedAt", "lastModifiedTime", "timestamp"]) {
    const value = item[key];
    const time = timestamp(value);
    if (time) return time;
  }
  return 0;
}

function conversationTime(item: Record<string, unknown>): number {
  return conversationActivityTime(item) || timestamp(item.createTimeUtc) || timestamp(item.createdAt);
}

function conversationId(item: Record<string, unknown>): string {
  for (const key of ["id", "conversationId", "conversation_id"]) {
    if (typeof item[key] === "string") return item[key] as string;
  }
  return "";
}

export function selectCloudCleanupCandidates(
  conversations: Record<string, unknown>[], protectedIDs: ReadonlySet<string>,
  maxAgeDays: number, keepLatest: number, now = Date.now(),
): { targets: Record<string, unknown>[]; protected: number; skippedUnknownActivity: number } {
  const keep = Math.max(0, Math.min(500, Math.trunc(keepLatest)));
  const cutoff = now - Math.max(1, Math.min(3_650, maxAgeDays)) * 86_400_000;
  const ordered = [...conversations].sort((a, b) => conversationTime(b) - conversationTime(a));
  let protectedCount = 0;
  let skippedUnknownActivity = 0;
  const targets = ordered.slice(keep).filter((item) => {
    if (protectedIDs.has(conversationId(item))) { protectedCount += 1; return false; }
    const activity = conversationActivityTime(item);
    if (!activity) { skippedUnknownActivity += 1; return false; }
    return activity < cutoff;
  }).slice(0, 20);
  return { targets, protected: protectedCount, skippedUnknownActivity };
}

export async function cleanupCloudConversations(
  env: Env,
  maxAgeDays: number,
  keepLatest: number,
): Promise<{ accountId: string; scanned: number; deleted: number; failed: number; protected: number; skippedUnknownActivity: number }> {
  const listed = await listCloudConversations(env);
  if (listed.status < 200 || listed.status >= 300) throw new Error("SERVICE_UPSTREAM_REJECTED");
  const conversations = ((listed.data as { conversations?: unknown }).conversations ?? []) as Record<string, unknown>[];
  const protectedIDs = await protectedCloudConversationIDs(env, listed.accountId);
  const { targets, protected: protectedCount, skippedUnknownActivity } = selectCloudCleanupCandidates(conversations, protectedIDs, maxAgeDays, keepLatest);
  let deleted = 0;
  let failed = 0;
  for (const item of targets) {
    const id = conversationId(item);
    if (!id) { failed += 1; continue; }
    try {
      const result = await deleteCloudConversation(env, id);
      if (result.status >= 200 && result.status < 300) deleted += 1;
      else failed += 1;
    } catch { failed += 1; }
  }
  return { accountId: listed.accountId, scanned: conversations.length, deleted, failed, protected: protectedCount, skippedUnknownActivity };
}

export async function protectedCloudConversationIDs(env: Env, accountId: string): Promise<Set<string>> {
  const registry = await tenant(env).protectedSessionObjectKeys();
  if (!registry.complete) throw new Error("CLOUD_CLEANUP_REGISTRY_TOO_LARGE");
  const protectedIDs = new Set<string>();
  for (let index = 0; index < registry.keys.length; index += 10) {
    const bindings = await Promise.all(registry.keys.slice(index, index + 10).map((key) => env.CHATS.getByName(key).conversationBinding()));
    for (const binding of bindings) {
      if (binding && binding.accountId === accountId && binding.conversationId) protectedIDs.add(binding.conversationId);
    }
  }
  return protectedIDs;
}
