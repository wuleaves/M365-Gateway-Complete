interface ModelSpec {
  id: string;
  owner: string;
  contextWindow: number;
  maxOutputTokens: number;
  reasoning: boolean;
  availability?: "standard" | "tenant_dependent";
  tone?: string;
  reasoningTone?: string;
  catalog?: false;
}

export interface RuntimeModelDefinition {
  id: string;
  tone: string;
  reasoningTone?: string;
  owner?: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  reasoning?: boolean;
}

export interface RuntimeModelConfiguration {
  aliases: Record<string, string>;
  models: RuntimeModelDefinition[];
}

let runtimeModelConfiguration: RuntimeModelConfiguration = { aliases: {}, models: [] };

function modelIdentifier(value: unknown): string {
  if (typeof value !== "string") throw new Error("INVALID_MODEL_CONFIGURATION");
  const id = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/u.test(id)) throw new Error("INVALID_MODEL_CONFIGURATION");
  return id;
}

function upstreamTone(value: unknown): string {
  if (typeof value !== "string") throw new Error("INVALID_MODEL_CONFIGURATION");
  const tone = value.trim();
  if (!/^[A-Za-z][A-Za-z0-9_]{0,127}$/u.test(tone)) throw new Error("INVALID_MODEL_CONFIGURATION");
  return tone;
}

export function normalizeRuntimeModelConfiguration(value: unknown): RuntimeModelConfiguration {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { aliases: {}, models: [] };
  const raw = value as { aliases?: unknown; models?: unknown };
  const aliases: Record<string, string> = {};
  if (raw.aliases !== undefined) {
    if (!raw.aliases || typeof raw.aliases !== "object" || Array.isArray(raw.aliases)) throw new Error("INVALID_MODEL_CONFIGURATION");
    const entries = Object.entries(raw.aliases as Record<string, unknown>);
    if (entries.length > 64) throw new Error("INVALID_MODEL_CONFIGURATION");
    for (const [key, target] of entries) aliases[modelIdentifier(key)] = modelIdentifier(target);
  }
  if (raw.models !== undefined && !Array.isArray(raw.models)) throw new Error("INVALID_MODEL_CONFIGURATION");
  const definitions = (raw.models ?? []) as unknown[];
  if (definitions.length > 32) throw new Error("INVALID_MODEL_CONFIGURATION");
  const seen = new Set<string>();
  const models = definitions.map((item): RuntimeModelDefinition => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("INVALID_MODEL_CONFIGURATION");
    const input = item as Record<string, unknown>;
    const id = modelIdentifier(input.id);
    if (seen.has(id) || MODELS.some((model) => model.id === id)) throw new Error("INVALID_MODEL_CONFIGURATION");
    seen.add(id);
    const contextWindow = input.contextWindow === undefined ? 224_000 : Number(input.contextWindow);
    const maxOutputTokens = input.maxOutputTokens === undefined ? 128_000 : Number(input.maxOutputTokens);
    if (!Number.isInteger(contextWindow) || contextWindow < 16_000 || contextWindow > 2_000_000
      || !Number.isInteger(maxOutputTokens) || maxOutputTokens < 1_024 || maxOutputTokens >= contextWindow) {
      throw new Error("INVALID_MODEL_CONFIGURATION");
    }
    return {
      id,
      tone: upstreamTone(input.tone),
      ...(input.reasoningTone === undefined ? {} : { reasoningTone: upstreamTone(input.reasoningTone) }),
      owner: typeof input.owner === "string" ? input.owner.trim().slice(0, 64) || "microsoft-365" : "microsoft-365",
      contextWindow,
      maxOutputTokens,
      reasoning: input.reasoning !== false,
    };
  });
  const targets = new Set([...MODELS.map((model) => model.id), ...models.map((model) => model.id)]);
  for (const target of Object.values(aliases)) if (!targets.has(target)) throw new Error("INVALID_MODEL_CONFIGURATION");
  return { aliases, models };
}

