import { anthropicErrorResponse, anthropicRequest } from "./anthropic";
import { authorizationURL, exchangeCode } from "./oauth";
import { chatSessionKey, openAIRequest } from "./openai";
import { applyRuntimeModelConfiguration, codexModelCatalog, modelCatalog } from "./models";
import {
  ACCOUNT_MIGRATION_PATH,
  MigrationRequestError,
  verifyAccountMigration,
} from "./migration";
import { readJSONLimited } from "./request-body";
import { RequestMetricTracker, shouldRetainRequestObservation, trackBufferedResponse, trackStreamingResponse } from "./request-metrics";
import { validTrendTimeZone } from "./usage-trend";
import { MAX_API_KEY_NAME_CHARACTERS, MAX_API_KEY_VALIDITY_DAYS, TenantState } from "./tenant-state";
import type { Env, RequestMetricInput } from "./types";
import type { APIKeyAuthorization } from "./tenant-state";
import {
  cleanupCloudConversations,
  deleteCloudConversation,
  listCloudConversations,
  memoryService,
  pluginService,
  type MicrosoftServiceResult,
} from "./m365-services";


const SESSION_COOKIE = "m365_admin_session";
const MAX_JSON_BYTES = 1024 * 1024;
const CREDENTIAL_STORAGE_DESCRIPTION = "AES-256-GCM ciphertext in Durable Object SQLite (authoritative) with an encrypted Cloudflare KV mirror";
const CAPABILITY_MATRIX = Object.freeze({
  oauthPkce: true,
  multipleAccounts: true,
  orderedAccountRotation: true,
  accountIsolation: true,
  apiKeyManagement: true,
  persistentUsageStats: true,
  boundedDiagnostics: true,
  strongAccountSessionCleanup: false,
  runtimeSettingsWrite: true,
  perAccountProxy: false,
  fixedTargetEgressRelay: true,
  arbitraryProxyPool: false,
  sessionEnumeration: true,
  filesystemPaths: false,
  localProcessLaunch: false,
});

function tenant(env: Env): DurableObjectStub<TenantState> {
  return env.TENANTS.getByName(env.TENANT_NAME || "default");
}

function cookie(request: Request, name: string): string {
  const raw = request.headers.get("Cookie") ?? "";
  for (const item of raw.split(";")) {
    const [key, ...parts] = item.trim().split("=");
    if (key === name) return decodeURIComponent(parts.join("="));
  }
  return "";
}

