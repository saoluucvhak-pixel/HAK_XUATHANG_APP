/* Kiểm tra giao diện tự động theo tiêu chí QA của HAK-Enterprise-Design-System (V10.4):
 *  - không tràn ngang ở 1366×768, 1920×1080 và điện thoại 390×844;
 *  - 4 chủ đề (luxe / classic / neutral / champagne) × sáng / tối: chữ đạt tương phản WCAG AA (4,5:1; 3:1 chữ lớn);
 *  - mọi nút / ô nhập đều có nhãn truy cập; không lỗi script.
 * Chạy: npm run ui-audit (cần playwright; trong CI cài riêng). Thoát mã 1 nếu có vi phạm. */
const { chromium } = require('playwright');
const path = require('node:path');
const APP = 'file://' + path.resolve(__dirname, '../app/index.html');
async function login(p) {
  await p.goto(APP);
  await p.waitForSelector('#authForm', { timeout: 15000 });
  await p.fill('#auName', 'Test');
  await p.fill('#auUser', 'tester');
  await p.fill('#auPw', 'matkhau123');
  await p.fill('#auPw2', 'matkhau123');
  await p.click('#authForm button[type=submit]');
  await p.waitForTimeout(1500);
  for (let i = 0; i < 4; i++) {
    const nb = await p.$('button:has-text("Tiếp tục")');
    if (!nb || !(await nb.isVisible())) break;
    const chk = await p.$('#auKept');
    if (chk && (await chk.isVisible())) await chk.check();
    await nb.click();
    await p.waitForTimeout(700);
  }
  const co = await p.$('[data-co="hak"]');
  if (co) {
    await co.click();
    await p.waitForTimeout(2000);
  }
}
const probe = () => {
  const out = {
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  };
  const vis = (e) => {
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && e.offsetParent !== null;
  };
  const name = (e) =>
    (e.getAttribute('aria-label') || e.getAttribute('title') || e.textContent || '').trim() ||
    (e.id && document.querySelector('label[for="' + e.id + '"]') ? 'x' : '') ||
    (e.closest('label') ? 'x' : '') ||
    e.getAttribute('placeholder') ||
    '';
  const unnamed = [];
  document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button]').forEach((e) => {
    if (!vis(e)) return;
    if (e.tagName === 'INPUT' && ['checkbox', 'radio'].includes(e.type) && e.closest('label')) return;
    if (!name(e))
      unnamed.push(
        e.tagName.toLowerCase() +
          (e.id ? '#' + e.id : '') +
          (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : '')
      );
  });
  out.unnamed = unnamed.slice(0, 10);
  out.unnamedN = unnamed.length;
  // phần tử tràn ra ngoài khung nhìn bên phải (trừ vùng cuộn)
  const vw = document.documentElement.clientWidth;
  const off = [];
  document.querySelectorAll('body *').forEach((e) => {
    if (!vis(e)) return;
    const r = e.getBoundingClientRect();
    if (r.right > vw + 2 && r.width < vw) {
      let p = e.parentElement,
        scrolled = false;
      while (p && p !== document.body) {
        const o = getComputedStyle(p).overflowX;
        if (o === 'auto' || o === 'scroll' || o === 'hidden') {
          scrolled = true;
          break;
        }
        p = p.parentElement;
      }
      if (!scrolled)
        off.push(
          e.tagName.toLowerCase() +
            (e.id ? '#' + e.id : '') +
            (typeof e.className === 'string' && e.className ? '.' + e.className.split(' ')[0] : '')
        );
    }
  });
  out.offscreen = off.slice(0, 8);
  out.offscreenN = off.length;
  // vùng bấm nhỏ
  const small = [];
  document.querySelectorAll('button, a[href], input[type=checkbox], input[type=radio], select, [role=button]').forEach((e) => {
    if (!vis(e)) return;
    const r = e.getBoundingClientRect();
    if (r.width < 24 || r.height < 24)
      small.push((e.id || e.className || e.tagName).toString().split(' ')[0] + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
  });
  out.smallN = small.length;
  out.small = small.slice(0, 6);
  // tương phản
  const lum = (c) => {
    const a = c.map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  };
  const parse = (s) => {
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map((x) => parseFloat(x));
    return { rgb: p.slice(0, 3), a: p[3] === undefined ? 1 : p[3] };
  };
  const bgOf = (e) => {
    let x = e;
    while (x) {
      const c = parse(getComputedStyle(x).backgroundColor);
      if (c && c.a > 0.95) return c.rgb;
      x = x.parentElement;
    }
    return [255, 255, 255];
  };
  const low = [];
  const seen = new Set();
  document.querySelectorAll('p, span, td, th, label, a, button, h1, h2, h3, h4, h5, h6, li, small, div').forEach((e) => {
    if (!vis(e)) return;
    const own = Array.from(e.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!own) return;
    const cs = getComputedStyle(e);
    const fg = parse(cs.color);
    if (!fg) return;
    const bg = bgOf(e);
    const mix = fg.rgb.map((v, i) => v * fg.a + bg[i] * (1 - fg.a));
    const L1 = lum(mix),
      L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(cs.fontSize),
      bold = parseInt(cs.fontWeight) >= 700;
    const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
    if (ratio < need) {
      const key = cs.color + '|' + bg.join(',');
      if (!seen.has(key)) {
        seen.add(key);
        low.push({
          t: e.textContent.trim().slice(0, 28),
          r: +ratio.toFixed(2),
          need,
          fg: cs.color,
          bg: 'rgb(' + bg.join(',') + ')',
          cls: (typeof e.className === 'string' ? e.className : '').split(' ')[0],
        });
      }
    }
  });
  out.lowContrast = low.slice(0, 8);
  out.lowN = low.length;
  return out;
};

