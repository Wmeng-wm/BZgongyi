# BZgongyi — 项目档案（给 AI 智能体看的说明）

> 本文件是项目的"交接说明"。任何 AI 智能体在修改本项目前，请先完整阅读本文件，
> 了解项目是什么、改过什么、部署在哪、如何构建部署。

## 1. 项目是什么

**医疗编织、缝合线、绕丝工艺计算平台** —— 单文件 SPA（Single Page Application），
零构建依赖，全部功能（HTML + CSS + JS）都在 `index.html` 一个文件里。

主要功能模块（底部导航 6 个 tab）：

| Tab | 功能 |
|---|---|
| 编织 | PPI、节距、编织角联动计算，输出用丝比、单目长度、单股/机台用丝、覆盖率、当前孔径、输出外径 |
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

### 2026-10-27：编织页丝宽改为「丝径 / 扁丝 厚度×宽度 × 股数」自动推算（已部署）

- `丝型`（`#wireShape`：圆丝/扁丝）**收在「丝径」框里**（标签行右侧小下拉，`onchange=braidShapeChange()`）：
  - 圆丝：`#wire` = 单根直径，`丝宽 w = #wire × 股数`
  - 扁丝：同一格变成 **厚度 `#wire` × 宽度 `#flatW`**（中间 `#flatX` 显示 ×），`丝宽 w = #flatW × 股数`，
    标签改「厚度 t×宽 W (mm)」；不再有单独的宽度格子（`#flatWidthWrap` 已删除）
- `股数 n`（`#shares`）**默认留空 = 单股**；丝宽（`#bwidth`）为 **readonly 自动值**，由
  `braidStrandWidth()` + `braidWidth()` + `braidWidthAuto()` 回填；旧的 `braidWireSync()`/`braidAutoWidth` 已删除
- **外径按丝厚算**：`OD = D + 2 × #wire`（圆丝=直径、扁丝=厚度），与股数/丝宽无关
- `node tests/braid.test.mjs` → **180 项断言全绿**
- **克重→金属丝 / 强度换算 的圆丝/扁丝也统一成同一形态**：丝型下拉在尺寸框内，圆丝=直径，扁丝=同格「厚度 × 宽度」；
  旧字段 `roundField/flatWidthField/flatThickField`、`strRound/strFlatW/strFlatH` 已删除，新增 `#wSizeLabel/#wFlatX`、`#sSizeLabel/#sFlatX`；
  截面积口径不变（圆丝 πd²/4、扁丝 宽×厚）
- **脱模后外径**（结果卡第 10 格 `#odOff`/`#odOffSub`；θₙ/λ 为代码常数 `BRAID_NAT_ANGLE=54.7`、`BRAID_REBOUND=0.1`，**不在界面展示**）：
  `braidOffMandrel()`：`Dm=D+丝厚`、`P=(锭数/div)×25.4/PPI`、`tanθ=πDm/P`、`Δ=(sinθₙ−sinθ)/sinθₙ`、
  `脱模外径 = 在模外径 ×(1+λΔ)`；变化幅度上限为 λ，`λ=0` 时等于在模外径。一阶估算，待实测标定 λ
- 本地渲染验证（编织圆丝/扁丝、克重圆丝/扁丝、强度扁丝、脱模外径卡片）；已部署（Version ID `4f0b041a-ff93-4b10-9180-6f6835934d35`）

### 2026-09-20：编织页新增「覆盖率」与「输出外径」（已本地测试，未部署）

- 输入新增 `丝宽 w (mm)`（`#bwidth`，默认随丝径自动同步，手动改过则不再覆盖）
- 输出新增 `覆盖率`（`#cover`，100% = 网孔闭合看不见芯棒，达 100% 绿色）、
  `当前孔径`（`#mesh` + `#meshSub`，mm，菱形网孔内切圆直径；为 0 时标注「无网孔」并变绿）、
  `输出外径`（`#od`）。结果卡 9 格，**卡内小字公式提示已去掉**（公式只留 README）。
  `增厚系数 k`（`#bk`）与整块**反推区已按用户要求移除**
- 公式：单向 `C1=(锭数/2)×丝宽 w ÷(π×D×cosθ)`；交织 `C=1−(1−C1)²`（封顶 100%）；
  当前孔径 `g=w×(1/C1−1)`（θ 为单股螺旋角，页面「编织夹角」= 2θ）；
  `OD = D + 2×d`。`g=0 ⇔ C=100%`。**外径与 PPI 无关**（用户确认不加 PPI 修正：
  芯棒远粗于丝径时 PPI 对壁厚只影响微米级，细管/缝合线场景才明显，那部分由缝合线 tab 的实测指数模型负责）
- 新增 `tests/braid.test.mjs`（Node `vm` + 最小 DOM stub，零依赖），
  运行：`node tests/braid.test.mjs`（75 项断言全绿，含「孔面积占比 = 1−覆盖率」的自洽断言）
- 本地验证：`python -m http.server 8765` + 无头 Chrome 渲染确认排布；**尚未 `wrangler deploy`**

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
- `tests/braid.test.mjs`：编织页本地回归测试（`node tests/braid.test.mjs`，零依赖）
- `src/worker.js`：生成的 Worker 源码（勿手改）
- `wrangler.toml`：Cloudflare 部署配置
- `README.md`：功能与业务说明（含双锭机校准模型细节）
