# BZgongyi — 项目档案（给 AI 智能体看的说明）

> 本文件是项目的"交接说明"。任何 AI 智能体在修改本项目前，请先完整阅读本文件，
> 了解项目是什么、改过什么、部署在哪、如何构建部署。

## 1. 项目是什么

**医疗编织、缝合线、绕丝工艺计算平台** —— 单文件 SPA（Single Page Application），
零构建依赖，全部功能（HTML + CSS + JS）都在 `index.html` 一个文件里。

主要功能模块（底部导航 6 个 tab）：

| Tab | 功能 |
|---|---|
| 编织 | PPI、节距、编织角联动计算，输出用丝比、单目长度、单股/机台用丝 |
| 绕丝 | 7x7 缆绳、单/双/三层绕丝，密绕/间隙/角度互算、外径反推丝径 |
| 缝合 | 单锭机 W/D/P 互算；双锭机按线号/锭数/PPI/目标外径反推 D 数；D/dtex/Tex 互转 |
| 克重 | 金属丝/纤维丝重量长度换算、强度换算、克重转张力 |
| 齿轮 | 按 A/B/C/D 齿轮组合匹配目标 PPI/节距，附调整教程与变频器参数 |
| 校准 | 分丝机倍率重算、移动量校准（含 LCP/UHMWPE 实测三点校准模型） |

## 2. 技术架构

- **单文件**：`index.html`（约 100KB）内联全部 CSS 和 JS，无外部依赖、无 CDN
- **数据**：校准参数与历史记录保存在浏览器 localStorage
- **部署方式**：`build.py` 将 `index.html` 内嵌生成 `src/worker.js`，
  部署为 Cloudflare Worker
- **UI 风格**：iOS 风格（毛玻璃、胶囊导航），移动端优先，主题色 `--blue: #007AFF`

## 3. 部署信息（重要）

| 项 | 值 |
|---|---|
| **生产域名** | `https://bzgongyi.ksjizhang.top/`（自定义域名，主入口） |
| **备用域名** | `https://bzgongyi.254009638.workers.dev` |
| **平台** | Cloudflare Workers（账户：254009638@qq.com） |
| **Worker 名称** | `bzgongyi` |
| **域名 zone** | `ksjizhang.top`（Cloudflare 托管，active） |

### 构建与部署命令

```bash
python build.py                 # 1. 生成 src/worker.js（自动内嵌 index.html）
npx wrangler deploy             # 2. 部署到 Cloudflare Workers
```

一条龙：`python build.py && npx wrangler deploy`

### 配置文件说明

- `wrangler.toml`：Worker 配置。**注意**：自定义域名必须写成
  `routes = [{ pattern = "bzgongyi.ksjizhang.top", custom_domain = true }]`
  形式。旧写法 `custom_domains = [...]` 是**错误字段**，会导致部署警告且域名不生效。
- `src/worker.js`：**自动生成文件，禁止手改**，改完 `index.html` 必须重新跑 `build.py`

## 4. 最近改动记录

### 2026-08-12：底部导航栏升级为"悬浮玻璃胶囊"样式

参照 iPhone 电池健康 App 的导航栏设计，对 `.tab-bar` / `.tab-btn` 做了以下改动
（全部在 `index.html` 的 `<style>` 内，约 40 行 CSS，HTML 结构未动）：

- **悬浮卡片底栏**：底栏不再贴边，左右各 14px、底部 12px 外边距，
  26px 大圆角、白色半透明背景、毛玻璃（`blur(28px) + saturate(180%)`）、
  白色描边 + 柔和阴影（`0 8px 24px`），呈现"飘在页面上"的悬浮感
- **选中项胶囊高亮**：每个 tab 独立 20px 圆角胶囊，选中时浅蓝色背景
  （`rgba(0,122,255,0.10)`）+ 蓝色图标文字，把图标和文字整个圈起来
- **背景透明度**：调至 30%（`rgba(250,250,252,0.30)`），保证磨砂玻璃感通透
- **按压反馈**：`transform: scale(0.92)` 点击缩放
- **`--tab-h` 变量**：同步从 `64px` 调大到 `84px`，防止悬浮底栏遮挡页面底部内容

### 2026-08-12：修复 wrangler.toml 自定义域名配置

- 原文件写了 `custom_domains = [...]`（非法字段，每次部署报警告）
- 改为 `routes = [{ pattern = "bzgongyi.ksjizhang.top", custom_domain = true }]`
- 修复后部署输出干净：同时列出 workers.dev 域名和自定义域名，无警告

## 5. 给修改者的注意事项

1. **单文件约束**：所有改动都应在 `index.html` 内完成，不要拆分成多文件
2. **改完必须构建**：`python build.py` 重新生成 `src/worker.js`，否则线上不生效
3. **部署后验证**：访问 `https://bzgongyi.ksjizhang.top/` 确认
4. **单位约定**：直径/芯径/丝径/节距用 `mm`，成品长度/用丝结果用 `m`；
   损耗预留以百分比输入并已计入"含损耗"结果
5. **公式校准**：所有公式结果应结合实际设备和实测数据校准（README 有详细说明）
6. **主题色**：`--blue: #007AFF`，全站统一；不要引入新的色系除非必要

## 6. 相关文件

- `index.html`：全部代码（唯一需要改的文件）
- `build.py`：构建脚本（把 index.html 打包成 worker.js）
- `src/worker.js`：生成的 Worker 源码（勿手改）
- `wrangler.toml`：Cloudflare 部署配置
- `README.md`：功能与业务说明（含双锭机校准模型细节）
