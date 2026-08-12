# CHANGELOG

## [2026-08-12] 底部导航栏 UI 改版

### 🔘 底部导航栏（参照电池健康 App 风格）

- **悬浮玻璃卡片**：左右 14px / 底部 12px 外边距、26px 大圆角、30% 半透明毛玻璃（blur 28px + 饱和度 180%）、白色高光描边、柔和阴影 —— 不再贴边
- **选中项胶囊高亮**：20px 圆角，浅蓝背景（`rgba(0,122,255,0.10)`）把图标+文字圈起来，沿用项目蓝色主题（`--blue: #007AFF`）
- **按压反馈**：点击缩放 `scale(0.92)`
- **`--tab-h` 同步调整**：64px → 84px，保证页面内容不被悬浮底栏遮挡

### 🐛 wrangler.toml 修复

- `custom_domains = [...]`（**错误字段**，每次部署报警告）→ `routes = [{ pattern = "bzgongyi.ksjizhang.top", custom_domain = true }]`（**正确写法**）
- 部署输出现在同时列出两个域名：`*.workers.dev` + 自定义域名，无警告

### 🚀 部署

- 自定义域名：`https://bzgongyi.ksjizhang.top/`（HTTP 200 已验证）
- 构建部署：`python build.py && npx wrangler deploy`