export function applyRuntimeModelConfiguration(value: unknown): RuntimeModelConfiguration {
  runtimeModelConfiguration = normalizeRuntimeModelConfiguration(value);
  return runtimeModelConfiguration;
}

export function currentRuntimeModelConfiguration(): RuntimeModelConfiguration {
  return structuredClone(runtimeModelConfiguration);
}

function allModels(): ModelSpec[] {
  return [...MODELS, ...runtimeModelConfiguration.models.map((model) => ({
    id: model.id,
    owner: model.owner ?? "microsoft-365",
    contextWindow: model.contextWindow ?? 224_000,
    maxOutputTokens: model.maxOutputTokens ?? 128_000,
    reasoning: model.reasoning !== false,
    availability: "tenant_dependent" as const,
    tone: model.tone,
    reasoningTone: model.reasoningTone,
  }))];
}

const MODELS: ModelSpec[] = [
  { id: "m365-image", owner: "microsoft-365", contextWindow: 32_000, maxOutputTokens: 4_096, reasoning: false, availability: "tenant_dependent", tone: "Magic", catalog: false },
  // These GPT-5 routes are present in the Go gateway's maintained catalog.
  // They remain tenant-dependent until a live tenant successfully answers.
  { id: "gpt-5.2", owner: "microsoft-365", contextWindow: 224_000, maxOutputTokens: 128_000, reasoning: true, availability: "tenant_dependent" },
  { id: "gpt-5.2-reasoning", owner: "microsoft-365", contextWindow: 224_000, maxOutputTokens: 128_000, reasoning: true, availability: "tenant_dependent" },
  { id: "gpt-5.3", owner: "microsoft-365", contextWindow: 224_000, maxOutputTokens: 128_000, reasoning: true, availability: "tenant_dependent" },
  { id: "gpt-5.3-reasoning", owner: "microsoft-365", contextWindow: 224_000, maxOutputTokens: 128_000, reasoning: true, availability: "tenant_dependent", catalog: false },
  { id: "gpt-5.4", owner: "microsoft-365", contextWindow: 224_000, maxOutputTokens: 128_000, reasoning: true, availability: "tenant_dependent" },
  { id: "gpt-5.4-reasoning", owner: "microsoft-365", contextWindow: 224_000, maxOutputTokens: 128_000, reasoning: true, availability: "tenant_dependent" },
  { id: "gpt-5.5", owner: "microsoft-365", contextWindow: 224_000, maxOutputTokens: 128_000, reasoning: true },
  { id: "gpt-5.5-reasoning", owner: "microsoft-365", contextWindow: 224_000, maxOutputTokens: 128_000, reasoning: true },
  { id: "gpt-5.6-sol", owner: "microsoft-365", contextWindow: 224_000, maxOutputTokens: 128_000, reasoning: true, catalog: false },
  { id: "gpt-5.6-terra", owner: "microsoft-365", contextWindow: 224_000, maxOutputTokens: 128_000, reasoning: true, availability: "tenant_dependent", catalog: false },
  { id: "gpt-5.6-luna", owner: "microsoft-365", contextWindow: 224_000, maxOutputTokens: 128_000, reasoning: true, availability: "tenant_dependent", catalog: false },
  { id: "gpt-5.6-reasoning", owner: "microsoft-365", contextWindow: 224_000, maxOutputTokens: 128_000, reasoning: true },
  // CF2 accepted this exact ChatHub tone and rejected a deliberately invalid
  // control tone. Microsoft still does not expose a resolved weight/version
  // in the response, so availability remains tenant-dependent.
  { id: "gpt-6-astra", owner: "microsoft-365", contextWindow: 224_000, maxOutputTokens: 128_000, reasoning: true, availability: "tenant_dependent", catalog: false },
  { id: "flux-3", owner: "microsoft-365", contextWindow: 32_000, maxOutputTokens: 4_096, reasoning: false, availability: "tenant_dependent", tone: "Magic" },
  { id: "flux-4", owner: "microsoft-365", contextWindow: 32_000, maxOutputTokens: 4_096, reasoning: false, availability: "tenant_dependent", tone: "Magic" },
  { id: "claude-sonnet", owner: "anthropic-via-microsoft-365", contextWindow: 200_000, maxOutputTokens: 64_000, reasoning: true },
  { id: "claude-sonnet-reasoning", owner: "anthropic-via-microsoft-365", contextWindow: 200_000, maxOutputTokens: 64_000, reasoning: true },
];

