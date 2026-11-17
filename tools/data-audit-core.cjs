/* Đối soát dữ liệu (chỉ ĐỌC, không sửa): phiếu cân lặp / cùng nhận diện khác khối lượng hoặc cờ trả về, hồ sơ không đọc được, phiếu thiếu ngày,
 * giấy nộp tiền nghi trùng, bản ghi mồ côi (dùng HAK.Integrity). Phân biệt phiếu đi qua các BƯỚC NGHIỆP VỤ hợp lệ (kho gửi → xuất khẩu / ủy thác…)
 * với phiếu bị cộng nhiều lần trong CÙNG PHẠM VI báo cáo (cùng hình thức + cùng công ty).
 *   analyze(backup) → { exceptions:[{ code, level, ref, msg, records:[{id,title,type,cid,from,to}] }], summary:{…} }
 *   buildSample()   → bản sao lưu mẫu có đủ các trường hợp (dùng để thử quy trình khi chưa có dữ liệu thật)
 * Danh sách ngoại lệ KHÔNG xóa / sửa dữ liệu gốc: người dùng đối chiếu hồ sơ nguồn rồi mới quyết định. */
const zlib = require('node:zlib');
global.window = global;
global.HAK = global.HAK || {};
HAK.ContractModel = require('../app/js/contract-model.js');
HAK.CustomsModel = require('../app/js/customs-model.js');
const W = require('../app/js/weigh-model.js');
const Integrity = require('../app/js/integrity-model.js');
const CM = HAK.CustomsModel;

const dmyToTs = (s) => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(s || ''));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[1] ? d.getTime() : null; // ngày không tồn tại → null
};
const STEP_TYPES = new Set(['xuatkhogui', 'guikho']); // bước trung gian: phiếu đi từ kho gửi tới hồ sơ đích là HỢP LỆ
const retKey = (r) => (r.uid !== undefined ? r.uid : r.idx);

function decode(s) {
  if (typeof s !== 'string') throw new Error('dữ liệu hồ sơ không phải chuỗi');
  if (s.slice(0, 3) === 'gz:') return JSON.parse(zlib.gunzipSync(Buffer.from(s.slice(3), 'base64')).toString('utf8'));
  if (s.slice(0, 4) === 'raw:') return JSON.parse(s.slice(4));
  throw new Error('định dạng dữ liệu hồ sơ lạ');
}
const brief = (m) => ({ id: m.id, title: m.title || '', type: m.type, cid: m.cid || '', from: m.from || '', to: m.to || '' });

