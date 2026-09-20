// 编织页「覆盖率 / 输出外径」本地测试
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

for (const id of ['bwidth', 'wire', 'ppi', 'pitchIn', 'angleIn', 'craft', 'cover', 'mesh', 'od']) {
  ok(braidHtml.includes(`id="${id}"`), `编织页存在 #${id}`);
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
const makeEl = (id) => ({
  id, value: defaults[id] ?? '', textContent: '-', innerHTML: '', style: {}, dataset: {},
  classList: { add() {}, remove() {}, toggle() {} },
});
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
// 页面初始化：DOMContentLoaded 里调用 braidSync('ppi') + braidCalc()
ctx.braidSync('ppi');
ctx.braidCalc();

const txt = (id) => document.getElementById(id).textContent;
const pct = (id) => parseFloat(txt(id));

section('3. 输出项存在性');
ok(missing.size === 0, '脚本引用的元素均存在于页面', [...missing].join(', '));
ok(/^\d+(\.\d+)?%$/.test(txt('cover')), `覆盖率输出为百分比: ${txt('cover')}`);
ok(/^\d+\.\d{3}$/.test(txt('mesh')), `当前孔径输出为 3 位小数: ${txt('mesh')}`);
eq(txt('meshSub'), 'mm', '当前孔径单位为 mm');
ok(/^\d+\.\d{3}$/.test(txt('od')), `输出外径输出为 3 位小数: ${txt('od')}`);
const preview = document.getElementById('preview').value;
ok(preview.includes('3、覆盖率：' + txt('cover')), '报告含覆盖率行');
ok(preview.includes('4、输出外径：' + txt('od') + ' mm'), '报告含输出外径行');
ok(preview.includes('丝宽：0.030 mm'), '报告含丝宽');

// ---------- 4. 默认参数：外径与覆盖率 ----------
section('4. 默认参数（N=144, 1x2, D=8, d=0.03, w=0.03, PPI=55）');
const D0 = 8, d0 = 0.03, w0 = 0.03, N0 = 144, ppi0 = 55, sp0 = 144;
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
eq(txt('od'), (D0 + 2 * d0 * 1).toFixed(3), '输出外径 = D + 2dk = 8.060');

// ---------- 5. 覆盖率与网孔公式 ----------
section('5. 覆盖率与网孔公式');
const setInputs = (o) => { for (const [k, v] of Object.entries(o)) document.getElementById(k).value = String(v); };
const coverOf = (o) => { setInputs(o); ctx.braidSync('ppi'); ctx.braidCalc(); return pct('cover'); };

// 孔径几何：孔径 g = w(1/C1-1)，菱形网孔（对角线 g/sinθ 与 g/cosθ），覆盖率 100% ⇔ g=0
setInputs({ spindles: 144, mandrel: 8, bwidth: 0.03, wire: 0.03, ppi: 55, length: 10, craft: '1x2' });
ctx.braidSync('ppi'); ctx.braidCalc();
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
near(holeFrac, (mv.gap / p0) ** 2, 1e-15, '网孔面积占比 = (g/p)²');
near(holeFrac, 1 - mv.total, 1e-12, '网孔面积占比 = 1−覆盖率（几何排布法与交织公式法自洽）');
eq((braidHtml.match(/class="kpi/g) || []).length, 9, '结果卡 9 格（6 原有 + 覆盖率 + 当前孔径 + 输出外径）');

// 覆盖率 100% ⇔ 孔径 0
setInputs({ spindles: 144, mandrel: 1, bwidth: 0.5, wire: 0.5, ppi: 55, length: 10, craft: '1x2' });
ctx.braidCalc();
eq(txt('cover'), '100.0%', '全覆盖时覆盖率 100.0%');
eq(txt('mesh'), '0.000', '全覆盖时当前孔径 0.000');
eq(txt('meshSub'), '无网孔', '全覆盖时孔径标注「无网孔」');
eq(ctx.braidCoverage(1, 0.5, 55, 144, '1x2').gap, 0, 'C1≥1 时孔径 g=0');
ok(document.getElementById('cover').style.color === 'var(--green)', '全覆盖时覆盖率显示绿色');
ok(document.getElementById('mesh').style.color === 'var(--green)', '无网孔时孔径显示绿色');

// 单调性：越密孔径越小
coverOf({ spindles: 144, mandrel: 8, bwidth: 0.02, wire: 0.02, ppi: 55, length: 10 });
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

// 45° 特例：pitch = πD → θ=45°；N=8, D=10, w=0.5
const D1 = 10, N1 = 8, w1 = 0.5;
const ppi1 = (N1 / 2) * 25.4 / (Math.PI * D1);
const c45 = coverOf({ spindles: N1, mandrel: D1, bwidth: w1, wire: 0.03, ppi: ppi1, length: 10 });
const exp45 = 1 - (1 - (N1 / 2) * (w1 / Math.cos(Math.PI / 4)) / (Math.PI * D1)) ** 2;
near(c45 / 100, exp45, 0.0005, `45° 特例覆盖率 ${c45}%（手算 ${(exp45 * 100).toFixed(1)}%）`);
const c1_45 = (N1 / 2) * w1 / (Math.PI * D1 * Math.cos(Math.PI / 4));
near(ctx.braidCoverage(D1, w1, ppi1, N1, '1x2').gap, w1 * (1 / c1_45 - 1), 1e-12,
  `45° 特例孔径 ${(w1 * (1 / c1_45 - 1)).toFixed(4)} mm = w(1/C1-1)`);

// 丝宽越大覆盖率越高
const cThin = coverOf({ spindles: 144, mandrel: 8, bwidth: 0.02, wire: 0.02, ppi: 55, length: 10 });
const cThick = coverOf({ spindles: 144, mandrel: 8, bwidth: 0.05, wire: 0.05, ppi: 55, length: 10 });
ok(cThick > cThin, `丝宽↑ → 覆盖率↑（${cThin}% → ${cThick}%）`);

// 芯棒越粗覆盖率越低
const cSmall = coverOf({ spindles: 144, mandrel: 4, bwidth: 0.03, wire: 0.03, ppi: 55, length: 10 });
const cBig = coverOf({ spindles: 144, mandrel: 16, bwidth: 0.03, wire: 0.03, ppi: 55, length: 10 });
ok(cSmall > cBig, `芯棒↑ → 覆盖率↓（${cSmall}% → ${cBig}%）`);

// 上限 100%
const cFull = coverOf({ spindles: 144, mandrel: 1, bwidth: 0.5, wire: 0.5, ppi: 55, length: 10 });
eq(cFull, 100, '高密编织覆盖率封顶 100.0%');
ok(cFull <= 100, '覆盖率不超过 100%');

// 锭数越多覆盖率越高（选低覆盖参数，避免贴近 100% 封顶看不出差异）
const c8 = coverOf({ spindles: 8, mandrel: 10, bwidth: 0.1, wire: 0.03, ppi: 10, length: 10 });
const c64 = coverOf({ spindles: 64, mandrel: 10, bwidth: 0.1, wire: 0.03, ppi: 10, length: 10 });
ok(c64 > c8, `锭数↑ → 覆盖率↑（${c8}% → ${c64}%）`);

// 工艺结构：1x1 节距系数更大(div=4) → 节距更小 → 螺旋角更贴近周向 → 单向覆盖更高
const c1x1 = coverOf({ spindles: 144, mandrel: 8, bwidth: 0.03, wire: 0.03, ppi: 55, length: 10, craft: '1x1' });
const c1x2 = coverOf({ spindles: 144, mandrel: 8, bwidth: 0.03, wire: 0.03, ppi: 55, length: 10, craft: '1x2' });
ok(c1x1 > c1x2, `1x1（节距更小/角更周向）覆盖率高于 1x2（${c1x1}% > ${c1x2}%）`);

// ---------- 6. 输出外径行为（无增厚系数：OD = D + 2d） ----------
section('6. 输出外径行为');
const odOf = (wire, mandrel = 8) => { setInputs({ mandrel, wire }); ctx.braidCalc(); return txt('od'); };
eq(odOf(0.03), '8.060', 'D=8, d=0.03 → 8 + 2×0.03 = 8.060');
eq(odOf(0.05), '8.100', 'D=8, d=0.05 → 8 + 2×0.05 = 8.100');
eq(odOf(0.03, 10), '10.060', 'D=10, d=0.03 → 10.060');
eq(odOf(0), '8.000', '丝径 0 → 外径 = 芯棒 8.000');

// ---------- 7. 丝宽自动跟随 ----------
section('7. 丝宽随丝径联动');
setInputs({ wire: 0.03, bwidth: 0.03 });
ctx.braidWireSync();
eq(document.getElementById('bwidth').value, '0.030', '丝径不变时丝宽不变');
setInputs({ wire: 0.05 }); ctx.braidWireSync();
eq(document.getElementById('bwidth').value, '0.050', '丝径 0.05 → 丝宽自动 = 0.050');
setInputs({ bwidth: 0.12 }); ctx.braidWireSync();          // 用户手动改丝宽
setInputs({ wire: 0.08 }); ctx.braidWireSync();
eq(document.getElementById('bwidth').value, '0.12', '手动改过的丝宽不被覆盖');

// ---------- 8. 异常输入 ----------
section('8. 异常输入');
setInputs({ ppi: '' }); ctx.braidCalc();
eq(txt('cover'), '-', 'PPI 为空 → 覆盖率 -');
eq(txt('mesh'), '-', 'PPI 为空 → 当前孔径 -');
eq(txt('od'), '-', 'PPI 为空 → 输出外径 -');
setInputs({ ppi: 55, mandrel: 8, wire: 0.03, bwidth: 0.03, spindles: 144, craft: '1x2' });
ctx.braidSync('ppi'); ctx.braidCalc();
ok(txt('cover') !== '-' && txt('od') !== '-', '恢复正常输入后重新出数');

// 节距/角度输入（braidSync 另外两条链路）仍然工作
setInputs({ pitchIn: 20 }); ctx.braidSync('pitch');
near(parseFloat(document.getElementById('ppi').value), (144 / 2) * 25.4 / 20, 0.01, 'pitch → PPI 联动正常');
setInputs({ angleIn: 60 }); ctx.braidSync('angle');
near(parseFloat(document.getElementById('ppi').value), (144 / 2) * 25.4 / (Math.PI * 8 / Math.tan(30 * Math.PI / 180)), 0.05, 'angle → PPI 联动正常');

eq(missing.size,0,'脚本引用的元素均存在于页面（无增厚系数、无反推残留）',[...missing].join(', '));

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
