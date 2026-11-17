const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  vm = require('node:vm');
const D = require('../app/js/document-import.js');
test('recognizes an agency contract code when Windows OCR drops the short number label', () => {
  for (const value of ['UTXK/QN-AB/0126', 'UTXK/DN-ZZ/0226'])
    assert.equal(D.contractNumber('HOP DONG UY THAC XUAT KHAU\n' + value + '\nHop dong nay duoc lap ngay...').value, value);
});
test('preserves original Vietnamese letters in the contract code instead of stripping them', () => {
  const text = '📄 HỢP ĐỒNG\nSố HĐ: UTXK/ĐN-AB/0126';
  assert.equal(D.contractNumber(text).value, 'UTXK/ĐN-AB/0126');
  assert.equal(D.parse(text, 'contract').find((x) => x.key === 'no').value, 'UTXK/ĐN-AB/0126');
});
test('normalizes a misread IWC year/serial separator and retains evidence of the OCR correction', () => {
  for (const separator of ['„', '–', '−', ',']) {
    const raw = 'IWC/TESTQNVT26' + separator + '1234',
      result = D.contractNumber(raw);
    assert.equal(result.value, 'IWC/TESTQNVT26-1234');
    assert.equal(result.evidence, raw);
    assert.ok(result.correction);
  }
  assert.equal(D.contractNumber('Số: IWC/TEST26„1234').value, 'IWC/TEST26-1234');
});
test('uses a first-page contract number before numbers mentioned in later appendices', () => {
  const pages = [
    { page: 2, text: 'Contract No: OTHER/2026/02' },
    { page: 1, text: 'HOP DONG UY THAC\nUTXK/QN-AB/0126' },
  ];
  assert.equal(D.contractNumberFromPages(pages).value, 'UTXK/QN-AB/0126');
  assert.equal(D.contractNumberFromPages(pages).page, 1);
  assert.equal(pages[0].page, 2);
});
test('does not invent a number from acknowledgement, quantity, vessel, filename or a boilerplate footer', () => {
  for (const text of [
    'Purchase Acknowledge: #1234',
    'Quantity: 18 000 BDMT',
    'MV SAMPLE V.2601',
    'sample-contract-1234.pdf',
    'IWC/VA/FOB/WOODCHIP2022',
    'IWC/VA/FOB/WOODCHIP - S&P 2022 MC REV.2',
  ])
    assert.equal(D.contractNumber(text), null, text);
});
class Element {
  constructor(tag, text = '') {
    this.tag = tag;
    this._text = text;
    this.children = [];
    this.value = '';
    this.dataset = {};
    this.attributes = {};
    this.classList = { add() {} };
  }
  append(...nodes) {
    this.children.push(...nodes);
  }
  replaceChildren(...nodes) {
    this.children = nodes;
    this._text = '';
  }
  set textContent(s) {
    this._text = String(s);
    this.children = [];
  }
  get textContent() {
    return this._text + this.children.map((x) => (typeof x === 'string' ? x : x.textContent)).join('');
  }
  setAttribute(k, v) {
    this.attributes[k] = v;
  }
  all() {
    return this.children.flatMap((n) => (typeof n === 'string' ? [] : [n, ...n.all()]));
  }
  querySelectorAll(selector) {
    return this.all().filter((n) =>
      selector === 'button' ? n.tag === 'button' : selector === '.ocr-proposal input:checked' ? n.tag === 'input' && n.checked : false
    );
  }
  querySelector(selector) {
    return this.all().find((n) => selector === 'input[type=file]' && n.tag === 'input' && n.type === 'file') || null;
  }
}
async function proposal(initial, text = 'HOP DONG UY THAC\nUTXK/DN-AB/0126', extra = {}) {
  const target = new Element('input');
  target.value = initial;
  target.events = [];
  target.dispatchEvent = (e) => target.events.push(e.type);
  const doc = {
    createElement: (t) => new Element(t),
    createTextNode: (s) => new Element('text', s),
    getElementById: (id) => (id === 'cf-no' ? target : extra[id] || null),
  };
  const window = { HAK: { DB: { get: async () => ({ id: 'qa', name: 'QA.pdf', size: 10, base64: 'UERG' }), usable: () => true } } },
    ctx = {
      window,
      document: doc,
      console,
      Uint8Array,
      Blob,
      atob,
      btoa,
      AbortController,
      setTimeout,
      clearTimeout,
      Event: class {
        constructor(type) {
          this.type = type;
        }
      },
      fetch: async () => ({ ok: true, json: async () => ({ language: 'en-US', pages: [{ page: 1, text }] }) }),
    };
  vm.createContext(ctx);
  for (const file of ['contract-parser.js', 'document-import.js'])
    vm.runInContext(fs.readFileSync(require.resolve('../app/js/' + file), 'utf8'), ctx);
  const container = new Element('div');
  await window.HAK.Documents.mount(container, 'contract', ['qa'], {});
  const read = container.all().find((n) => n.tag === 'button' && n.textContent === 'Đọc bằng OCR Windows');
  await read.onclick();
  return { container, target };
}
test('OCR fills an EMPTY contract number field right away, keeps the proposal editable, and re-applying a corrected number reaches the real field', async () => {
  const { container, target } = await proposal('');
  assert.equal(target.value, 'UTXK/DN-AB/0126', 'empty field is filled automatically (v2.13.0)');
  const input = container.all().find((n) => n.attributes['aria-label'] === 'Số hợp đồng OCR đề xuất');
  assert.equal(input.value, 'UTXK/DN-AB/0126');
  input.value = 'UTXK/ĐN-AB/0126';
  const apply = container.all().find((n) => n.tag === 'button' && n.textContent === 'Điền số hợp đồng');
  assert.ok(apply);
  apply.onclick();
  assert.equal(target.value, 'UTXK/ĐN-AB/0126');
  assert.deepEqual(target.events, ['input', 'input']);
});
test('OCR preserves an existing contract number until the user explicitly chooses to replace it', async () => {
  const { container, target } = await proposal('EXISTING/2026');
  assert.equal(target.value, 'EXISTING/2026');
  const apply = container.all().find((n) => n.tag === 'button' && n.textContent === 'Thay số hợp đồng hiện có');
  assert.ok(apply);
  apply.onclick();
  assert.equal(target.value, 'UTXK/DN-AB/0126');
});