function analyze(backup) {
  const ex = [];
  const add = (code, level, ref, msg, records) => ex.push({ code, level, ref, msg, records: records || [] });
  const items = (backup.archive || []).filter((x) => x && x.meta);
  const recs = [];
  items.forEach((it) => {
    const m = it.meta;
    let d = null;
    try {
      d = decode(it.data);
      if (!d || !Array.isArray(d.rows)) throw new Error('không có danh sách phiếu');
    } catch (e) {
      add(
        'RECORD_UNREADABLE',
        'error',
        m.id,
        'Hồ sơ "' + (m.title || m.id) + '" không đọc được phiếu cân: ' + e.message + ' (số liệu của hồ sơ này nằm ở phần "Chưa phân bổ")',
        [brief(m)]
      );
      return;
    }
    const ret = new Set(d.params && Array.isArray(d.params.returned) ? d.params.returned : []);
    const tickets = W.ticketsOf(d.rows, (r) => ret.has(retKey(r)), { cid: m.cid || '', contract: m.contract || '', ship: m.ship || '' });
    recs.push({ m, d, tickets, fromTs: dmyToTs(m.from), toTs: dmyToTs(m.to) || dmyToTs(m.from) });
  });
  // ---- phiếu thiếu / sai ngày, lặp trong cùng hồ sơ ----
  recs.forEach((r) => {
    const undated = r.tickets.filter((t) => dmyToTs(t.date) === null);
    if (undated.length)
      add(
        'TICKET_NO_DATE',
        'warn',
        r.m.id,
        'Hồ sơ "' +
          (r.m.title || r.m.id) +
          '": ' +
          undated.length +
          ' phiếu thiếu / sai ngày cân (' +
          undated
            .map((t) => t.ticket || '(không số)')
            .slice(0, 5)
            .join(', ') +
          ') — nằm ở "Chưa phân bổ" khi báo cáo theo ngày cân',
        [brief(r.m)]
      );
    const noId = r.tickets.filter((t) => !t.id);
    if (noId.length)
      add(
        'TICKET_NO_IDENTITY',
        'warn',
        r.m.id,
        'Hồ sơ "' +
          (r.m.title || r.m.id) +
          '": ' +
          noId.length +
          ' dòng thiếu số phiếu / giờ / biển số nên không nhận diện được để loại trùng',
        [brief(r.m)]
      );
    const rep = r.tickets.filter((t) => t.id && /#([2-9]|\d{2,})$/.test(t.id));
    if (rep.length)
      add(
        'TICKET_REPEAT_IN_RECORD',
        'warn',
        r.m.id,
        'Hồ sơ "' +
          (r.m.title || r.m.id) +
          '": ' +
          rep.length +
          ' dòng trùng nhận diện với dòng khác TRONG CÙNG hồ sơ (cộng cả hai): ' +
          rep
            .map((t) => t.ticket)
            .slice(0, 5)
            .join(', '),
        [brief(r.m)]
      );
  });
  // ---- cùng nhận diện ở nhiều hồ sơ ----
  const byId = new Map();
  recs.forEach((r) => r.tickets.forEach((t) => t.id && byId.set(t.id, (byId.get(t.id) || []).concat({ r, t }))));
  let shared = 0,
    sharedKg = 0;
  byId.forEach((occ, id) => {
    const distinct = new Map();
    occ.forEach((o) => distinct.set(o.r.m.id, o));
    if (distinct.size < 2) return;
    const list = Array.from(distinct.values());
    const scopes = new Set(list.map((o) => o.r.m.type + '|' + (o.r.m.cid || '')));
    const types = new Set(list.map((o) => o.r.m.type));
    const kgs = new Set(list.map((o) => Math.round(o.t.net * 1000))),
      rets = new Set(list.map((o) => o.t.ret)),
      links = new Set(list.map((o) => o.t.link));
    const recsOf = list.map((o) => brief(o.r.m));
    const tag = 'Phiếu ' + (list[0].t.ticket || id.replace(/#\d+$/, '')) + ' (' + list[0].t.date + ', ' + list[0].t.plate + ')';
    if (scopes.size === 1) {
      // cùng hình thức + cùng công ty = cùng phạm vi báo cáo → báo cáo tự loại trùng (giữ hồ sơ mới nhất); khác nội dung thì tính tạm và báo xung đột
      if (kgs.size === 1 && rets.size === 1 && links.size === 1)
        add(
          'TICKET_DUP_SAME_SCOPE',
          'info',
          id,
          tag + ' nằm ở ' + list.length + ' hồ sơ cùng phạm vi, nội dung giống nhau → báo cáo chỉ tính một lần (tự loại bản cũ)',
          recsOf
        );
      else
        add(
          'TICKET_CONFLICT',
          'warn',
          id,
          tag +
            ' nằm ở ' +
            list.length +
            ' hồ sơ cùng phạm vi nhưng KHÁC ' +
            [
              kgs.size > 1 ? 'khối lượng (' + list.map((o) => o.t.net).join(' / ') + ' kg)' : '',
              rets.size > 1 ? 'cờ xe trả về' : '',
              links.size > 1 ? 'liên kết hợp đồng / tàu' : '',
            ]
              .filter(Boolean)
              .join(' và ') +
            ' → báo cáo tính tạm theo hồ sơ mới nhất, cần đối soát',
          recsOf
        );
    } else if ([...types].some((t) => STEP_TYPES.has(t))) {
      shared++;
      sharedKg += list[0].t.net;
      add(
        'TICKET_ACROSS_STEPS',
        'info',
        id,
        tag +
          ' đi qua các bước nghiệp vụ hợp lệ (' +
          [...types].join(' → ') +
          ') → tổng thực giao chỉ tính một lần (hồ sơ đích trước, kho gửi sau)',
        recsOf
      );
    } else {
      add(
        'TICKET_ACROSS_TYPES',
        'warn',
        id,
        tag + ' xuất hiện ở các hình thức không phải kho gửi (' + [...types].join(', ') + ') — kiểm tra có bị lập hai lần không',
        recsOf
      );
    }
  });
  // ---- giấy nộp tiền nghi trùng + toàn vẹn cha–con ----
  const catalog = (backup.keys && backup.keys['hak.catalog.v1']) || backup.catalog || { customers: [], contracts: [], customs: [] };
  const data = HAK.ContractModel.migrate(catalog).data;
  (data.customs || []).forEach((t) => {
    const pays = (t.payments || []).filter((p) => !p.deletedAt);
    for (let i = 0; i < pays.length; i++)
      for (let j = i + 1; j < pays.length; j++) {
        if (CM.samePayment(pays[i], pays[j])) continue; // đã được HAK.Integrity báo là dup-payment
        if (CM.maybeSamePayment(pays[i], pays[j]))
          add(
            'PAYMENT_MAYBE_DUP',
            'warn',
            pays[j].id,
            'Tờ khai ' +
              t.no +
              ': hai khoản nộp ' +
              pays[i].amount +
              ' đ chưa đủ số giấy để khẳng định trùng (giấy ' +
              (pays[i].receiptNo || pays[i].refNo || 'chưa ghi') +
              ' / ' +
              (pays[j].receiptNo || pays[j].refNo || 'chưa ghi') +
              ') — đối chiếu giấy nộp tiền gốc',
            []
          );
      }
  });
  const metas = items.map((x) => x.meta);
  const integ = Integrity.audit(data, metas, {
    attachmentIds: Array.isArray(backup.attachments) ? backup.attachments.map((x) => x.id) : null,
  });
  integ.forEach((f) => add('INTEGRITY:' + f.code, f.level, f.ref, f.msg, []));
  // ---- tổng: phân biệt cộng trùng cùng phạm vi với bước nghiệp vụ hợp lệ ----
  let rawKg = 0,
    rawTrips = 0;
  recs.forEach((r) => r.tickets.forEach((t) => ((rawKg += t.net), rawTrips++)));
  const cl = W.clusters(
    recs.map((r) =>
      Object.assign(
        { id: r.m.id, type: r.m.type, cid: r.m.cid, fromTs: r.fromTs, toTs: r.toTs, title: r.m.title, updatedAt: r.m.updatedAt },
        {}
      )
    )
  );
  let dupKg = 0,
    dupTrips = 0,
    pendingKg = 0,
    conflicts = 0;
  cl.forEach((c) => {
    const res = W.resolve(c.map((x) => ({ rec: x, tickets: recs.find((r) => r.m.id === x.id).tickets })));
    dupKg += res.dup.kg;
    dupTrips += res.dup.trips;
    pendingKg += res.pendingKg;
    conflicts += res.conflicts.length;
  });
  const summary = {
    records: items.length,
    unreadable: ex.filter((x) => x.code === 'RECORD_UNREADABLE').length,
    ticketsRaw: rawTrips,
    kgRaw: rawKg,
    sameScopeDuplicates: { trips: dupTrips, kg: dupKg, note: 'đã được báo cáo tự loại (cùng hình thức + công ty)' },
    sameScopeConflicts: { n: conflicts, pendingKg, note: 'khác khối lượng / cờ trả về — tính tạm theo hồ sơ mới nhất' },
    acrossValidSteps: {
      tickets: shared,
      kg: sharedKg,
      note: 'bước nghiệp vụ hợp lệ (kho gửi → hồ sơ đích) — tổng thực giao chỉ tính một lần',
    },
    errors: ex.filter((x) => x.level === 'error').length,
    warnings: ex.filter((x) => x.level === 'warn').length,
    infos: ex.filter((x) => x.level === 'info').length,
  };
  return { exceptions: ex, summary, relations: Integrity.relations(data, metas) };
}

/* ---------------- bộ dữ liệu thử đủ các trường hợp ---------------- */
function buildSample() {
  const row = (n, date, net, extra) =>
    Object.assign(
      {
        idx: n,
        uid: 'u' + n + '-' + date,
        ticket: 'P' + String(n).padStart(4, '0'),
        dateStr: date,
        plate: '43C-' + (10000 + n),
        time1: '08:00',
        net,
        carrier: 'VT-A',
      },
      extra || {}
    );
  const meta = (id, title, type, from, to, extra) =>
    Object.assign({ id, title, type, cid: 'hak', ship: title, from, to, contract: '', updatedAt: 1000, trips: 0, kg: 0 }, extra || {});
  const archive = [];
  const put = (m, rows, returned, corrupt) => {
    m.trips = rows.length;
    m.kg = rows.reduce((a, r) => a + r.net, 0);
    archive.push({
      meta: m,
      data: corrupt ? 'gz:@@không-phải-gzip@@' : 'raw:' + JSON.stringify({ params: { returned: returned || [] }, rows }),
    });
  };
  // 1) hai tàu cùng ngày, giờ xen kẽ
  put(
    meta('r-A', 'TÀU A', 'uythac', '03/02/2026', '03/02/2026', { contract: 'ct-A' }),
    [row(1, '03/02/2026', 20000, { time1: '07:00' }), row(3, '03/02/2026', 21000, { time1: '08:00' })],
    ['u3-03/02/2026']
  );
  put(meta('r-B', 'TÀU B', 'uythac', '03/02/2026', '03/02/2026'), [
    row(2, '03/02/2026', 25000, { time1: '07:30' }),
    row(4, '03/02/2026', 26000, { time1: '08:30' }),
  ]);
  // 2) hồ sơ qua năm
  put(meta('r-Y', 'TÀU QUA NĂM', 'xuatkhau', '31/12/2025', '01/01/2026'), [row(10, '31/12/2025', 10000), row(11, '01/01/2026', 20000)]);
  // 3) cùng phạm vi (uythac / hak) với r-A: 3 phiếu của r-A lặp ở hồ sơ mới hơn r-C — giống nội dung, khác khối lượng, khác cờ trả về
  put(meta('r-C', 'TÀU A (lập lại)', 'uythac', '03/02/2026', '03/02/2026', { updatedAt: 2000, contract: 'ct-A', ship: 'TÀU A' }), [
    row(1, '03/02/2026', 20000, { time1: '07:00' }), // giống hệt phiếu P0001 của r-A → loại trùng
    row(3, '03/02/2026', 21500, { time1: '08:00' }), // khác khối lượng so với r-A (21000)
    row(2, '03/02/2026', 25000, { time1: '07:30' }), // trùng r-B nhưng r-C gắn ct-A còn r-B chưa gắn → khác liên kết
  ]);
  // 4) bước nghiệp vụ hợp lệ: kho gửi → xuất khẩu
  put(meta('r-K', 'KHO GỬI', 'xuatkhogui', '10/02/2026', '10/02/2026'), [row(20, '10/02/2026', 30000), row(21, '10/02/2026', 31000)]);
  put(meta('r-X', 'TÀU ĐÍCH', 'xuatkhau', '10/02/2026', '10/02/2026', { updatedAt: 1500 }), [
    row(20, '10/02/2026', 30000),
    row(22, '10/02/2026', 32000),
  ]);
  // 5) lặp trong cùng hồ sơ + thiếu ngày + thiếu nhận diện
  put(meta('r-D', 'TÀU LẶP', 'xuatkhau', '15/02/2026', '15/02/2026'), [
    row(30, '15/02/2026', 11000),
    row(30, '15/02/2026', 11000),
    row(31, '', 12000),
    { idx: 99, uid: 'u99', net: 5000, dateStr: '15/02/2026' },
  ]);
  // 6) hồ sơ lỗi đọc
  put(meta('r-E', 'TÀU LỖI ĐỌC', 'xuatkhau', '20/02/2026', '20/02/2026'), [row(40, '20/02/2026', 9000)], [], true);
  // 7) hồ sơ gắn chi tiết không còn; gắn nhầm công ty
  put(meta('r-M', 'TÀU MỒ CÔI', 'xuatkhau', '22/02/2026', '22/02/2026', { contract: 'ct-khong-con' }), [row(50, '22/02/2026', 8000)]);
  put(meta('r-N', 'TÀU NHẦM CÔNG TY', 'xuatkhau', '23/02/2026', '23/02/2026', { contract: 'ct-A', cid: 'dh' }), [
    row(60, '23/02/2026', 7000),
  ]);
  const cust = [
    { id: 'k-hak', name: 'HAK', companyId: 'hak' },
    { id: 'k-iwc', name: 'IWC' },
  ];
  const c1 = HAK.ContractModel.parent({
    id: 'hd1',
    type: 'uythac',
    no: 'HD1',
    contractQty: 5000,
    exporterId: 'k-hak',
    buyerId: 'k-iwc',
    details: [{ id: 'ct-A', ship: 'TÀU A', bdmt: 4000 }],
  });
  const pay = (id, o) => Object.assign({ id, kind: 'tax', date: '2026-06-12' }, o);
  const customs = [
    CM.newDecl({
      id: 'tk1',
      no: '308629701000',
      contractId: 'hd1',
      detailId: 'ct-A',
      status: 'cleared',
      taxVnd: 1000,
      payments: [pay('p1', { receiptNo: 'DN0206/26', amount: 1000 }), pay('p2', { receiptNo: 'DN0206/26', amount: 1000 })],
    }), // trùng chắc chắn
    CM.newDecl({
      id: 'tk2',
      no: '308629701001',
      contractId: 'hd1',
      status: 'opened',
      taxVnd: 500,
      payments: [pay('p3', { receiptNo: '', amount: 500 }), pay('p4', { receiptNo: '', amount: 500 })],
    }), // nghi trùng (thiếu số giấy)
    CM.newDecl({ id: 'tk3', no: '308629701002', contractId: 'hd-khong-co', status: 'opened' }), // tờ khai mồ côi
  ];
  return {
    app: 'mau',
    v: 1,
    keys: { 'hak.catalog.v1': { v: 3, customers: cust, products: [], contracts: [c1], customs } },
    archive,
    attachments: [],
  };
}
module.exports = { analyze, buildSample, decode };
