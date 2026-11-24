/**
 * migrate-ui.js — HAK.MigrateUI: khu "Nơi lưu dữ liệu" trong màn Sao lưu: hiện nguồn đang dùng và dẫn người dùng qua từng bước chuyển sang SQLite:
 *   ① Sao lưu ZIP (đọc lại để xác minh) → ② Chụp nhất quán → ③ Nhập vào cơ sở dữ liệu tạm → ④ Đối chiếu → ⑤ Kích hoạt.   Quay lui bất cứ lúc nào sau khi kích hoạt.
 * Chỉ hiện khi HAKDocs-SQLite trả lời (bản Windows). Chế độ trình duyệt / portable: chỉ ghi chú nơi lưu. Văn bản người dùng luôn đi qua textContent (không dựng HTML từ dữ liệu).
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const doc = root.document;
  const el = (tag, text, cls, attrs) => {
    const n = doc.createElement(tag);
    if (text != null) n.textContent = text;
    if (cls) n.className = cls;
    Object.entries(attrs || {}).forEach(([k, v]) => n.setAttribute(k, v));
    return n;
  };
  const fmt = (n) => Number(n || 0).toLocaleString('vi-VN');
  const STEPS = [
    ['backup', '① Sao lưu ZIP và đọc lại để xác minh'],
    ['snapshot', '② Chụp dữ liệu nhất quán'],
    ['import', '③ Nhập vào cơ sở dữ liệu SQLite (chưa kích hoạt)'],
    ['verify', '④ Đối chiếu từng bản ghi, tệp và tổng số'],
    ['activate', '⑤ Kích hoạt SQLite làm nguồn dữ liệu chính'],
  ];
  const stamp = () => new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');

  async function backupFirst() {
    const B = HAK.Backup;
    const f = await B.buildFull();
    const zip = await B.zipParts(f.parts);
    if (!zip) throw Error('Thiếu thư viện nén: không tạo được ZIP sao lưu nên không chuyển dữ liệu.');
    const z = await root.JSZip.loadAsync(zip);
    const inner = Object.values(z.files).find((x) => !x.dir && /\.json$/i.test(x.name));
    if (!inner) throw Error('ZIP sao lưu vừa tạo không đọc lại được.');
    const j = JSON.parse(await inner.async('string'));
    const got = {
      keys: Object.keys(j.keys || {}).length,
      archive: (j.archive || []).length,
      batches: (j.batches || []).length,
      issued: (j.issued || []).length,
    };
    ['keys', 'archive', 'batches', 'issued'].forEach((k) => {
      if (got[k] !== f[k]) throw Error('Đọc lại ZIP sao lưu: ' + k + ' ' + got[k] + ' ≠ ' + f[k] + '. Không chuyển dữ liệu.');
    });
    const name = 'HAK_TruocKhiChuyenSQLite_' + stamp() + '.zip';
    await B.saveBackupBlob(zip, name); // người dùng chọn nơi lưu; hủy → ném lỗi → dừng
    return { name, size: zip.size, counts: got };
  }

  function mount(box) {
    if (!doc || !box || !HAK.Storage) return;
    const old = box.querySelector('#storageCard');
    if (old) old.remove();
    const S = HAK.Storage;
    const card = el('section', null, 'border rounded p-3 mt-3', { id: 'storageCard', 'aria-labelledby': 'storageCardTitle' });
    card.append(el('h3', 'Nơi lưu dữ liệu', 'h6 mb-2', { id: 'storageCardTitle' }));
    const d = S.describe();
    card.append(el('p', d.backend + (d.where ? ' — ' + d.where : ''), 'mb-1'));
    card.append(el('p', d.note, 'text-muted small mb-2'));
    box.append(card);

    if (S.mode === 'sqlite') {
      const info = el(
        'p',
        'Dữ liệu mới chỉ được ghi vào SQLite. Bản cũ trong IndexedDB của trình duyệt được giữ nguyên để quay lui, nhưng KHÔNG nhận dữ liệu mới.',
        'small mb-2'
      );
      const b = el('button', 'Quay lui về IndexedDB (tắt SQLite)', 'btn btn-outline-danger btn-sm', { type: 'button' });
      const out = el('div', null, 'small mt-2', { 'aria-live': 'polite' });
      b.addEventListener('click', async () => {
        if (
          !root.confirm(
            'Quay lui về IndexedDB?\n\nDữ liệu phát sinh SAU khi chuyển sang SQLite chỉ có trong SQLite. Hãy bấm "Sao lưu toàn bộ" trước để giữ bản này, rồi sau khi quay lui dùng "Nhập bổ sung" để đưa dữ liệu mới vào bản cũ.'
          )
        )
          return;
        b.disabled = true;
        try {
          await HAK.Migrate.rollback();
          out.textContent = 'Đã tắt SQLite. Đang tải lại app…';
          HAK.reloadAfterWrites ? HAK.reloadAfterWrites(800) : root.setTimeout(() => root.location.reload(), 800);
        } catch (e) {
          b.disabled = false;
          out.textContent = 'Không quay lui được: ' + (e.message || e);
        }
      });
      card.append(info, b, out);
      return;
    }
    if (S.mode !== 'idb' || !S.available) {
      card.append(
        el(
          'p',
          S.mode === 'idb'
            ? 'Chế độ trình duyệt / portable: dữ liệu nằm trong trình duyệt đang mở. Cài bản Windows (có HAKDocs) để dùng SQLite.'
            : '',
          'small mb-0'
        )
      );
      return;
    }

    card.append(
      el(
        'p',
        'Có thể chuyển dữ liệu sang SQLite: tệp nằm ngoài thư mục cài đặt (' +
          ((S.status && S.status.dataDir) || '') +
          '), không phụ thuộc trình duyệt. App chỉ chuyển khi mọi bản ghi, tệp và tổng số khớp nguồn; bản cũ không bị xóa.',
        'small mb-2'
      )
    );
    const list = el('ol', null, 'small ps-3 mb-2');
    const li = {};
    STEPS.forEach(([k, t]) => {
      li[k] = el('li', t, null);
      list.append(li[k]);
    });
    const start = el('button', 'Bắt đầu chuyển sang SQLite', 'btn btn-primary btn-sm', { type: 'button' });
    const out = el('div', null, 'small mt-2', { 'aria-live': 'polite' });
    card.append(list, start, out);
    const mark = (k, state, extra) => {
      const t = STEPS.find((s) => s[0] === k)[1];
      li[k].textContent =
        (state === 'run' ? '⏳ ' : state === 'ok' ? '✔ ' : state === 'bad' ? '✖ ' : '') + t + (extra ? ' — ' + extra : '');
      li[k].className = state === 'bad' ? 'text-danger' : state === 'ok' ? 'text-success' : '';
    };
    const table = (rows, cols) => {
      const t = el('table', null, 'table table-sm mt-2');
      const hr = el('tr');
      cols.forEach(([, h]) => hr.append(el('th', h, null, { scope: 'col' })));
      t.append(el('thead').appendChild(hr).parentNode);
      const tb = el('tbody');
      rows.slice(0, 200).forEach((r) => {
        const tr = el('tr');
        cols.forEach(([k]) => tr.append(el('td', r[k], null)));
        tb.append(tr);
      });
      t.append(tb);
      return t;
    };
    let last = null;
    const fail = (key, msg) => {
      mark(key, 'bad');
      out.textContent = '';
      out.append(
        el('div', 'Chưa chuyển được: ' + msg, 'text-danger mb-1'),
        el('div', 'Dữ liệu cũ KHÔNG bị thay đổi. Bạn có thể sửa nguyên nhân rồi bấm thử lại.', 'text-muted')
      );
      start.disabled = false;
      start.textContent = 'Thử lại';
    };
    start.addEventListener('click', async () => {
      start.disabled = true;
      out.textContent = '';
      STEPS.forEach(([k]) => mark(k));
      try {
        mark('backup', 'run');
        const bk = await backupFirst();
        mark(
          'backup',
          'ok',
          bk.name + ' (' + fmt(bk.size) + ' byte; đọc lại khớp ' + bk.counts.archive + ' hồ sơ, ' + bk.counts.keys + ' khóa)'
        );
      } catch (e) {
        return fail('backup', (e && e.message) || String(e));
      }
      try {
        mark('snapshot', 'run');
        last = await HAK.Migrate.consistentSnapshot(HAK.Backup.collect);
        mark('snapshot', 'ok', 'chụp ' + last.attempts + ' lần');
      } catch (e) {
        return fail('snapshot', (e && e.message) || String(e));
      }
      mark('import', 'run');
      const r = await HAK.Migrate.run(last.snap, {
        onStep: (s) => {
          mark(s.step === 'verify' ? 'verify' : 'import', 'run', s.step + ' ' + s.i + '/' + s.n);
        },
      });
      if (r.stage === 'validate') {
        fail('import', 'dữ liệu nguồn có ' + r.problems.length + ' bản ghi hỏng (không nhập).');
        out.append(
          table(r.problems, [
            ['store', 'Nhóm'],
            ['id', 'Mã bản ghi nguồn'],
            ['problem', 'Vấn đề'],
          ])
        );
        return;
      }
      if (r.stage === 'import') {
        fail('import', r.error + (r.at ? ' (đang nhập ' + r.at.store + ' ' + r.at.id + ')' : ''));
        return;
      }
      mark('import', 'ok');
      if (!r.ok) {
        fail('verify', 'đối chiếu có ' + r.mismatches.length + ' sai lệch.');
        out.append(
          table(r.mismatches, [
            ['store', 'Nhóm'],
            ['id', 'Mã bản ghi nguồn'],
            ['problem', 'Sai lệch'],
          ])
        );
        return;
      }
      mark('verify', 'ok', 'khớp ' + Object.values(r.expected).reduce((a, b) => a + b, 0) + ' bản ghi; toàn vẹn khóa ngoại đạt');
      out.textContent = '';
      if (r.quarantine.length) {
        out.append(el('div', 'Có ' + r.quarantine.length + ' bản ghi cần lưu ý (đã giữ nguyên, không bị bỏ):', 'mb-1'));
        out.append(
          table(r.quarantine, [
            ['record', 'Mã bản ghi'],
            ['reason', 'Ghi chú'],
          ])
        );
      }
      const go = el('button', 'Kích hoạt SQLite', 'btn btn-success btn-sm mt-2', { type: 'button' });
      out.append(go);
      go.addEventListener('click', async () => {
        go.disabled = true;
        mark('activate', 'run');
        const a = await HAK.Migrate.activate(last.snap);
        if (!a.activated) {
          mark('activate', 'bad', a.reason || 'không kích hoạt');
          go.disabled = false;
          return;
        }
        mark('activate', 'ok', 'bản sao SQLite trước kích hoạt: ' + (a.backup && a.backup.path));
        out.append(el('div', 'Đã chuyển sang SQLite. Đang tải lại app…', 'text-success mt-2'));
        HAK.reloadAfterWrites ? HAK.reloadAfterWrites(1200) : root.setTimeout(() => root.location.reload(), 1200);
      });
    });
  }
  HAK.MigrateUI = { mount };
  if (typeof module === 'object' && module.exports) module.exports = HAK.MigrateUI;
})(typeof window !== 'undefined' ? window : globalThis);