test('selected OCR price and money proposals fill real form controls only after review', async () => {
  const price = new Element('input'),
    currency = new Element('select');
  price.value = '150';
  currency.value = 'VND';
  price.dispatchEvent = currency.dispatchEvent = () => {};
  const { container } = await proposal('', 'Giå däm gd lå 176,00 USD/BDMT- FOB\nPhi uy thac la 1.40 USD/BDMT', {
    'cf-priceUsd': price,
    'cf-currency': currency,
  });
  assert.equal(price.value, '150');
  assert.equal(currency.value, 'VND');
  for (const row of container.all().filter((n) => n.tag === 'label' && /Đơn giá: 176|Tiền tệ: USD/.test(n.textContent)))
    row.children.find((n) => n.tag === 'input').checked = true;
  const button = container.all().find((n) => n.tag === 'button' && /Điền các mục/.test(n.textContent));
  assert.ok(button);
  button.onclick();
  assert.equal(price.value, 176);
  assert.equal(currency.value, 'USD');
});

test('purchase order (PO): số PO, ngày ISO, tên hàng, người bán là HOANG ANH KHOI (không phải END USER / không nhầm vai)', () => {
  global.window = global;
  global.HAK = global.HAK || {};
  const CP = require('../app/js/contract-parser.js'),
    D = require('../app/js/document-import.js');
  const text = [
    '                                PURCHASE         ORDER',
    'DATE   BM: 2026-6-26',
    '',
    'PURCHASE ORDER NUMBER *!i[iji,J Jti%:0626LH-HAK2607004',
    'BASE AGREEMENT NUMBER t}}i$l%: LSV-2629-2',
    '',
    'BUYER~1.f:',
    'XIAMEN JIULI PAPER IMP. & EXP. CO., LTD .',
    'Unit 2102-2103,Ganghang Building No.29 Donggang North Road',
    '',
    'END USER li~-ff!Jfl 1J:',
    'Liansheng Pulp & Paper (Zhangzhou) Co., Ltd',
    'No.288 Xiating, Tingli village',
    '',
    "SELLER ~1i:                                          ,'     ~/",
    'HOANG ANH KHOI COMPANY LIMITED                          "\'1',
    'LAND LOT N0.1182, MAP N0.38, THACH NHAM TAY VILLAGE',
    'PRODUCTS ~rf/i:',
    'VIETNAM ACACIA WOODCHIPS ~1¥Jffl,W.*J-r',
    'QUANTITY ~:ti1: 20,000.00BDMT+/-10%',
    'UNIT PRICE .t)iift:USD 173.00/BDMT FOB DA NANG Port, Vietnam',
  ].join('\n');
  const r = CP.extract([{ page: 1, text }]);
  assert.equal(r.parties.exporter.name, 'HOANG ANH KHOI COMPANY LIMITED');
  assert.equal(r.parties.buyer.name, 'XIAMEN JIULI PAPER IMP. & EXP. CO., LTD');
  assert.equal(r.product, 'Vietnam Acacia Woodchips');
  assert.equal(r.lots[0].qty, 20000);
  assert.equal(D.contractNumber(text).value, '0626LH-HAK2607004');
  const date = D.parse(text, 'contract').find((s) => s.key === 'date');
  assert.equal(date && date.value, '2026-06-26');
});
