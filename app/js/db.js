/**
 * db.js — HAK.DB: lớp IndexedDB dùng chung của app (DB "hak-app").
 *   - Kho "kv": bản sao lưu ngầm của mọi khóa HAK.Store (cài đặt, danh sách xe, mẫu Word, form…) → không mất khi localStorage đầy / bị xóa.
 *   - Kho "hak-archive" (Lưu trữ biên bản) vẫn do archive.js quản lý riêng, KHÔNG đổi định dạng.
 *   - Kho nghiệp vụ (v2): "batches" + "batchdata" (các đợt Excel đã nhập: thông số + file gốc), "issued" (nhật ký chứng từ PXK/BKLS đã lập).
 *   - Kho "handles" (v3): tay cầm thư mục mặc định khi Sao lưu (File System Access API) — xem backup.js.
 *   - Kho mới ở giai đoạn sau: nâng VER và thêm khối `if (ev.oldVersion < N)` trong onupgradeneeded.
 * Không có IndexedDB → backend 'mem' (mọi hàm vẫn chạy, chỉ không lưu bền).
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const NAME = 'hak-app',
    VER = 4;
  const STORES = {
    kv: { keyPath: 'key' },
    batches: { keyPath: 'id' },
    batchdata: {},
    issued: { keyPath: 'id' },
    handles: {},
    attachments: { keyPath: 'id' },
    bklsTemplates: { keyPath: 'id' },
  };
  const memStores = {}; // dự phòng khi không có IndexedDB
  /** Backend SQLite (HAKDocs) khi HAK.Storage.mode === 'sqlite'; kho "handles" luôn ở IndexedDB (tay cầm thư mục không tuần tự hóa được). null = dùng IndexedDB. Bị chặn → ném lỗi. */
  const sqlite = async (store) => {
    const S = HAK.Storage;
    if (!S) return null;
    await S.whenReady();
    S.assertOpen();
    return S.mode === 'sqlite' && store !== 'handles' && HAK.DBSqlite ? HAK.DBSqlite : null;
  };
  const state = { backend: root.indexedDB ? 'idb' : 'mem', error: null };
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((ok) => {
      let done = false;
      const fin = (db) => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          ok(db);
        } else if (db) db.close();
      };
      const timer = setTimeout(() => {
        if (!done) {
          state.backend = 'mem';
          state.error = 'timeout';
          fin(null);
        }
      }, 4000); // tab cũ giữ DB → không chờ mãi
      try {
        if (!root.indexedDB) {
          state.backend = 'mem';
          return fin(null);
        }
        const rq = root.indexedDB.open(NAME, VER);
        rq.onupgradeneeded = (ev) => {
          const d = rq.result;
          if (ev.oldVersion < 1) d.createObjectStore('kv', { keyPath: 'key' });
          if (ev.oldVersion < 2) {
            d.createObjectStore('batches', { keyPath: 'id' });
            d.createObjectStore('batchdata');
            d.createObjectStore('issued', { keyPath: 'id' });
          }
          if (ev.oldVersion < 3) d.createObjectStore('handles');
          if (ev.oldVersion < 4) {
            d.createObjectStore('attachments', { keyPath: 'id' });
            d.createObjectStore('bklsTemplates', { keyPath: 'id' });
          }
        };
        rq.onsuccess = () => {
          const d = rq.result;
          d.onversionchange = () => {
            d.close();
            dbp = null;
          };
          fin(d);
        };
        rq.onerror = () => {
          state.backend = 'mem';
          state.error = String(rq.error || 'error');
          fin(null);
        };
        /* onblocked: chờ (tab khác đang mở bản cũ sẽ tự đóng) — có timeout ở trên */
      } catch (e) {
        state.backend = 'mem';
        state.error = String(e);
        fin(null);
      }
    });
    return dbp;
  }
  const reqP = (rq) =>
    new Promise((ok, no) => {
      rq.onsuccess = () => ok(rq.result);
      rq.onerror = () => no(rq.error);
    });
  const txDone = (tx) =>
    new Promise((ok, no) => {
      tx.oncomplete = () => ok();
      tx.onerror = tx.onabort = () => no(tx.error || new Error('Không ghi được IndexedDB'));
    });

  async function kvPut(key, val, ls) {
    const q = await sqlite('kv');
    if (q) return q.kvPut(key, val);
    const db = await open();
    if (!db) return;
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put({ key, val, ls: ls !== false, ts: Date.now() });
    return txDone(tx);
  }
  async function kvDel(key) {
    const q = await sqlite('kv');
    if (q) return q.kvDel(key);
    const db = await open();
    if (!db) return;
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').delete(key);
    return txDone(tx);
  }
  async function kvAll() {
    const q = await sqlite('kv');
    if (q) return q.kvAll();
    const db = await open();
    if (!db) return [];
    return reqP(db.transaction('kv', 'readonly').objectStore('kv').getAll());
  }
  async function kvClear() {
    const q = await sqlite('kv');
    if (q) return q.kvClear();
    const db = await open();
    if (!db) return;
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').clear();
    return txDone(tx);
  }

  /* ---- API chung cho các kho nghiệp vụ (put/get/getAll/del/clear); không có IndexedDB → Map trong RAM ---- */
  const mem = (st) => memStores[st] || (memStores[st] = new Map());
  async function put(store, val, key) {
    const q = await sqlite(store);
    if (q) return q.put(store, val, key);
    const db = await open();
    if (!db) {
      mem(store).set(key !== undefined ? key : val[STORES[store].keyPath], val);
      return;
    }
    const tx = db.transaction(store, 'readwrite');
    if (key !== undefined) tx.objectStore(store).put(val, key);
    else tx.objectStore(store).put(val);
    return txDone(tx);
  }
  async function get(store, key) {
    const q = await sqlite(store);
    if (q) return q.get(store, key);
    const db = await open();
    if (!db) return mem(store).get(key);
    return reqP(db.transaction(store, 'readonly').objectStore(store).get(key));
  }
  async function getAll(store) {
    const q = await sqlite(store);
    if (q) return q.getAll(store);
    const db = await open();
    if (!db) return Array.from(mem(store).values());
    return reqP(db.transaction(store, 'readonly').objectStore(store).getAll());
  }
  async function del(store, key) {
    const q = await sqlite(store);
    if (q) return q.del(store, key);
    const db = await open();
    if (!db) {
      mem(store).delete(key);
      return;
    }
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    return txDone(tx);
  }
  async function clear(store) {
    const q = await sqlite(store);
    if (q) return q.clear(store);
    const db = await open();
    if (!db) {
      mem(store).clear();
      return;
    }
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).clear();
    return txDone(tx);
  }

  /**
   * Ghi NHIỀU kho trong MỘT giao dịch có kiểm tra phiên bản (rev) của bản ghi chốt:
   *   check(cur) → chuỗi lỗi (xung đột) hoặc null; apply(tx) ghi bằng tx.objectStore(kho).put / delete.
   * Giao dịch hỏng / bị hủy → KHÔNG ghi gì (không còn tình trạng có file gốc mà thiếu thông số, hoặc ngược lại). Không có IndexedDB → ghi vào RAM.
   * Lỗi xung đột (cửa sổ khác đã đổi bản ghi) có e.conflict = true.
   */
  async function guarded(stores, guardStore, guardKey, check, apply) {
    const q = await sqlite(guardStore);
    if (q) return q.guarded(stores, guardStore, guardKey, check, apply);
    const db = await open();
    if (!db) {
      const err = check(mem(guardStore).get(guardKey));
      if (err) throw Object.assign(new Error(err), { conflict: true });
      apply({
        objectStore: (st) => ({
          put: (val, key) => mem(st).set(key !== undefined ? key : val[STORES[st].keyPath], val),
          delete: (key) => mem(st).delete(key),
        }),
      });
      return;
    }
    return new Promise((ok, no) => {
      let tx,
        conflict = null;
      try {
        tx = db.transaction(stores, 'readwrite');
        const g = tx.objectStore(guardStore).get(guardKey);
        g.onsuccess = () => {
          const err = check(g.result);
          if (err) {
            conflict = err;
            try {
              tx.abort();
            } catch (e) {
              /* đã hủy */
            }
          } else {
            try {
              apply(tx);
            } catch (e) {
              try {
                tx.abort();
              } catch (e2) {
                /* đã hủy */
              }
            }
          }
        };
        tx.oncomplete = () => ok();
        tx.onabort = tx.onerror = () =>
          no(conflict ? Object.assign(new Error(conflict), { conflict: true }) : tx.error || new Error('Không ghi được IndexedDB'));
      } catch (e) {
        no(e);
      }
    });
  }

  /** Đọc bản ghi kv (giá trị đã giải mã) hoặc undefined. */
  async function kvGet(key) {
    const q = await sqlite('kv');
    if (q) return q.kvGet(key);
    const db = await open();
    if (!db) {
      const m = mem('kv').get(key);
      return m ? m.val : undefined;
    }
    const r = await reqP(db.transaction('kv', 'readonly').objectStore('kv').get(key));
    return r ? r.val : undefined;
  }
  /**
   * So sánh-và-ghi nguyên tử một khóa kv: check(giá trị hiện tại | undefined) → chuỗi lỗi (xung đột) hoặc null; null thì ghi `next`.
   * Cửa sổ khác đổi bản ghi giữa lúc đọc và ghi → e.conflict = true. (Thay cho giao dịch IndexedDB tự mở ở catalog.js / yearbook.js.)
   */
  async function kvCas(key, check, next) {
    const q = await sqlite('kv');
    if (q) return q.kvCas(key, check, next);
    const db = await open();
    if (!db) {
      const err = check(mem('kv').has(key) ? mem('kv').get(key).val : undefined);
      if (err) throw Object.assign(new Error(err), { conflict: true });
      mem('kv').set(key, { key, val: next, ls: false, ts: Date.now() });
      return;
    }
    return new Promise((ok, no) => {
      let tx,
        conflict = null;
      try {
        tx = db.transaction('kv', 'readwrite');
        const store = tx.objectStore('kv'),
          g = store.get(key);
        g.onsuccess = () => {
          const err = check(g.result ? g.result.val : undefined);
          if (err) {
            conflict = err;
            try {
              tx.abort();
            } catch (e) {
              /* đã hủy */
            }
            return;
          }
          store.put({ key, val: next, ls: false, ts: Date.now() });
        };
        tx.oncomplete = () => ok();
        tx.onabort = tx.onerror = () =>
          no(conflict ? Object.assign(new Error(conflict), { conflict: true }) : tx.error || new Error('Không ghi được IndexedDB'));
      } catch (e) {
        no(e);
      }
    });
  }

  /** Tình trạng bộ nhớ trình duyệt (để hiện ở Cài đặt). */
  async function status() {
    const out = { backend: state.backend, persisted: null, usage: null, quota: null };
    if (HAK.Storage && HAK.Storage.mode === 'sqlite') {
      const st = HAK.Storage.status || {};
      return Object.assign(out, { backend: 'sqlite', persisted: true, usage: st.size == null ? null : st.size, file: st.file || '' });
    }
    await open();
    out.backend = state.backend;
    try {
      if (navigator.storage && navigator.storage.persisted) out.persisted = await navigator.storage.persisted();
    } catch (e) {
      /* bỏ qua */
    }
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const e = await navigator.storage.estimate();
        out.usage = e.usage;
        out.quota = e.quota;
      }
    } catch (e) {
      /* bỏ qua */
    }
    return out;
  }
  async function requestPersist() {
    try {
      return !!(navigator.storage && navigator.storage.persist && (await navigator.storage.persist()));
    } catch (e) {
      return false;
    }
  }

  HAK.DB = {
    guarded,
    open,
    kvGet,
    kvCas,
    kvPut,
    kvDel,
    kvAll,
    kvClear,
    put,
    get,
    getAll,
    del,
    clear,
    status,
    requestPersist,
    usable: () => (HAK.Storage && HAK.Storage.mode === 'sqlite') || state.backend === 'idb',
    get backend() {
      return HAK.Storage && HAK.Storage.mode === 'sqlite' ? 'sqlite' : state.backend;
    },
  };
})(window);
