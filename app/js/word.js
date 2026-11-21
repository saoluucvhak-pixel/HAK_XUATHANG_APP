/**
 * word.js — Sinh file Word từ template DOCX bằng Docxtemplater + PizZip, lưu file bằng FileSaver.
 *
 * Nguồn template (theo thứ tự ưu tiên):
 *   1. Template người dùng upload (lưu trong trình duyệt)      → source = 'custom'
 *   2. Template mặc định nhúng sẵn (js/templates-data.js)      → source = 'embedded'
 *   3. Thư mục templates/ (chỉ hoạt động khi chạy qua http)     → source = 'file'
 * (Lý do nhúng: trình duyệt chặn fetch() file cục bộ khi mở index.html bằng file://.)
 *
 * Placeholder dùng dấu phân cách {{ }}, vòng lặp {{#ten}}…{{/ten}}.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  // Bản build trình duyệt của docxtemplater xuất biến toàn cục 'docxtemplater' (chữ thường)
  const DT = () => root.Docxtemplater || root.docxtemplater;
  const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const TPL_KEY = (k) => 'hak.tpl.' + k;
  const OPTIONS = {
    delimiters: { start: '{{', end: '}}' },
    paragraphLoop: true, // thẻ mở/đóng vòng lặp nằm riêng 1 đoạn sẽ bị bỏ khỏi kết quả
    linebreaks: true, // "\n" trong dữ liệu → xuống dòng trong Word
    nullGetter() {
      return '';
    },
  };

  /* ---------- base64 <-> bytes ---------- */
  function b64ToBytes(b64) {
    if (typeof Buffer !== 'undefined' && typeof atob === 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
    const bin = atob(b64),
      out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function bytesToB64(bytes) {
    let s = '';
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
  }

  /* ---------- Lỗi Docxtemplater → thông báo dễ hiểu ---------- */
  function explain(e) {
    if (e && e.properties && Array.isArray(e.properties.errors) && e.properties.errors.length) {
      return e.properties.errors
        .slice(0, 5)
        .map((x) => {
          const pr = x.properties || {};
          return (
            (pr.explanation || x.message) +
            (pr.xtag ? ' [' + pr.xtag + ']' : '') +
            (pr.context ? ' … "' + String(pr.context).slice(0, 60) + '"' : '')
          );
        })
        .join(' | ');
    }
    return e && e.message ? e.message : String(e);
  }

  /* ---------- Quản lý template ---------- */
  const Templates = {
    /** Trả về {bytes, source, name} hoặc ném lỗi. */
    async get(key) {
      const custom = HAK.Store.get(TPL_KEY(key), null);
      if (custom && custom.b64)
        return { bytes: b64ToBytes(custom.b64), source: 'custom', name: custom.name, size: custom.size, date: custom.date };
      if (HAK.TEMPLATES && HAK.TEMPLATES[key]) {
        const bytes = b64ToBytes(HAK.TEMPLATES[key]);
        return { bytes, source: 'embedded', name: HAK.TEMPLATE_DEFS[key].file, size: bytes.length };
      }
      // dự phòng: đọc từ thư mục templates/ khi chạy qua máy chủ http
      if (typeof fetch === 'function' && /^https?:/.test(root.location ? root.location.protocol : '')) {
        const r = await fetch('templates/' + HAK.TEMPLATE_DEFS[key].file);
        if (r.ok) {
          const b = new Uint8Array(await r.arrayBuffer());
          return { bytes: b, source: 'file', name: HAK.TEMPLATE_DEFS[key].file, size: b.length };
        }
      }
      throw new Error('Chưa có template cho "' + HAK.TEMPLATE_DEFS[key].title + '". Hãy upload ở Cài đặt → Mẫu.');
    },
    /** Kiểm tra 1 file DOCX có phải template hợp lệ không; trả về danh sách thẻ. */
    inspect(bytes) {
      const out = { ok: false, tags: [], unknown: [], error: '' };
      try {
        const zip = new PizZip(bytes);
        if (!zip.file('word/document.xml')) throw new Error('Không phải file .docx hợp lệ (thiếu word/document.xml).');
        const doc = new (DT())(zip, OPTIONS); // biên dịch → phát hiện thẻ lỗi
        const text = doc.getFullText();
        const found = new Set();
        text.replace(/\{\{\s*[#\/^]?\s*([\w.]+)\s*\}\}/g, (_, n) => {
          found.add(n);
          return _;
        });
        out.tags = Array.from(found).sort();
        const known = new Set();
        HAK.PLACEHOLDERS.forEach((row) =>
          row[0].replace(/\{\{\s*[#\/^]?\s*([\w.]+)\s*\}\}/g, (_, n) => {
            known.add(n);
            return _;
          })
        );
        // các biến bổ sung nằm trong nhiều template
        [
          'stt',
          'ticket',
          'time1',
          'time2',
          'plate',
          'w1',
          'w2',
          'net',
          'driver',
          'carrier',
          'wh',
          'trips',
          'dFrom',
          'dTo',
          'tons',
          'note',
          'giao_khoShort',
          'nhan_khoShort',
          'weightType',
          'evidence',
          'dateFromShort',
          'khoGuiCode',
          'periodMonth',
          'periodYear',
          'factory',
          'contractQtyText',
          'giao_short',
          'issuer_name_upper',
          'giao_role',
          'nhan_role',
          'giao_repName',
          'nhan_repName',
          'giao_email',
          'giao_phone',
          'days',
          'date',
          'kg',
          'retKg',
          'delKg',
          'trip',
          'weightKg',
          'returnedKg',
          'weightDeliveredKg',
          'hasPrice',
          'unitPrice',
          'amount',
          'amountWords',
          'priceNote',
          'contractNo',
          'nhan_email',
          'nhan_phone',
          'giao_factory',
          'nhan_factory',
          'giao_name_upper',
          'nhan_name_upper',
          'kho_giao_addr',
          'kho_nhan_addr',
        ].forEach((n) => known.add(n));
        out.unknown = out.tags.filter((t) => !known.has(t));
        out.ok = true;
      } catch (e) {
        out.error = explain(e);
      }
      return out;
    },
    /** Lưu template người dùng upload (base64 trong localStorage). */
    async saveCustom(key, file) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const info = this.inspect(bytes);
      if (!info.ok) throw new Error('Template lỗi: ' + info.error);
      const okStore = HAK.Store.set(TPL_KEY(key), {
        name: file.name,
        b64: bytesToB64(bytes),
        size: bytes.length,
        date: new Date().toISOString(),
      });
      return { info, persisted: okStore };
    },
    reset(key) {
      HAK.Store.remove(TPL_KEY(key));
    },
    async download(key) {
      const t = await this.get(key);
      Files.saveBlob(new Blob([t.bytes], { type: DOCX_MIME }), HAK.TEMPLATE_DEFS[key].file);
    },
  };

  /* ---------- Render ---------- */
  const Render = {
    /** Trả về Uint8Array của file DOCX đã điền dữ liệu. */
    async render(key, data) {
      const t = await Templates.get(key);
      if (HAK.DocxWorker) return HAK.DocxWorker.render(t.bytes, data);
      let doc;
      try {
        doc = new (DT())(new PizZip(t.bytes), OPTIONS);
        doc.render(data);
      } catch (e) {
        throw new Error('Lỗi khi điền template "' + HAK.TEMPLATE_DEFS[key].file + '": ' + explain(e));
      }
      return doc.getZip().generate({ type: 'uint8array', compression: 'DEFLATE', mimeType: DOCX_MIME });
    },
  };

  /* ---------- Lưu file ---------- */
  /** Tải về bằng trình duyệt (thư mục Tải xuống). Trả về nhãn đường dẫn, hoặc null nếu không làm được. */
  function browserDownload(blob, name) {
    try {
      if (typeof root.saveAs === 'function') {
        root.saveAs(blob, name);
        return 'Downloads/' + name;
      }
      if (root.document && root.URL && root.URL.createObjectURL) {
        const a = root.document.createElement('a');
        a.href = root.URL.createObjectURL(blob);
        a.download = name;
        a.style.display = 'none';
        root.document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          a.remove();
          root.URL.revokeObjectURL(a.href);
        }, 4000);
        return 'Downloads/' + name;
      }
    } catch (err) {
      /* không tải được → báo lỗi như cũ */
    }
    return null;
  }
  const Files = {
    async saveBlob(blob, name) {
      let hintTimer = null;
      try {
        // Native Save As does not depend on browser user-activation surviving document generation.
        const raw = new Uint8Array(await blob.arrayBuffer());
        let binary = '';
        for (let i = 0; i < raw.length; i += 16384) binary += String.fromCharCode.apply(null, raw.subarray(i, i + 16384));
        if (HAK.UI && HAK.UI.Loading) HAK.UI.Loading.hide();
        const encoded = btoa(binary);
        // Trình hỗ trợ (HAKDocs) từ chối gói > 36 MB mà không đọc hết → trình duyệt chỉ báo "Failed to fetch": báo rõ nguyên nhân trước khi gửi.
        if (encoded.length > 36 * 1024 * 1024 - 4096)
          throw Error(
            'tệp quá lớn (' +
              Math.round(raw.length / 1048576) +
              ' MB), vượt giới hạn ~26 MB của trình hỗ trợ lưu tệp. Thu hẹp phạm vi (ngày / số phiếu / biển số) rồi tạo lại'
          );
        const send = async () => {
          const controller = new AbortController(),
            timer = setTimeout(() => controller.abort(), 180000);
          try {
            return await fetch('http://127.0.0.1:31879/save-download', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-HAK-Client': 'documents-v1', 'X-HAK-Token': window.HAK_DOCS_TOKEN || '' },
              body: JSON.stringify({ name, base64: encoded }),
              signal: controller.signal,
            });
          } finally {
            clearTimeout(timer);
          }
        };
        // Chỉ nhắc khi phải chờ > 1,2 giây (tức hộp Lưu của Windows đang mở, có thể nằm sau cửa sổ trình duyệt).
        hintTimer = setTimeout(() => {
          if (HAK.UI && HAK.UI.toast)
            HAK.UI.toast(
              'Đang mở hộp Lưu của Windows cho "' +
                name +
                '". Nếu chưa thấy, tìm biểu tượng nhấp nháy ở thanh taskbar (hộp có thể nằm sau cửa sổ trình duyệt).',
              'info'
            );
        }, 1200);
        let response;
        for (let attempt = 0; ; attempt++) {
          try {
            response = await send();
          } catch (err) {
            if (err && err.name === 'AbortError') throw err;
            throw Error('không kết nối được trình hỗ trợ lưu tệp — có thể nó đã tắt khi cài bản mới hoặc sau thời gian dài không dùng');
          }
          if (response.status !== 409 || attempt >= 40) break; // 409 = trình hỗ trợ đang bận (hộp Lưu còn mở / tệp trước chưa xong) → đợi rồi thử lại
          if (attempt === 2 && HAK.UI && HAK.UI.toast) HAK.UI.toast('Trình hỗ trợ lưu tệp đang bận — đang đợi để lưu tiếp…', 'info');
          await new Promise((ok) => setTimeout(ok, 1500));
        }
        clearTimeout(hintTimer);
        const result = await response.json();
        if (!response.ok) {
          const errDetail =
            result && typeof result.error === 'object' && result.error !== null
              ? result.error.message || JSON.stringify(result.error)
              : result && result.error;
          throw Error(
            response.status === 409
              ? 'trình hỗ trợ lưu tệp vẫn đang bận — đóng hộp Lưu còn mở (nếu có) rồi bấm lại'
              : errDetail || 'Không lưu được tệp.'
          );
        }
        if (result.canceled) return false;
        if (HAK.Downloads) HAK.Downloads.saved(result.path, result.warning);
        return result.path;
      } catch (e) {
        clearTimeout(hintTimer);
        // v2.12.5: trình hỗ trợ lưu tệp không dùng được / bận / tệp quá lớn → TỰ tải qua trình duyệt thay vì báo lỗi chặn người dùng.
        // Chờ hộp Lưu quá 3 phút (AbortError) thì không tự tải — hộp Lưu có thể còn mở.
        if (!(e && e.name === 'AbortError')) {
          const done = browserDownload(blob, name);
          if (done) {
            if (HAK.UI) {
              const rawReason = (e && e.message) || String(e || '');
              const cleanReason = HAK.UI.friendly ? HAK.UI.friendly(rawReason) : rawReason;
              HAK.UI.toast(
                'Đã tải "' + name + '" về thư mục Tải xuống của trình duyệt (trình hỗ trợ lưu tệp không dùng được: ' + cleanReason + ').',
                'info'
              );
            }
            return done;
          }
        }
        if (HAK.UI) {
          const rawErr = e && e.message ? e.message : String(e || '');
          const cleanErr = HAK.UI.friendly ? HAK.UI.friendly(rawErr) : rawErr;
          HAK.UI.toast(
            e && e.name === 'AbortError'
              ? 'Chờ chọn nơi lưu quá 3 phút. Đóng hộp Lưu thành còn mở rồi thử lại.'
              : 'Chưa lưu tệp: ' + cleanErr + '. Mở app bằng lối tắt của bản cài mới rồi thử lại.',
            'error'
          );
        }
        return false;
      }
    },
    /**
     * Sinh & lưu nhiều file. opts: { zip:boolean, zipName:string, onProgress(pct,msg) }
     * Trả về [{name, size}]
     */
    async generateAndSave(files, opts) {
      opts = opts || {};
      const prog = opts.onProgress || function () {};
      const done = [];
      const tick = () => new Promise((r) => setTimeout(r, 20)); // nhường luồng để UI vẽ loading/tiến độ
      for (let i = 0; i < files.length; i++) {
        prog(Math.round((i / files.length) * 85) + 5, 'Đang sinh ' + files[i].name + '…');
        await tick();
        files[i].bytes = await Render.render(files[i].tpl, files[i].data);
        done.push({ name: files[i].name, size: files[i].bytes.length });
      }
      prog(92, 'Đang lưu file…');
      await tick();
      if (files.length > 1 && opts.zip) {
        const z = new PizZip();
        files.forEach((f) => z.file(f.name, f.bytes));
        const blob = new Blob([z.generate({ type: 'uint8array', compression: 'DEFLATE' })], { type: 'application/zip' });
        if (!(await Files.saveBlob(blob, opts.zipName || 'BienBan.zip'))) return [];
      } else {
        for (let i = 0; i < files.length; i++) {
          if (!(await Files.saveBlob(new Blob([files[i].bytes], { type: DOCX_MIME }), files[i].name))) return [];
          if (i < files.length - 1) await new Promise((r) => setTimeout(r, 500)); // tránh trình duyệt chặn tải nhiều file
        }
      }
      prog(100, 'Hoàn tất');
      return done;
    },
  };

  /* ---------- Tải PDF: dựng bản in từ chính file DOCX rồi mở hộp thoại in của trình duyệt ----------
   * Trình duyệt không chuyển DOCX → PDF được khi chạy offline, nên:
   *   1. Điền dữ liệu vào template (giống hệt file Word).
   *   2. docx-preview hiển thị DOCX thành HTML trong #printRoot (ẩn trên màn hình, chỉ hiện khi in).
   *   3. Mở hộp thoại in → người dùng chọn "Lưu dưới dạng PDF". Tên file PDF gợi ý = tên file Word.
   * Mỗi section Word (dọc/ngang) → 1 "named page" CSS riêng để giữ đúng khổ giấy & lề; tiêu đề bảng lặp lại mỗi trang.
   */
  const PX_MM = 25.4 / 96;
  const Pdf = {
    _title: null,
    cleanup() {
      const h = document.getElementById('printRoot');
      if (h) h.remove();
      const s = document.getElementById('printPageStyle');
      if (s) s.remove();
      document.body.classList.remove('printing');
      if (this._title !== null) {
        document.title = this._title;
        this._title = null;
      }
    },
    /** files: [{tpl,name,data}] → dựng #printRoot. Trả về số section (trang gốc). */
    async prepare(files, onProgress) {
      if (!root.docx && HAK.UI && HAK.UI.needLib) await HAK.UI.needLib('docxPreview'); // nạp khi cần
      if (!root.docx || !root.JSZip) throw new Error('Thiếu thư viện xem trước DOCX (libs/docx-preview.min.js, libs/jszip.min.js).');
      this.cleanup();
      const prog = onProgress || function () {};
      const host = document.createElement('div');
      host.id = 'printRoot';
      document.body.appendChild(host);
      const tick = () => new Promise((r) => setTimeout(r, 20));
      for (let i = 0; i < files.length; i++) {
        prog(5 + Math.round((i / files.length) * 40), 'Đang dựng ' + files[i].name + '…');
        await tick();
        const bytes = files[i].bytes || (files[i].bytes = await Render.render(files[i].tpl, files[i].data));
        const holder = document.createElement('div');
        holder.className = 'print-doc';
        host.appendChild(holder);
        await root.docx.renderAsync(bytes.buffer ? new Blob([bytes], { type: DOCX_MIME }) : bytes, holder, null, {
          className: 'docx',
          inWrapper: false,
          breakPages: true,
          ignoreLastRenderedPageBreak: true,
          renderHeaders: false,
          renderFooters: false,
          renderFootnotes: false,
          useBase64URL: true,
        });
      }
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      prog(60, 'Đang dàn trang…');
      await tick();
      // ---- khổ giấy / lề theo từng section ----
      const pages = new Map(),
        css = [];
      host.querySelectorAll('section.docx').forEach((sec) => {
        const cs = getComputedStyle(sec);
        const w = parseFloat(cs.width),
          h = parseFloat(cs.minHeight); // computed style luôn đổi sang px
        const pad = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].map((k) => Math.max(0, parseFloat(cs[k]) || 0));
        const key = [w, h]
          .concat(pad)
          .map((x) => Math.round(x))
          .join('_');
        let name = pages.get(key);
        if (!name) {
          name = 'pg' + pages.size;
          pages.set(key, name);
          const mm = (x) => (x * PX_MM).toFixed(2) + 'mm';
          css.push('@page ' + name + ' { size: ' + mm(w) + ' ' + mm(h) + '; margin: ' + pad.map(mm).join(' ') + '; }');
          css.push('.' + name + ' { page: ' + name + '; }');
        }
        sec.classList.add(name);
      });
      // docx-preview không áp cỡ chữ của "dấu đoạn" → dòng bị cao hơn Word. Cho đoạn lấy cỡ chữ của run đầu tiên.
      host.querySelectorAll('p').forEach((p) => {
        const sp = p.firstElementChild;
        if (sp && sp.tagName === 'SPAN' && sp.style.fontSize) p.style.fontSize = sp.style.fontSize;
      });
      // tiêu đề bảng lặp lại trên mỗi trang: đưa hàng đầu của bảng dài vào <thead>
      host.querySelectorAll('table').forEach((t) => {
        if (t.rows.length < 12 || t.tHead) return;
        const first = t.rows[0],
          thead = document.createElement('thead');
        first.parentNode.insertBefore(thead, first);
        thead.appendChild(first);
      });
      const st = document.createElement('style');
      st.id = 'printPageStyle';
      st.textContent = css.join('\n');
      document.head.appendChild(st);
      document.body.classList.add('printing');
      prog(90, 'Sẵn sàng in…');
      return pages.size;
    },
    /** Dựng bản in rồi mở hộp thoại in (chọn "Lưu dưới dạng PDF"). */
    async print(files, opts) {
      opts = opts || {};
      await this.prepare(files, opts.onProgress);
      this._title = document.title;
      document.title = String(opts.title || files[files.length - 1].name).replace(/\.docx$/i, '');
      const done = () => {
        window.removeEventListener('afterprint', done);
        setTimeout(() => this.cleanup(), 300);
      };
      window.addEventListener('afterprint', done);
      if (opts.beforePrint) opts.beforePrint();
      await new Promise((r) => setTimeout(r, 350)); // cho trình duyệt dàn trang xong
      window.print();
    },
  };

  HAK.Word = { Templates, Render, Files, Pdf, b64ToBytes, bytesToB64, explain, DOCX_MIME, OPTIONS };
})(typeof window !== 'undefined' ? window : globalThis);
