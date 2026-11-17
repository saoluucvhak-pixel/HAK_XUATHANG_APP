(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {}),
    W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const decode = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const encode = (b) => {
    let s = '';
    for (let i = 0; i < b.length; i += 16384) s += String.fromCharCode(...b.subarray(i, i + 16384));
    return btoa(s);
  };
  const text = (p) =>
    Array.from(p.getElementsByTagNameNS(W, 't'))
      .map((n) => n.textContent)
      .join('');
  const norm = (s) => s.replace(/^\s*(?:-\s*|\d+\.\s*)/, '').trim();
  const tags = [
    'TEN_HANG',
    'SO_HOP_DONG',
    'SO_BKLS',
    'CHU_LAM_SAN',
    'MST_CHU',
    'DIA_CHI_CHU',
    'BEN_MUA',
    'MST_MUA',
    'DIA_CHI_MUA',
    'KHOI_LUONG',
    'SO_LUONG',
    'VAN_CHUYEN',
    'NGAY_LAP',
    'NGUON_GOC',
    'MA_HS',
    'HO_SO',
  ];
  async function inspect(raw) {
    const zip = await JSZip.loadAsync(raw);
    if (zip.file('word/vbaProject.bin')) throw Error('Chỉ nhận DOCX không có macro');
    const f = zip.file('word/document.xml');
    if (!f) throw Error('Không phải mẫu Word DOCX');
    const xml = await f.async('string');
    if (xml.length > 8e6) throw Error('Mẫu Word quá lớn');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.querySelector('parsererror')) throw Error('Mẫu Word bị lỗi');
    const t = Array.from(doc.getElementsByTagNameNS(W, 't'))
      .map((n) => n.textContent)
      .join('');
    const used = Array.from(t.matchAll(/\{\{([^{}]+)\}\}/g), (m) => m[1]);
    if (used.length) {
      if (used.some((x) => !tags.includes(x))) throw Error('Có mã điền không hỗ trợ. Mã hợp lệ: ' + tags.join(', '));
      if (!used.includes('SO_BKLS') || !used.includes('KHOI_LUONG')) throw Error('Mẫu cần có {{SO_BKLS}} và {{KHOI_LUONG}}');
      return 'tags';
    }
    if (t.includes('Tên chủ lâm sản') && t.includes('Khối lượng/trọng lượng') && t.includes('Tên tổ chức, cá nhân')) return 'form01';
    throw Error('Mẫu cần theo Mẫu số 01 hoặc dùng mã điền: ' + tags.map((x) => '{{' + x + '}}').join(', '));
  }
  async function list() {
    return [
      { id: 'legacy', name: 'Mẫu HAK hiện hành' },
      { id: 'form01', name: 'Mẫu 01/BKLS Thông tư 84/2025/TT-BNNMT', kind: 'form01', base64: HAK.BklsForm01 },
    ].concat(await HAK.DB.getAll('bklsTemplates'));
  }
  async function upload(file) {
    if (!/\.docx$/i.test(file.name) || file.size > 5 * 1024 * 1024) throw Error('Chọn DOCX tối đa 5 MB');
    const raw = new Uint8Array(await file.arrayBuffer()),
      kind = await inspect(raw);
    const id = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', raw)), (x) => x.toString(16).padStart(2, '0')).join('');
    if (!HAK.DB.usable()) throw Error('Chưa có bộ nhớ để lưu mẫu bền vững');
    const rec = { id, name: file.name, kind, base64: encode(raw) };
    await HAK.DB.put('bklsTemplates', rec);
    return rec;
  }
  async function choose(params) {
    const templates = await list();
    return new Promise((resolve) => {
      const host = document.createElement('div');
      host.className = 'modal fade';
      host.tabIndex = -1;
      host.innerHTML =
        '<div class="modal-dialog modal-lg"><div class="modal-content"><div class="modal-header"><h5 class="modal-title">Chọn mẫu và hình thức xuất BKLS</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Đóng"></button></div><div class="modal-body"><label class="form-label">Mẫu BKLS</label><select class="form-select template-select"></select><div class="d-flex gap-2 mt-2"><label class="btn btn-outline-primary">Tải mẫu lên / đồng bộ<input class="d-none upload-template" type="file" accept=".docx"></label><button type="button" class="btn btn-outline-secondary download-template">Tải mẫu đang chọn</button><button type="button" class="btn btn-outline-danger delete-template">Xóa mẫu đã tải lên</button></div><p class="small muted mt-2">Word và PDF dùng chung bố cục của mẫu đã chọn. PDF mở hộp thoại In: chọn Lưu thành PDF, khổ A4 và tỷ lệ 100%.</p><div class="row"><div class="col-sm-6"><label class="form-label">Phạm vi</label><select class="form-select scope"><option value="total">BKLS tổng</option><option value="trip">BKLS từng xe</option><option value="both">Tổng và từng xe</option></select></div><div class="col-sm-6"><label class="form-label">Định dạng</label><select class="form-select format"><option value="docx">Word</option><option value="pdf">PDF / In</option><option value="both">Word và PDF / In</option></select></div></div><div class="text-danger mt-2 error" role="alert"></div></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Hủy</button><button type="button" class="btn btn-primary create">Tạo BKLS</button></div></div></div>';
      HAK.BklsBuilder.mount(host.querySelector('.modal-body'));
      document.body.append(host);
      const q = (s) => host.querySelector(s),
        select = q('.template-select');
      let all = templates,
        result = null;
      function options(id) {
        select.replaceChildren();
        for (const item of all) {
          const o = document.createElement('option');
          o.value = item.id;
          o.textContent = item.name;
          select.append(o);
        }
        select.value = id || 'legacy';
        if (!select.value) select.value = 'legacy';
      }
      options((params.bklsTemplate && params.bklsTemplate.id) || HAK.Store.get('hak.bkls.lastTemplate', 'legacy'));
      q('.upload-template').onchange = async (e) => {
        q('.create').disabled = true;
        try {
          const rec = await upload(e.target.files[0]);
          all = await list();
          options(rec.id);
          q('.error').textContent = '';
        } catch (e) {
          q('.error').textContent = e.message;
        } finally {
          q('.create').disabled = false;
        }
      };
      q('.download-template').onclick = async () => {
        try {
          const rec = all.find((x) => x.id === select.value);
          let raw;
          if (rec.id === 'legacy') {
            await HAK.Bkls.ensureAssets(false);
            raw = HAK.Bkls.templateBuffer();
          } else raw = decode(rec.base64);
          await HAK.Word.Files.saveBlob(
            new Blob([raw], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
            rec.name.replace(/\.docx$/i, '') + '.docx'
          );
        } catch (e) {
          q('.error').textContent = e.message;
        }
      };
      q('.delete-template').onclick = async () => {
        try {
          const rec = all.find((x) => x.id === select.value);
          if (['legacy', 'form01'].includes(rec.id)) throw Error('Mẫu đi kèm ứng dụng được giữ lại');
          await HAK.DB.del('bklsTemplates', rec.id);
          all = await list();
          options('legacy');
        } catch (e) {
          q('.error').textContent = e.message;
        }
      };
      q('.create').onclick = () => {
        const rec = all.find((x) => x.id === select.value),
          scope = q('.scope').value,
          format = q('.format').value;
        result = {
          template: rec,
          want: {
            totalDocx: scope !== 'trip' && format !== 'pdf',
            totalPdf: scope !== 'trip' && format !== 'docx',
            tripDocx: scope !== 'total' && format !== 'pdf',
            tripPdf: scope !== 'total' && format !== 'docx',
          },
        };
        HAK.Store.set('hak.bkls.lastTemplate', rec.id);
        modal.hide();
      };
      host.addEventListener(
        'hidden.bs.modal',
        () => {
          modal.dispose();
          host.remove();
          resolve(result);
        },
        { once: true }
      );
      const modal = new bootstrap.Modal(host);
      modal.show();
    });
  }
  // Retain the label's emphasis and footnote runs; inserted data uses the value style.
  // Reusing the first run for the entire paragraph makes section values bold/superscript.
  function replaceParagraph(p, value) {
    const doc = p.ownerDocument,
      runs = Array.from(p.getElementsByTagNameNS(W, 'r')).filter((r) => r.getElementsByTagNameNS(W, 't').length);
    if (!runs.length) return;
    const old = text(p),
      oldColon = old.indexOf(':'),
      newColon = value.indexOf(':'),
      first = runs[0];
    let offset = 0,
      valueRef = null;
    for (const r of runs) {
      const content = text(r);
      if (offset + content.length > oldColon + 1 && !r.getElementsByTagNameNS(W, 'vertAlign').length && offset >= Math.max(0, oldColon))
        valueRef = valueRef || r;
      offset += content.length;
    }
    valueRef =
      valueRef || runs.find((r) => !r.getElementsByTagNameNS(W, 'b').length && !r.getElementsByTagNameNS(W, 'vertAlign').length) || first;
    function makeRun(content, reference, isValue) {
      const r = doc.createElementNS(W, 'w:r'),
        rp = reference.getElementsByTagNameNS(W, 'rPr')[0];
      if (rp) {
        const copy = rp.cloneNode(true);
        if (isValue) {
          Array.from(copy.getElementsByTagNameNS(W, 'vertAlign')).forEach((n) => n.parentNode.removeChild(n));
          if (reference === first && oldColon >= 0)
            for (const tag of ['b', 'bCs']) Array.from(copy.getElementsByTagNameNS(W, tag)).forEach((n) => n.parentNode.removeChild(n));
        }
        r.appendChild(copy);
      }
      String(content)
        .split('\n')
        .forEach((part, i) => {
          if (i) r.appendChild(doc.createElementNS(W, 'w:br'));
          const t = doc.createElementNS(W, 'w:t');
          t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
          t.textContent = part;
          r.appendChild(t);
        });
      return r;
    }
    const fresh = [];
    if (oldColon >= 0 && newColon >= 0) {
      const prefix = value.slice(0, newColon + 1);
      if (prefix === old.slice(0, oldColon + 1)) {
        let remaining = oldColon + 1;
        for (const r of runs) {
          if (!remaining) break;
          const segment = text(r).slice(0, remaining);
          if (segment) fresh.push(makeRun(segment, r, false));
          remaining -= segment.length;
        }
      } else fresh.push(makeRun(prefix, first, false));
      fresh.push(makeRun(value.slice(newColon + 1), valueRef, true));
    } else fresh.push(makeRun(value, first, false));
    const anchor = first.parentNode === p ? first : null;
    fresh.forEach((r) => p.insertBefore(r, anchor));
    for (const r of runs) {
      if (r.getElementsByTagNameNS(W, 'drawing').length || r.getElementsByTagNameNS(W, 'fldChar').length) {
        Array.from(r.getElementsByTagNameNS(W, 't')).forEach((t) => (t.textContent = ''));
      } else r.parentNode.removeChild(r);
    }
  }
  function replaceDateLine(p, value) {
    const parts = Array.from(p.getElementsByTagNameNS(W, '*'));
    let first = true;
    for (const node of parts) {
      if (node.localName === 'br') break;
      if (node.localName === 't') {
        node.textContent = first ? value : '';
        first = false;
      }
    }
  }
  function valuesMap(v, ctx, lot) {
    return {
      TEN_HANG: ctx.g.product || '',
      SO_HOP_DONG: ctx.g.contractNo || '',
      SO_BKLS: v.soBklsLine.replace(/^.*?:\s*/, ''),
      CHU_LAM_SAN: ctx.g.tenChu || '',
      MST_CHU: ctx.g.mstChu || '',
      DIA_CHI_CHU: ctx.g.diaChiChu || '',
      BEN_MUA: lot.benMuaTen || '',
      MST_MUA: lot.benMuaMst || '',
      DIA_CHI_MUA: lot.benMuaDiaChi || '',
      KHOI_LUONG: (v.khoiLuongLine || '').replace(/^[^:]*:\s*/, ''),
      SO_LUONG: (v.soLuongLine || '').replace(/^[^:]*:\s*/, ''),
      VAN_CHUYEN: (v.vanChuyenLine || '').replace(/^[^:]*:\s*/, ''),
      NGAY_LAP: v.kyNgayText || '',
      NGUON_GOC: ctx.g.nguonGoc || '',
      MA_HS: ctx.g.maHs || '',
      HO_SO: 'Hợp đồng số ' + (ctx.g.contractNo || '……………………'),
    };
  }
  async function render(rec, ctx, lot, v) {
    const raw = decode(rec.id === 'form01' ? HAK.BklsForm01 : rec.base64);
    if (rec.kind === 'tags') {
      const data = valuesMap(v, ctx, lot),
        zip = new PizZip(raw);
      const doc = new docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: { start: '{{', end: '}}' },
        nullGetter: () => '',
      });
      doc.render(data);
      return new Uint8Array(doc.getZip().generate({ type: 'uint8array' }));
    }
    const zip = await JSZip.loadAsync(raw),
      doc = new DOMParser().parseFromString(await zip.file('word/document.xml').async('string'), 'application/xml');
    let tax = 0,
      address = 0,
      phone = 0,
      header = false,
      inAppendix = false;
    const allParagraphs = Array.from(doc.getElementsByTagNameNS(W, 'p'));
    const dateParagraphs = allParagraphs.filter((p) => /ngày.*tháng.*năm/i.test(text(p)) && /^[.…_,\s]*ngày/.test(text(p).trim()));
    for (const p of Array.from(doc.getElementsByTagNameNS(W, 'p'))) {
      const s = norm(text(p));
      let value;
      if (s === 'BẢNG KÊ CHI TIẾT') {
        inAppendix = true;
        continue;
      }
      if (inAppendix) {
        if (/^\(Kèm theo Bảng kê lâm sản số:/.test(s))
          replaceParagraph(
            p,
            '(Kèm theo Bảng kê lâm sản ' + v.soBklsLine + ' ' + (v.kyNgayText || '') + ' của ' + (ctx.g.tenChu || '………') + ')'
          );
        continue;
      }
      if (!header && /^[.…\-\s]{5,}$/.test(s) && p.parentNode && p.parentNode.localName === 'tc') {
        value = ctx.g.tenChu;
        header = true;
      } else if (s.startsWith('Số(1):')) value = v.soBklsLine;
      else if (s.startsWith('Tên chủ lâm sản')) value = v.tenChuLamSanLine;
      else if (s.startsWith('Tên tổ chức, cá nhân')) value = v.tenMuaLine;
      else if (s.startsWith('Số GCN/MSDN/')) value = ++tax === 1 ? v.mstChuLamSanLine : v.mstLine;
      else if (s.startsWith('Địa chỉ(6)')) value = ++address === 1 ? v.diaChiChuLamSanLine : v.diaChiLine;
      else if (/^(?:Số )?Điện thoại|^Điện thoại/i.test(s))
        value =
          ++phone === 1
            ? 'Số điện thoại: ' + (ctx.g.dienThoaiChu || '………') + '; Địa chỉ email: ' + (ctx.g.email || '………')
            : 'Số điện thoại: ' + (lot.benMuaDt || '………') + '; Email: ' + (lot.benMuaEmail || '………');
      else if (/^Tên loài \(/.test(s) && ctx.g.product)
        value = 'Tên loài (tên khoa học, tên tiếng Việt hoặc tên thương mại): ' + ctx.g.product;
      else if (/^\(Kèm theo Bảng kê lâm sản số:/.test(s))
        value = '(Kèm theo Bảng kê lâm sản ' + v.soBklsLine + ' ' + (v.kyNgayText || '') + ' của ' + (ctx.g.tenChu || '………') + ')';
      else if (/ngày.*tháng.*năm/i.test(s) && /^[.…_,\s]*ngày/.test(s) && v.kyNgayText && p === dateParagraphs[dateParagraphs.length - 1]) {
        replaceDateLine(p, v.kyNgayText);
        continue;
      } else if (s.startsWith('Nguồn gốc')) value = v.nguonGocLine;
      else if (s.startsWith('Mã HS')) value = v.maHsLine;
      else if (s.startsWith('Khối lượng/trọng lượng')) value = v.khoiLuongLine;
      else if (s.startsWith('Số lượng (')) value = v.soLuongLine;
      else if (s.startsWith('Thông tin vận chuyển')) value = '5. ' + v.vanChuyenLine;
      else if (s.startsWith('Hồ sơ kèm theo')) value = '6. Hồ sơ kèm theo (nếu có): Hợp đồng số ' + (ctx.g.contractNo || '……………………') + '.';
      if (value) replaceParagraph(p, (text(p).trim().startsWith('-') ? '- ' : '') + value);
    }
    zip.file('word/document.xml', new XMLSerializer().serializeToString(doc));
    return zip.generateAsync({ type: 'uint8array' });
  }
  async function generate(rec, ctx, lot, want, base, onProgress) {
    const step = onProgress || function () {};
    step('Đang kiểm tra mẫu BKLS…', 1);
    await new Promise((r) => setTimeout(r, 0));
    await inspect(decode(rec.base64));
    const out = [],
      documents = new Map();
    const add = async (key, v, name) => {
      if (!documents.has(name)) {
        const raw = await render(rec, ctx, lot, v);
        documents.set(name, new Blob([raw], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
      }
      out.push({
        key,
        name: name + '.docx',
        label: name,
        blob: documents.get(name),
        needsPrint: key.endsWith('Pdf'),
        weight: key.indexOf('trip') === 0 ? 1 : 0,
      });
    };
    for (const key of ['totalDocx', 'totalPdf']) if (want[key]) await add(key, HAK.Bkls.aggregateValues(ctx, lot), base + '_tong');
    if (want.tripDocx || want.tripPdf) {
      /* v2.18.0: bỏ giới hạn 200 xe — mỗi xe một file, nhiều file tự gói ZIP; bản PDF được in theo từng đợt ≤ PDF_BATCH xe (xem pages.js) */ for (
        let i = 0;
        i < lot.trips.length;
        i++
      ) {
        step('Đang tạo BKLS xe ' + (i + 1) + '/' + lot.trips.length, 5 + (90 * i) / lot.trips.length);
        if (i % 5 === 0) await new Promise((r) => setTimeout(r, 0));
        const v = HAK.Bkls.tripValues(ctx, lot, lot.trips[i], HAK.Bkls.tripNo(lot.soBkls, i));
        for (const key of ['tripDocx', 'tripPdf']) if (want[key]) await add(key, v, base + '_xe_' + String(i + 1).padStart(4, '0'));
      }
    }
    step('Tạo xong BKLS', 100);
    return out;
  }
  HAK.BklsTemplates = { list, upload, choose, generate, inspect, render, replaceParagraph, valuesMap };
})(window);
