# Web 管理后台

该目录包含 M365 Gateway 的静态管理后台资源。

- `index.html`：主控制台、账号池、API Key、模型与诊断管理。
- `login.html`：管理员登录与首次改密流程。
- `debug.html`：旧调试地址的兼容跳转页。
- `_headers`：Cloudflare 静态资产安全响应头。

页面调用的管理接口与 Worker 源码位于同一发布包中。
