(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {}),
    W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const fields = {
    SO_BKLS: 'Số BKLS',
    CHU_LAM_SAN: 'Tên chủ lâm sản',
    MST_CHU: 'MST chủ lâm sản',
    DIA_CHI_CHU: 'Địa chỉ chủ lâm sản',
    BEN_MUA: 'Tên bên mua / nhận',
    MST_MUA: 'MST bên mua',
    DIA_CHI_MUA: 'Địa chỉ bên mua',
    TEN_HANG: 'Tên hàng hóa',
    SO_HOP_DONG: 'Số hợp đồng',
    KHOI_LUONG: 'Khối lượng',
    SO_LUONG: 'Số lượng',
    VAN_CHUYEN: 'Thông tin vận chuyển',
    NGAY_LAP: 'Ngày lập',
    NGUON_GOC: 'Nguồn gốc',
    MA_HS: 'Mã HS',
    HO_SO: 'Hồ sơ kèm theo',
  };
  const parts = /^word\/(document|header\d*|footer\d*)\.xml$/;
  const text = (p) =>
    Array.from(p.getElementsByTagNameNS(W, 't'))
      .map((t) => t.textContent)
      .join('');
  function read(xml) {
    const d = new DOMParser().parseFromString(xml, 'application/xml');
    if (d.querySelector('parsererror')) throw Error('File Word có XML bị lỗi');
    return d;
  }
  function rows(doc, part) {
    return Array.from(doc.getElementsByTagNameNS(W, 'p')).map((p, i) => ({
      id: part + '#' + i,
      text: text(p),
      position: /header/.test(part) ? 'Đầu trang' : /footer/.test(part) ? 'Chân trang' : 'Đoạn ' + (i + 1),
    }));
  }
  async function analyze(raw) {
    const z = await JSZip.loadAsync(raw);
    if (z.file('word/vbaProject.bin')) throw Error('Không nhận file có macro');
    if (!z.file('word/document.xml')) throw Error('Không phải DOCX');
    const list = [];
    for (const name of Object.keys(z.files).filter((n) => parts.test(n))) {
      const xml = await z.file(name).async('string');
      if (xml.length > 8e6) throw Error('Nội dung mẫu quá lớn');
      list.push(...rows(read(xml), name));
    }
    return list.filter((x) => x.text.trim());
  }
  function replaceRange(p, maps) {
    const ts = Array.from(p.getElementsByTagNameNS(W, 't'));
    let offset = 0;
    const nodes = ts.map((t) => {
      const n = { t, start: offset, end: offset + t.textContent.length, value: t.textContent };
      offset = n.end;
      return n;
    });
    const source = text(p),
      sorted = maps.slice().sort((a, b) => a.start - b.start);
    for (let i = 0; i < sorted.length; i++) {
      const m = sorted[i];
      if (
        !fields[m.key] ||
        !Number.isInteger(m.start) ||
        !Number.isInteger(m.end) ||
        m.start < 0 ||
        m.end <= m.start ||
        m.end > source.length ||
        source.slice(m.start, m.end) !== m.selected
      )
        throw Error('Vùng gán không còn đúng nội dung Word');
      if (i && sorted[i - 1].end > m.start) throw Error('Các vùng gán đang chồng nhau');
    }
    for (const n of nodes) {
      let out = '',
        pos = 0;
      for (const m of sorted) {
        const a = Math.max(n.start, m.start),
          b = Math.min(n.end, m.end);
        if (a >= b) continue;
        out += n.value.slice(pos, a - n.start);
        if (m.start >= n.start && m.start < n.end) out += '{{' + m.key + '}}';
        pos = b - n.start;
      }
      out += n.value.slice(pos);
      n.t.textContent = out;
      n.t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
    }
  }
  async function build(raw, mappings) {
    if (!mappings.length) throw Error('Chưa gán trường dữ liệu');
    const z = await JSZip.loadAsync(raw);
    for (const name of Object.keys(z.files).filter((n) => parts.test(n))) {
      const maps = mappings.filter((m) => m.id.split('#')[0] === name);
      if (!maps.length) continue;
      const d = read(await z.file(name).async('string')),
        ps = Array.from(d.getElementsByTagNameNS(W, 'p'));
      for (const id of new Set(maps.map((m) => m.id))) {
        const p = ps[+id.split('#')[1]];
        if (!p) throw Error('Không tìm thấy đoạn đã gán');
        replaceRange(
          p,
          maps.filter((m) => m.id === id)
        );
      }
      z.file(name, new XMLSerializer().serializeToString(d));
    }
    const result = await z.generateAsync({ type: 'uint8array' });
    await HAK.BklsTemplates.inspect(result);
    return result;
  }
  function suggest(row) {
    const s = row.text,
      colon = s.indexOf(':'),
      after = colon >= 0 ? colon + 1 : 0;
    const pairs = [
      [/^\s*Số(?:\(1\))?\s*:/, 'SO_BKLS'],
      [/Tên chủ lâm sản/, 'CHU_LAM_SAN'],
      [/Tên tổ chức, cá nhân/, 'BEN_MUA'],
      [/Tên loài|Tên hàng hóa/, 'TEN_HANG'],
      [/Khối lượng\/trọng lượng/, 'KHOI_LUONG'],
      [/Số lượng \(/, 'SO_LUONG'],
      [/Thông tin vận chuyển/, 'VAN_CHUYEN'],
      [/Hồ sơ kèm theo/, 'HO_SO'],
      [/Nguồn gốc/, 'NGUON_GOC'],
      [/Mã HS/, 'MA_HS'],
    ];
    const hit = pairs.find((x) => x[0].test(s));
    if (!hit || colon < 0 || !s.slice(after).trim()) return null;
    let start = after;
    while (/\s/.test(s[start] || '') && start < s.length) start++;
    return { id: row.id, start, end: s.length, selected: s.slice(start), key: hit[1] };
  }
  function mount(container) {
    const el = (t, txt, cls) => {
      const n = document.createElement(t);
      if (txt) n.textContent = txt;
      if (cls) n.className = cls;
      return n;
    };
    const box = el('details', null, 'border rounded p-3 mt-3');
    box.append(el('summary', 'Tạo mẫu từ file Word có sẵn'));
    const help = el(
      'p',
      'Chọn DOCX → phân tích → bôi chọn chữ trong từng đoạn rồi chọn trường → tạo và tải mẫu → tải mẫu đã tạo lên danh sách để dùng hoặc chuyển sang máy khác. Font, lề, bảng và hình QR trong file được giữ lại.',
      'small muted mt-2'
    );
    box.append(help);
    const input = el('input', null, 'form-control');
    input.type = 'file';
    input.accept = '.docx';
    box.append(input);
    const area = el('div'),
      status = el('p', null, 'small mt-2');
    box.append(status, area);
    container.append(box);
    let raw = null,
      mappings = [],
      generated = null;
    input.onchange = async () => {
      try {
        generated = null;
        mappings = [];
        area.replaceChildren();
        const f = input.files[0];
        if (!f || f.size > 5 * 1024 * 1024) throw Error('Chọn DOCX tối đa 5 MB');
        raw = new Uint8Array(await f.arrayBuffer());
        const entries = await analyze(raw);
        status.textContent = 'Đã phân tích ' + entries.length + ' đoạn. Gán ít nhất Số BKLS và Khối lượng.';
        const controls = el('div', null, 'd-flex flex-wrap gap-2 my-2'),
          make = el('button', 'Tạo mẫu & kiểm tra', 'btn btn-primary'),
          save = el('button', 'Tải mẫu đã tạo', 'btn btn-outline-primary');
        make.type = save.type = 'button';
        save.disabled = true;
        const name = el('input', null, 'form-control');
        name.value = f.name.replace(/\.docx$/i, '') + '_MAU';
        name.setAttribute('aria-label', 'Tên mẫu');
        controls.append(name, make, save);
        area.append(controls);
        const mappingList = el('div', null, 'small mb-2');
        area.append(mappingList);
        const paragraphs = el('div');
        paragraphs.style.maxHeight = '360px';
        paragraphs.style.overflow = 'auto';
        area.append(paragraphs);
        function showMappings() {
          generated = null;
          save.disabled = true;
          mappingList.replaceChildren();
          for (const m of mappings) {
            const r = el('div', null, 'border-bottom py-1');
            r.append(el('span', m.selected + ' → ' + fields[m.key] + ' '));
            const rm = el('button', 'Bỏ', 'btn btn-sm btn-outline-secondary');
            rm.type = 'button';
            rm.onclick = () => {
              mappings = mappings.filter((x) => x !== m);
              showMappings();
            };
            r.append(rm);
            mappingList.append(r);
          }
        }
        for (const row of entries) {
          const card = el('div', null, 'border rounded p-2 mb-2'),
            label = el('small', row.position, 'muted'),
            value = el('textarea', null, 'form-control form-control-sm my-1');
          value.value = row.text;
          value.readOnly = true;
          value.rows = Math.min(4, Math.max(2, Math.ceil(row.text.length / 85)));
          value.setAttribute('aria-label', row.position);
          const select = el('select', null, 'form-select form-select-sm');
          const empty = el('option', 'Chọn trường cho chữ đã bôi chọn');
          empty.value = '';
          select.append(empty);
          for (const [key, title] of Object.entries(fields)) {
            const o = el('option', title);
            o.value = key;
            select.append(o);
          }
          select.onchange = () => {
            try {
              const start = value.selectionStart,
                end = value.selectionEnd;
              if (!select.value) return;
              if (start === end) throw Error('Bôi chọn chữ cần thay trong đoạn trước');
              const m = { id: row.id, start, end, selected: row.text.slice(start, end), key: select.value };
              if (mappings.some((x) => x.id === m.id && x.start < m.end && m.start < x.end))
                throw Error('Vùng này đã có trường. Bỏ gán cũ trước');
              mappings.push(m);
              showMappings();
              status.textContent = 'Đã gán ' + fields[m.key];
            } catch (e) {
              status.textContent = e.message;
            } finally {
              select.value = '';
            }
          };
          card.append(label, value, select);
          const proposal = suggest(row);
          if (proposal) {
            const b = el('button', 'Gợi ý: ' + fields[proposal.key], 'btn btn-sm btn-outline-secondary mt-1');
            b.type = 'button';
            b.onclick = () => {
              if (!mappings.some((x) => x.id === proposal.id && x.start < proposal.end && proposal.start < x.end)) {
                mappings.push(proposal);
                showMappings();
              } else status.textContent = 'Đoạn đã có vùng gán; bỏ gán cũ trước.';
            };
            card.append(b);
          }
          paragraphs.append(card);
        }
        make.onclick = async () => {
          make.disabled = true;
          try {
            generated = await build(raw, mappings);
            save.disabled = false;
            status.textContent = 'Mẫu hợp lệ. Tải mẫu, mở Word kiểm tra bố cục rồi dùng Tải mẫu lên / đồng bộ để thêm vào danh sách.';
          } catch (e) {
            status.textContent = e.message;
          } finally {
            make.disabled = false;
          }
        };
        save.onclick = () => {
          if (generated)
            HAK.Word.Files.saveBlob(
              new Blob([generated], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
              (name.value || 'BKLS_MAU').replace(/[\\/:*?"<>|]/g, '-') + '.docx'
            );
        };
      } catch (e) {
        status.textContent = e.message;
      }
    };
  }
  HAK.BklsBuilder = { fields, analyze, build, replaceRange, suggest, mount };
})(window);