// Codex counts the complete client-visible history, while this gateway sends
// only the active turn into a persisted Microsoft conversation. Keep the
// advertised context minus output reserve equal to the gateway's verified 96k
// active-prompt budget so clients compact before a single turn is too large to
// summarize safely.
export const CODEX_AUTO_COMPACT_TOKEN_LIMIT = 90_000;

const ALIASES: Record<string, string> = {
  "gpt-5.6": "gpt-5.6-sol",
  "m365-copilot": "gpt-5.6-sol",
  "gpt-5.5-think-deeper": "gpt-5.5-reasoning",
  "gpt-5.6-think-deeper": "gpt-5.6-reasoning",
  "gpt-5.6-terra-think-deeper": "gpt-5.6-terra",
  "gpt-5.6-luna-think-deeper": "gpt-5.6-luna",
  claude: "claude-sonnet",
  "claude-sonnet-5": "claude-sonnet",
};

// `gpt-5.6-sol` is also used as the gateway's default model.  An omitted
// reasoning_effort must therefore stay on the low-latency conversational tone;
// otherwise every ordinary request pays the deep/Think startup cost before its
// first token.  Callers that need deeper reasoning can opt in with
// reasoning_effort=medium/high or use the explicit `gpt-5.6-reasoning` id.
const SOL_FAST_EFFORTS = new Set(["none", "minimal", "low"]);

export function canonicalModel(value: unknown): string {
  // The request interfaces are compile-time only.  Keep the optional/missing
  // case compatible with the documented default, but reject a non-string
  // supplied value deterministically as an unsupported model instead of
  // throwing `trim is not a function` and surfacing an opaque 5xx.
  if (value !== undefined && value !== null && typeof value !== "string") throw new Error("UNSUPPORTED_MODEL");
  const normalized = typeof value === "string" ? value.trim() : "";
  const requested = (normalized || "gpt-5.6-sol").toLowerCase();
  const canonical = runtimeModelConfiguration.aliases[requested] ?? ALIASES[requested] ?? requested;
  if (!allModels().some((model) => model.id === canonical)) throw new Error("UNSUPPORTED_MODEL");
  return canonical;
}