function sessionCookie(request: Request, value: string, maxAge: number): string {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",", 1)[0]?.trim().toLowerCase();
  const secure = forwardedProto === "https" || new URL(request.url).protocol === "https:";
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly;${secure ? " Secure;" : ""} SameSite=Lax; Max-Age=${maxAge}`;
}

function json(value: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

function error(status: number, code: string, message: string): Response {
  return json({ error: { type: "cloudflare_native_error", code, message } }, status, { "X-M365-Error-Code": code });
}

function apiCredential(request: Request): string {
  return request.headers.get("X-API-Key")?.trim()
    || request.headers.get("Authorization")?.replace(/^Bearer\s+/iu, "").trim()
    || "";
}

function authorizeAPIKey(request: Request, env: Env): Promise<APIKeyAuthorization | null> {
  return tenant(env).authorizeAPIKey(apiCredential(request));
}

function serviceResponse(result: MicrosoftServiceResult): Response {
  if (result.status < 200 || result.status >= 300) {
    const status = result.status >= 400 && result.status <= 599 ? result.status : 502;
    return error(status, "microsoft_service_error", "Microsoft 365 service rejected the request");
  }
  return json(result.data, result.status, {
    "X-M365-Account": result.accountId,
    ...(result.cache ? { "X-Cache": result.cache } : {}),
  });
}

function serviceFailure(cause: unknown): Response {
  const code = cause instanceof Error ? cause.message : "";
  if (code === "INVALID_SERVICE_IDENTIFIER") return error(400, "invalid_request_error", "invalid Microsoft 365 resource identifier");
  if (code === "NO_HEALTHY_ACCOUNT") return error(503, "account_unavailable", "no healthy Microsoft 365 account is available");
  if (code === "SERVICE_RESPONSE_TOO_LARGE") return error(502, "upstream_payload_too_large", "Microsoft 365 service response exceeded the gateway limit");
  if (code === "SERVICE_INVALID_RESPONSE") return error(502, "upstream_response_error", "Microsoft 365 service returned invalid JSON");
  if (code === "MICROSOFT_REFRESH_TOKEN_REJECTED" || code === "MICROSOFT_REFRESH_TOKEN_MISSING") {
    return error(409, "account_reauthorization_required", "Microsoft 365 authorization must be renewed for this feature");
  }
  if (code === "ACCOUNT_NOT_ACTIVE") return error(409, "account_not_active", "only the active Microsoft 365 account can perform this operation");
  return error(502, "upstream_unavailable", "Microsoft 365 service is temporarily unavailable");
}

function isJSONObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function apiKeyInputError(cause: unknown): Response | null {
  const code = cause instanceof Error ? cause.message : "";
  if (code === "INVALID_API_KEY_NAME") {
    return error(400, "invalid_api_key_name", `API Key name must contain 1 to ${MAX_API_KEY_NAME_CHARACTERS} characters`);
  }
  if (code === "INVALID_API_KEY_DAYS") {
    return error(400, "invalid_api_key_days", `API Key validity must be a whole number from 0 to ${MAX_API_KEY_VALIDITY_DAYS} days`);
  }
  return null;
}

function redirect(requestURL: URL, pathname: string): Response {
  const target = new URL(pathname, requestURL);
  return new Response(null, { status: 307, headers: { Location: target.toString(), "Cache-Control": "no-store" } });
}

async function managementPage(request: Request, env: Env, url: URL): Promise<Response> {
  const current = await tenant(env).session(cookie(request, SESSION_COOKIE));
  if (url.pathname === "/login.html") return redirect(url, "/login");
  if (url.pathname === "/login") {
    if (current.authenticated && !current.mustChangePassword) return redirect(url, "/");
    const assetURL = new URL("/login.html", url);
    const response = await env.ASSETS.fetch(new Request(assetURL, request));
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
  if (!current.authenticated || current.mustChangePassword) return redirect(url, "/login");
  const assetURL = new URL(url.pathname === "/" ? "/index.html" : url.pathname, url);
  const response = await env.ASSETS.fetch(new Request(assetURL, request));
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function jsonBody<T>(request: Request): Promise<T> {
  return readJSONLimited<T>(request, MAX_JSON_BYTES);
}

async function admin(request: Request, env: Env, allowMustChange = false): Promise<{ ok: true } | { ok: false; response: Response }> {
  const current = await tenant(env).session(cookie(request, SESSION_COOKIE));
  if (!current.authenticated) return { ok: false, response: error(401, "auth_error", "administrator login required") };
  if (current.mustChangePassword && !allowMustChange) {
    return { ok: false, response: error(403, "password_change_required", "administrator password must be changed first") };
  }
  return { ok: true };
}

async function adminRoute(request: Request, env: Env, url: URL): Promise<Response> {
  const state = tenant(env);
  if (url.pathname === "/api/admin/login" && request.method === "POST") {
    const body = await jsonBody<{ password?: string }>(request);
    const result = await state.beginLogin(body.password ?? "", request.headers.get("CF-Connecting-IP") ?? "unknown");
    if (!result.ok) {
      if (result.error === "LOGIN_IP_BLACKLISTED") return error(403, "login_ip_blacklisted", "该访问 IP 已被暂时加入黑名单");
      if (result.error === "LOGIN_RATE_LIMITED") return error(429, "rate_limit_error", "登录失败次数过多，请 30 分钟后重试");
      if (result.error === "MFA_NOT_CONFIGURED") return error(503, "mfa_not_configured", "管理员 MFA 尚未配置");
      return error(401, "auth_error", "invalid administrator password");
    }
    return json({ status: "mfa_required", challenge: result.challenge, methods: result.methods });
  }
  if (url.pathname === "/api/admin/mfa/totp" && request.method === "POST") {
    const body = await jsonBody<{ challenge?: string; code?: string }>(request);
    const result = await state.completeTOTP(body.challenge ?? "", body.code ?? "", request.headers.get("CF-Connecting-IP") ?? "unknown");
    if (!result.ok) return error(401, "mfa_error", "2FA 验证失败或已过期");
    return json({ status: "authenticated", must_change_password: result.mustChangePassword }, 200, { "Set-Cookie": sessionCookie(request, result.token, 86_400) });
  }
  if (url.pathname === "/api/admin/mfa/passkey/options" && request.method === "POST") {
    const body = await jsonBody<{ challenge?: string }>(request);
    const options = await state.passkeyOptions(body.challenge ?? "", request.headers.get("CF-Connecting-IP") ?? "unknown");
    if (!options) return error(401, "mfa_error", "Passkey 验证会话已过期");
    return json({ publicKey: { challenge: options.challenge, rpId: options.rpId, userVerification: "required", allowCredentials: options.allowCredentials.map((id) => ({ type: "public-key", id })) } });
  }
  if (url.pathname === "/api/admin/mfa/passkey" && request.method === "POST") {
    const body = await jsonBody<{ challenge?: string; credentialId?: string; clientDataJSON?: string; authenticatorData?: string; signature?: string }>(request);
    const result = await state.completePasskey(body.challenge ?? "", request.headers.get("CF-Connecting-IP") ?? "unknown", { credentialId: body.credentialId ?? "", clientDataJSON: body.clientDataJSON ?? "", authenticatorData: body.authenticatorData ?? "", signature: body.signature ?? "" });
    if (!result.ok) return error(401, "mfa_error", "Passkey 验证失败或已过期");
    return json({ status: "authenticated", must_change_password: result.mustChangePassword }, 200, { "Set-Cookie": sessionCookie(request, result.token, 86_400) });
  }
  if (url.pathname === "/api/admin/session" && request.method === "GET") {
    const result = await state.session(cookie(request, SESSION_COOKIE));
    return json({ authenticated: result.authenticated, must_change_password: result.mustChangePassword });
  }
  if (url.pathname === "/api/admin/logout" && request.method === "POST") {
    await state.logout(cookie(request, SESSION_COOKIE));
    return json({ status: "logged_out" }, 200, { "Set-Cookie": sessionCookie(request, "", 0) });
  }
  if (url.pathname === "/api/admin/change-password" && request.method === "POST") {
    // The one-time bootstrap password is only a login credential. Even during
    // first-run replacement, a caller must first prove it completed login and
    // received the HttpOnly administrator session cookie.
    const passwordAccess = await admin(request, env, true);
    if (!passwordAccess.ok) return passwordAccess.response;
    const body = await jsonBody<{ current_password?: string; new_password?: string }>(request);
    const changed = await state.changePassword(
      cookie(request, SESSION_COOKIE),
      body.current_password ?? "",
      body.new_password ?? "",
    );
    if (!changed.ok) {
      if (changed.error === "PASSWORD_TOO_SHORT") return error(400, "password_too_short", "新密码至少需要 8 个字符");
      if (changed.error === "INVALID_ADMIN_PASSWORD") return error(401, "invalid_admin_password", "当前密码错误");
      return error(401, "admin_session_required", "请先登录管理员账号");
    }
    return json({ status: "password_changed" }, 200, { "Set-Cookie": sessionCookie(request, "", 0) });
  }

  const access = await admin(request, env);
  if (!access.ok) return access.response;
  if (url.pathname === "/api/admin/mfa/passkeys" && request.method === "GET") {
    return json({ passkeys: await state.listPasskeys(cookie(request, SESSION_COOKIE)) });
  }
  if (url.pathname === "/api/admin/mfa/passkeys" && request.method === "DELETE") {
    const id = url.searchParams.get("id") ?? "";
    if (!id) return error(400, "invalid_passkey_id", "passkey id required");
    await state.deletePasskey(cookie(request, SESSION_COOKIE), id);
    return json({ status: "passkey_deleted" });
  }
  if (url.pathname === "/api/admin/mfa/passkey/register/options" && request.method === "POST") {
    const body = await jsonBody<{ label?: string }>(request);
    const options = await state.beginPasskeyRegistration(cookie(request, SESSION_COOKIE), body.label ?? "管理员设备");
    if (!options) return error(401, "auth_error", "administrator login required");
    return json({ publicKey: { challenge: options.challenge, rp: { id: options.rpId, name: "M365 Gateway" }, user: { id: options.userId, name: "admin", displayName: "M365 Gateway 管理员" }, pubKeyCredParams: [{ type: "public-key", alg: -7 }], timeout: 60_000, authenticatorSelection: { residentKey: "preferred", userVerification: "required" }, attestation: "none" } });
  }
  if (url.pathname === "/api/admin/mfa/passkey/register" && request.method === "POST") {
    const body = await jsonBody<{ challenge?: string; credentialId?: string; clientDataJSON?: string; attestationObject?: string; label?: string }>(request);
    const result = await state.completePasskeyRegistration(cookie(request, SESSION_COOKIE), { challenge: body.challenge ?? "", credentialId: body.credentialId ?? "", clientDataJSON: body.clientDataJSON ?? "", attestationObject: body.attestationObject ?? "", label: body.label });
    if (!result.ok) return error(400, "passkey_registration_failed", "通行密钥注册失败");
    return json({ status: "passkey_registered" });
  }
  if (url.pathname === "/api/admin/keys") {
    if (request.method === "GET") {
      const keys = await state.listAPIKeys();
      return json({ keys: keys.map((key) => ({
        id: key.id,
        name: key.name,
        prefix: key.prefix,
        createdAt: new Date(key.created_at).toISOString(),
        lastUsedAt: key.last_used_at ? new Date(key.last_used_at).toISOString() : null,
        expiresAt: key.expires_at ? new Date(key.expires_at).toISOString() : null,
        revoked: Boolean(key.revoked),
      })) });
    }
    if (request.method === "POST") {
      const body = await jsonBody<unknown>(request);
      if (!isJSONObject(body)) return error(400, "invalid_api_key_request", "API Key request body must be a JSON object");
      if (body.name !== undefined && typeof body.name !== "string") {
        return error(400, "invalid_api_key_name", `API Key name must contain 1 to ${MAX_API_KEY_NAME_CHARACTERS} characters`);
      }
      if (body.days !== undefined && typeof body.days !== "number") {
        return error(400, "invalid_api_key_days", `API Key validity must be a whole number from 0 to ${MAX_API_KEY_VALIDITY_DAYS} days`);
      }
      const name = body.name ?? "default";
      const days = body.days ?? 0;
      if (!name.trim() || name.trim().length > MAX_API_KEY_NAME_CHARACTERS) {
        return error(400, "invalid_api_key_name", `API Key name must contain 1 to ${MAX_API_KEY_NAME_CHARACTERS} characters`);
      }
      if (!Number.isInteger(days) || days < 0 || days > MAX_API_KEY_VALIDITY_DAYS) {
        return error(400, "invalid_api_key_days", `API Key validity must be a whole number from 0 to ${MAX_API_KEY_VALIDITY_DAYS} days`);
      }
      try {
        const created = await state.createAPIKey(name, days);
        return json({ key: created.key, record: created.record }, 201);
      } catch (cause) {
        const validation = apiKeyInputError(cause);
        if (validation) return validation;
        throw cause;
      }
    }
    if (request.method === "DELETE") return json({ status: await state.revokeAPIKey(url.searchParams.get("id") ?? "") ? "revoked" : "not_found" });
    if (request.method === "PATCH") {
      const body = await jsonBody<unknown>(request);
      if (!isJSONObject(body)) return error(400, "invalid_api_key_request", "API Key request body must be a JSON object");
      if (body.id !== undefined && typeof body.id !== "string") {
        return error(400, "invalid_api_key_id", "API Key id must be a string");
      }
      if (body.days !== undefined && typeof body.days !== "number") {
        return error(400, "invalid_api_key_days", `API Key validity must be a whole number from 0 to ${MAX_API_KEY_VALIDITY_DAYS} days`);
      }
      const days = body.days ?? 0;
      if (!Number.isInteger(days) || days < 0 || days > MAX_API_KEY_VALIDITY_DAYS) {
        return error(400, "invalid_api_key_days", `API Key validity must be a whole number from 0 to ${MAX_API_KEY_VALIDITY_DAYS} days`);
      }
      try {
        return json({ status: await state.updateAPIKeyExpiry(body.id ?? "", days) ? "updated" : "not_found" });
      } catch (cause) {
        const validation = apiKeyInputError(cause);
        if (validation) return validation;
        throw cause;
      }
    }
  }
  if (url.pathname === "/api/admin/settings") {
    if (request.method === "GET") return json({ settings: {
      platform: "cloudflare-native",
      maxAccounts: Number(env.MAX_ACCOUNTS),
      environment: env.ENVIRONMENT,
      credentialStorage: CREDENTIAL_STORAGE_DESCRIPTION,
      sessionTTL: "24 hours",
      adminSessionTTL: "24 hours",
      chatSessionTTL: "30 days",
      runtime: await state.runtimeConfiguration(),
      capabilities: CAPABILITY_MATRIX,
    } });
    if (request.method === "PUT" || request.method === "PATCH") {
      try {
        const runtime = await state.setRuntimeConfiguration(await jsonBody<unknown>(request));
        applyRuntimeModelConfiguration(runtime.models);
        return json({ status: "updated", runtime });
      } catch {
        return error(400, "invalid_runtime_configuration", "runtime configuration is outside the supported bounds");
      }
    }
    return error(405, "method_not_allowed", "GET, PUT, or PATCH is required for runtime settings");
  }
  if (url.pathname === "/api/admin/models") {
    if (request.method === "GET") {
      const runtime = await state.runtimeConfiguration();
      applyRuntimeModelConfiguration(runtime.models);
      return json({ runtime: runtime.models, catalog: modelCatalog() });
    }
    if (request.method === "PUT") {
      try {
        const input = await jsonBody<unknown>(request);
        const current = await state.runtimeConfiguration();
        const runtime = await state.setRuntimeConfiguration({ ...current, models: input });
        applyRuntimeModelConfiguration(runtime.models);
        return json({ status: "updated", runtime: runtime.models, catalog: modelCatalog() });
      } catch {
        return error(400, "invalid_model_configuration", "model aliases or tone definitions are invalid");
      }
    }
    return error(405, "method_not_allowed", "GET or PUT is required for /api/admin/models");
  }
  if (url.pathname === "/api/admin/egress" && request.method === "GET") {
    // Cloudflare Workers cannot safely accept arbitrary HTTP/SOCKS proxy URLs.
    // Expose only redacted fixed-target relay status; secrets and full URLs
    // never leave the Worker environment.
    const relay = (name: "direct" | "relay5" | "relay7", urlValue?: string) => ({
      name,
      configured: Boolean(urlValue?.trim()),
      target: name === "direct" ? "Microsoft ChatHub via Cloudflare" : "fixed Microsoft ChatHub relay",
    });
    return json({
      mode: "fixed-target-only",
      arbitraryProxyPool: false,
      relays: [relay("direct", "configured"), relay("relay5", env.RELAY5_URL), relay("relay7", env.RELAY7_URL)],
      note: "Cloudflare-native mode does not support arbitrary HTTP/HTTPS/SOCKS5 proxy URLs.",
    });
  }
  if (url.pathname === "/api/admin/egress/check" && (request.method === "GET" || request.method === "POST")) {
    const check = async (name: "relay5" | "relay7", value?: string): Promise<Record<string, unknown>> => {
      if (!value?.trim()) return { name, configured: false, healthy: false, status: "not_configured" };
      const started = Date.now();
      try {
        const target = new URL("/health", value);
        if (target.protocol !== "https:") throw new Error("invalid relay scheme");
        const response = await fetch(target, { method: "GET", signal: AbortSignal.timeout(5_000) });
        await response.body?.cancel().catch(() => undefined);
        return { name, configured: true, healthy: response.ok, status: response.status, latencyMs: Date.now() - started };
      } catch {
        return { name, configured: true, healthy: false, status: "unreachable", latencyMs: Date.now() - started };
      }
    };
    return json({ direct: { name: "direct", configured: true, healthy: true }, relays: await Promise.all([
      check("relay5", env.RELAY5_URL),
      check("relay7", env.RELAY7_URL),
    ]) });
  }
  if (url.pathname === "/api/admin/models/discover" && request.method === "GET") {
    // Read-only discovery of public Microsoft UI bundle labels. The result is
    // a candidate list only; it never changes the production catalog or routes.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    try {
      const landing = await fetch("https://m365.cloud.microsoft/", { signal: controller.signal });
      const landingText = await landing.text();
      const bundleName = landingText.match(/main\.[a-f0-9]{8}\.js/u)?.[0] ?? "";
      if (!bundleName) return json({ candidates: [], status: "bundle_not_found", productionCatalogChanged: false });
      const bundle = await fetch(`https://res.public.onecdn.static.microsoft/midgard/versionless-v2/${bundleName}`, { signal: controller.signal });
      const bundleText = await bundle.text();
      const tones = [...new Set(bundleText.match(/(?:Gpt_[0-9]_[0-9]_[A-Za-z_]+|Claude_[A-Za-z0-9_]+|Magic)/gu) ?? [])].sort();
      return json({ candidates: tones.slice(0, 256), status: "ok", productionCatalogChanged: false, source: "public-microsoft-ui-bundle" });
    } catch {
      return json({ candidates: [], status: "discovery_failed", productionCatalogChanged: false });
    } finally {
      clearTimeout(timer);
    }
  }
  if (url.pathname === "/api/admin/debug/logs" && request.method === "GET") {
    const limit = Number.parseInt(url.searchParams.get("limit") ?? "100", 10);
    return json({ records: await state.listDiagnostics(limit), maxRecords: 200 });
  }
  if (url.pathname === "/api/admin/usage" && request.method === "GET") {
    const limit = Number.parseInt(url.searchParams.get("limit") ?? "500", 10);
    return json({ totals: await state.statsSnapshot(), dimensions: await state.usageDimensionStats(limit) });
  }
  if (url.pathname === "/api/admin/usage/trend" && request.method === "GET") {
    const days = Number(url.searchParams.get("days") ?? "1");
    const timeZone = url.searchParams.get("timezone") ?? "UTC";
    if ((days !== 1 && days !== 7) || !validTrendTimeZone(timeZone)) return error(400, "invalid_usage_trend", "days must be 1 or 7 and timezone must be a valid IANA time zone");
    return json(await state.usageTrend(days, timeZone));
  }
  if (url.pathname === "/api/admin/reset-stats" && request.method === "POST") {
    return json({ status: "reset", ...(await state.resetRequestStats()) });
  }
  if (url.pathname.includes("proxy")) return error(400, "proxy_unsupported", "Cloudflare-native accounts do not use server-side proxies");
  return error(404, "not_found", "management endpoint not found");
}

