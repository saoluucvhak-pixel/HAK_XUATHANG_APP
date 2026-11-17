/* HAKDB engine (tham chiếu, Node `node:sqlite`): hợp đồng dữ liệu của HAKDocs-SQLite. HAKDocs (C#, winsqlite3) cài đặt CÙNG hợp đồng này;
 * bộ test tests/hakdb-*.test.cjs chạy trên engine này, và CI Windows chạy lại bộ ca HTTP trên HAKDocs.exe thật.
 *
 * Không có SQL từ trang web: chỉ có các thao tác CRUD theo bảng/cột được lấy từ schema (PRAGMA table_info), mọi giá trị đều là tham số.
 *   tx(ops, ctx)   ops: { op:'put', table, row, ifRev }  — ifRev: bỏ qua = ghi đè; null = phải CHƯA có; số = phải đúng phiên bản đó
 *                       { op:'del', table, key|where, ifRev }
 *                       { op:'guard', table, key, ifRev }   (chỉ kiểm phiên bản, không ghi)
 *   query(q, ctx)  { table, where, cols, order, limit, offset, count }
 *   ctx.scope: null = mọi công ty | mảng mã công ty được phép (bảng có cột company_id bị lọc / chặn ghi ngoài phạm vi)
 * Lỗi: { code:'conflict'|'fk'|'unique'|'scope'|'bad-request'|'io', message, ... } (HTTP 409/409/409/403/400/500).
 * Blob truyền dạng { "$b64": "..." }. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA_DIR = path.join(__dirname, '..', '..', 'installer', 'native', 'db');
const SCHEMAS = [{ v: 1, file: 'schema.v1.sql' }]; // thêm bản mới: { v: 2, file: 'schema.v2.sql' } (chỉ ALTER/CREATE, chạy trong giao dịch, sao lưu trước)

class HakDbError extends Error {
  constructor(code, message, extra) {
    super(message);
    this.code = code;
    Object.assign(this, extra || {});
  }
}
const IDENT = /^[a-z_][a-z0-9_]*$/;
const sha256File = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

function enc(v) {
  if (v === undefined) return null;
  if (v && typeof v === 'object' && typeof v.$b64 === 'string') return Buffer.from(v.$b64, 'base64');
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number' && !Number.isFinite(v)) throw new HakDbError('bad-request', 'Số không hợp lệ (NaN / Infinity)');
  if (v !== null && typeof v === 'object') throw new HakDbError('bad-request', 'Giá trị cột phải là số, chuỗi, null hoặc {$b64}');
  return v;
}
function dec(v) {
  if (v instanceof Uint8Array) return { $b64: Buffer.from(v).toString('base64') };
  return v;
}

class HakDb {
  constructor(file, opt) {
    this.file = file;
    this.opt = opt || {};
    this.db = null;
    this.tables = new Map();
    this.stmtCache = new Map();
  }
  static open(file, opt) {
    const h = new HakDb(file, opt);
    h._open();
    return h;
  }
  _open() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    this.db = new DatabaseSync(this.file);
    // Cấu hình MỖI kết nối: khóa ngoại bật, WAL + synchronous=FULL (bền khi mất điện), chờ khóa 5 s.
    this.db.exec(
      'PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; PRAGMA trusted_schema=OFF;'
    );
    this._migrate();
    this._loadMeta();
  }
  _migrate() {
    const has = this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='meta'").get();
    let cur = 0;
    if (has) {
      const r = this.db.prepare("SELECT value FROM meta WHERE key='schema_version'").get();
      cur = r ? Number(r.value) : 0;
    }
    const latest = SCHEMAS[SCHEMAS.length - 1].v;
    if (cur > latest)
      throw new HakDbError('bad-request', 'Cơ sở dữ liệu thuộc phiên bản mới hơn (' + cur + ' > ' + latest + '): hãy cập nhật ứng dụng.');
    for (const s of SCHEMAS.filter((x) => x.v > cur)) {
      const sql = fs.readFileSync(path.join(SCHEMA_DIR, s.file), 'utf8');
      this.db.exec('BEGIN IMMEDIATE');
      try {
        this.db.exec(sql);
        this.db
          .prepare("INSERT INTO meta(key,value) VALUES('schema_version',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
          .run(String(s.v));
        if (s.v === 1) this.db.prepare("INSERT OR IGNORE INTO meta(key,value) VALUES('created_at',?)").run(new Date().toISOString());
        this.db.exec('COMMIT');
      } catch (e) {
        this.db.exec('ROLLBACK');
        throw new HakDbError('io', 'Nâng schema lên v' + s.v + ' thất bại: ' + e.message);
      }
    }
  }
  _loadMeta() {
    this.tables.clear();
    const names = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((r) => r.name);
    for (const t of names) {
      const cols = this.db.prepare('PRAGMA table_info(' + t + ')').all();
      this.tables.set(t, {
        cols: new Map(cols.map((c) => [c.name, { type: String(c.type).toUpperCase(), notnull: !!c.notnull, pk: c.pk }])),
        pk: cols
          .filter((c) => c.pk)
          .sort((a, b) => a.pk - b.pk)
          .map((c) => c.name),
        rev: cols.some((c) => c.name === 'rev'),
        company: cols.some((c) => c.name === 'company_id'),
        blobs: cols.filter((c) => c.type.toUpperCase() === 'BLOB').map((c) => c.name),
      });
    }
  }
  close() {
    if (this.db) this.db.close();
    this.db = null;
  }
  /** Giá trị meta (vd active_backend); ghi bằng quy trình kích hoạt có đối chiếu (di trú). */
  meta(key) {
    const r = this.db.prepare('SELECT value FROM meta WHERE key=?').get(key);
    return r ? r.value : null;
  }
  setMeta(key, value) {
    this.db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, String(value));
  }
  schemaVersion() {
    return Number(this.db.prepare("SELECT value FROM meta WHERE key='schema_version'").get().value);
  }
  _tbl(name) {
    const t = this.tables.get(name);
    if (!t || name === 'meta' || name === 'sqlite_sequence') throw new HakDbError('bad-request', 'Bảng không được phép: ' + name);
    return t;
  }
  _col(t, c, table) {
    if (!IDENT.test(c) || !t.cols.has(c)) throw new HakDbError('bad-request', 'Cột không có trong ' + table + ': ' + c);
  }
  _stmt(sql) {
    let s = this.stmtCache.get(sql);
    if (!s) {
      if (this.stmtCache.size > 500) this.stmtCache.clear();
      s = this.db.prepare(sql);
      this.stmtCache.set(sql, s);
    }
    return s;
  }
  _inScope(t, row, ctx) {
    if (!t.company || !ctx || !ctx.scope) return true;
    return row.company_id == null || ctx.scope.includes(row.company_id);
  }
  _keyWhere(t, table, key) {
    const k = key && typeof key === 'object' && !Array.isArray(key) ? key : { [t.pk[0]]: key };
    if (Object.keys(k).length !== t.pk.length || !t.pk.every((c) => k[c] !== undefined && k[c] !== null))
      throw new HakDbError('bad-request', 'Thiếu khóa chính của ' + table + ' (' + t.pk.join(', ') + ')');
    return { sql: t.pk.map((c) => c + '=?').join(' AND '), args: t.pk.map((c) => enc(k[c])) };
  }
  _currentRev(t, table, kw) {
    const r = this._stmt('SELECT ' + (t.rev ? 'rev' : '1 AS rev') + ' FROM ' + table + ' WHERE ' + kw.sql).get(...kw.args);
    return r ? Number(r.rev) : null;
  }
  _op(op, ctx) {
    const table = op.table;
    const t = this._tbl(table);
    if (op.op === 'put') {
      const row = op.row || {};
      for (const c of Object.keys(row)) this._col(t, c, table);
      const cols = Object.keys(row).filter((c) => c !== 'rev');
      t.pk.forEach((c) => {
        if (row[c] === undefined || row[c] === null) throw new HakDbError('bad-request', 'Thiếu khóa chính ' + c + ' của ' + table);
      });
      if (!this._inScope(t, row, ctx)) throw new HakDbError('scope', 'Ngoài phạm vi công ty được phép (' + table + ')', { table });
      const kw = this._keyWhere(t, table, Object.fromEntries(t.pk.map((c) => [c, row[c]])));
      const cur = this._currentRev(t, table, kw);
      if (t.company && cur !== null && ctx && ctx.scope) {
        const old = this._stmt('SELECT company_id FROM ' + table + ' WHERE ' + kw.sql).get(...kw.args);
        if (old && old.company_id != null && !ctx.scope.includes(old.company_id))
          throw new HakDbError('scope', 'Bản ghi thuộc công ty ngoài phạm vi', { table });
      }
      if (op.ifRev !== undefined && t.rev) {
        if (op.ifRev === null && cur !== null)
          throw new HakDbError('conflict', 'Bản ghi đã tồn tại (' + table + ')', { table, key: row[t.pk[0]], expected: null, actual: cur });
        if (typeof op.ifRev === 'number' && cur !== op.ifRev)
          throw new HakDbError('conflict', 'Bản ghi đã đổi bởi nơi khác (' + table + ')', {
            table,
            key: row[t.pk[0]],
            expected: op.ifRev,
            actual: cur,
          });
      }
      const vals = cols.map((c) => enc(row[c]));
      if (cur === null) {
        const ic = t.rev ? cols.concat(['rev']) : cols;
        const iv = t.rev ? vals.concat([1]) : vals;
        this._stmt('INSERT INTO ' + table + '(' + ic.join(',') + ') VALUES(' + ic.map(() => '?').join(',') + ')').run(...iv);
        return { table, key: row[t.pk[0]], rev: t.rev ? 1 : undefined, created: true };
      }
      const sets = cols.filter((c) => !t.pk.includes(c)).map((c) => c + '=?');
      const sv = cols.filter((c) => !t.pk.includes(c)).map((c) => enc(row[c]));
      if (t.rev) sets.push('rev=rev+1');
      if (sets.length) this._stmt('UPDATE ' + table + ' SET ' + sets.join(',') + ' WHERE ' + kw.sql).run(...sv, ...kw.args);
      return { table, key: row[t.pk[0]], rev: t.rev ? cur + 1 : undefined, created: false };
    }
    if (op.op === 'del') {
      let wsql, wargs;
      if (op.key !== undefined) {
        const kw = this._keyWhere(t, table, op.key);
        wsql = kw.sql;
        wargs = kw.args;
        if (op.ifRev !== undefined && t.rev) {
          const cur = this._currentRev(t, table, kw);
          if (cur !== op.ifRev)
            throw new HakDbError('conflict', 'Bản ghi đã đổi bởi nơi khác (' + table + ')', { table, expected: op.ifRev, actual: cur });
        }
      } else {
        const w = this._where(t, table, op.where || {});
        if (!w.sql) throw new HakDbError('bad-request', 'Xóa theo điều kiện cần where không rỗng');
        wsql = w.sql;
        wargs = w.args;
      }
      if (t.company && ctx && ctx.scope) {
        const bad = this._stmt(
          'SELECT COUNT(*) n FROM ' +
            table +
            ' WHERE (' +
            wsql +
            ') AND company_id IS NOT NULL AND company_id NOT IN (' +
            (ctx.scope.map(() => '?').join(',') || "''") +
            ')'
        ).get(...wargs, ...ctx.scope);
        if (bad.n) throw new HakDbError('scope', 'Có bản ghi ngoài phạm vi công ty được phép', { table });
      }
      const r = this._stmt('DELETE FROM ' + table + ' WHERE ' + wsql).run(...wargs);
      return { table, deleted: Number(r.changes) };
    }
    if (op.op === 'clear') {
      if (op.confirm !== true) throw new HakDbError('bad-request', 'Xóa toàn bảng cần confirm:true');
      if (table === 'audit_log' || table === 'quarantine') throw new HakDbError('bad-request', 'Bảng ' + table + ' không được xóa toàn bộ');
      if (t.company && ctx && ctx.scope) throw new HakDbError('scope', 'Tài khoản giới hạn công ty không được xóa toàn bảng ' + table);
      return { table, deleted: Number(this._stmt('DELETE FROM ' + table).run().changes) };
    }
    if (op.op === 'guard') {
      const kw = this._keyWhere(t, table, op.key);
      const cur = this._currentRev(t, table, kw);
      if (cur !== op.ifRev)
        throw new HakDbError('conflict', 'Bản ghi đã đổi bởi nơi khác (' + table + ')', {
          table,
          key: op.key,
          expected: op.ifRev,
          actual: cur,
        });
      return { table, rev: cur };
    }
    throw new HakDbError('bad-request', 'Thao tác không hỗ trợ: ' + op.op);
  }
  /** Toàn bộ ops trong MỘT giao dịch: lỗi bất kỳ → không ghi gì. */
  tx(ops, ctx) {
    if (!Array.isArray(ops) || !ops.length) throw new HakDbError('bad-request', 'ops phải là mảng không rỗng');
    if (ops.length > 20000) throw new HakDbError('bad-request', 'Quá nhiều thao tác trong một giao dịch');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const out = ops.map((op, i) => {
        try {
          return this._op(op, ctx);
        } catch (e) {
          throw Object.assign(e, { opIndex: i });
        }
      });
      this.db.exec('COMMIT');
      return out;
    } catch (e) {
      try {
        this.db.exec('ROLLBACK');
      } catch (e2) {
        /* giao dịch đã tự hủy */
      }
      throw this._wrap(e);
    }
  }
  _wrap(e) {
    if (e instanceof HakDbError) return e;
    const m = String(e && e.message);
    if (/FOREIGN KEY/i.test(m))
      return Object.assign(new HakDbError('fk', 'Vi phạm khóa ngoại (bản ghi con trỏ tới cha không tồn tại hoặc cha còn con): ' + m), {
        opIndex: e.opIndex,
      });
    if (/UNIQUE|PRIMARY KEY/i.test(m)) return Object.assign(new HakDbError('unique', 'Trùng khóa duy nhất: ' + m), { opIndex: e.opIndex });
    if (/audit_log chỉ được thêm/.test(m)) return new HakDbError('bad-request', m);
    if (/NOT NULL/i.test(m)) return Object.assign(new HakDbError('bad-request', 'Thiếu giá trị bắt buộc: ' + m), { opIndex: e.opIndex });
    return Object.assign(new HakDbError('io', m), { opIndex: e.opIndex });
  }
  _where(t, table, where) {
    const parts = [],
      args = [];
    for (const [c, cond] of Object.entries(where)) {
      this._col(t, c, table);
      if (cond !== null && typeof cond === 'object' && !cond.$b64) {
        for (const [o, v] of Object.entries(cond)) {
          if (o === 'in') {
            if (!Array.isArray(v) || !v.length) throw new HakDbError('bad-request', 'in cần mảng không rỗng');
            parts.push(c + ' IN (' + v.map(() => '?').join(',') + ')');
            args.push(...v.map(enc));
          } else {
            const sym = { gt: '>', gte: '>=', lt: '<', lte: '<=', ne: '<>' }[o];
            if (!sym) throw new HakDbError('bad-request', 'Toán tử không hỗ trợ: ' + o);
            parts.push(c + sym + '?');
            args.push(enc(v));
          }
        }
      } else if (cond === null) parts.push(c + ' IS NULL');
      else {
        parts.push(c + '=?');
        args.push(enc(cond));
      }
    }
    return { sql: parts.join(' AND '), args };
  }
  query(q, ctx) {
    const table = q.table,
      t = this._tbl(table);
    const wanted = q.cols ? q.cols : Array.from(t.cols.keys()).filter((c) => !t.blobs.includes(c)); // blob chỉ khi yêu cầu rõ
    wanted.forEach((c) => this._col(t, c, table));
    const w = this._where(t, table, q.where || {});
    let sql = ' FROM ' + table,
      args = w.args.slice();
    const conds = [];
    if (w.sql) conds.push(w.sql);
    if (t.company && ctx && ctx.scope) {
      conds.push('(company_id IS NULL OR company_id IN (' + (ctx.scope.map(() => '?').join(',') || "''") + '))');
      args.push(...ctx.scope);
    }
    if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
    const out = {};
    if (q.count) out.total = Number(this._stmt('SELECT COUNT(*) n' + sql).get(...args).n);
    let sel = 'SELECT ' + wanted.join(',') + sql;
    if (q.order && q.order.length)
      sel +=
        ' ORDER BY ' +
        q.order
          .map(([c, d]) => {
            this._col(t, c, table);
            return c + (String(d).toLowerCase() === 'desc' ? ' DESC' : ' ASC');
          })
          .join(',');
    const lim = Math.min(Number.isInteger(q.limit) ? q.limit : 50000, 200000);
    sel += ' LIMIT ' + lim;
    if (Number.isInteger(q.offset) && q.offset > 0) sel += ' OFFSET ' + q.offset;
    out.rows = this._stmt(sel)
      .all(...args)
      .map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, dec(v)])));
    return out;
  }
  /** Bản sao nhất quán (VACUUM INTO) + băm; đích phải CHƯA tồn tại. */
  backup(dest) {
    if (fs.existsSync(dest)) throw new HakDbError('bad-request', 'Tệp đích đã tồn tại: ' + dest);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const tmp = dest + '.part';
    try {
      this.db.prepare('VACUUM INTO ?').run(tmp);
      fs.renameSync(tmp, dest);
    } catch (e) {
      try {
        fs.rmSync(tmp, { force: true });
      } catch (e2) {
        /* bỏ qua */
      }
      throw new HakDbError('io', 'Sao lưu thất bại: ' + e.message);
    }
    return { path: dest, sha256: sha256File(dest), size: fs.statSync(dest).size, schema: this.schemaVersion() };
  }
  /** Kiểm tra toàn vẹn: integrity_check + foreign_key_check. */
  check() {
    const ic = this.db
      .prepare('PRAGMA integrity_check')
      .all()
      .map((r) => Object.values(r)[0]);
    const fk = this.db.prepare('PRAGMA foreign_key_check').all();
    return { ok: ic.length === 1 && ic[0] === 'ok' && fk.length === 0, integrity: ic, foreignKeys: fk, schema: this.schemaVersion() };
  }
  counts() {
    const out = {};
    for (const t of this.tables.keys()) out[t] = Number(this.db.prepare('SELECT COUNT(*) n FROM ' + t).get().n);
    return out;
  }
}
module.exports = { HakDb, HakDbError, sha256File };
