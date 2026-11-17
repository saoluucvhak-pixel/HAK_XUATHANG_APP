/**
 * pages-bkls.js — Bảng kê lâm sản (BKLS) Tổng + Từng xe, sinh song song với biên bản
 * Tách từ pages.js (v2.20), KHÔNG đổi hành vi: pages.js truyền hàm/biến dùng chung qua ctx.
 * Phải nạp trước pages.js.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  HAK.PagesBkls = function (ctx) {
    const { HAK, $, esc, toast, Loading, G, fmtInt, NGUON_GOC_DEF, maHsOf, BKLS_TYPES, BKLS_HAS_RETURNED, DOCS, ST, getDs, fid, SAVED } =
      ctx;
    // Hàm dùng chung: gọi qua ctx tại thời điểm dùng (giữ nguyên ngữ nghĩa khi pages.js/test gán lại hàm)
    const collect = (...a) => ctx.collect(...a),
      archive = (...a) => ctx.archive(...a),
      printInBatches = (...a) => ctx.printInBatches(...a),
      fieldDef = (...a) => ctx.fieldDef(...a),
      setField = (...a) => ctx.setField(...a);
    /* ===============================================================
     * Bảng kê lâm sản (BKLS) — Tổng + Từng xe, sinh song song với biên bản.
     * Dùng HAK.Bkls (bkls.js) và HAK.Issued (records.js) y nguyên, không sửa 2 file đó.
     * ============================================================= */
    /** So khớp 1 dòng phiếu cân giữa mảng đã gộp (ds.rows) và mảng gốc từng đợt (b.ds.rows): dùng uid (tên file + số dòng) gán ở mergeSlot(). */
    const rowKey = (r) => G().retKey(r);

    /** Ô BKLS còn thiếu (dùng chung cho nút Tạo BKLS và trạng thái tab). needBuyer = có xe chính (không phải xe trả về) cần bên mua. */
    function bklsMissing(type, p, needBuyer) {
      const nhan = p.nhanId ? HAK.Config.company(p.nhanId) : null;
      const autoBuyer = !!(BKLS_TYPES[type] && nhan);
      const benMuaTen = (p.bklsBenMuaTen || (autoBuyer ? nhan.name : '')).trim();
      const m = [];
      if (!p.bklsSoBkls) m.push({ id: 'bklsSoBkls', label: 'Số BKLS' });
      if (!(parseFloat(p.bklsHeSo) > 0)) m.push({ id: 'bklsHeSo', label: 'Hệ số RMT → BDMT (phải lớn hơn 0)' });
      if (needBuyer && !benMuaTen) m.push({ id: 'bklsBenMuaTen', label: 'Tên bên mua / nhận chuyển giao' });
      return { m, nhan, autoBuyer, benMuaTen };
    }
    /** Gợi ý dưới ô "Số BKLS": số gần nhất đã lập của bên xuất đang chọn (bỏ qua số "-TV" trả về) + link dùng số kế tiếp. */
    function bklsHint(type) {
      const box = $('#' + fid(type, 'bklsSoBkls') + '-help');
      if (!box) return;
      const sel = $('#' + fid(type, 'giaoId')),
        cid = sel ? sel.value : '';
      const last =
        HAK.Issued && cid ? HAK.Issued.list.find((r) => r.kind === 'bkls' && r.cid === cid && !/-TV$/.test(r.soBkls || '')) : null;
      if (!last) {
        box.innerHTML = '';
        return;
      }
      const next = HAK.Issued.nextBklsNo(last.soBkls);
      box.innerHTML =
        'Số gần nhất: <b>' +
        esc(last.soBkls) +
        '</b>' +
        (next ? ' · <a href="#" data-bkls-next="' + esc(next) + '">Dùng ' + esc(next) + '</a>' : '');
    }

    /** src (tùy chọn) = { ds, params } lấy từ hồ sơ Lưu trữ → tạo lại BKLS không cần file Excel cân (không ghi lại nhật ký chứng từ). */
    async function generateBkls(type, src) {
      const ds = src ? src.ds : getDs(type);
      if (!ds) {
        toast('Chưa có dữ liệu Excel.', 'error');
        return;
      }
      const p = src ? src.params : collect(type);
      const rowsAll = G().filterRows(ds.rows, p.filter);
      if (!rowsAll.length) {
        toast('Không có phiếu cân nào trong phạm vi đã chọn. Hãy kiểm tra bộ lọc ngày.', 'error');
        return;
      }
      // v2.12.4: LUÔN hỏi phạm vi / định dạng (mặc định "BKLS tổng · Word"), kể cả khi tạo lại từ Lưu trữ — trước đây Lưu trữ dùng 4 ô đã lưu
      // (mặc định đều tick) nên luôn tạo cả bản từng xe Word + PDF rất lâu dù chỉ cần bản tổng.
      const chosen = await HAK.BklsTemplates.choose(p);
      if (!chosen) return;
      p.bklsTemplate = chosen.template;
      const want = chosen.want;
      if (!Object.keys(want).some((k) => want[k])) {
        toast('Chọn ít nhất một bản BKLS cần tạo (Tổng / Từng xe).', 'warning');
        return;
      }

      // Xe trả về (chỉ những loại có "Chọn xe trả về") → tách riêng, KHÔNG tính vào BKLS chính.
      const hasReturned = !!BKLS_HAS_RETURNED[type];
      const retSet = hasReturned ? new Set(p.returned || []) : new Set(); // p.returned = danh sách xe trả về đang chọn (hoặc đã lưu trong hồ sơ)
      const rowsMain = rowsAll.filter((r) => !retSet.has(G().retKey(r)));
      const rowsReturned = rowsAll.filter((r) => retSet.has(G().retKey(r)));

      const chk = HAK.Yearbook
          ? HAK.Yearbook.underContext(src ? null : HAK.Yearbook.active(type), () => bklsMissing(type, p, rowsMain.length > 0))
          : bklsMissing(type, p, rowsMain.length > 0),
        nhan = chk.nhan,
        autoBuyer = chk.autoBuyer,
        benMuaTen = chk.benMuaTen;
      // v2.7.1 đơn vị vận chuyển cho mục 5 BKLS tổng — cùng thứ tự ưu tiên với phụ lục biên bản (generator.detailRows): Excel / danh sách xe → ĐVVC mặc định của trang → Cài đặt chung
      const dvvcOf = (r) => r.carrier || p.defaultCarrier || (HAK.Config.data.general || {}).defaultCarrier || '';
      // v2.12.7: KHÔNG chặn nữa — tự điền chỗ thiếu rồi vẫn tạo, nói rõ ở thông báo cuối: Số BKLS = số kế tiếp đã lập (hoặc 001/<năm>/BKLS),
      // hệ số = mặc định của ô, tên bên mua để trống (in "………" trên BKLS để điền tay).
      const preWarn = [];
      chk.m.forEach((x) => {
        if (x.id === 'bklsSoBkls') {
          const last =
            HAK.Issued && p.giaoId
              ? HAK.Issued.list.find((r) => r.kind === 'bkls' && r.cid === p.giaoId && !/-TV$/.test(r.soBkls || ''))
              : null;
          const so = (last && HAK.Issued.nextBklsNo(last.soBkls)) || '001/' + new Date().getFullYear() + '/BKLS';
          p.bklsSoBkls = so;
          const f = fieldDef(type, 'bklsSoBkls');
          if (!src && f) setField(type, f, so);
          preWarn.push('Số BKLS chưa nhập → tự đặt ' + so + '.');
        } else if (x.id === 'bklsHeSo') {
          const f = fieldDef(type, 'bklsHeSo'),
            def = f && f.def !== undefined ? String(f.def) : '0.468';
          p.bklsHeSo = def;
          if (!src && f) setField(type, f, def);
          preWarn.push('Hệ số RMT → BDMT chưa hợp lệ → dùng mặc định ' + def + '.');
        } else if (x.id === 'bklsBenMuaTen') preWarn.push('Chưa có tên bên mua / nhận — để trống trên BKLS.');
      });
      const benMuaMst = p.bklsBenMuaMst || (autoBuyer ? nhan.tax || '' : '');
      const benMuaDc = p.bklsBenMuaDc || (autoBuyer ? nhan.address || '' : '');

      // Các đợt (file Excel) góp phần vào phạm vi đang lọc — ghi nhật ký theo từng đợt để mục 🏠 Tổng quan nhận biết đúng "đã lập BKLS".
      const slBatches = src ? [] : ((HAK.App.slots[type] && HAK.App.slots[type].batches) || []).filter((b) => b.ds && b.ds.ok);
      const perBatchFor = (subset) => {
        const keys = new Set(subset.map(rowKey));
        return slBatches
          .map((b) => ({
            b,
            sub: G()
              .filterRows(b.ds.rows, p.filter)
              .filter((r) => keys.has(rowKey(r))),
          }))
          .filter((x) => x.sub.length);
      };
      const perBatchMain = perBatchFor(rowsMain),
        perBatchTv = perBatchFor(rowsReturned);
      const batchLabel = (perBatchMain[0] || perBatchTv[0] || {}).b;
      const batchLabelName = batchLabel ? batchLabel.fileName : p.ship || p.contractNo || p.period || DOCS[type].title;

      // Các điều cần người dùng xác nhận (gộp vào MỘT lần bấm lại): trùng số BKLS, phạm vi quá nhiều xe cho bản từng xe.
      const confirmMsgs = [];
      if (HAK.Issued && !src && !(HAK.Yearbook && HAK.Yearbook.active(type) && HAK.Yearbook.active(type).readonly)) {
        // tạo lại từ Lưu trữ = in lại bản đã lập → không cảnh báo trùng với chính nó
        const conflicts = HAK.Issued.checkBkls({ cid: p.giaoId, so: p.bklsSoBkls, type, batch: batchLabelName });
        if (conflicts.length)
          confirmMsgs.push(
            'Số BKLS ' +
              p.bklsSoBkls +
              ' có thể đã dùng cho đợt khác: ' +
              conflicts
                .slice(0, 3)
                .map((c) => '"' + c.rec.batch + '"')
                .join(', ') +
              '.'
          );
      }
      const tripMax = want.tripDocx || want.tripPdf ? Math.max(rowsMain.length, rowsReturned.length) : 0;
      if (tripMax > HAK.Bkls.TRIP_SPLIT_OVER) {
        confirmMsgs.push(
          'Phạm vi đang có ' +
            fmtInt(tripMax) +
            ' xe — bản từng xe sẽ tự chia thành ' +
            HAK.Bkls.tripRanges(tripMax).length +
            ' file (≤ ' +
            fmtInt(HAK.Bkls.TRIP_PART_SIZE) +
            ' xe/file, số BKLS từng xe vẫn liên tục) và có thể mất vài phút. Nếu quên lọc ngày, hãy chọn lại phạm vi.'
        );
      }
      if (want.tripPdf && tripMax > HAK.Bkls.PDF_BATCH)
        confirmMsgs.push(
          'PDF từng xe có ' +
            fmtInt(tripMax) +
            ' xe sẽ được IN THÀNH ' +
            Math.ceil(tripMax / HAK.Bkls.PDF_BATCH) +
            ' ĐỢT (≤ ' +
            HAK.Bkls.PDF_BATCH +
            ' xe/đợt): mỗi đợt mở một hộp thoại in, lưu PDF xong bấm tiếp đợt sau.'
        );
      const confirmKey = p.bklsSoBkls + '|' + rowsAll.length + '|' + confirmMsgs.length;
      if (confirmMsgs.length && ST[type].bklsDupKey !== confirmKey) {
        ST[type].bklsDupKey = confirmKey;
        toast('⚠ ' + confirmMsgs.join(' ') + ' Bấm "🧾 Tạo BKLS" lần nữa nếu vẫn muốn tạo.', 'warning');
        return;
      }
      ST[type].bklsDupKey = '';

      const savedConfig = (fn) => (HAK.Yearbook ? HAK.Yearbook.underContext(src ? null : HAK.Yearbook.active(type), fn) : fn());
      const giao = savedConfig(() => HAK.Config.company(p.giaoId));
      const kg = p.khoGiaoId ? savedConfig(() => HAK.Config.warehouse(p.khoGiaoId)) : null;
      const kn = p.khoNhanId ? savedConfig(() => HAK.Config.warehouse(p.khoNhanId)) : null;
      const xuatKhoTai = kg ? kg.address || kg.name : '';
      const noiDen = kn ? kn.address || kn.name : '';
      const gCommon = {
        tenChu: HAK.Config.companyAttr(giao, 'cua'),
        mstChu: (giao.tax || '').trim(),
        diaChiChu: (giao.address || '').trim(),
        dienThoaiChu: (giao.phone || '').trim(),
        email: (giao.email || '').trim(),
        nguonGoc: p.bklsNguonGoc || NGUON_GOC_DEF,
        contractNo: p.contractNo || '',
        product: p.product || '',
        maHs: maHsOf(type, p), // v2.7.6
      };
      const btn = $('#bkls-' + type) || {};
      btn.disabled = true;
      Loading.show('Đang tạo BKLS…');
      try {
        const out = []; // { key, label, name, blob, kind: 'main'|'tv' }
        let ctxMain = null;

        // ---- BKLS chính (không tính xe trả về) ----
        if (rowsMain.length) {
          ctxMain = { template: p.bklsTemplate, g: Object.assign({}, gCommon, { xuatKhoTai, noiDen }) };
          const lotMain = {
            soBkls: p.bklsSoBkls,
            heSoBdmt: parseFloat(p.bklsHeSo),
            ngayLap: p.bklsNgayLap,
            ngayLapTheoXe: p.bklsNgayLapXe,
            listTrips: p.bklsListTrips !== false,
            benMuaTen,
            benMuaMst,
            benMuaDiaChi: benMuaDc,
            benMuaDt: p.bklsBenMuaDt,
            benMuaEmail: p.bklsBenMuaEmail,
            trips: rowsMain.map((r) => ({
              ngayCanDate: HAK.Bkls.parseDMY(r.dateStr),
              bienSoRaw: r.plate,
              tenTaiXe: r.driver || '',
              klHangKg: r.net || 0,
              donViVc: dvvcOf(r),
            })),
          };
          const baseMain = 'BKLS_' + G().slug(DOCS[type].title) + '_' + String(p.bklsSoBkls).replace(/[\\/:*?"<>|\s]+/g, '-');
          const o = await HAK.Bkls.generate(ctxMain, lotMain, want, baseMain, (msg, pct) => Loading.set(pct, msg));
          o.forEach((x) => out.push(Object.assign(x, { kind: 'main' })));
        } else if (rowsReturned.length) {
          Loading.set(0, 'Toàn bộ xe trong phạm vi đều là xe trả về — chỉ tạo BKLS trả về…');
        }

        // ---- BKLS TRẢ VỀ (chiều ngược lại: chủ lâm sản = bên mua/nhận = bên xuất, tự nhận lại hàng của mình) ----
        if (hasReturned && rowsReturned.length) {
          const soBklsTv = p.bklsSoBkls + '-TV';
          const noiDenTv = (p.bklsTvNoiDen || '').trim() || (p.returnWh || '').trim() || xuatKhoTai || ''; // Ủy thác: "Kho nhận xe trả về"; loại khác: đảo ngược điểm xuất kho ban đầu
          const xuatKhoTaiTv = noiDen || ''; // điểm xuất phát của lượt trả về = điểm đến của biên bản chính
          const ctxTv = { template: p.bklsTemplate, g: Object.assign({}, gCommon, { xuatKhoTai: xuatKhoTaiTv, noiDen: noiDenTv }) };
          if (ctxMain && ctxMain.snapshot) ctxTv.snapshot = ctxMain.snapshot; // dùng lại snapshot đã đọc, đỡ đọc lại file mẫu lần 2
          const lotTv = {
            soBkls: soBklsTv,
            heSoBdmt: parseFloat(p.bklsHeSo),
            ngayLap: p.bklsNgayLap,
            ngayLapTheoXe: p.bklsNgayLapXe,
            listTrips: p.bklsListTrips !== false,
            // Chủ lâm sản vẫn là bên xuất (giao) — Bên mua/nhận trên BKLS trả về CŨNG là chính công ty đó (tự nhận lại hàng của mình).
            benMuaTen: giao.name,
            benMuaMst: giao.tax || '',
            benMuaDiaChi: giao.address || '',
            benMuaDt: giao.phone || '',
            benMuaEmail: giao.email || '',
            trips: rowsReturned.map((r) => ({
              ngayCanDate: HAK.Bkls.parseDMY(r.dateStr),
              bienSoRaw: r.plate,
              tenTaiXe: r.driver || '',
              klHangKg: r.net || 0,
              donViVc: dvvcOf(r),
            })),
          };
          const baseTv = 'BKLS_' + G().slug(DOCS[type].title) + '_TraVe_' + soBklsTv.replace(/[\\/:*?"<>|\s]+/g, '-');
          const oTv = await HAK.Bkls.generate(ctxTv, lotTv, want, baseTv, (msg, pct) => Loading.set(pct, 'Trả về: ' + msg));
          oTv.forEach((x) => out.push(Object.assign(x, { kind: 'tv' })));
        }

        // Nhiều file (bản từng xe bị chia phần) → gói 1 ZIP để trình duyệt không hỏi tải hàng chục file; ít file → tải từng file như cũ.
        const printable = out.filter((o) => o.needsPrint);
        const downloadable = out.filter((o) => !o.needsPrint);
        if (downloadable.length > 4) {
          Loading.set(99, 'Đang gói ZIP ' + out.length + ' file…');
          const z = new JSZip();
          downloadable.forEach((o) => z.file(o.name, o.blob, { binary: true }));
          const zipName = 'BKLS_' + G().slug(DOCS[type].title) + '_' + String(p.bklsSoBkls).replace(/[\\/:*?"<>|\s]+/g, '-') + '.zip';
          if (!(await HAK.Word.Files.saveBlob(await z.generateAsync({ type: 'blob', compression: 'STORE' }), zipName))) return;
        } else
          for (const o of downloadable) {
            if (!(await HAK.Word.Files.saveBlob(o.blob, o.name))) return;
          }
        if (printable.length) {
          const files = await Promise.all(
            printable.map(async (o) => ({ name: o.name, bytes: new Uint8Array(await o.blob.arrayBuffer()) }))
          );
          Loading.hide();
          await printInBatches(
            files,
            printable.map((o) => o.weight || 0)
          );
        }

        if (HAK.Issued && !(HAK.Yearbook && HAK.Yearbook.active(type) && HAK.Yearbook.active(type).readonly)) {
          for (const { b, sub } of perBatchMain) {
            const sumB = G().summarize(sub);
            const old = HAK.Issued.list.find(
              (r) => r.kind === 'bkls' && r.cid === p.giaoId && r.type === type && r.batch === b.fileName && r.soBkls === p.bklsSoBkls
            );
            if (old) await HAK.Issued.remove(old.id);
            await HAK.Issued.add({
              kind: 'bkls',
              type,
              cid: p.giaoId,
              cua: giao.short || giao.name,
              batch: b.fileName,
              from: sumB.from,
              to: sumB.to,
              trips: sumB.trips,
              kg: sumB.kg,
              soBkls: p.bklsSoBkls,
              benMua: benMuaTen,
              outputs: Object.keys(want).filter((k) => want[k]),
            });
          }
          if (hasReturned && rowsReturned.length) {
            const soBklsTv = p.bklsSoBkls + '-TV';
            for (const { b, sub } of perBatchTv) {
              const sumB = G().summarize(sub);
              const old = HAK.Issued.list.find(
                (r) => r.kind === 'bkls' && r.cid === p.giaoId && r.type === type && r.batch === b.fileName && r.soBkls === soBklsTv
              );
              if (old) await HAK.Issued.remove(old.id);
              await HAK.Issued.add({
                kind: 'bkls',
                type,
                cid: p.giaoId,
                cua: giao.short || giao.name,
                batch: b.fileName,
                from: sumB.from,
                to: sumB.to,
                trips: sumB.trips,
                kg: sumB.kg,
                soBkls: soBklsTv,
                benMua: giao.name,
                outputs: Object.keys(want).filter((k) => want[k]),
              });
            }
          }
        }

        const warn = preWarn.slice();
        const thieu = [
          ['MST', gCommon.mstChu],
          ['địa chỉ', gCommon.diaChiChu],
          ['số điện thoại', gCommon.dienThoaiChu],
          ['email', gCommon.email],
        ]
          .filter((x) => !x[1])
          .map((x) => x[0]);
        if (thieu.length)
          warn.push('Bên xuất chưa có ' + thieu.join(', ') + ' (Cài đặt → Công ty): dòng tương ứng trên BKLS giữ nguyên như file mẫu.');
        if (rowsMain.length && !benMuaMst) warn.push('Chưa có MST bên mua.');
        const zeroAll = rowsAll.filter((r) => !(r.net > 0)).length;
        if (zeroAll) warn.push(zeroAll + ' xe có khối lượng bằng 0 nên ra 0 tấn trên BKLS.');
        const nMain = out.filter((o) => o.kind === 'main').length,
          nTv = out.filter((o) => o.kind === 'tv').length;
        const parts = [];
        if (nMain) parts.push(nMain + ' bản chính');
        if (nTv) parts.push(nTv + ' bản trả về (' + rowsReturned.length + ' xe)');
        // Lưu hồ sơ vào Lưu trữ (cùng hồ sơ với biên bản của đợt này nếu đã có) → tải lại BKLS sau mà không cần file Excel cân.
        const sv = await archive(
          type,
          p,
          {
            files: [{ name: out[0].name.replace(/_(tong|tung_xe)(_phan\d+)?\.\w+$/, '') }],
            summary: { 'Số BKLS': p.bklsSoBkls, 'Bên mua': benMuaTen || giao.name },
          },
          ds,
          'bkls'
        );
        toast(
          'Đã tạo ' +
            out.length +
            ' bản BKLS: ' +
            parts.join(' + ') +
            '.' +
            (out.length > 4 ? ' Đã gói chung vào 1 file ZIP.' : '') +
            (sv ? SAVED + '.' : '') +
            (warn.length ? ' Lưu ý: ' + warn.join(' ') : ''),
          warn.length ? 'warning' : 'success'
        );
        bklsHint(type);
      } catch (e) {
        console.error(e);
        toast('Lỗi khi tạo BKLS: ' + e.message, 'error');
      } finally {
        Loading.hide();
        btn.disabled = false;
      }
    }

    return { bklsMissing, bklsHint, generateBkls };
  };
})(window);
