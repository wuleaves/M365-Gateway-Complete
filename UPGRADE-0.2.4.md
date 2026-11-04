# M365 Gateway 0.2.4 升级说明

本升级包在完整包 0.2.3 基础上适配上游 M365-Copilot2API v0.7.3 的可移植运行指标能力，不覆盖你现有的账号、密钥或部署配置。没有新的数据库表或必填 Secret。

## 升级前

备份部署参数和 Worker 版本 ID。保持原 Worker 名称、KV ID、Durable Object 绑定、Entra Client ID 及 `DATA_ENCRYPTION_KEY` 不变。先在候选环境验证，再按原部署方式更新；不要用本包自动覆盖生产状态。

```powershell
npm ci
npm run check
```

## 更新内容

- 新增管理员会话保护的 `GET /api/admin/metrics`，返回准确累计请求/错误数、成功率、按端点汇总和账号状态。
- `latency_ms` 只使用最多 200 条有界诊断记录，其中成功请求按 1/64 抽样，错误和慢请求全部保留。`method=biased_diagnostic_sample` 表明分位数不能代表全量 SLA；不要把它用于对外服务等级承诺。
- 上游 Codex `additional_tools`、代码块后文本、首次输出超时和账号切换等修复已在当前 TypeScript 架构中有对应实现与回归覆盖，不复制 Go 服务端代码。
- 保留默认 75 秒首次输出超时；上游 40 秒策略依赖其跨账号重放条件，本项目尚未证明已提交请求可安全重放。管理员仍可通过现有运行配置调整该值。
- 不引入上游本地进程的运行时长指标、常驻连接池或公开匿名指标接口；Cloudflare Worker 生命周期与安全边界不同。

本升级包不包含凭据、构建缓存或本地日志。制作升级包不等于部署线上 Worker。