async function accountRoute(request: Request, env: Env, url: URL): Promise<Response> {
  const access = await admin(request, env);
  if (!access.ok) return access.response;
  const state = tenant(env);
  if (url.pathname === "/api/accounts" && request.method === "GET") {
    const snapshot = await state.accountsSnapshot();
    return json({ accounts: snapshot.accounts, ...snapshot.totals, accountLimit: Number(env.MAX_ACCOUNTS) });
  }
  if (url.pathname === "/api/accounts/activate" && request.method === "POST") {
    const body = await jsonBody<{ id?: string }>(request);
    const activated = await state.activateAccount(body.id ?? "");
    return activated ? json({ status: "activated", id: body.id }) : error(409, "account_unavailable", "account is missing, disabled, or cooling down");
  }
  if (url.pathname === "/api/accounts/configure" && request.method === "POST") {
    const body = await jsonBody<{ id?: string; enabled?: boolean; egress?: "direct" | "relay5" | "relay7" }>(request);
    if (body.enabled !== undefined && typeof body.enabled !== "boolean") return error(400, "invalid_account_setting", "enabled must be a boolean");
    if (body.egress !== undefined && !["direct", "relay5", "relay7"].includes(body.egress)) return error(400, "invalid_account_egress", "egress must be direct, relay5, or relay7");
    const account = await state.configureAccount(body.id ?? "", { enabled: body.enabled, egress: body.egress });
    return account ? json({ status: "updated", account }) : error(404, "account_not_found", "account not found");
  }
  if (url.pathname === "/api/accounts/token-health" && request.method === "POST") {
    const body = await jsonBody<{ id?: string; refresh?: boolean }>(request);
    try {
      const token = await state.ensureValidAccount(body.id ?? "", body.refresh === true);
      if (!token) return error(404, "account_not_found", "account not found");
      return json({ status: "valid", expiresAt: new Date(token.expiresAt).toISOString(), identityComplete: Boolean(token.oid && token.tid) });
    } catch (cause) {
      return serviceFailure(cause);
    }
  }
  if (url.pathname === "/api/accounts/clear-cooldown" && request.method === "POST") {
    const body = await jsonBody<{ id?: string }>(request);
    const account = await state.configureAccount(body.id ?? "", { enabled: true });
    return account ? json({ status: "healthy", account }) : error(404, "account_not_found", "account not found");
  }
  if (url.pathname === "/api/accounts/batch" && request.method === "POST") {
    const body = await jsonBody<{ ids?: unknown; enabled?: boolean; egress?: "direct" | "relay5" | "relay7" }>(request);
    if (!Array.isArray(body.ids) || body.ids.length === 0 || body.ids.length > 50 || body.ids.some((id) => typeof id !== "string")) {
      return error(400, "invalid_account_batch", "ids must contain 1 to 50 account ids");
    }
    if (body.enabled !== undefined && typeof body.enabled !== "boolean") return error(400, "invalid_account_setting", "enabled must be a boolean");
    if (body.egress !== undefined && !["direct", "relay5", "relay7"].includes(body.egress)) return error(400, "invalid_account_egress", "egress must be direct, relay5, or relay7");
    const updated = [];
    const missing: string[] = [];
    for (const id of body.ids as string[]) {
      const account = await state.configureAccount(id, { enabled: body.enabled, egress: body.egress });
      if (account) updated.push(account);
      else missing.push(id.slice(0, 128));
    }
    return json({ status: "updated", accounts: updated, missing });
  }
  if (url.pathname === "/api/accounts/delete" && request.method === "POST") {
    const body = await jsonBody<{ id?: string }>(request);
    const deleted = await state.deleteAccount(body.id ?? "");
    return json({
      status: deleted ? "deleted" : "not_found",
      // Chat sessions live in separately named Durable Objects. Stable Chat
      // objects are not currently registered by account and Cloudflare does
      // not expose namespace enumeration, so claiming a numeric deletion count
      // would be false. Deleted credentials cannot be selected for new work;
      // session objects continue to expire under their bounded TTLs.
      sessionsRemoved: null,
      sessionCleanup: {
        status: "not_performed",
        reason: "authoritative_account_session_registry_unavailable",
      },
    });
  }
  if (url.pathname === "/api/accounts/refresh" && request.method === "POST") {
    try {
      const body = await jsonBody<{ id?: string }>(request);
      const account = await state.refreshActiveAccount(body.id ?? "");
      if (!account) return error(404, "account_not_found", "account not found");
      return json({ status: "refreshed", account });
    } catch (cause) {
      if (cause instanceof Error && cause.message === "ACCOUNT_NOT_ACTIVE") {
        return error(409, "account_not_active", "only the active account can be refreshed");
      }
      const code = cause instanceof Error ? cause.message : "TOKEN_REFRESH_FAILED";
      if (["MICROSOFT_REFRESH_TOKEN_MISSING", "MICROSOFT_REFRESH_TOKEN_REJECTED", "MICROSOFT_TOKEN_EXCHANGE_FAILED"].includes(code)) {
        return error(409, "token_refresh_authorization_failed", "Microsoft authorization must be renewed for this account");
      }
      if (code === "MICROSOFT_TOKEN_RATE_LIMITED") return error(429, "token_refresh_rate_limited", "Microsoft temporarily rate-limited token refresh");
      if (code === "MICROSOFT_TOKEN_SERVICE_UNAVAILABLE") return error(503, "token_refresh_unavailable", "Microsoft token service is temporarily unavailable");
      if (["ACCOUNT_CREDENTIAL_MISSING", "ACCOUNT_CREDENTIAL_CORRUPT", "ACCOUNT_CREDENTIAL_MIRROR_UNAVAILABLE"].includes(code)) {
        return error(500, "account_credential_error", "the encrypted account credential is unavailable");
      }
      return error(502, "token_refresh_failed", "Microsoft token refresh failed");
    }
  }
  return error(404, "not_found", "account endpoint not found");
}

