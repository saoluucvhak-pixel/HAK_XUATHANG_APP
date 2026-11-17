const test = require('node:test'),
  assert = require('node:assert/strict'),
  vm = require('node:vm'),
  fs = require('node:fs');
const JSZip = require('../app/libs/jszip.min.js'),
  W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
class Node {
  constructor(name, text, children = []) {
    this.localName = name;
    this.value = text;
    this.children = [];
    this.attributes = {};
    children.forEach((c) => this.appendChild(c));
  }
  get ownerDocument() {
    let n = this;
    while (n.parentNode) n = n.parentNode;
    return n;
  }
  createElementNS(ns, name) {
    return new Node(name.split(':').pop());
  }
  getElementsByTagNameNS(ns, name) {
    return this.children.flatMap((c) => (name === '*' || c.localName === name ? [c] : []).concat(c.getElementsByTagNameNS(ns, name)));
  }
  get textContent() {
    return this.value === undefined ? this.children.map((c) => c.textContent).join('') : this.value;
  }
  set textContent(value) {
    this.value = String(value);
    this.children = [];
  }
  setAttributeNS(ns, key, value) {
    this.attributes[key] = value;
  }
  cloneNode(deep) {
    const n = new Node(this.localName, this.value);
    n.attributes = { ...this.attributes };
    if (deep) this.children.forEach((c) => n.appendChild(c.cloneNode(true)));
    return n;
  }
  appendChild(c) {
    c.parentNode = this;
    this.children.push(c);
    return c;
  }
  insertBefore(c, anchor) {
    if (!anchor) return this.appendChild(c);
    const at = this.children.indexOf(anchor);
    assert.ok(at >= 0);
    c.parentNode = this;
    this.children.splice(at, 0, c);
    return c;
  }
  removeChild(c) {
    const at = this.children.indexOf(c);
    assert.ok(at >= 0);
    this.children.splice(at, 1);
    c.parentNode = null;
  }
  querySelector() {
    return null;
  }
}
const t = (text) => new Node('t', text),
  br = () => new Node('br'),
  run = (text, props = []) =>
    new Node('r', undefined, [
      new Node(
        'rPr',
        undefined,
        props.map((p) => new Node(p))
      ),
      t(text),
    ]),
  para = (...runs) => new Node('p', undefined, runs);
