(() => {
  "use strict";
  const dictionary = {
  "M365 Gateway 运维控制台 · 天体动态光影玻璃中控": "M365 Gateway Operations Console",
  "系统核心监控": "System monitoring",
  "全景仪表盘": "Dashboard",
  "微软账号池": "Microsoft accounts",
  "API 密钥管理": "API keys",
  "链路能力与诊断": "Capabilities and diagnostics",
  "模型与能力矩阵": "Models and capabilities",
  "诊断记录": "Diagnostics",
  "系统架构与设置": "Architecture and settings",
  "登出": "Sign out",
  "监控全景仪表盘": "Operations dashboard",
  "DURABLE OBJECTS 集群": "DURABLE OBJECTS cluster",
  "正在同步本地时间...": "Synchronizing local time...",
  "同步状态": "Refresh data",
  "添加微软账号": "Add Microsoft account",
  "Cloudflare Edge 原生智能网关运行就绪": "Cloudflare Edge gateway ready",
  "PROD 生产环境": "PROD production",
  "采用 Durable Objects SQLite 保存权威状态，支持微软多账号有序调度、Token 智能续期与协议适配转换。": "Durable Objects SQLite stores authoritative state, with ordered Microsoft account routing, automatic token renewal and protocol adaptation.",
  "查看全部账号池 →": "View all accounts →",
  "累计请求处理": "Total requests",
  "100% 成功": "100% success",
  "(异常:": "(Errors:",
  "Token 吞吐计量": "Token usage",
  "入:": "In:",
  "• 出:": "• Out:",
  "微软账号池容量": "Account pool capacity",
  "在线: 0 • 冷却: 0": "Online: 0 • Cooling: 0",
  "状态权威架构": "Authoritative state",
  "强一致性存储": "Strongly consistent storage",
  "凭据密封安全": "Credential security",
  "强一致密文 + 加密 KV 镜像": "Authoritative ciphertext + encrypted KV mirror",
  "最近上游活跃": "Last upstream activity",
  "无调用记录": "No requests yet",
  "来自持久化请求统计": "From persistent request statistics",
  "当前承载主账号透视": "Active account overview",
  "载入账号池状态中...": "Loading account pool...",
  "出口:": "Egress:",
  "状态:": "State:",
  "Token 剩余": "Token remaining",
  "主账号承载请求": "Active account requests",
  "异常拦截": "Errors",
  "自动续期时刻": "Automatic renewal",
  "网关吞吐轨迹示意 (Traffic Pulse)": "Traffic pulse illustration",
  "• 图形仅作界面示意，并非实时或历史监控数据": "• Illustration only; this is not live or historical monitoring data",
  "实际状态请以上方持久化累计指标为准": "Refer to the persistent counters above for actual traffic",
  "主力后端模型与能力速查": "Model and capability quick reference",
  "查看全部 →": "View all →",
  "已就绪": "Ready",
  "224K Context • 租户相关可用性": "224K Context • Tenant-dependent availability",
  "推理优化": "Reasoning route",
  "最新请求诊断记录": "Recent request diagnostics",
  "全部日志 →": "All diagnostics →",
  "正在载入诊断记录...": "Loading diagnostics...",
  "微软账号池集群管理": "Microsoft account pool",
  "网关支持智能轮换。当上游遭遇 429 限流时，自动触发指数退避并在多账号间平滑切换。": "The gateway uses ordered failover. Upstream rate limits trigger exponential backoff and a switch to the next eligible account.",
  "添加微软账号 (OAuth)": "Add Microsoft account (OAuth)",
  "调度角色": "Routing role",
  "微软账号 (Email)": "Microsoft account (Email)",
  "显示名称": "Display name",
  "出口链路": "Egress",
  "Token 凭据状态": "Token state",
  "请求 / 错误": "Requests / Errors",
  "Token 吞吐量": "Tokens",
  "快捷操作": "Actions",
  "载入账号数据中...": "Loading accounts...",
  "客户端 API Key 全生命周期管理": "Client API key management",
  "外部应用调用": "External clients",
  "必须携带创建后仅展示一次的": "must send the key shown only once after creation:",
  "创建新 API Key": "Create API key",
  "状态": "Status",
  "密钥名称": "Key name",
  "脱敏前缀": "Masked prefix",
  "有效期限": "Expires",
  "创建时刻": "Created",
  "最近使用": "Last used",
  "管理操作": "Actions",
  "载入密钥列表中...": "Loading API keys...",
  "Copilot 代理支持模型全景矩阵": "Copilot gateway model capabilities",
  "模型 ID": "Model ID",
  "开发者 / 架构": "Provider / Architecture",
  "上下文窗口": "Context window",
  "视觉能力 (Vision)": "Vision",
  "函数调用 (Tools)": "Tools",
  "流式传输 (SSE)": "Streaming (SSE)",
  "协议转换支持": "Protocol compatibility",
  "224K / 输入 96K": "224K / Input 96K",
  "未开放": "Unavailable",
  "支持": "Supported",
  "推理路由；公开摘要按上游实际返回": "Reasoning route; public summaries depend on upstream output",
  "租户相关可用性": "Tenant-dependent availability",
  "标准与推理模式": "Standard and reasoning modes",
  "200K / 输入 136K": "200K / Input 136K",
  "OpenAI 与 Anthropic Messages 兼容端点": "OpenAI and Anthropic Messages compatible endpoints",
  "系统请求诊断记录": "Request diagnostics",
  "最多保留 200 条有界、脱敏的请求终态快照；本页不是实时日志，请手动刷新。": "Up to 200 bounded, redacted request outcomes. Refresh manually; this is not a live log.",
  "刷新日志流": "Refresh diagnostics",
  "时间戳 (UTC)": "Timestamp (UTC)",
  "等级": "Level",
  "HTTP 方法": "HTTP method",
  "路径 / 状态": "Path / Status",
  "诊断码 / 耗时": "Diagnostic code / Duration",
  "载入日志中...": "Loading diagnostics...",
  "Cloudflare 原生架构属性": "Cloudflare architecture",
  "计算架构": "Compute",
  "元数据权威存储": "Authoritative metadata storage",
  "DO SQLite (零外部网络开销)": "DO SQLite (no external storage service)",
  "凭据密封加密": "Credential encryption",
  "Durable Object 强一致密文权威副本 + AES-GCM KV 镜像": "Authoritative Durable Object ciphertext + AES-GCM KV mirror",
  "账号容量配额": "Account limit",
  "管理鉴权保持": "Admin session",
  "24 小时 (HttpOnly Cookie)": "24 hours (HttpOnly Cookie)",
  "运维敏感操作": "Administrative actions",
  "更新管理员口令": "Update administrator password",
  "修改后台登录凭据。更新后需使用新口令重新鉴权。": "Change the console password. Sign in again with the new password afterwards.",
  "修改管理员密码": "Change admin password",
  "重置全局统计指标": "Reset request statistics",
  "将累计请求数、异常拦截数及 Token 消耗计数归零（不会清除账号或密钥配置）。": "Reset requests, errors and token counters. Account and API key configuration is retained.",
  "立即清空统计计数": "Reset statistics",
  "接入微软账号 (OAuth PKCE 向导)": "Add Microsoft account (OAuth PKCE)",
  "初始化授权请求": "Start authorization",
  "点击下方按钮，系统将生成符合 S256 Code Challenge 标准的链接并在新窗口中打开微软授权页面：": "Generate an S256 Code Challenge link and open Microsoft authorization in a new window:",
  "在新窗口打开微软登录授权页 →": "Open Microsoft authorization →",
  "登录并复制重定向 URL": "Sign in and copy the redirect URL",
  "在微软页面登录有权限的 Copilot 账号。授权后请完整复制包含": "Sign in with an eligible Copilot account. Copy the complete redirect address containing",
  "与": "and",
  "的地址；不支持不带字段名的裸授权码。": ". A bare authorization code without field names is unsupported.",
  "粘贴回调并自动换取 Token": "Paste callback URL to exchange tokens",
  "取消": "Cancel",
  "确认解析并激活": "Confirm and activate",
  "生成新 API 密钥": "Create API key",
  "密钥别名 (用于区分客户端)": "Key name (identify the client)",
  "永久不过期 (0 天)": "Never expires (0 days)",
  "30 天": "30 days",
  "90 天 (推荐生产周期)": "90 days (recommended)",
  "180 天": "180 days",
  "365 天": "365 days",
  "确认生成": "Create",
  "API 密钥创建成功": "API key created",
  "这是该密钥": "This is the key's",
  "唯一一次完整展示": "only full display",
  "。系统仅在数据库中保存其 SHA-256 哈希，关闭窗口后无法再次找回，请妥善保存。": ". Only its SHA-256 hash is stored. Save the key now; it cannot be recovered after closing this window.",
  "复制": "Copy",
  "我已保存妥当": "I have saved the key",
  "当前口令": "Current password",
  "新口令 (至少 8 位)": "New password (at least 8 characters)",
  "确认新口令": "Confirm new password",
  "更新密码": "Update password",
  "按设备本地真实时间运行；日出/日落边界为 06:00/18:00": "Uses actual device time; sunrise/sunset boundaries are 06:00/18:00",
  "关闭 OAuth 向导": "Close OAuth wizard",
  "粘贴 https://login.microsoftonline.com/... 链接": "Paste the https://login.microsoftonline.com/... URL",
  "关闭 API Key 创建窗口": "Close API key dialog",
  "例如: codex-dev 或 production-agent": "For example: codex-dev or production-agent",
  "关闭修改密码窗口": "Close password dialog",
  "请输入现有密码": "Enter current password",
  "输入新密码": "Enter new password",
  "再次输入新密码": "Enter new password again",
  "晨光": "Dawn",
  "暮光": "Dusk",
  "日照": "Daylight",
  "月升": "Moonrise",
  "月落": "Moonset",
  "夜月": "Moonlight",
  "微软账号池调度": "Microsoft account routing",
  "API 密钥生命周期": "API key lifecycle",
  "模型与协议能力": "Models and protocols",
  "请求诊断记录": "Request diagnostics",
  "架构与安全设置": "Architecture and security",
  "运维中控台": "Operations console",
  "无最近调用": "No recent requests",
  "刷新就绪": "Ready to refresh",
  "拉取数据失败": "Failed to load data",
  "未知账户": "Unknown account",
  "就绪": "Ready",
  "未配置活动主账号": "No active account configured",
  "请点击右上角添加": "Use Add account in the upper right",
  "暂未配置微软账号，点击上方添加。": "No Microsoft accounts configured. Add one above.",
  "正常": "Healthy",
  "主力服务中": "Active",
  "429 冷却中": "429 cooldown",
  "已隔离": "Isolated",
  "有效": "Valid",
  "未知": "Unknown",
  "待命账号无需手动刷新": "Standby accounts do not need manual refresh",
  "请使用同一个微软账号重新完成授权": "Authorize the same Microsoft account again",
  "只有当前主力账号可以手动刷新令牌": "Only the active account can be refreshed manually",
  "微软授权已失效，请重新授权该账号": "Microsoft authorization expired. Authorize this account again.",
  "微软暂时限制了令牌刷新，请稍后重试": "Microsoft rate-limited token refresh. Retry later.",
  "微软令牌服务暂时不可用，请稍后重试": "Microsoft token service is unavailable. Retry later.",
  "账号加密凭据不可用，请重新授权该账号": "Encrypted account credentials are unavailable. Authorize again.",
  "微软凭据已刷新成功！": "Microsoft credentials refreshed.",
  "确认彻底移除该微软账号？": "Remove this Microsoft account permanently?",
  "删除失败": "Failed to delete",
  "账号已安全移除": "Account removed",
  "拉取密钥失败": "Failed to load API keys",
  "暂未创建 API 密钥": "No API keys created yet",
  "已撤销": "Revoked",
  "生效中": "Active",
  "无名称": "Unnamed",
  "永久": "Never",
  "从未使用": "Never used",
  "撤销后使用此密钥的客户端将立即失效，确认撤销？": "Revoking this key immediately disables its clients. Revoke it?",
  "撤销失败": "Failed to revoke",
  "密钥已撤销": "API key revoked",
  "暂无诊断记录": "No diagnostics yet",
  "无法初始化授权流程": "Could not start authorization",
  "授权服务未返回登录地址": "Authorization service did not return a sign-in URL",
  "已在新窗口打开微软登录页面，授权后请复制地址栏 URL 粘贴至第三步": "Microsoft sign-in opened in a new window. After authorization, paste the redirect URL in step 3.",
  "请粘贴重定向后的完整 URL": "Paste the complete redirect URL",
  "请先点击第一步初始化授权": "Start authorization in step 1 first",
  "兑换 Token 失败": "Token exchange failed",
  "微软账号接入成功！已接入调度池": "Microsoft account added to the pool.",
  "请选择有效期限": "Select an expiration period",
  "创建密钥失败": "Failed to create API key",
  "密钥已复制到剪贴板！": "API key copied to clipboard.",
  "请完整填写表单": "Complete all fields",
  "新密码长度需至少 8 位": "New password must contain at least 8 characters",
  "两次输入的新密码不一致": "New passwords do not match",
  "密码修改失败": "Failed to change password",
  "密码已成功更新！请重新登录": "Password updated. Sign in again.",
  "确认将全部请求与 Token 统计归零？此操作不可逆。": "Reset all request and token counters? This cannot be undone.",
  "重置失败": "Failed to reset",
  "统计指标已清空": "Statistics reset",
  "账号和诊断数据已同步": "Account and diagnostic data refreshed",
  "日志流已更新": "Diagnostics refreshed",
  "M365 Gateway 管理登录 · 日月微晶控制台": "M365 Gateway Admin Sign-in",
  "运维控制台": "Operations console",
  "已连线": "Connected",
  "管理员口令 (ADMIN_PASSWORD)": "Administrator password (ADMIN_PASSWORD)",
  "验证登录": "Sign in",
  "Cloudflare Edge 原生驱动 • 随机初始密码仅在部署终端显示一次": "Powered by Cloudflare Edge • A generated initial password is shown only once in the deployment terminal",
  "首次登录安全改密": "Change initial password",
  "系统检测到您当前使用的是初始配置口令。为了保障网关凭据与多租户账号池安全，请设置高强度新密码（至少 8 位）。": "You are using the initial password. Set a strong new password (at least 8 characters) to protect gateway credentials and accounts.",
  "新管理员密码": "New admin password",
  "确认新密码": "Confirm new password",
  "更新密码并进入控制台": "Update password and continue",
  "纯白太阳 · 点击一直切换": "Sun theme · Click to toggle",
  "玄黑夜月 · 点击一直切换": "Moon theme · Click to toggle",
  "请输入管理员密码": "Enter administrator password",
  "切换密码明文": "Show or hide password",
  "至少 8 位新密码": "New password, at least 8 characters",
  "请再次输入新密码": "Enter new password again",
  "请输入当前初始密码以继续完成首次改密": "Enter the initial password to finish changing it",
  "正在验证...": "Verifying...",
  "密码尝试过于频繁，IP已被锁定，请稍后重试": "Too many password attempts. This IP is temporarily locked. Retry later.",
  "管理员口令错误，请核对后重试": "Incorrect administrator password. Try again.",
  "验证通过，正在进入控制台...": "Verified. Opening the console...",
  "网络连接异常，请检查网关状态后重试": "Network error. Check the gateway and retry.",
  "新密码长度至少需要 8 个字符": "New password must contain at least 8 characters",
  "两次输入的新密码不一致，请核对": "New passwords do not match. Check and retry.",
  "改密失败，请重试": "Could not change password. Try again.",
  "密码已更新！请使用新密码重新登录": "Password updated. Sign in with the new password.",
  "密码已修改，请输入新密码登录系统": "Password changed. Enter the new password to sign in.",
  "改密请求失败，请稍后重试": "Password update failed. Retry later.",
  "M365 Gateway · 诊断记录": "M365 Gateway · Diagnostics",
  "诊断记录已合并到管理后台": "Diagnostics moved to the console",
  "旧调试页曾尝试展示服务端不会返回的原始请求与敏感上游内容。现已统一迁移至控制台内部有界、脱敏的请求终态诊断记录中。": "The old debug page attempted to display raw requests and sensitive upstream content that the server does not expose. Use the bounded, redacted request outcome diagnostics in the console.",
  "前往新版控制台 →": "Open the console →",
  "模型测试": "Model test",
  "会话管理": "Sessions",
  "网关请求趋势": "Request trends",
  "24 小时": "24 hours",
  "7 天": "7 days",
  "正在读取趋势数据…": "Loading request trends…",
  "统计从升级后开始，按所选时区显示": "Recorded since upgrade, in the selected time zone",
  "正在读取会话复用统计…": "Loading session reuse statistics…",
  "创建 API 密钥": "Create API key",
  "查看会话": "View sessions",
  "查看近期请求": "View recent requests",
  "图片生成 • 租户相关可用性": "Image generation • Tenant-dependent availability",
  "图片模型": "Image model",
  "模型最小请求测试": "Minimal model request test",
  "沿用 Go 版“逐模型探测”的思路。API Key 只在当前浏览器内存中使用，不会提交到管理接口或写入 Worker。": "Probe each model individually. The API key stays in this browser's memory and is not sent to management APIs or stored in the Worker.",
  "临时 API Key": "Temporary API key",
  "模型": "Model",
  "读取模型目录中…": "Loading model catalog…",
  "发送测试": "Run test",
  "尚未执行测试。": "No test run yet.",
  "显示已登记的显式会话；临时会话不在列表中。": "Registered explicit sessions are listed here. Temporary sessions are excluded.",
  "刷新": "Refresh",
  "会话 ID": "Session ID",
  "端点 / 模型": "Endpoint / Model",
  "消息数": "Messages",
  "操作": "Actions",
  "正在读取会话…": "Loading sessions…",
  "重置会话会清除本地续接状态；正在处理请求的会话不可重置。Cloudflare 不提供全部 Durable Object 的全局枚举。": "Reset clears local continuation state. Active sessions cannot be reset. Cloudflare cannot enumerate every Durable Object.",
  "出口链路管理": "Egress management",
  "参考 Go 版代理池的健康检查与故障隔离思路，但 Cloudflare 版只允许直连或固定 Microsoft ChatHub Relay，不接受任意 HTTP / HTTPS / SOCKS5 地址。": "Cloudflare supports direct egress and fixed Microsoft ChatHub relays only. Arbitrary HTTP / HTTPS / SOCKS5 proxies are unsupported.",
  "刷新状态": "Refresh status",
  "正在读取出口状态…": "Loading egress status…",
  "安全边界：": "Security boundary:",
  "Relay 的 URL、HMAC 密钥和访问令牌不会显示在此页面，也不会写入前端；账号只能选择 direct、relay5 或 relay7 三种受限出口策略。": "Relay URLs, HMAC secrets and access tokens are never exposed to the browser. Accounts can use only direct, relay5 or relay7 egress.",
  "Worker 实际模型目录": "Actual Worker model catalog",
  "一致；新增 Go 版目录中的 GPT-5.2 / 5.3 / 5.4 路由，租户未开放时会由上游返回明确错误。": ". GPT-5.2 / 5.3 / 5.4 routes are tenant-dependent; unavailable routes return explicit upstream errors.",
  "扩展模型目录": "Extended model catalog",
  "发现候选路由": "Discover candidate routes",
  "租户相关": "Tenant-dependent",
  "标准 / 推理路由": "Standard / Reasoning route",
  "标准路由；高 reasoning effort 可选推理 tone": "Standard route; higher reasoning effort can select a reasoning tone",
  "图片专用": "Images only",
  "不适用": "Not applicable",
  "图片生成专用；租户相关可用性": "Image generation only; tenant-dependent availability",
  "固定推理路由": "Fixed reasoning route",
  "固定推理路由；兼容 OpenAI 与 Anthropic Messages": "Fixed reasoning route; OpenAI and Anthropic Messages compatible",
  "兼容请求别名（不会在标准 /v1/models 中重复返回）": "Compatibility aliases (not repeated in the standard /v1/models catalog)",
  "gpt-5.6-sol / terra / luna：旧客户端兼容": "gpt-5.6-sol / terra / luna: legacy client compatibility",
  "m365-copilot → gpt-5.6-sol（旧客户端）": "m365-copilot → gpt-5.6-sol (legacy clients)",
  "候选路由发现不会自动修改生产模型目录。": "Candidate discovery does not change the production catalog automatically.",
  "界面地区与时间": "Language and time",
  "地区 / 时区": "Region / Time zone",
  "跟随系统": "Follow system",
  "中国（上海）": "China (Shanghai)",
  "美国（西海岸）": "United States (West Coast)",
  "显示模式": "Appearance",
  "白天": "Day",
  "夜晚": "Night",
  "设置仅保存在当前浏览器": "Preferences are saved in this browser only",
  "通行密钥 Passkey": "Passkeys",
  "使用当前浏览器注册 Touch ID、iCloud Keychain 或硬件安全密钥。私钥只保存在你的设备上。": "Register Touch ID, iCloud Keychain or a hardware security key using this browser. Private keys stay on your device.",
  "注册通行密钥": "Register passkey",
  "正在载入通行密钥...": "Loading passkeys...",
  "设备名称，例如：我的 MacBook": "Device name, for example: My MacBook",
  "系统时区": "System time zone",
  "系统显示模式": "System appearance",
  "趋势数据暂不可用": "Request trends unavailable",
  "暂无请求记录": "No requests yet",
  "统计暂不可用": "Statistics unavailable",
  "会话续用统计暂不可用": "Session reuse statistics unavailable",
  "会话列表读取失败": "Failed to load sessions",
  "暂无已登记的显式会话": "No registered explicit sessions",
  "会话已重置": "Session reset",
  "已配置": "Configured",
  "未配置": "Not configured",
  "无法读取固定出口状态": "Could not load fixed egress status",
  "没有可用模型": "No models available",
  "模型目录读取失败": "Failed to load model catalog",
  "正在读取 Microsoft 公共模型标签…": "Loading Microsoft public model labels…",
  "候选路由发现失败；生产目录未改变。": "Candidate discovery failed. Production catalog is unchanged.",
  "请输入临时 API Key 并选择模型。": "Enter a temporary API key and select a model.",
  "请求被拒绝": "Request rejected",
  "收到响应": "Response received",
  "无法载入通行密钥列表": "Could not load passkeys",
  "尚未注册通行密钥": "No passkeys registered",
  "确认删除这个通行密钥？删除后该设备将不能用于登录。": "Delete this passkey? This device will no longer be able to sign in with it.",
  "管理员设备": "Admin device",
  "无法开始通行密钥注册": "Could not start passkey registration",
  "未完成通行密钥注册": "Passkey registration incomplete",
  "通行密钥注册失败": "Passkey registration failed",
  "通行密钥注册成功": "Passkey registered",
  "二次验证": "Two-factor verification",
  "验证 2FA 验证码": "Verify 2FA code",
  "使用通行密钥 Passkey": "Use passkey",
  "返回密码登录": "Back to password sign-in",
  "输入 Google Authenticator 的 6 位验证码": "Enter the 6-digit Google Authenticator code",
  "二次验证失败，请重试": "Two-factor verification failed. Try again.",
  "2FA 验证失败": "2FA verification failed",
  "Passkey 验证已过期": "Passkey challenge expired",
  "Passkey 验证失败": "Passkey verification failed"
};
  Object.assign(dictionary, {
    "重新授权": "Authorize again", "刷新令牌": "Refresh token", "删除": "Delete", "撤销": "Revoke",
    "已作废": "Revoked", "重置": "Reset", "主力": "Active", "待命": "Standby",
    "新密码至少需要 8 个字符": "New password must contain at least 8 characters", "当前密码错误": "Incorrect current password", "请先登录管理员账号": "Sign in as administrator first", "通行密钥注册失败": "Passkey registration failed",
    "即将过期": "Expiring soon", "已过期": "Expired", "本地真实时间": "Actual local time",
    "总计": "Total", "语言": "Language", "请求延迟与成功率": "Request latency and success rate",
    "读取 SLA 指标": "Refresh SLA metrics", "尚未读取 SLA 指标": "SLA metrics not loaded",
    "无法读取 SLA 指标": "SLA metrics unavailable", "升级或重置以来的全部请求；延迟为有界直方图估计。": "All requests since upgrade or reset; latency uses bounded histogram estimates."
  });
  let locale = "zh";
  try { locale = localStorage.getItem("m365_locale") === "en" ? "en" : "zh"; } catch {}
  const normalize = (value) => String(value).replace(/\s+/gu, " ").trim();
  function translate(value) {
    if (locale !== "en") return String(value);
    const key = normalize(value);
    let result = dictionary[key];
    if (result === undefined) {
      const ago = /^(\d[\d,]*) (秒|分钟|小时|天)前$/u.exec(key);
      if (ago) result = `${ago[1]} ${{ 秒: "s", 分钟: "min", 小时: "h", 天: "d" }[ago[2]]} ago`;
      else if (/^[\d.]+% 成功$/u.test(key)) result = key.replace(" 成功", " success");
      else if (/^在线: \d+ • 冷却: \d+(?: • 隔离: \d+)?$/u.test(key)) result = key.replace("在线:", "Online:").replace("冷却:", "Cooling:").replace("隔离:", "Isolated:");
      else if (/^入: [\d., KM]+ • 出: [\d., KM]+$/u.test(key)) result = key.replace("入:", "In:").replace("出:", "Out:");
      else if (/^刷新失败（HTTP \d{3}）$/u.test(key)) result = key.replace("刷新失败（", "Refresh failed (").replace("）", ")");
      else if (/^确认重置会话 .+？$/u.test(key)) result = key.replace("确认重置会话 ", "Reset session ").replace(/？$/u, "?");
      else if (/^已保存：.+ · .+$/u.test(key)) result = key.replace("已保存：", "Saved: ").replace("系统时区", "System time zone").replace("系统显示模式", "System appearance").replace("白天", "Day").replace("夜晚", "Night");
      else if (/^按 .+ 显示 · 新数据从本次升级后开始$/u.test(key)) result = key.replace(/^按 /u, "Time zone: ").replace(" 显示 · 新数据从本次升级后开始", " · Recorded since upgrade");
      else if (/^[\d,]+ 次请求 · .+ Token$/u.test(key)) result = key.replace(" 次请求", " requests");
      else if (/^成功请求的会话续用：[\d,]+ 次 \/ [\d,]+ 次 · 命中率 [\d.]+%$/u.test(key)) result = key.replace("成功请求的会话续用：", "Successful session reuse: ").replaceAll(" 次", "").replace("命中率 ", "hit rate ");
      else if (/^[\d: ]+ (晨光|暮光|日照|月升|月落|夜月) · .+$/u.test(key)) result = key.replace(/晨光|暮光|日照|月升|月落|夜月/gu, (phase) => dictionary[phase]).replace("本地真实时间", "Actual local time");
      else if (/^正在测试 [a-z0-9_.-]+…$/iu.test(key)) result = key.replace("正在测试 ", "Testing ");
      else if (/^未发现候选路由（状态：.+）。生产目录未改变。$/u.test(key)) result = key.replace("未发现候选路由（状态：", "No candidate routes found (status: ").replace("）。生产目录未改变。", "). Production catalog unchanged.");
      else if (/^发现 \d+ 个候选上游路由：.+。生产目录未改变，请先用模型测试验证。$/u.test(key)) result = key.replace(/^发现 /u, "Found ").replace(" 个候选上游路由：", " candidate upstream routes: ").replace("。生产目录未改变，请先用模型测试验证。", ". Production catalog unchanged; verify with model tests first.");
    }
    return result === undefined ? String(value) : String(value).replace(String(value).trim(), result);
  }
  const textState = new WeakMap();
  const attrState = new WeakMap();
  const skip = "script,style,code,pre,textarea,[data-no-translate],#modelTestOutput";
  function applyText(node) {
    if (!node.parentElement || node.parentElement.closest(skip)) return;
    const previous = textState.get(node);
    const source = previous && node.nodeValue === previous.rendered ? previous.source : node.nodeValue;
    const rendered = translate(source);
    if (node.nodeValue !== rendered) node.nodeValue = rendered;
    textState.set(node, { source, rendered });
  }
  function applyAttributes(element) {
    if (element.closest(skip)) return;
    const state = attrState.get(element) || {};
    for (const attr of ["placeholder", "title", "aria-label", "alt"]) {
      if (!element.hasAttribute(attr)) continue;
      const value = element.getAttribute(attr);
      const previous = state[attr];
      const source = previous && value === previous.rendered ? previous.source : value;
      const rendered = translate(source);
      if (value !== rendered) element.setAttribute(attr, rendered);
      state[attr] = { source, rendered };
    }
    attrState.set(element, state);
  }
  function visit(root) {
    if (root.nodeType === Node.TEXT_NODE) { applyText(root); return; }
    if (root.nodeType !== Node.ELEMENT_NODE) return;
    applyAttributes(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.nodeType === Node.TEXT_NODE) applyText(node); else applyAttributes(node);
    }
  }
  const observer = new MutationObserver((records) => {
    observer.disconnect();
    for (const record of records) {
      if (record.type === "childList") for (const node of record.addedNodes) visit(node);
      else if (record.type === "characterData") applyText(record.target);
      else applyAttributes(record.target);
    }
    observe();
  });
  function observe() { observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["placeholder", "title", "aria-label", "alt"] }); }
  let button;
  function setLocale(next) {
    locale = next === "en" ? "en" : "zh";
    try { localStorage.setItem("m365_locale", locale); } catch {}
    observer.disconnect();
    document.documentElement.lang = locale === "en" ? "en" : "zh-CN";
    visit(document.documentElement);
    if (button) { button.textContent = locale === "en" ? "中文" : "English"; button.setAttribute("aria-label", locale === "en" ? "Switch to Chinese" : "切换到英文"); }
    observe();
  }
  for (const method of ["alert", "confirm", "prompt"]) {
    const original = window[method].bind(window);
    window[method] = (message, ...args) => original(translate(message), ...args);
  }
  window.M365I18n = { translate, setLocale, getLocale: () => locale };
  function initialize() {
    button = document.createElement("button");
    button.type = "button"; button.id = "languageToggle"; button.dataset.noTranslate = "";
    button.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:900;padding:8px 13px;border:1px solid #64748b;border-radius:10px;background:#0f172a;color:#fff;font:600 13px system-ui;cursor:pointer;max-width:110px";
    button.addEventListener("click", () => setLocale(locale === "en" ? "zh" : "en"));
    document.body.append(button);
    setLocale(locale);
    window.addEventListener("storage", (event) => { if (event.key === "m365_locale") setLocale(event.newValue); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true }); else initialize();
})();