async function oauthRoute(request: Request, env: Env, url: URL): Promise<Response> {
  const access = await admin(request, env);
  if (!access.ok) return access.response;
  const state = tenant(env);
  if (url.pathname === "/api/auth/start" && request.method === "GET") {
    const pending = await state.createOAuthState();
    return json({ state: pending.state, url: authorizationURL(env, pending.state, pending.challenge), mode: "paste_callback" });
  }
  if (url.pathname === "/api/auth/callback" && request.method === "GET") {
    let code = url.searchParams.get("code") ?? "";
    let oauthState = url.searchParams.get("state") ?? "";
    const pasted = url.searchParams.get("url");
    if (pasted) {
      try {
        const callback = new URL(pasted);
        code ||= callback.searchParams.get("code") ?? "";
        oauthState ||= callback.searchParams.get("state") ?? "";
      } catch {
        return error(400, "invalid_callback_url", "invalid callback URL");
      }
    }
    if (!code || !oauthState) return error(400, "missing_oauth_fields", "OAuth code and state are required");
    try {
      const verifier = await state.consumeOAuthState(oauthState);
      const account = await state.upsertAccount(await exchangeCode(env, code, verifier));
      await state.activateAccount(account.id);
      return json({ status: "authenticated", account });
    } catch (cause) {
      const codeValue = cause instanceof Error ? cause.message : "OAUTH_FAILED";
      if (codeValue === "ACCOUNT_LIMIT_REACHED") return error(409, "account_limit_reached", `this Cloudflare deployment allows up to ${Number(env.MAX_ACCOUNTS) || 1} accounts`);
      return error(400, "oauth_failed", "Microsoft authorization could not be completed");
    }
  }
  return error(404, "not_found", "OAuth endpoint not found");
}

