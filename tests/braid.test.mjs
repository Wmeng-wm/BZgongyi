// 编织页「丝宽推算 / 覆盖率 / 输出外径」本地测试
// 用法: node tests/braid.test.mjs
// 不依赖任何 npm 包：从 index.html 抽取编织脚本，用最小 DOM stub 在 vm 里跑
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

let pass = 0, fail = 0;
const ok = (cond, msg, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${msg}`); }
  else { fail++; console.log(`  ✗ ${msg}${extra ? '  →  ' + extra : ''}`); }
};
const eq = (actual, expected, msg) => ok(actual === expected, msg, `期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
const near = (actual, expected, tol, msg) => ok(Math.abs(actual - expected) <= tol, msg, `期望 ≈${expected}（±${tol}），实际 ${actual}`);
const section = (t) => console.log(`\n${t}`);

// ---------- 1. HTML 结构检查 ----------
section('1. HTML 结构');
const pageStart = html.indexOf('<div class="page active" id="page-braid">');
const pageEnd = html.indexOf('<!-- ====== 绕丝', pageStart);
ok(pageStart >= 0 && pageEnd > pageStart, '找到编织页 HTML 片段');
const braidHtml = pageStart >= 0 && pageEnd > pageStart ? html.slice(pageStart, pageEnd) : '';

for (const id of ['wire', 'wireShape', 'wireLabel', 'flatW', 'shares', 'bwidth', 'ppi', 'pitchIn', 'angleIn', 'craft', 'cover', 'mesh', 'od', 'odOff', 'odOffSub', 'natAngle', 'rebound']) {
  ok(braidHtml.includes(`id="${id}"`), `编织页存在 #${id}`);
}
ok(/<input id="bwidth"[^>]*readonly/.test(braidHtml), '丝宽 w 为只读（自动推算）');
ok(/<select id="wireShape"[^>]*braidShapeChange/.test(braidHtml), '丝型选择在丝径框内（onchange=braidShapeChange）');
ok(/<span id="flatX" class="hidden"/.test(braidHtml) && /<input id="flatW" class="hidden"/.test(braidHtml), '扁丝厚度/宽度同格：× 与宽度默认隐藏');
ok(!braidHtml.includes('id="flatWidthWrap"'), '宽度不再单独占一个格子');
ok(braidHtml.includes('股数 n（空=单股）'), '股数标签注明「空=单股」');
// 克重 / 强度的圆丝-扁丝也统一成同一种形态（丝型在尺寸框内、扁丝 = 厚度 × 宽度）
for (const id of ['wSizeLabel', 'wFlatX', 'sSizeLabel', 'sFlatX']) {
  ok(html.includes(`id="${id}"`), `克重/强度存在 #${id}（与编织同形态）`);
}
for (const id of ['roundField', 'flatWidthField', 'flatThickField', 'strRound', 'strFlatW', 'strFlatH']) {
  ok(!html.includes(`id="${id}"`), `旧的独立字段 #${id} 已移除`);
}
ok(!braidHtml.includes('id="bk"'), '增厚系数 k 输入已移除');
ok(!braidHtml.includes('rv_') && !braidHtml.includes('反推'), '反推区已移除');
ok(!braidHtml.includes('覆盖率 = 1−(1−单向)'), '结果卡下方小字提示已移除');

const allIds = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
const dupes = allIds.filter((v, i) => allIds.indexOf(v) !== i);
ok(dupes.length === 0, '全页无重复 id', `重复: ${[...new Set(dupes)].join(', ')}`);

// 解析编织页默认值（与页面真实默认值保持一致）
const defaults = {};
for (const m of braidHtml.matchAll(/<input\s+id="([^"]+)"[^>]*>/g)) {
  const v = m[0].match(/value="([^"]*)"/);
  defaults[m[1]] = v ? v[1] : '';
}
for (const m of braidHtml.matchAll(/<select\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
  const opts = [...m[2].matchAll(/<option([^>]*)>/g)].map(o => ({
    tag: o[1], val: (o[1].match(/value="([^"]*)"/) || [])[1] ?? '',
  }));
  const sel = opts.find(o => /\sselected/.test(o.tag)) || opts[0];
  defaults[m[1]] = sel ? sel.val : '';
}
ok(defaults.craft === '1x2' && defaults.spindles === '144' && defaults.mandrel === '8', '解析出页面默认值', JSON.stringify(defaults));
eq(defaults.wireShape, 'round', '丝型默认「圆丝」');
eq(defaults.shares, '', '股数默认留空（= 单股）');

// ---------- 2. 抽取编织脚本并建立 DOM stub ----------
section('2. 脚本抽取与加载');
const scriptBlocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
ok(scriptBlocks.length > 0, `抽取到 ${scriptBlocks.length} 个内联脚本`);
for (const [i, code] of scriptBlocks.entries()) {
  try { new vm.Script(code); ok(true, `脚本 #${i + 1} 语法通过`); }
  catch (e) { ok(false, `脚本 #${i + 1} 语法通过`, e.message); }
}
const braidCode = scriptBlocks.find(c => c.includes('// ========== 编织计算 =========='));
ok(!!braidCode, '定位到编织计算脚本');

const missing = new Set();
const knownIds = new Set(allIds);
const els = {};
const makeEl = (id) => {
  const el = {
    id, value: defaults[id] ?? '', textContent: '-', innerHTML: '', style: {}, dataset: {},
    hiddenClass: false,   // 记录 classList 的 hidden 状态
    classList: {
      add(c) { if (c === 'hidden') el.hiddenClass = true; },
      remove(c) { if (c === 'hidden') el.hiddenClass = false; },
      toggle(c, on) { if (c === 'hidden') el.hiddenClass = on === undefined ? !el.hiddenClass : !!on; },
    },
  };
  return el;
};
const document = {
  getElementById(id) {
    if (!knownIds.has(id)) missing.add(id);
    if (!els[id]) els[id] = makeEl(id);
    return els[id];
  },
  querySelectorAll: () => [],
  querySelector: () => null,
};
const ctx = {
  document, console,
  window: { addEventListener() {}, scrollTo() {} },
  navigator: {}, alert() {}, localStorage: { getItem: () => null, setItem() {} },
  Math, JSON, parseFloat, parseInt, isFinite, Number, String,
};
ctx.globalThis = ctx;
missing.clear();
vm.createContext(ctx);
new vm.Script(braidCode).runInContext(ctx);
// 页面初始化：DOMContentLoaded 里调用 braidSync('ppi') + braidShapeChange()（内部会 braidCalc）
ctx.braidSync('ppi');
ctx.braidShapeChange();

const txt = (id) => document.getElementById(id).textContent;
const val = (id) => document.getElementById(id).value;
const pct = (id) => parseFloat(txt(id));
const setInputs = (o) => { for (const [k, v] of Object.entries(o)) document.getElementById(k).value = String(v); };
const run = (o) => { setInputs(o); ctx.braidSync('ppi'); ctx.braidCalc(); };
const coverOf = (o) => { run(o); return pct('cover'); };

section('3. 输出项存在性');
ok(missing.size === 0, '脚本引用的元素均存在于页面', [...missing].join(', '));
ok(/^\d+(\.\d+)?%$/.test(txt('cover')), `覆盖率输出为百分比: ${txt('cover')}`);
ok(/^\d+\.\d{3}$/.test(txt('mesh')), `当前孔径输出为 3 位小数: ${txt('mesh')}`);
eq(txt('meshSub'), 'mm', '当前孔径单位为 mm');
ok(/^\d+\.\d{3}$/.test(txt('od')), `输出外径输出为 3 位小数: ${txt('od')}`);
ok(/^\d+\.\d{3}$/.test(txt('odOff')), `脱模后外径为 3 位小数: ${txt('odOff')}`);
const preview = document.getElementById('preview').value;
ok(preview.includes('3、覆盖率：' + txt('cover')), '报告含覆盖率行');
ok(preview.includes('4、在模外径：' + txt('od') + ' mm'), '报告含在模外径行');
ok(preview.includes('5、脱模后外径：' + txt('odOff') + ' mm'), '报告含脱模后外径行');
ok(preview.includes('圆丝 直径 0.030 mm，1 股 → 丝宽 0.030 mm'), '报告含「丝型/股数 → 丝宽」');

// ---------- 4. 默认参数 ----------
section('4. 默认参数（N=144, 1x2, D=8, d=0.03 圆丝 1 股, PPI=55）');
const D0 = 8, d0 = 0.03, w0 = 0.03, N0 = 144, ppi0 = 55, sp0 = 144;
eq(val('bwidth'), '0.030', '默认丝宽 = 丝径×1 = 0.030');
const pitch0 = (sp0 / 2) * (25.4 / ppi0);
near(pitch0, 33.25, 0.01, `节距 ${pitch0.toFixed(2)} mm`);
near(parseFloat(txt('pitchOut')), pitch0, 0.01, '节距与手算一致');
const theta0 = Math.atan((Math.PI * D0) / pitch0);
near(parseFloat(txt('angle')), theta0 * 2 * 180 / Math.PI, 0.01, '编织夹角(2θ)与手算一致');

// 覆盖率：单向 = 单侧锭数×丝宽 ÷ 圆周（垂直于螺旋线的截面上投影宽度 w/cosθ 累加）
const c1_0 = (N0 / 2) * (w0 / Math.cos(theta0)) / (Math.PI * D0);
const exp0 = 1 - (1 - Math.min(1, c1_0)) ** 2;
near(pct('cover') / 100, exp0, 0.0005, `覆盖率 ${txt('cover')}（手算 ${(exp0 * 100).toFixed(1)}%）`);
// 独立验算：纱线面积 / 圆柱面积（按一整个节距长度算）
const hyp0 = Math.hypot(pitch0, Math.PI * D0);
const areaC1 = (N0 / 2) * w0 * hyp0 / (Math.PI * D0 * pitch0);
near(areaC1, c1_0, 1e-9, '两种推导（截面法 / 面积法）一致');
eq(txt('od'), (D0 + 2 * d0).toFixed(3), '输出外径 = D + 2d = 8.060');

// ---------- 5. 覆盖率与孔径公式 ----------
section('5. 覆盖率与孔径公式');
// 孔径几何：孔径 g = w(1/C1-1)，菱形网孔（对角线 g/sinθ 与 g/cosθ），覆盖率 100% ⇔ g=0
const mv = ctx.braidCoverage(8, 0.03, 55, 144, '1x2');
const th0 = Math.atan(Math.PI * 8 / ((144 / 2) * (25.4 / 55)));
const c1hand = (144 / 2) * 0.03 / (Math.PI * 8 * Math.cos(th0));
near(mv.single, c1hand, 1e-12, `单向覆盖率手算一致 ${(c1hand * 100).toFixed(1)}%`);
near(mv.gap, 0.03 * (1 / c1hand - 1), 1e-12, `当前孔径 g = w(1/C1-1) = ${mv.gap.toFixed(4)} mm`);
eq(txt('mesh'), mv.gap.toFixed(3), `KPI 当前孔径 ${txt('mesh')} 与公式一致`);
// 自洽性：孔径按几何排布算出的孔面积占比，必须等于 1-覆盖率
// 孔心 = 两组纱线中线（各距纱带 p/2，p=同向纱线中心距）的交点格，
// 基元面积 = p²/sin2θ（每格恰 1 个孔）；单孔面积 = g²/sin2θ
// → 面积占比 = (g/p)² = (1-C1)²，应与交织公式的 1-C 完全相等
const p0 = mv.gap + 0.03;
const holeFrac = (mv.gap ** 2 / Math.sin(2 * th0)) / (p0 ** 2 / Math.sin(2 * th0));
near(holeFrac, (mv.gap / p0) ** 2, 1e-15, '孔面积占比 = (g/p)²');
near(holeFrac, 1 - mv.total, 1e-12, '孔面积占比 = 1−覆盖率（几何排布法与交织公式法自洽）');
eq((braidHtml.match(/class="kpi/g) || []).length, 10, '结果卡 10 格（6 原有 + 覆盖率 + 当前孔径 + 在模外径 + 脱模外径）');

// 覆盖率 100% ⇔ 孔径 0
run({ spindles: 144, mandrel: 1, wire: 0.5, shares: 1, wireShape: 'round', ppi: 55, length: 10, craft: '1x2' });
eq(val('bwidth'), '0.500', '圆丝 1 股 0.5mm → 丝宽 0.500');
eq(txt('cover'), '100.0%', '全覆盖时覆盖率 100.0%');
eq(txt('mesh'), '0.000', '全覆盖时当前孔径 0.000');
eq(txt('meshSub'), '无网孔', '全覆盖时孔径标注「无网孔」');
eq(ctx.braidCoverage(1, 0.5, 55, 144, '1x2').gap, 0, 'C1≥1 时孔径 g=0');
ok(document.getElementById('cover').style.color === 'var(--green)', '全覆盖时覆盖率显示绿色');
ok(document.getElementById('mesh').style.color === 'var(--green)', '无网孔时孔径显示绿色');

// 单调性：越密孔径越小
run({ spindles: 144, mandrel: 8, wire: 0.02, shares: 1, wireShape: 'round', ppi: 55, length: 10 });
const gThin = ctx.braidCoverage(8, 0.02, 55, 144, '1x2').gap;
const gThick = ctx.braidCoverage(8, 0.05, 55, 144, '1x2').gap;
ok(gThick < gThin, `丝宽↑ → 孔径↓（${gThin.toFixed(4)} → ${gThick.toFixed(4)} mm）`);
const gPPI = ctx.braidCoverage(8, 0.03, 55, 144, '1x2').gap;
const gPPI2 = ctx.braidCoverage(8, 0.03, 110, 144, '1x2').gap;
ok(gPPI2 < gPPI, `PPI↑ → 孔径↓（${gPPI.toFixed(4)} → ${gPPI2.toFixed(4)} mm）`);
const gN1 = ctx.braidCoverage(8, 0.03, 55, 8, '1x2').gap;
const gN2 = ctx.braidCoverage(8, 0.03, 55, 144, '1x2').gap;
ok(gN2 < gN1, `锭数↑ → 孔径↓（${gN1.toFixed(4)} → ${gN2.toFixed(4)} mm）`);
const gD1 = ctx.braidCoverage(4, 0.03, 55, 144, '1x2').gap;
const gD2 = ctx.braidCoverage(16, 0.03, 55, 144, '1x2').gap;
ok(gD2 > gD1, `芯棒↑ → 孔径↑（${gD1.toFixed(4)} → ${gD2.toFixed(4)} mm）`);

// 45° 特例：pitch = πD → θ=45°；N=8, D=10, w=0.5（圆丝 1 股 0.5mm）
const D1 = 10, N1 = 8, w1 = 0.5;
const ppi1 = (N1 / 2) * 25.4 / (Math.PI * D1);
const c45 = coverOf({ spindles: N1, mandrel: D1, wire: w1, shares: 1, wireShape: 'round', ppi: ppi1, length: 10 });
const exp45 = 1 - (1 - (N1 / 2) * (w1 / Math.cos(Math.PI / 4)) / (Math.PI * D1)) ** 2;
near(c45 / 100, exp45, 0.0005, `45° 特例覆盖率 ${c45}%（手算 ${(exp45 * 100).toFixed(1)}%）`);
const c1_45 = (N1 / 2) * w1 / (Math.PI * D1 * Math.cos(Math.PI / 4));
near(ctx.braidCoverage(D1, w1, ppi1, N1, '1x2').gap, w1 * (1 / c1_45 - 1), 1e-12,
  `45° 特例孔径 ${(w1 * (1 / c1_45 - 1)).toFixed(4)} mm = w(1/C1-1)`);

// 丝宽越大覆盖率越高
const cThin = coverOf({ spindles: 144, mandrel: 8, wire: 0.02, shares: 1, wireShape: 'round', ppi: 55, length: 10 });
const cThick = coverOf({ spindles: 144, mandrel: 8, wire: 0.05, shares: 1, wireShape: 'round', ppi: 55, length: 10 });
ok(cThick > cThin, `丝宽↑ → 覆盖率↑（${cThin}% → ${cThick}%）`);

// 芯棒越粗覆盖率越低
const cSmall = coverOf({ spindles: 144, mandrel: 4, wire: 0.03, shares: 1, wireShape: 'round', ppi: 55, length: 10 });
const cBig = coverOf({ spindles: 144, mandrel: 16, wire: 0.03, shares: 1, wireShape: 'round', ppi: 55, length: 10 });
ok(cSmall > cBig, `芯棒↑ → 覆盖率↓（${cSmall}% → ${cBig}%）`);

// 上限 100%
const cFull = coverOf({ spindles: 144, mandrel: 1, wire: 0.5, shares: 1, wireShape: 'round', ppi: 55, length: 10 });
eq(cFull, 100, '高密编织覆盖率封顶 100.0%');
ok(cFull <= 100, '覆盖率不超过 100%');

// 锭数越多覆盖率越高（选低覆盖参数，避免贴近 100% 封顶看不出差异）
const c8 = coverOf({ spindles: 8, mandrel: 10, wire: 0.1, shares: 1, wireShape: 'round', ppi: 10, length: 10 });
const c64 = coverOf({ spindles: 64, mandrel: 10, wire: 0.1, shares: 1, wireShape: 'round', ppi: 10, length: 10 });
ok(c64 > c8, `锭数↑ → 覆盖率↑（${c8}% → ${c64}%）`);

// 工艺结构：1x1 节距系数更大(div=4) → 节距更小 → 螺旋角更贴近周向 → 单向覆盖更高
const c1x1 = coverOf({ spindles: 144, mandrel: 8, wire: 0.03, shares: 1, wireShape: 'round', ppi: 55, length: 10, craft: '1x1' });
const c1x2 = coverOf({ spindles: 144, mandrel: 8, wire: 0.03, shares: 1, wireShape: 'round', ppi: 55, length: 10, craft: '1x2' });
ok(c1x1 > c1x2, `1x1（节距更小/角更周向）覆盖率高于 1x2（${c1x1}% > ${c1x2}%）`);

// ---------- 6. 输出外径（OD = D + 2×丝厚：圆丝=直径，扁丝=厚度） ----------
section('6. 输出外径行为');
const odOf = (wire, mandrel = 8, shares = 1, wireShape = 'round', flatW = 0.1) => {
  setInputs({ mandrel, wire, shares, wireShape, flatW }); ctx.braidCalc(); return txt('od');
};
eq(odOf(0.03), '8.060', 'D=8, d=0.03 → 8 + 2×0.03 = 8.060');
eq(odOf(0.05), '8.100', 'D=8, d=0.05 → 8 + 2×0.05 = 8.100');
eq(odOf(0.03, 10), '10.060', 'D=10, d=0.03 → 10.060');
eq(odOf(0), '8.000', '丝径 0 → 外径 = 芯棒 8.000');
eq(odOf(0.03, 8, 4, 'flat', 0.2), '8.060', '扁丝外径按厚度 0.03 算，跟宽度 0.2 无关');
eq(odOf(0.05, 8, 1, 'flat', 0.3), '8.100', '扁丝厚 0.05、宽 0.3 → 外径 8.100（不是 8.7）');
eq(odOf(0.03, 8, 9, 'round'), '8.060', '圆丝 9 股：平铺一层，外径仍 8.060');

// ---------- 7. 丝宽：圆丝=直径×股数；扁丝=带宽×股数 ----------
section('7. 丝宽推算（圆丝直径 / 扁丝厚×宽）');
const widthOf = (wire, shares, wireShape, flatW = 0.1) => {
  setInputs({ wire, shares, wireShape, flatW }); ctx.braidCalc(); return val('bwidth');
};
eq(widthOf(0.03, 1, 'round'), '0.030', '圆丝 1 股：0.03×1 = 0.030');
eq(widthOf(0.03, '', 'round'), '0.030', '股数留空（圆丝）= 单股 → 丝宽 = 直径');
eq(widthOf(0.045, '', 'round'), '0.045', '直径 0.045 空股数 → 丝宽 0.045');
eq(widthOf(0.03, 0, 'round'), '0.030', '股数 0 也按单股');
// 用户现场口径：合股是平铺的（等于一根扁丝）→ 圆丝多股 ×股数
eq(widthOf(0.18, 4, 'round'), '0.720', '圆丝 0.18×4 股（平铺合股）→ 丝宽 0.720');
eq(widthOf(0.03, 4, 'round'), '0.120', '圆丝 4 股：0.03×4 = 0.120');
eq(widthOf(0.03, 9, 'round'), '0.270', '圆丝 9 股：0.03×9 = 0.270');
// 扁丝：宽度取自「宽度 W」，与厚度无关
eq(widthOf(0.03, 1, 'flat', 0.1), '0.100', '扁丝 1 股：宽 0.100 → 丝宽 0.100（厚度 0.03 不参与）');
eq(widthOf(0.5, 1, 'flat', 0.1), '0.100', '扁丝丝宽与厚度无关（厚度 0.5 仍 0.100）');
eq(widthOf(0.03, 2, 'flat', 0.15), '0.300', '扁丝 2 股：宽 0.15×2 = 0.300');
eq(widthOf(0.03, 2.5, 'flat', 0.04), '0.100', '扁丝 2.5 股：宽 0.04×2.5 = 0.100');
eq(widthOf(0.03, '', 'flat', 0.06), '0.060', '扁丝股数留空 = 单股 → 丝宽 = 带宽 0.060');
// 纯函数
near(ctx.braidWidth(0.03, 4), 0.12, 1e-12, 'braidWidth(0.03, 4) = 0.12');
near(ctx.braidWidth(0.18, 4), 0.72, 1e-12, 'braidWidth(0.18, 4) = 0.72');
near(ctx.braidWidth(0.03, 0), 0.03, 1e-12, '股数 0 按 1 股处理');
near(ctx.braidWidth(0.03, -2), 0.03, 1e-12, '股数为负按 1 股处理');
eq(ctx.braidWidth(0, 4), 0, '单条宽度 0 → 丝宽 0');
// 切丝型：标签与显示
eq(document.getElementById('flatX').hiddenClass, true, '默认圆丝 → × 号隐藏');
eq(document.getElementById('flatW').hiddenClass, true, '默认圆丝 → 宽度输入隐藏');
setInputs({ wire: 0.03, shares: '', wireShape: 'flat', flatW: 0.1 }); ctx.braidShapeChange();
eq(txt('wireLabel'), '厚度 t×宽 W (mm)', '切到扁丝 → 同一格标注「厚度 t×宽 W」');
eq(val('bwidth'), '0.100', '切到扁丝 → 丝宽 = 宽度 0.100');
eq(document.getElementById('flatX').hiddenClass, false, '扁丝 → × 号显示');
eq(document.getElementById('flatW').hiddenClass, false, '扁丝 → 宽度输入显示');
setInputs({ wireShape: 'round' }); ctx.braidShapeChange();
eq(txt('wireLabel'), '丝径 d (mm)', '切回圆丝 → 标注恢复「丝径 d」');
eq(val('bwidth'), '0.030', '切回圆丝 → 丝宽 = 直径 0.030');
eq(document.getElementById('flatX').hiddenClass, true, '切回圆丝 → × 号重新隐藏');
eq(document.getElementById('flatW').hiddenClass, true, '切回圆丝 → 宽度输入重新隐藏');
// 报告文案
run({ spindles: 144, mandrel: 8, wire: 0.03, shares: '', wireShape: 'round', flatW: 0.1, ppi: 55, length: 10 });
ok(document.getElementById('preview').value.includes('圆丝 直径 0.030 mm，1 股 → 丝宽 0.030 mm'), '圆丝报告写直径与股数');
run({ spindles: 144, mandrel: 8, wire: 0.03, shares: 2, wireShape: 'flat', flatW: 0.1, ppi: 55, length: 10 });
ok(document.getElementById('preview').value.includes('扁丝 厚 0.030 × 宽 0.100 mm，2 股 → 丝宽 0.200 mm'), '扁丝报告写厚×宽与股数');
ok(document.getElementById('preview').value.includes('外径按丝厚 0.030 mm 计'), '报告注明外径按丝厚');
// 只读：手改会被重算覆盖
setInputs({ bwidth: 9, wire: 0.03, shares: 1, wireShape: 'round' }); ctx.braidCalc();
eq(val('bwidth'), '0.030', '只读丝宽被自动重算覆盖');
// 股数影响覆盖率与孔径
const cov1 = coverOf({ spindles: 144, mandrel: 8, wire: 0.03, shares: 1, wireShape: 'round', ppi: 55, length: 10 });
const cov3 = coverOf({ spindles: 144, mandrel: 8, wire: 0.03, shares: 3, wireShape: 'round', ppi: 55, length: 10 });
const cov3f = coverOf({ spindles: 144, mandrel: 8, wire: 0.5, shares: 3, wireShape: 'flat', flatW: 0.03, ppi: 55, length: 10 });
ok(cov3 > cov1, `股数↑ → 覆盖率↑（1 股 ${cov1}% → 3 股 ${cov3}%）`);
eq(cov3f, cov3, '扁丝 3 股 × 0.03 与圆丝 3 股 0.03 覆盖率相同（同丝宽）');
const gap1 = ctx.braidCoverage(8, 0.03, 55, 144, '1x2').gap;
const gap3 = ctx.braidCoverage(8, 0.09, 55, 144, '1x2').gap;
ok(gap3 < gap1, `3 股丝宽 0.09 → 孔径更小（${gap1.toFixed(4)} → ${gap3.toFixed(4)} mm）`);
// 扁丝宽度为空 → 丝宽空、覆盖率不再计算
setInputs({ wireShape: 'flat', wire: 0.03, shares: 1, flatW: '', ppi: 55 }); ctx.braidCalc();
eq(val('bwidth'), '', '扁丝宽度为空 → 丝宽为空');
eq(txt('cover'), '-', '扁丝宽度为空 → 覆盖率 -');

// ---------- 8. 异常输入 ----------
section('8. 异常输入');
setInputs({ ppi: '' }); ctx.braidCalc();
eq(txt('cover'), '-', 'PPI 为空 → 覆盖率 -');
eq(txt('mesh'), '-', 'PPI 为空 → 当前孔径 -');
eq(txt('od'), '-', 'PPI 为空 → 输出外径 -');
setInputs({ ppi: 55, mandrel: 8, wire: 0.03, shares: 1, wireShape: 'round', spindles: 144, craft: '1x2' });
ctx.braidSync('ppi'); ctx.braidCalc();
ok(txt('cover') !== '-' && txt('od') !== '-', '恢复正常输入后重新出数');
// 丝径为空 → 丝宽清空、覆盖率不再计算
setInputs({ wire: '' }); ctx.braidCalc();
eq(val('bwidth'), '', '丝径为空 → 丝宽为空');
eq(txt('cover'), '-', '丝径为空 → 覆盖率 -');
setInputs({ wire: 0.03 }); ctx.braidCalc();
eq(val('bwidth'), '0.030', '丝径恢复 → 丝宽恢复');
eq(txt('cover'), '20.4%', '丝径恢复 → 覆盖率恢复 20.4%');

// 节距/角度输入（braidSync 另外两条链路）仍然工作
setInputs({ pitchIn: 20 }); ctx.braidSync('pitch');
near(parseFloat(document.getElementById('ppi').value), (144 / 2) * 25.4 / 20, 0.01, 'pitch → PPI 联动正常');
setInputs({ angleIn: 60 }); ctx.braidSync('angle');
near(parseFloat(document.getElementById('ppi').value), (144 / 2) * 25.4 / (Math.PI * 8 / Math.tan(30 * Math.PI / 180)), 0.05, 'angle → PPI 联动正常');

// ---------- 9. 克重 / 强度：圆丝-扁丝转换（与编织同形态） ----------
section('9. 克重 / 强度 的圆丝-扁丝转换');
const weightCode = scriptBlocks.find(c => c.includes('// ========== 克重转换 =========='));
ok(!!weightCode, '定位到克重转换脚本');
new vm.Script(weightCode).runInContext(ctx);

// 金属丝：圆丝面积 = πd²/4，扁丝面积 = 宽×厚
const setW = (o) => { for (const [k, v] of Object.entries(o)) document.getElementById(k).value = String(v); };
setW({ material: '304', wireType: '圆丝', diameter: 0.05, thickness: 0.127, width: 0.05, metalWeight: 1000, metalStrands: 1 });
ctx.weightCalc();
const areaRound = Math.PI * Math.pow(0.05 / 2, 2);            // 0.0019635
const rho304 = 7.93;
near(parseFloat(txt('areaOut')), areaRound, 1e-6, `圆丝 0.05 截面积 ${txt('areaOut')} mm² = πd²/4`);
near(parseFloat(txt('gpmOut')), areaRound * rho304, 1e-6, `圆丝每米克重 ${txt('gpmOut')} g/m = 面积×密度`);
near(parseFloat(txt('lengthOut')), 1000 / (areaRound * rho304), 0.2, `圆丝 1000g 长度 ${txt('lengthOut')} m`);
setW({ wireType: '扁丝' });
ctx.weightCalc();
const areaFlat = 0.05 * 0.127;                                // 0.00635
near(parseFloat(txt('areaOut')), areaFlat, 1e-6, `扁丝 0.05×0.127 截面积 ${txt('areaOut')} mm² = 宽×厚`);
near(parseFloat(txt('gpmOut')), areaFlat * rho304, 1e-6, `扁丝每米克重 ${txt('gpmOut')} g/m`);
near(parseFloat(txt('lengthOut')), 1000 / (areaFlat * rho304), 0.2, `扁丝 1000g 长度 ${txt('lengthOut')} m`);
// 合股数：单股可用长度 = 总长 / 股数
setW({ metalStrands: 2 }); ctx.weightCalc();
near(parseFloat(txt('strandLengthOut')), 1000 / (areaFlat * rho304) / 2, 0.2, `2 股时单股可用 ${txt('strandLengthOut')} m`);
// 切换丝型：同一格内 直径 ⇄ 厚度×宽度
setW({ wireType: '圆丝' }); ctx.weightToggleFields();
eq(txt('wSizeLabel'), '丝径 d (mm)', '克重：圆丝标注「丝径 d」');
eq(document.getElementById('diameter').hiddenClass, false, '克重：圆丝显示直径');
eq(document.getElementById('thickness').hiddenClass, true, '克重：圆丝隐藏厚度');
eq(document.getElementById('width').hiddenClass, true, '克重：圆丝隐藏宽度');
eq(document.getElementById('wFlatX').hiddenClass, true, '克重：圆丝隐藏 × 号');
setW({ wireType: '扁丝' }); ctx.weightToggleFields();
eq(txt('wSizeLabel'), '厚度 × 宽度 (mm)', '克重：扁丝标注「厚度 × 宽度」');
eq(document.getElementById('diameter').hiddenClass, true, '克重：扁丝隐藏直径');
eq(document.getElementById('thickness').hiddenClass, false, '克重：扁丝显示厚度');
eq(document.getElementById('width').hiddenClass, false, '克重：扁丝显示宽度');
eq(document.getElementById('wFlatX').hiddenClass, false, '克重：扁丝显示 × 号');

// 强度：圆丝/扁丝截面积与断裂力
setW({ strType: '圆丝', strDia: 0.05, strThick: 0.127, strWidth: 0.05, strMPa: 500 });
ctx.strengthCalc();
near(parseFloat(txt('strengthOut')), 500 * areaRound, 1e-4, `强度：圆丝断裂力 ${txt('strengthOut')} N`);
setW({ strType: '扁丝' }); ctx.strengthCalc();
near(parseFloat(txt('strengthOut')), 500 * areaFlat, 1e-4, `强度：扁丝断裂力 ${txt('strengthOut')} N = 500×宽×厚`);
setW({ strType: '圆丝' }); ctx.strengthToggleFields();
eq(txt('sSizeLabel'), '丝径 d (mm)', '强度：圆丝标注「丝径 d」');
eq(document.getElementById('strDia').hiddenClass, false, '强度：圆丝显示直径');
setW({ strType: '扁丝' }); ctx.strengthToggleFields();
eq(txt('sSizeLabel'), '厚度 × 宽度 (mm)', '强度：扁丝标注「厚度 × 宽度」');
eq(document.getElementById('strDia').hiddenClass, true, '强度：扁丝隐藏直径');
eq(document.getElementById('strThick').hiddenClass, false, '强度：扁丝显示厚度');
eq(document.getElementById('strWidth').hiddenClass, false, '强度：扁丝显示宽度');
eq(document.getElementById('sFlatX').hiddenClass, false, '强度：扁丝显示 × 号');

// ---------- 10. 脱模后外径（PPI → 编织角 → 回弹到自然角） ----------
section('10. 脱模后外径');
const setO = (o) => { for (const [k, v] of Object.entries(o)) document.getElementById(k).value = String(v); };
const offOf = (o) => {
  setO(Object.assign({ spindles: 144, mandrel: 8, wire: 0.03, shares: 1, wireShape: 'round', ppi: 55, length: 10, craft: '1x2', natAngle: 54.7, rebound: 0.1 }, o));
  ctx.braidSync('ppi'); ctx.braidCalc(); return parseFloat(txt('odOff'));
};
// 默认（D=8, d=0.03, 144锭 1x2, PPI55, θₙ=54.7, λ=0.2）手工核算
const Dm0 = 8 + 0.03, P55 = 72 * 25.4 / 55;
const sn0 = Math.sin(Math.atan(Math.PI * Dm0 / P55)), snN = Math.sin(54.7 * Math.PI / 180);
const onMandrel = Dm0 + 0.03;
const expOff = onMandrel * (1 + 0.1 * (snN - sn0) / snN);
near(ctx.braidOffMandrel(8, 0.03, 55, 144, '1x2').od, expOff, 1e-12, `braidOffMandrel 手算一致 ${expOff.toFixed(4)} mm`);
near(offOf({}), expOff, 0.002, `默认脱模外径 ${txt('odOff')} mm（手算 ${expOff.toFixed(3)}）`);
eq(txt('odOffSub'), 'mm（+2.6%）', `脱模外径标注回弹比例 ${txt('odOffSub')}`);
ok(parseFloat(txt('odOff')) > parseFloat(txt('od')), '低编织角（37°<自然角）→ 脱模后变粗');
// λ=0：不回弹，等于在模外径
const off0 = offOf({ rebound: 0 });
eq(off0, parseFloat(txt('od')), 'λ=0 → 脱模外径 = 在模外径');
eq(txt('odOffSub'), 'mm（= 在模）', 'λ=0 → 标注「= 在模」');
// λ 越大回弹越多
const offL1 = offOf({ rebound: 1 });
ok(offL1 > offOf({}), `λ 越大越回弹（0.2 → ${offOf({})}，1 → ${offL1}）`);
near(offL1, onMandrel * (1 + (snN - sn0) / snN), 0.002, `λ=1 → 完全放松到自然角 ${offL1} mm`);
// PPI 越高（编织角越大）→ 脱模后越细
const off10 = offOf({ ppi: 10 }), off55 = offOf({ ppi: 55 }), off200 = offOf({ ppi: 200 });
ok(off10 > off55 && off55 > off200, `PPI↑ → 脱模外径↓（10: ${off10}，55: ${off55}，200: ${off200}）`);
// 高编织角（θ0 > θn）时脱模后变细
const offHigh = offOf({ ppi: 200 });
ok(offHigh < parseFloat(txt('od')), `θ0>θn（PPI200）→ 脱模后变细（${offHigh} < ${txt('od')}）`);
// 自然角越大 → 回弹越多；留空按 54.7°
const offA80 = offOf({ natAngle: 80 }), offAempty = offOf({ natAngle: '' });
ok(offA80 > offOf({}), `自然角 80° > 54.7° 的回弹（${offA80} > ${offOf({})}）`);
near(offAempty, expOff, 0.002, '自然角留空按 54.7° 处理');
// 回弹系数留空按 0
setO({ rebound: '' }); ctx.braidCalc();
eq(parseFloat(txt('odOff')), parseFloat(txt('od')), '回弹系数留空按 0（= 在模）');
// 报告
setO({ rebound: 0.1 }); ctx.braidCalc();
const pv = document.getElementById('preview').value;
ok(pv.includes('5、脱模后外径：' + txt('odOff') + ' mm'), '报告含脱模后外径行');
ok(pv.includes('回弹 +2.6%') && pv.includes('自然角 54.7°、λ 0.10'), '报告注明回弹比例与模型参数');
// PPI 为空 → 脱模外径也置 -
setO({ ppi: '' }); ctx.braidCalc();
eq(txt('odOff'), '-', 'PPI 为空 → 脱模外径 -');

eq(missing.size, 0, '脚本引用的元素均存在于页面（编织 / 克重 / 强度，无增厚系数、无反推残留）', [...missing].join(', '));

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