function harness(doc) {
  let output = '';
  const zip = {
    file: (name, value) => {
      if (value !== undefined) {
        output = value;
        return zip;
      }
      return { async: async () => '<xml/>' };
    },
    generateAsync: async () => new Uint8Array([1]),
  };
  const window = { HAK: { BklsForm01: 'AA==' } },
    ctx = {
      window,
      Uint8Array,
      Blob,
      atob,
      btoa,
      JSZip: { loadAsync: async () => zip },
      DOMParser: class {
        parseFromString() {
          return doc;
        }
      },
      XMLSerializer: class {
        serializeToString() {
          return 'serialized';
        }
      },
    };
  vm.runInNewContext(fs.readFileSync(require.resolve('../app/js/bkls-builder.js'), 'utf8'), ctx);
  vm.runInNewContext(fs.readFileSync(require.resolve('../app/js/bkls-templates.js'), 'utf8'), ctx);
  return { T: window.HAK.BklsTemplates, B: window.HAK.BklsBuilder, ctx };
}
test('inserted values do not inherit the bold label or stale line breaks', () => {
  const p = para(run('5. Thông tin vận chuyển: ', ['b']), run('Old value')),
    doc = new Node('document', undefined, [p]),
    { T } = harness(doc);
  T.replaceParagraph(p, '5. Thông tin vận chuyển: Kho A đến Cảng B');
  const runs = p.getElementsByTagNameNS(W, 'r');
  assert.equal(p.textContent, '5. Thông tin vận chuyển: Kho A đến Cảng B');
  assert.equal(runs[0].getElementsByTagNameNS(W, 'b').length, 1);
  assert.equal(runs[1].getElementsByTagNameNS(W, 'b').length, 0);
});
test('footnote superscript is retained on the label, not applied to inserted data', () => {
  const p = para(run('- Địa chỉ'), run('(6)', ['vertAlign']), run(': …')),
    doc = new Node('document', undefined, [p]),
    { T } = harness(doc);
  T.replaceParagraph(p, '- Địa chỉ(6): Address QA');
  assert.equal(p.textContent, '- Địa chỉ(6): Address QA');
  const runs = p.getElementsByTagNameNS(W, 'r');
  assert.equal(
    runs
      .filter((r) => r.getElementsByTagNameNS(W, 'vertAlign').length)
      .map((r) => r.textContent)
      .join(''),
    '(6)'
  );
  assert.equal(runs.at(-1).getElementsByTagNameNS(W, 'vertAlign').length, 0);
});
test('form fill preserves signature lines and never writes quantities into appendix column headings', async () => {
  const owner = para(run('- Tên chủ lâm sản(4): …')),
    qty = para(run('- Số lượng (bằng số và chữ: …): …')),
    leftDate = para(run('…, ngày… tháng … năm …')),
    rightDate = para(
      run('…, ngày… tháng … năm …', ['i']),
      new Node('r', undefined, [br()]),
      run('TỔ CHỨC/CÁ NHÂN LẬP BẢNG KÊ', ['b']),
      new Node('r', undefined, [br()]),
      run('(Ký, ghi rõ họ tên)', ['i'])
    ),
    appendix = para(run('BẢNG KÊ CHI TIẾT')),
    header = para(run('Số lượng (thanh/tấm/lóng)', ['b'])),
    source = para(run('Nguồn gốc(7)', ['b'])),
    doc = new Node('document', undefined, [owner, qty, leftDate, rightDate, appendix, new Node('tbl', undefined, [header, source])]),
    { T } = harness(doc);
  await T.render(
    { id: 'custom', kind: 'form01', base64: 'AA==' },
    { g: {} },
    {},
    {
      tenChuLamSanLine: 'Tên chủ lâm sản(4): QA',
      soLuongLine: 'Số lượng (bằng số và chữ): 9 BDMT',
      kyNgayText: 'Ngày 17 tháng 10 năm 2026',
    }
  );
  assert.match(owner.textContent, /QA/);
  assert.match(qty.textContent, /9 BDMT/);
  assert.equal(leftDate.textContent, '…, ngày… tháng … năm …');
  assert.ok(rightDate.textContent.includes('Ngày 17 tháng 10 năm 2026'));
  assert.ok(rightDate.textContent.includes('TỔ CHỨC/CÁ NHÂN LẬP BẢNG KÊ'));
  assert.ok(rightDate.textContent.includes('(Ký, ghi rõ họ tên)'));
  assert.equal(header.textContent, 'Số lượng (thanh/tấm/lóng)');
  assert.equal(source.textContent, 'Nguồn gốc(7)');
});
test('bundled Form 01 uses old HAK A4 margins and Times New Roman 11.5pt', async () => {
  const ctx = { window: { HAK: {} } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../app/js/bkls-form01.js'), 'utf8'), ctx);
  const zip = await JSZip.loadAsync(Buffer.from(ctx.window.HAK.BklsForm01, 'base64')),
    xml = await zip.file('word/document.xml').async('string');
  assert.match(xml, /<w:pgSz[^>]*w:w="11907"[^>]*w:h="16840"/);
  for (const [key, value] of Object.entries({ top: 1134, left: 1701, right: 1134, bottom: 1134 }))
    assert.match(xml, new RegExp('w:' + key + '="' + value + '"'));
  assert.ok(xml.includes('Times New Roman'));
  assert.ok(xml.includes('w:sz w:val="23"'));
  assert.ok(xml.includes('w:pageBreakBefore'));
  assert.ok(xml.includes('w:cantSplit'));
  assert.ok(xml.includes('TỔ CHỨC/CÁ NHÂN LẬP BẢNG KÊ'));
  assert.equal((xml.match(/<w:drawing\b/g) || []).length, 1);
  assert.ok(zip.file('word/media/hak-current-qr.jpeg'));
  assert.match(await zip.file('word/_rels/document.xml.rels').async('string'), /rIdHAKQR/);
});

test('template builder maps text across Word runs while retaining label emphasis and drawings', () => {
  const picture = new Node('drawing'),
    p = para(run('Số: ', ['b']), run('QA/20'), run('26/BKLS'), new Node('r', undefined, [picture])),
    doc = new Node('document', undefined, [p]),
    { B } = harness(doc);
  B.replaceRange(p, [{ key: 'SO_BKLS', start: 4, end: 16, selected: 'QA/2026/BKLS' }]);
  assert.equal(p.textContent, 'Số: {{SO_BKLS}}');
  assert.equal(p.getElementsByTagNameNS(W, 'b').length, 1);
  assert.equal(p.getElementsByTagNameNS(W, 'drawing').length, 1);
});
test('template builder rejects changed text and overlapping mappings', () => {
  const p = para(run('abcdef')),
    doc = new Node('document', undefined, [p]),
    { B } = harness(doc);
  assert.throws(() => B.replaceRange(p, [{ key: 'SO_BKLS', start: 0, end: 2, selected: 'zz' }]), /không còn đúng/);
  assert.throws(
    () =>
      B.replaceRange(p, [
        { key: 'SO_BKLS', start: 0, end: 3, selected: 'abc' },
        { key: 'KHOI_LUONG', start: 2, end: 5, selected: 'cde' },
      ]),
    /chồng/
  );
  assert.equal(p.textContent, 'abcdef');
});
test('new BKLS lists the contract reference rather than individual vehicles', async () => {
  const p = para(run('6. Hồ sơ kèm theo (nếu có): …')),
    doc = new Node('document', undefined, [p]),
    { T } = harness(doc);
  await T.render(
    { id: 'custom', kind: 'form01', base64: 'AA==' },
    { g: { contractNo: 'QA/HD/2026' } },
    {},
    { hoSo: { head: '1 xe', rows: [{ t: 'xe QA-01' }] } }
  );
  assert.equal(p.textContent, '6. Hồ sơ kèm theo (nếu có): Hợp đồng số QA/HD/2026.');
});

test('mapped quantity fields contain only values so builder labels are not repeated', () => {
  const { T } = harness(new Node('document'));
  const data = T.valuesMap(
    {
      soBklsLine: 'Số: QA',
      khoiLuongLine: 'Khối lượng/trọng lượng (bằng số và chữ): 12,00 Tấn',
      soLuongLine: 'Số lượng (bằng số và chữ): 5,76 BDMT',
      vanChuyenLine: 'Thông tin vận chuyển (nếu có): Kho A đến B',
    },
    { g: {} },
    {}
  );
  assert.equal(data.KHOI_LUONG, '12,00 Tấn');
  assert.equal(data.SO_LUONG, '5,76 BDMT');
  assert.equal(data.VAN_CHUYEN, 'Kho A đến B');
});