export function modelTone(model: string, effort: unknown = ""): string {
  // Request bodies are untrusted JSON and can bypass the TypeScript shape at
  // runtime.  Treat a malformed/omitted effort as the model's documented
  // default instead of throwing `trim is not a function` before ChatHub is
  // reached (which used to surface as an opaque 500/502).
  const normalizedEffort = typeof effort === "string" ? effort.trim().toLowerCase() : "";
  const wantsReasoning = !["none", "minimal", "low"].includes(normalizedEffort) && normalizedEffort !== "";
  const runtime = allModels().find((candidate) => candidate.id === model && candidate.tone);
  if (runtime?.tone) return wantsReasoning && runtime.reasoningTone ? runtime.reasoningTone : runtime.tone;
  switch (model) {
    case "gpt-5.2": return wantsReasoning ? "Gpt_5_2_Reasoning" : "Gpt_5_2_Chat";
    case "gpt-5.2-reasoning": return "Gpt_5_2_Reasoning";
    case "gpt-5.3": return wantsReasoning ? "Gpt_5_3_Reasoning" : "Gpt_5_3_Chat";
    case "gpt-5.3-reasoning": return "Gpt_5_3_Reasoning";
    case "gpt-5.4": return wantsReasoning ? "Gpt_5_4_Reasoning" : "Gpt_5_4_Chat";
    case "gpt-5.4-reasoning": return "Gpt_5_4_Reasoning";
    case "gpt-5.5": return wantsReasoning ? "Gpt_5_5_Reasoning" : "Gpt_5_5_Chat";
    case "gpt-5.5-reasoning": return "Gpt_5_5_Reasoning";
    case "gpt-5.6-sol": return normalizedEffort === "" || SOL_FAST_EFFORTS.has(normalizedEffort)
      ? "Gpt_5_6_Chat"
      : "Gpt_5_6_Reasoning";
    case "gpt-5.6-reasoning": return "Gpt_5_6_Reasoning";
    case "gpt-5.6-terra": return "Gpt_5_6_Reasoning";
    case "gpt-5.6-luna": return "Gpt_5_6_Reasoning";
    case "gpt-6-astra": return "Gpt_6_Astra";
    case "claude-sonnet": return wantsReasoning ? "Claude_Sonnet_Reasoning" : "Claude_Sonnet";
    case "claude-sonnet-reasoning": return "Claude_Sonnet_Reasoning";
    default: throw new Error("UNSUPPORTED_MODEL");
  }
}

// ChatHub receives UTF-16 strings, while advertised model limits are tokens.
// Keep a conservative character ceiling so large client histories cannot make
// a Worker allocate the entire request several times during prompt assembly.
export function modelPromptCharacterLimit(model: string): number {
  const spec = allModels().find((candidate) => candidate.id === model);
  if (!spec) throw new Error("UNSUPPORTED_MODEL");
  const usableTokens = spec.contextWindow - spec.maxOutputTokens;
  return Math.min(3_000_000, Math.max(64_000, Math.floor(usableTokens * 3)));
}

export function modelMaxInputTokens(model: string): number {
  const spec = allModels().find((candidate) => candidate.id === model);
  if (!spec) throw new Error("UNSUPPORTED_MODEL");
  return spec.contextWindow - spec.maxOutputTokens;
}

/**
 * Conservative prompt estimate for the gateway's dominant input classes:
 * Latin/code averages roughly four characters per token, while CJK and other
 * non-ASCII code points are charged one token each. Protocol envelopes supply
 * additional slack, so whitespace itself is ignored here.
 */
export function estimatePromptTokens(value: string): number {
  const counts = countPromptTokenClasses(value);
  return Math.ceil(counts.asciiWordCharacters / 4)
    + Math.ceil(counts.asciiSyntaxCharacters / 2)
    + counts.nonAsciiCharacters
    + counts.emojiCharacters * 2;
}

export interface PromptTokenClassCounts {
  asciiWordCharacters: number;
  asciiSyntaxCharacters: number;
  nonAsciiCharacters: number;
  emojiCharacters: number;
}

function isPromptWhitespace(codePoint: number): boolean {
  return (codePoint >= 0x09 && codePoint <= 0x0d)
    || codePoint === 0x20
    || codePoint === 0x85
    || codePoint === 0xa0
    || codePoint === 0x1680
    || (codePoint >= 0x2000 && codePoint <= 0x200a)
    || codePoint === 0x2028
    || codePoint === 0x2029
    || codePoint === 0x202f
    || codePoint === 0x205f
    || codePoint === 0x3000
    || codePoint === 0xfeff;
}

// This covers the emoji and pictographic blocks used in prompts without a
// Unicode property-regexp test for every character in a streamed response.
function isPromptEmoji(codePoint: number): boolean {
  return (codePoint >= 0x1f000 && codePoint <= 0x1faff)
    || (codePoint >= 0x1fc00 && codePoint <= 0x1fffd)
    || (codePoint >= 0x2300 && codePoint <= 0x23ff)
    || (codePoint >= 0x2600 && codePoint <= 0x27bf)
    || (codePoint >= 0x2b00 && codePoint <= 0x2bff);
}

