/**
 * customs-import.js — Nhập tờ khai từ file .xls/.xlsx và OCR (tờ khai, giấy nộp tiền); chuyển giấy nộp tiền sang màn duyệt (customs-receipt.js).
 * Tách từ customs.js (không đổi logic ghi dữ liệu / liên kết hợp đồng — tờ khai; dùng chung commit() của customs.js). Nạp SAU customs.js, được gọi khi người dùng bấm nút.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const { CP, core, today, customsList, toast } = HAK.CustomsCommon;
  const { commit, openDecl, openSupp, upsertInto, suggestLink, draw, st } = HAK.CustomsCore;
  const { openReceiptReview } = HAK.CustomsReceipt;

  /* ---------------- Nhập file .xls / OCR ---------------- */
  async function sheetRows(file) {
    if (!root.XLSX) throw Error('Thư viện đọc Excel chưa nạp.');
    const wb = root.XLSX.read(await file.arrayBuffer(), { type: 'array' }),
      ws = wb.Sheets[wb.SheetNames[0]];
    return root.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
  }
  const PICK = [
    'no',
    'openDate',
    'type',
    'office',
    'ship',
    'bill',
    'goods',
    'hs',
    'qtyBdmt',
    'qtyTon',
    'invoiceNo',
    'invoiceUsd',
    'exchangeRate',
    'taxableVnd',
    'taxRate',
    'taxVnd',
    'exporter',
    'importer',
    'certNo',
    'relatedNo',
    'changedAt',
    'note',
    'round',
  ];
  function toDecl(p, source) {
    const rec = { status: 'opened', source: source || '' };
    PICK.forEach((k) => {
      if (p[k] !== undefined && p[k] !== '' && p[k] !== null) rec[k] = p[k];
    });
    return rec;
  }
  async function importFiles(files) {
    if (!files.length) return;
    const { Loading } = HAK.UI,
      added = [],
      skipped = [];
    Loading.show('Đang đọc tờ khai…');
    try {
      const recs = [];
      for (const f of files) {
        try {
          const p = CP().parseDeclarationRows(await sheetRows(f));
          if (!p.no) {
            skipped.push(f.name + ': không thấy SỐ TỜ KHAI — không phải "Bản xác nhận nội dung tờ khai"?');
            continue;
          }
          recs.push({ rec: toDecl(p, f.name), p, name: f.name });
        } catch (e) {
          skipped.push(f.name + ': ' + (e.message || e));
        }
      }
      if (recs.length)
        await commit((next) => {
          let cur = next;
          recs.forEach((x) => {
            if ((cur.customs || []).some((d) => !d.deletedAt && d.no === x.rec.no)) {
              skipped.push(x.name + ': tờ khai ' + x.rec.no + ' đã có.');
              return;
            }
            const link = suggestLink(x.rec);
            if (link.detailId && (cur.customs || []).some((d) => !d.deletedAt && d.detailId === link.detailId)) delete link.detailId; // đợt đã có tờ khai khác → chỉ gắn hợp đồng
            Object.assign(x.rec, link);
            try {
              cur = upsertInto(cur, x.rec).data;
              added.push(x);
            } catch (e) {
              skipped.push(x.name + ': ' + e.message);
            }
          });
          return cur;
        });
      if (added.length) st.sel = customsList().find((d) => d.no === added[added.length - 1].rec.no).id;
      draw();
      core().render();
      const linked = added.filter((x) => x.rec.contractId).length;
      // Cảnh báo của bộ đọc (vd ô thuế dạng ngoặc "(1.200)" — quy tắc 28, thiếu số tiền thuế / ngày đăng ký) phải hiện ở MỌI đường nhập, như đường OCR.
      const notes = added.flatMap((x) => (x.p.warnings || []).map((w) => x.name + ': ' + w));
      toast(
        (added.length
          ? 'Đã nhập ' +
            added.length +
            ' tờ khai' +
            (linked ? ' (' + linked + ' tờ khai tự gắn hợp đồng / đợt theo tàu hoặc số TKHQ)' : '') +
            '. '
          : '') +
          (skipped.length ? 'Bỏ qua: ' + skipped.join(' · ') + (notes.length ? ' ' : '') : '') +
          (notes.length ? 'Cần đối chiếu với tờ khai gốc: ' + notes.join(' · ') : ''),
        (skipped.length && !added.length) || notes.length ? 'warning' : 'success'
      );
    } finally {
      Loading.hide();
    }
  }
  async function importSupp(declId, files) {
    const d = customsList().find((x) => x.id === declId);
    if (!d || !files.length) return;
    const { Loading } = HAK.UI;
    Loading.show('Đang đọc tờ khai bổ sung…');
    try {
      const p = CP().parseDeclarationRows(await sheetRows(files[0]));
      if (!p.no) throw Error('Không thấy SỐ TỜ KHAI trong file.');
      if (p.no === d.no) throw Error('File này chính là tờ khai gốc ' + d.no + '.');
      Loading.hide();
      openSupp(declId, null, {
        no: p.no,
        date: p.changedAt || p.openDate || today(),
        taxVnd: p.taxVnd,
        qtyBdmt: p.qtyBdmt,
        reason: 'Khai bổ sung theo tờ khai ' + p.no,
      });
      if (p.warnings && p.warnings.length) toast('Cần đối chiếu với tờ khai bổ sung gốc: ' + p.warnings.join(' · '), 'warning');
    } catch (e) {
      toast(e.message || String(e), 'error');
    } finally {
      Loading.hide();
    }
  }
  const toBase64 = (file) =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1] || '');
      r.onerror = () => reject(Error('Không đọc được file.'));
      r.readAsDataURL(file);
    });
  let lastPlain = '';
  async function ocrFile(file) {
    if (file.size > 26 * 1024 * 1024) throw Error('File quá lớn (tối đa 26 MB). Chụp lại ở độ phân giải thấp hơn.');
    const out = await HAK.Documents.ocr(await toBase64(file), 'document');
    lastPlain = out.pages.map((p) => p.text || '').join('\n');
    return out.pages.map((p) => (p.rowsText || p.text) + '\n' + (p.supplementalText || '')).join('\n');
  }
  const ocrHelp = (e) =>
    /fetch|network|load failed/i.test(e.message || '')
      ? 'Chưa kết nối OCR Windows. Mở app bằng lối tắt native\\HAKDocs.exe (bản setup có sẵn) rồi thử lại.'
      : e.message || String(e);
  async function ocrDecl(files) {
    if (!files.length) return;
    const { Loading } = HAK.UI;
    Loading.show('Đang đọc tờ khai bằng Windows OCR…');
    try {
      const text = await ocrFile(files[0]),
        p = CP().parseDeclarationText(text);
      Loading.hide();
      const rec = toDecl(p, files[0].name);
      Object.assign(rec, suggestLink(rec));
      openDecl(null, rec, { warnings: p.warnings, ocrText: text, fromOcr: true });
    } catch (e) {
      toast(ocrHelp(e), 'error');
    } finally {
      Loading.hide();
    }
  }
  async function ocrReceipt(files) {
    if (!files.length) return;
    const { Loading } = HAK.UI;
    Loading.show('Đang đọc giấy nộp tiền bằng Windows OCR…');
    try {
      const text = await ocrFile(files[0]),
        p = CP().parseReceiptText(text, lastPlain);
      Loading.hide();
      openReceiptReview(p, text);
    } catch (e) {
      toast(ocrHelp(e), 'error');
    } finally {
      Loading.hide();
    }
  }
  HAK.CustomsImport = { importFiles, importSupp, ocrDecl, ocrReceipt };
})(window);