async function migrationRoute(request: Request, env: Env): Promise<Response> {
  try {
    const verified = await verifyAccountMigration(request, env);
    const result = await tenant(env).importAccountMigration(
      verified.input.migrationId,
      verified.bodyHash,
      verified.nonceHash,
      verified.input.activeSequence,
      verified.input.accounts,
    );
    return json({
      status: result.replayed ? "already_imported" : "imported",
      migrationId: result.migrationId,
      importedCount: result.importedCount,
      activeSequence: result.activeSequence,
      replayed: result.replayed,
    }, result.replayed ? 200 : 201);
  } catch (cause) {
    if (cause instanceof MigrationRequestError) return error(cause.status, cause.code, cause.message);
    const code = cause instanceof Error ? cause.message : "";
    if (code === "MIGRATION_REPLAY") return error(409, "migration_replay", "migration nonce has already been consumed");
    if (code === "MIGRATION_ID_CONFLICT") return error(409, "migration_id_conflict", "migration id was already used for different content");
    if (code === "DUPLICATE_MIGRATION_ACCOUNT") return error(409, "duplicate_migration_account", "migration contains conflicting account identities");
    if (code === "ACCOUNT_LIMIT_REACHED") return error(409, "account_limit_reached", "migration exceeds this candidate's account limit");
    // Keep candidate diagnostics actionable without ever echoing token/body data.
    // The stable prefix makes the failure visible to the migration client while
    // avoiding a generic upstream 500 that cannot be investigated remotely.
    if (code) return error(500, "migration_internal_error", code.slice(0, 120));
    throw cause;
  }
}