export function countPromptTokenClasses(value: string): PromptTokenClassCounts {
  const counts: PromptTokenClassCounts = {
    asciiWordCharacters: 0,
    asciiSyntaxCharacters: 0,
    nonAsciiCharacters: 0,
    emojiCharacters: 0,
  };
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (isPromptWhitespace(codePoint)) continue;
    if (codePoint <= 0x7f) {
      if ((codePoint >= 0x30 && codePoint <= 0x39)
        || (codePoint >= 0x41 && codePoint <= 0x5a)
        || (codePoint >= 0x61 && codePoint <= 0x7a)
        || codePoint === 0x5f) counts.asciiWordCharacters += 1;
      else counts.asciiSyntaxCharacters += 1;
    } else if (isPromptEmoji(codePoint)) counts.emojiCharacters += 1;
    else counts.nonAsciiCharacters += 1;
  }
  return counts;
}

function reasoningSelection(model: ModelSpec): Record<string, unknown> {
  const efforts = ["low", "medium", "high", "xhigh", "max"];
  if (model.id === "gpt-5.6-sol" || model.id === "gpt-6-astra") efforts.push("ultra");
  return {
    default_reasoning_level: model.id === "gpt-5.6-sol" ? "low" : "medium",
    supported_reasoning_levels: efforts.map((effort) => ({ effort, description: `${effort} reasoning` })),
  };
}

// Both routes returned a real Microsoft public summary in serial CF2 probes.
// This does not promise a summary on every answer or expose hidden reasoning.
function hasVerifiedPublicSummary(model: ModelSpec): boolean {
  return model.id === "gpt-5.6-sol" || model.id === "gpt-5.6-reasoning";
}

/** Instructions returned in the Codex model manifest.  Keep shell selection
 * explicit here because this is the one contract the CLI receives before it
 * emits its first local command.  The gateway must preserve command bytes; it
 * can only tell the model how to choose a compatible shell. */
export const CODEX_BASE_INSTRUCTIONS = [
  "You are Codex. Use the caller-provided tools and their live schemas to inspect, change, and verify the caller's workspace.",
  "Local patch/diff helpers are disabled: use direct bounded writes or exec_command and verify the result.",
  "Batch independent read-only checks and validations in one caller-runtime round when their outputs are not prerequisites for each other.",
  "When several files form one coherent change and a declared execution tool can update them safely, group those writes into one call and use one authoritative verifier instead of spending a model turn on every redundant read-back.",
  "Choose actions from the current request and returned evidence; do not simulate results, invent a workflow, or substitute a hosted shell for the caller's environment.",
  "SHELL DISCIPLINE: Treat the caller's declared shell/shell_type and the most recent successful tool result as authoritative. Preserve every command, path, text, and shell argument as opaque bytes; the gateway does not translate Bash, PowerShell, cmd.exe, or a remote SSH command for you.",
  "When the caller is Windows PowerShell, use PowerShell-native commands such as Get-ChildItem, Get-Content, Test-Path, Set-Content and semicolon sequencing; do not send POSIX find/grep/pwd, Bash &&, or <<EOF heredocs to it. When the caller is Bash/WSL, use POSIX syntax and do not send PowerShell cmdlets.",
  "If the shell is not known, run one short read-only identity/working-directory check with the declared local tool and then reuse the reported shell; do not guess from a path alone. For Code Mode JavaScript, do not nest a shell heredoc or powershell -Command quoting layer inside the JavaScript source; use a short direct command or a bounded script file.",
  "After a parser or command-not-found failure, choose a materially different command in the reported shell and keep the failed command only as evidence; never repeat it unchanged or silently rewrite it in transit.",
  "Do not report a build or deployment as successful without structured exit-code or verifier evidence.",
].join(" ");