const ROUTES = [
  '#/home',
  '#/catalog',
  '#/file',
  '#/guikho',
  '#/xuatkhau',
  '#/chungtu',
  '#/report',
  '#/contractoverview',
  '#/archive',
  '#/settings',
];
(async () => {
  const exe = process.env.HAK_CHROMIUM || undefined;
  const browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {});
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
  const errs = [],
    bad = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await login(page);
  const visit = async (label, r) => {
    await page.evaluate((x) => {
      location.hash = x;
    }, r);
    await page.waitForTimeout(350);
    const res = await page.evaluate(probe);
    if (res.overflowX) bad.push(label + ' ' + r + ': tràn ngang ' + res.scrollW + ' > ' + res.clientW);
    if (res.offscreenN)
      bad.push(label + ' ' + r + ': ' + res.offscreenN + ' phần tử ngoài khung nhìn (' + res.offscreen.slice(0, 3).join(', ') + ')');
    if (res.unnamedN)
      bad.push(label + ' ' + r + ': ' + res.unnamedN + ' điều khiển không có nhãn truy cập (' + res.unnamed.slice(0, 3).join(', ') + ')');
    if (res.lowN)
      bad.push(
        label + ' ' + r + ': ' + res.lowN + ' cặp màu thiếu tương phản (vd "' + res.lowContrast[0].t + '" ' + res.lowContrast[0].r + ':1)'
      );
    return res;
  };
  for (const [w, h] of [
    [1366, 768],
    [1920, 1080],
    [390, 844],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    for (const r of ROUTES) await visit(w + 'x' + h, r);
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  for (const theme of ['luxe', 'classic', 'neutral', 'champagne'])
    for (const mode of ['light', 'dark']) {
      await page.evaluate(
        ([t, m]) => {
          document.documentElement.setAttribute('data-hak-theme', t);
          document.documentElement.setAttribute('data-bs-theme', m);
        },
        [theme, mode]
      );
      for (const r of ROUTES) await visit(theme + '/' + mode, r);
    }
  await browser.close();
  console.log('Đã kiểm ' + (3 * ROUTES.length + 8 * ROUTES.length) + ' màn hình; lỗi script: ' + errs.length + '; vi phạm: ' + bad.length);
  errs.concat(bad).forEach((m) => console.error(' - ' + m));
  if (errs.length || bad.length) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