async function serviceRoute(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    if (url.pathname === "/api/plugins") {
      if (request.method !== "GET") return error(405, "method_not_allowed", "GET is required for /api/plugins");
      if (!(await authorizeAPIKey(request, env))) return error(401, "auth_error", "valid API key required");
      return serviceResponse(await pluginService(env));
    }

    if (url.pathname === "/api/conversations" && request.method === "GET") {
      const access = await admin(request, env);
      if (!access.ok) return access.response;
      return serviceResponse(await listCloudConversations(env));
    }
    if (url.pathname === "/api/conversations/delete" && request.method === "POST") {
      const access = await admin(request, env);
      if (!access.ok) return access.response;
      const input = await jsonBody<{ conversation_id?: string }>(request);
      return serviceResponse(await deleteCloudConversation(env, input.conversation_id ?? ""));
    }
    if (url.pathname === "/api/conversations/cleanup" && request.method === "POST") {
      const access = await admin(request, env);
      if (!access.ok) return access.response;
      const input = await jsonBody<{ max_age_days?: number; keep_latest?: number }>(request);
      const maxAgeDays = Number.isFinite(input.max_age_days) ? Math.max(0, Math.min(3_650, Math.trunc(input.max_age_days!))) : 30;
      const keepLatest = Number.isFinite(input.keep_latest) ? Math.max(0, Math.min(500, Math.trunc(input.keep_latest!))) : 20;
      return json(await cleanupCloudConversations(env, maxAgeDays, keepLatest));
    }

    if (url.pathname.startsWith("/v1/memory/")) {
      const write = request.method !== "GET";
      if (write) {
        const access = await admin(request, env);
        if (!access.ok) return access.response;
      } else if (!(await authorizeAPIKey(request, env))) {
        return error(401, "auth_error", "valid API key required");
      }
      if (url.pathname === "/v1/memory/flags" && request.method === "GET") {
        return serviceResponse(await memoryService(env, "flags", "GET"));
      }
      if (url.pathname === "/v1/memory/flags" && request.method === "PATCH") {
        return serviceResponse(await memoryService(env, "flags", "POST", await jsonBody<unknown>(request)));
      }
      if (url.pathname === "/v1/memory/instructions" && request.method === "GET") {
        return serviceResponse(await memoryService(env, "instructions", "GET"));
      }
      if (url.pathname === "/v1/memory/instructions" && request.method === "PUT") {
        return serviceResponse(await memoryService(env, "instructions", "POST", await jsonBody<unknown>(request)));
      }
      if (url.pathname === "/v1/memory/settings" && request.method === "PATCH") {
        return serviceResponse(await memoryService(env, "settings", "PATCH", await jsonBody<unknown>(request)));
      }
      const prefix = "/v1/memory/instructions/";
      if (url.pathname.startsWith(prefix) && request.method === "DELETE") {
        return serviceResponse(await memoryService(env, "instruction", "DELETE", undefined, decodeURIComponent(url.pathname.slice(prefix.length))));
      }
      return error(405, "method_not_allowed", "memory resource does not support this method");
    }
    return error(404, "not_found", "service endpoint not found");
  } catch (cause) {
    return serviceFailure(cause);
  }
}