export function modelCatalog(): Record<string, unknown>[] {
  return allModels().filter((model) => model.catalog !== false).map((model) => ({
    id: model.id,
    object: "model",
    owned_by: model.owner,
    context_window: model.contextWindow,
    max_input_tokens: model.contextWindow - model.maxOutputTokens,
    max_output_tokens: model.maxOutputTokens,
    ...reasoningSelection(model),
    // Extension metadata; clients may still require their own model config.
    // Accepted effort names select two observed routes, not six verified
    // upstream compute budgets. Do not advertise synthetic reasoning text.
    x_m365_reasoning: { control: "tone_selection", summaries: hasVerifiedPublicSummary(model),
      ...(hasVerifiedPublicSummary(model) ? { summary_delivery: "end_of_turn", public_only: true } : {}) },
    ...(model.availability ? { x_m365_availability: model.availability } : {}),
    capabilities: {
      chat_completions: model.tone !== "Magic",
      responses: model.tone !== "Magic",
      streaming: model.tone !== "Magic",
      tools: model.tone !== "Magic",
      reasoning: model.reasoning,
      vision: model.tone === "Magic",
      image_generation: model.tone === "Magic",
      audio: false,
      modalities: model.tone === "Magic" ? ["text", "image"] : ["text"],
    },
  }));
}

/** Codex CLI uses its own model-capability manifest when it requests
 * `/models?client_version=...`.  Returning only the standard OpenAI `data`
 * list makes the CLI fall back to metadata with shell execution disabled, so
 * it silently omits exec_command/write_stdin from subsequent Responses calls.
 */
export function codexModelCatalog(clientVersion = ""): { models: Record<string, unknown>[] } {
  // Responses Lite is restricted to OpenAI-supported model identifiers.
  // Advertising it for M365 Gateway models makes current Codex CLI versions
  // send X-OpenAI-Internal-Codex-Responses-Lite and reject the model locally.
  const responsesLite = false;
  return {
    models: allModels().filter((model) => model.catalog !== false && model.tone !== "Magic").map((model, index) => {
      return {
      slug: model.id,
      display_name: model.id,
      description: "M365 Gateway model for Codex CLI",
      // Sol is the low-latency route. Keep deeper reasoning opt-in so a long
      // tool task does not pay the reasoning startup cost on every ordinary
      // continuation. Explicit per-task medium/high/max values still flow
      // through unchanged, and the reasoning model remains available.
      ...reasoningSelection(model),
      // Declare the verified routes without overriding unverified models'
      // existing client defaults. Explicit client summary=none is respected.
      ...(hasVerifiedPublicSummary(model) ? { default_reasoning_summary: "auto" } : {}),
      shell_type: "unified_exec",
      visibility: "list",
      supported_in_api: true,
      priority: index + 1,
      availability_nux: null,
      upgrade: null,
      include_skills_usage_instructions: false,
      include_plugin_usage_instructions: false,
      include_apps_usage_instructions: false,
      support_verbosity: true,
      default_verbosity: "low",
      truncation_policy: { mode: "tokens", limit: 10_000 },
      supports_image_detail_original: false,
      ...(model.availability ? { x_m365_availability: model.availability } : {}),
      context_window: model.contextWindow,
      max_context_window: model.contextWindow,
      auto_compact_token_limit: Math.min(CODEX_AUTO_COMPACT_TOKEN_LIMIT, Math.floor(model.contextWindow * 0.9)),
      experimental_supported_tools: [],
      input_modalities: ["text"],
      supports_search_tool: false,
      // Codex 0.152+ carries its live caller contract in
      // input[].additional_tools. Older clients retain the direct path.
      use_responses_lite: responsesLite,
      node_repl_auto_review_required: false,
      node_repl_disabled: false,
      tool_mode: responsesLite ? "code_mode_only" : "direct",
       base_instructions: CODEX_BASE_INSTRUCTIONS,
      };
    }),
  };
}
