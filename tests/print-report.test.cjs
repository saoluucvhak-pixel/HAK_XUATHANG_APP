/* In PDF báo cáo: lỗi khi dựng bảng hoặc mở hộp thoại in được báo cho người dùng và giao diện trở về bình thường (không kẹt chế độ "đang in"). */
const { test } = require('node:test'),
  assert = require('node:assert/strict');
function dom() {
  const body = {
    classes: new Set(),
    kids: new Set(),
    classList: { add: (c) => body.classes.add(c), remove: (c) => body.classes.delete(c) },
    appendChild(n) {
      n.parentNode = body;
      body.kids.add(n);
    },
    append(n) {
      body.appendChild(n);
    },
  };
  const head = {
    kids: new Set(),
    appendChild(n) {
      n.parentNode = head;
      head.kids.add(n);
    },
  };
  const mk = () => ({
    remove() {
      if (this.parentNode) this.parentNode.kids.delete(this);
      this.parentNode = null;
    },
  });
  const listeners = new Map();
  global.window = global;
  global.HAK = { UI: { esc: (s) => String(s), toast: (m, t) => toasts.push([t, m]) }, VERSION: 'x' };
  global.document = {
    title: 'Trang gốc',
    body,
    head,
    createElement: mk,
    querySelector: () => null,
    getElementById: () => null,
    addEventListener() {},
  };
  global.addEventListener = (n, f) => listeners.set(n, f);
  global.removeEventListener = (n) => listeners.delete(n);
  return { body, head, listeners };
}
const toasts = [];
const spec = (rows) => ({ file: 'Bao_cao', title: 'T', sub: 'S', tables: [{ cols: [{ h: 'A' }], rows }] });
// customs.js ghép API HAK.Customs từ các mô-đun con (nạp theo đúng thứ tự trong index.html)
const CUSTOMS_PARTS = ['customs-common', 'customs-report', 'customs-contract-report', 'customs-export', 'customs-print', 'customs'];
function loadCustoms() {
  let last;
  for (const f of CUSTOMS_PARTS) {
    delete require.cache[require.resolve('../app/js/' + f + '.js')];
    last = require('../app/js/' + f + '.js');
  }
  return last;
}
test('hộp thoại in ném lỗi → promise bị từ chối, khôi phục trang, bỏ chế độ in', async () => {
  const d = dom();
  global.print = () => {
    throw new Error('Bị chặn in');
  };
  try {
    loadCustoms();
  } catch (e) {
    /* nếu module cần DOM khi nạp thì bỏ qua — kiểm tra bên dưới */
  }
  assert.ok(HAK.Customs && HAK.Customs.printReport, 'HAK.Customs.printReport sẵn sàng');
  await assert.rejects(HAK.Customs.printReport(spec([{ c: ['x'] }])), /Bị chặn in/);
  assert.equal(d.body.classes.has('printing'), false);
  assert.equal(d.body.kids.size, 0);
  assert.equal(d.head.kids.size, 0);
  assert.equal(document.title, 'Trang gốc');
  assert.equal(d.listeners.size, 0);
});
test('dựng bảng lỗi (dòng hỏng) → từ chối ngay, không để lại phần tử in', async () => {
  const d = dom();
  global.print = () => {};
  loadCustoms();
  await assert.rejects(HAK.Customs.printReport(spec([null])), TypeError);
  assert.equal(d.body.classes.has('printing'), false);
  assert.equal(d.body.kids.size, 0);
  assert.equal(document.title, 'Trang gốc');
});
test('in bình thường: còn chế độ in tới khi afterprint, rồi tự dọn', async () => {
  const d = dom();
  let printed = 0;
  global.print = () => {
    printed++;
  };
  loadCustoms();
  await HAK.Customs.printReport(spec([{ c: ['x'] }]));
  assert.equal(printed, 1);
  assert.equal(d.body.classes.has('printing'), true);
  d.listeners.get('afterprint')();
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(d.body.classes.has('printing'), false);
  assert.equal(d.body.kids.size, 0);
});