function mcpTools(): Record<string, unknown>[] {
  return [
    { name: "m365_memory_flags", description: "Read Microsoft 365 personalization flags", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
    { name: "m365_memory_instructions", description: "Read Microsoft 365 custom instructions", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
    { name: "m365_plugins", description: "List Microsoft 365 action plugins", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  ];
}

async function mcpRoute(request: Request, env: Env, url: URL): Promise<Response> {
  if (!(await authorizeAPIKey(request, env))) return error(401, "auth_error", "valid API key required");
  if (url.pathname === "/v1/mcp/tools" && request.method === "GET") return json({ tools: mcpTools() });
  if (url.pathname === "/v1/mcp/sse" && request.method === "GET") {
    return new Response(`event: endpoint\ndata: /v1/mcp/message\n\nevent: tools\ndata: ${JSON.stringify({ tools: mcpTools() })}\n\n`, {
      headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-store" },
    });
  }
  if (url.pathname !== "/v1/mcp/message" || request.method !== "POST") {
    return error(405, "method_not_allowed", "unsupported MCP method");
  }
  const input = await jsonBody<{ jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown }>(request);
  const id = input.id ?? null;
  const method = typeof input.method === "string" ? input.method : "";
  const success = (result: unknown): Response => json({ jsonrpc: "2.0", id, result });
  const failure = (code: number, message: string): Response => json({ jsonrpc: "2.0", id, error: { code, message } });
  if (method === "initialize") return success({ protocolVersion: "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "m365-gateway-complete", version: "0.2.0" } });
  if (method === "ping") return success({});
  if (method === "tools/list") return success({ tools: mcpTools() });
  if (method === "tools/call") {
    const params = isJSONObject(input.params) ? input.params : {};
    const name = typeof params.name === "string" ? params.name : "";
    try {
      const result = name === "m365_plugins"
        ? await pluginService(env)
        : name === "m365_memory_flags"
          ? await memoryService(env, "flags", "GET")
          : name === "m365_memory_instructions"
            ? await memoryService(env, "instructions", "GET")
            : null;
      if (!result) return failure(-32602, "unknown tool");
      if (result.status < 200 || result.status >= 300) return success({ isError: true, content: [{ type: "text", text: "Microsoft 365 rejected the tool request" }] });
      return success({ content: [{ type: "text", text: JSON.stringify(result.data) }] });
    } catch {
      return success({ isError: true, content: [{ type: "text", text: "Microsoft 365 tool is temporarily unavailable" }] });
    }
  }
  return failure(-32601, "method not found");
}

async function sessionRoute(request: Request, env: Env, url: URL): Promise<Response> {
  const authorization = await authorizeAPIKey(request, env);
  if (!authorization) return error(401, "auth_error", "valid API key required");
  const state = tenant(env);
  if (url.pathname === "/v1/sessions" && request.method === "GET") {
    return json({ object: "list", data: await state.listSessions(authorization.id) });
  }
  if (url.pathname === "/v1/sessions" && request.method === "POST") {
    const input = await jsonBody<{ id?: string; model?: string; endpoint?: string }>(request);
    const id = input.id?.trim() || crypto.randomUUID();
    if (id.length > 256 || !/^[A-Za-z0-9_.:@-]+$/u.test(id)) return error(400, "invalid_session_key", "session id contains unsupported characters");
    const objectKey = await chatSessionKey(request, { session_key: id });
    await state.registerSession(authorization.id, id, objectKey, input.endpoint ?? "chat.completions", input.model ?? "");
    const snapshot = await env.CHATS.getByName(objectKey).inspect();
    return json({ id, object: "session", ...snapshot }, 201);
  }
  const prefix = "/v1/sessions/";
  if (!url.pathname.startsWith(prefix)) return error(404, "not_found", "session endpoint not found");
  const id = decodeURIComponent(url.pathname.slice(prefix.length)).trim();
  if (!id || id.length > 256 || !/^[A-Za-z0-9_.:@-]+$/u.test(id)) return error(400, "invalid_session_key", "invalid session id");
  const objectKey = await chatSessionKey(request, { session_key: id });
  const stub = env.CHATS.getByName(objectKey);
  if (request.method === "GET") return json({ id, object: "session", ...(await stub.inspect()) });
  if (request.method === "DELETE") {
    const result = await stub.reset();
    if (result === "busy") return error(409, "conversation_busy", "session currently has an active request");
    await state.deleteSessionRegistration(authorization.id, id);
    return json({ id, deleted: true, status: result });
  }
  return error(405, "method_not_allowed", "unsupported session method");
}

async function openAI(
  request: Request,
  env: Env,
  url: URL,
  metrics: RequestMetricTracker,
): Promise<Response> {
  const authorization = await authorizeAPIKey(request, env);
  if (!authorization) {
    if (url.pathname === "/v1/messages") return anthropicErrorResponse(401, "authentication_error", "valid API key required");
    return error(401, "auth_error", "valid API key required");
  }
  metrics?.setAPIKeyId(authorization.id);
  metrics?.setEndpoint(url.pathname.replace(/^\/v1\//u, "").replaceAll("/", "."));
  const runtime = await tenant(env).runtimeConfiguration();
  applyRuntimeModelConfiguration(runtime.models);
  if (url.pathname === "/v1/models" && request.method === "GET") {
    if (url.searchParams.has("client_version")) {
      return json(codexModelCatalog(url.searchParams.get("client_version") ?? ""));
    }
    return json({ object: "list", data: modelCatalog() });
  }
  if (url.pathname === "/v1/models") return error(405, "method_not_allowed", "GET is required for /v1/models");
  if (url.pathname === "/v1/messages") return anthropicRequest(request, env, openAIRequest, metrics);
  return openAIRequest(request, env, url, metrics);
}

function secure(response: Response, api: boolean): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  if (api) headers.set("Cache-Control", "no-store");
  else headers.set("Content-Security-Policy", "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'; form-action 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request: Request, env: Env, ctx: Pick<ExecutionContext, "waitUntil">): Promise<Response> {
    const url = new URL(request.url);
    const requestId = crypto.randomUUID();
    const startedAt = Date.now();
    // Model discovery is a read-only compatibility probe that Codex,
    // OpenCode and Hermes commonly repeat during startup/reconnect.  It does
    // not represent an inference request, so do not fan each successful
    // catalog read into TenantState metrics.  Authentication failures and
    // method errors still use the normal diagnostic path below.
    const catalogRead = url.pathname === "/v1/models" && request.method === "GET";
    const inferenceRequest = [
      "/v1/chat/completions", "/v1/responses", "/v1/responses/compact", "/v1/messages",
      "/v1/images/generations", "/v1/images/edits", "/v1/images/variations",
    ].includes(url.pathname);
    const metrics = inferenceRequest && !catalogRead ? new RequestMetricTracker({
      requestId,
      startedAt,
      sink: {
        recordRequest: async (input: RequestMetricInput): Promise<void> => {
          const state = tenant(env);
          // Successful terminal metrics are already persisted in TenantState;
          // emitting a console event for every one would consume the Workers
          // Logs free quota twice (invocation + application log). Keep the
          // searchable stream for errors/cancellations only. TenantState keeps
          // exact aggregate counters and a bounded, sampled detail trail.
          if (input.semanticStatus !== "complete" || input.status >= 400) {
            console.warn(JSON.stringify({
              event: "request_terminal",
              request_id: requestId,
              method: request.method,
              path: url.pathname,
              status: input.status,
              semantic_status: input.semanticStatus,
              error_code: input.code ?? "",
              duration_ms: input.durationMs ?? 0,
            }));
          }
          if (shouldRetainRequestObservation(requestId, input)) {
            // Error, cancellation, slow and sampled-success detail remains
            // idempotent and is written sequentially in one TenantState RPC.
            await state.recordRequestWithDiagnostic(input, {
              requestId,
              method: request.method,
              // Only pathname is retained. URL query and fragments never enter
              // terminal metrics or diagnostics.
              path: url.pathname,
              status: input.status,
              durationMs: input.durationMs ?? 0,
              code: `terminal_${input.semanticStatus ?? (input.status >= 400 ? "error" : "complete")}${input.code ? `_${input.code}` : ""}`,
            });
          } else {
            // Ordinary successes update exact global/account aggregates only;
            // do not create metric+diagnostic ring rows for every request.
            await state.recordRequestAggregate(input);
          }
        },
      },
      waitUntil: (promise) => ctx.waitUntil(promise),
      onRecordError: () => console.error(JSON.stringify({ event: "terminal_metric_write_failed" })),
    }) : undefined;
    const finish = (response: Response, api: boolean): Response => {
      const headers = new Headers(response.headers);
      headers.set("X-Request-Id", requestId);
      if (env.CF_VERSION_METADATA?.id) headers.set("X-M365-Worker-Version", env.CF_VERSION_METADATA.id);
      let identified = new Response(response.body, { status: response.status, statusText: response.statusText, headers });
      // Read-only probes and successful management reads do not need an
      // application log line; errors are still logged and retained below.
      if (!metrics && response.status >= 400) {
        console.warn(JSON.stringify({ event: "request", request_id: requestId, method: request.method, path: url.pathname, status: response.status }));
      }
      if (metrics) {
        metrics.setFailureCode(identified.headers.get("X-M365-Error-Code"));
        identified = identified.headers.get("Content-Type")?.toLowerCase().startsWith("text/event-stream")
          ? trackStreamingResponse(identified, metrics)
          : trackBufferedResponse(identified, metrics);
      } else if (api && !(catalogRead && response.ok)
        && !(url.pathname === "/api/health" && request.method === "GET" && response.ok)) {
        // Control-plane routes are fully buffered at this point. Long-running
        // /v1 streams use RequestMetricTracker above and are recorded only at
        // their real complete/error/cancel terminal event.
        const diagnostic = {
          requestId,
          method: request.method,
          path: url.pathname,
          status: response.status,
          durationMs: Date.now() - startedAt,
          code: response.headers.get("X-M365-Error-Code") ?? "",
        };
        const retainDiagnostic = shouldRetainRequestObservation(requestId, {
          status: diagnostic.status,
          semanticStatus: response.ok ? "complete" : "error",
          durationMs: diagnostic.durationMs,
        });
        if (retainDiagnostic) ctx.waitUntil(tenant(env).recordDiagnostic(diagnostic).catch(() => {
          // A diagnostic write must never fail the user request. Keep this
          // fallback constant so storage exceptions cannot disclose secrets.
          console.error(JSON.stringify({ event: "diagnostic_write_failed" }));
        }));
      }
      return secure(identified, api);
    };
    try {
      let response: Response;
      if (url.pathname === "/api/health") response = request.method === "GET"
        ? json({
            status: "ok",
             platform: "cloudflare-native",
             version: env.CF_VERSION_METADATA?.id ?? "local",
             metadataStorage: "durable-object-sqlite",
            credentialStorage: CREDENTIAL_STORAGE_DESCRIPTION,
          })
        : error(405, "method_not_allowed", "GET is required for /api/health");
      else if (url.pathname === ACCOUNT_MIGRATION_PATH) response = await migrationRoute(request, env);
      else if (url.pathname.startsWith("/api/admin/")) response = await adminRoute(request, env, url);
      else if (url.pathname.startsWith("/api/accounts")) response = await accountRoute(request, env, url);
      else if (url.pathname.startsWith("/api/auth/")) response = await oauthRoute(request, env, url);
      else if (url.pathname === "/api/plugins" || url.pathname.startsWith("/api/conversations")) response = await serviceRoute(request, env, url);
      else if (url.pathname.startsWith("/api/")) response = error(404, "not_found", "API endpoint not found");
      else if (url.pathname.startsWith("/v1/memory/")) response = await serviceRoute(request, env, url);
      else if (url.pathname.startsWith("/v1/mcp/")) response = await mcpRoute(request, env, url);
      else if (url.pathname === "/v1/sessions" || url.pathname.startsWith("/v1/sessions/")) response = await sessionRoute(request, env, url);
      else if (url.pathname.startsWith("/v1/")) response = await openAI(request, env, url, metrics!);
      else if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html" || url.pathname === "/login" || url.pathname === "/login.html")) response = await managementPage(request, env, url);
      else response = await env.ASSETS.fetch(request);
      return finish(response, url.pathname.startsWith("/api/") || url.pathname.startsWith("/v1/"));
    } catch (cause) {
      if (cause instanceof Error && cause.message === "REQUEST_TOO_LARGE") {
        return finish(error(413, "request_too_large", "request body exceeds the 1 MiB management API limit"), true);
      }
      if (cause instanceof SyntaxError || (cause instanceof Error && cause.message === "INVALID_JSON")) {
        return finish(error(400, "invalid_json", "request body is not valid JSON"), true);
      }
      // Never log arbitrary exception messages here. Fetch, crypto and OAuth
      // errors may embed URLs, authorization codes or credential material.
      console.error(JSON.stringify({
        event: "request_failed",
        request_id: requestId,
        path: url.pathname,
        error_class: cause instanceof Error ? cause.name : "UnknownError",
      }));
      return finish(error(500, "internal_error", "Cloudflare-native gateway request failed"), true);
    }
  },
} satisfies ExportedHandler<Env>;
