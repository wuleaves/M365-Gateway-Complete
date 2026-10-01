# 完整包来源与合并说明

本目录由“小群”文件夹中的全部压缩包盘点、解包和版本对比后生成。原目录共有 20 个压缩包；去除内容完全相同的重复副本后为 17 份独立归档。

## 选用基线

- 主线：`M365-Gateway-Cloudflare-UI-Mobile-20260917-r9.zip`。它是 r5 → r7 → r8 → r9 升级链的最新版本，并且已经包含 Cloudflare Worker、Node/Docker 服务器运行时、MFA、`web/` 与 `web-v2/`。
- 补充：从 `M365-Gateway-OpenSource-20260913.zip` 恢复 `optional-egress-relay/`、`CONTRIBUTING.md` 与 `LICENSE-NOTICE.md`。r9 的 README 和 `SOURCE-PACKAGE.json` 明确引用这些内容，但原 r9 压缩包漏装了它们。
- 未直接覆盖主线源码：9 月 4 日至 13 日的旧源码包、CF4 验证包和服务器 RAR。它们用于核对历史差异；r9 已包含服务器版，并包含旧版的后续实现。

## 已检查的归档

- 初始与早期 Cloudflare 源码：`M365-Gateway初始包.zip`、`M365-Gateway-open-source-20260904.zip`、`M365-Gateway-CF4-OpenSource-2026-09-05.zip`、`M365-Gateway-source-20260905-tool-image.zip`、`M365-Gateway-OpenSource-20260906-GPT6-Astra.zip`、`M365-Gateway-public-source-2026-09-07.zip`、`M365-Gateway-open-source-20260908-image-compat.zip`。
- 9 月 9 日至 13 日主线：`M365-Gateway-CF4-source-20260909.zip`、`M365-Gateway-OpenSource-20260909.zip`、`M365-Gateway-c20c12fa-d121-4d3e-84ea-777c0396b2cb-CF-Verified-Source.zip`、`m365-gateway-open-source-20260910.rar`、`M365-Gateway-OpenSource.rar`、`M365-Gateway-OpenSource-20260913.zip`。
- 服务器与升级链：`M365-Gateway-服务器版本.rar`、`M365-Gateway-Cloudflare-MFA-Upgrade-20260915-r5.zip`、`M365-Gateway-Cloudflare-MFA-Upgrade-20260916-r7.zip`、`M365-Gateway-Cloudflare-MFA-Upgrade-20260917-r8.zip`、`M365-Gateway-Cloudflare-UI-Mobile-20260917-r9.zip`。

## 重复副本

- `M365-Gateway初始包.zip` 与 `M365-Gateway-open-source-20260904.zip` 内容哈希相同。
- `M365-Gateway-OpenSource-20260913 (1).zip` 与 `M365-Gateway-OpenSource-20260913.zip` 内容哈希相同。
- `M365-Gateway-服务器版本 (1).rar` 与 `M365-Gateway-服务器版本.rar` 内容哈希相同。

## 合并原则

只补回当前版本明确引用且缺失的文件，不用较旧实现覆盖 r9 的 TypeScript、MFA 或移动端界面。历史部署产物和旧版本校验文件不放入运行包，避免把过期配置或线上制品混入当前源码。

## 0.2.0 兼容升级来源

2026-09-30 另行检查了 `HEXUXIU/M365-Copilot2API` 的 `a182c0f2c5d3c86096ed1631aab6b08961823130`。本包没有复制其 Go 实现，而是根据公开 HTTP/协议行为在现有 TypeScript + Cloudflare Durable Objects 架构中独立实现可移植功能，并为新边界增加本地回归测试。

未移植的内容只限于 Cloudflare 无法提供或会扩大风险的本机功能：进程自启动、文件系统自更新、任意 HTTP/SOCKS 代理池、强制 IPv4、API Key 明文回读和完整提示词/上游正文日志。

## 0.2.1 上游更新核对

2026-10-01 核对上游 `056c028`（相对旧基线新增 `0a21dac`、`056c028`）。独立实现图片模型校验、按所选时区统计的真实用量趋势、控制台快捷操作与 503 过载分类。Go 常驻进程的 WebSocket 连接池保活不适用于按请求运行的 Cloudflare Worker，因此没有加入定时后台连接。
