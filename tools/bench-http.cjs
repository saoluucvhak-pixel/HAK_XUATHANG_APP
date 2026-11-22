/* Ước lượng chi phí đường "SQLite qua HAKDocs": trang file:// gọi HTTP localhost có mã bảo vệ (giống HAKDocs) → máy chủ truy vấn SQLite gốc (node:sqlite) → JSON.
 * Chỉ để đo độ trễ kênh (CORS preflight + tuần tự hóa JSON), KHÔNG phải cài đặt HAKDocs thật (.NET). */
const http = require('node:http'),
  { DatabaseSync } = require('node:sqlite'),
  { chromium } = require('playwright');
const path = require('node:path');
const db = new DatabaseSync(':memory:');
db.exec('CREATE TABLE ticket(record_id TEXT, idx INTEGER, ticket TEXT, plate TEXT, weigh_ts INTEGER, kg INTEGER, carrier TEXT)');
db.exec('CREATE INDEX ix ON ticket(weigh_ts)');
const ins = db.prepare('INSERT INTO ticket VALUES(?,?,?,?,?,?,?)');
db.exec('BEGIN');
for (let i = 0; i < 1500; i++)
  for (let j = 0; j < 100; j++)
    ins.run(
      'a' + i,
      j,
      String(100000 + i * 100 + j).padStart(7, '0'),
      '43C-' + (10000 + j),
      Date.UTC(2026, i % 12, 1 + (j % 27)),
      25000 + j,
      'VT-' + (j % 7)
    );
db.exec('COMMIT');
const srv = http.createServer((req, res) => {
  const h = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'X-HAK-Token, Content-Type',
    'Access-Control-Allow-Methods': 'POST',
  };
  if (req.method === 'OPTIONS') {
    res.writeHead(204, h);
    return res.end();
  }
  let b = '';
  req.on('data', (c) => (b += c));
  req.on('end', () => {
    const q = JSON.parse(b || '{}');
    const rows =
      q.op === 'month'
        ? db.prepare('SELECT * FROM ticket WHERE weigh_ts>=? AND weigh_ts<?').all(Date.UTC(2026, 2, 1), Date.UTC(2026, 3, 1))
        : db.prepare('SELECT 1 x').all();
    res.writeHead(200, { ...h, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ rows }));
  });
});
srv.listen(0, '127.0.0.1', async () => {
  const port = srv.address().port;
  const b = await chromium.launch();
  const p = await (await b.newContext()).newPage();
  await p.goto(require('node:url').pathToFileURL(path.resolve(__dirname, '../app/index.html')).href);
  const r = await p.evaluate(async (port) => {
    const call = async (op) => {
      const t = performance.now();
      const x = await fetch('http://127.0.0.1:' + port + '/q', {
        method: 'POST',
        headers: { 'X-HAK-Token': 't', 'Content-Type': 'application/json' },
        body: JSON.stringify({ op }),
      });
      const j = await x.json();
      return [performance.now() - t, j.rows.length];
    };
    await call('ping');
    const ping = [];
    for (let i = 0; i < 20; i++) ping.push((await call('ping'))[0]);
    const month = [];
    let n = 0;
    for (let i = 0; i < 5; i++) {
      const [t, c] = await call('month');
      month.push(t);
      n = c;
    }
    ping.sort((a, b) => a - b);
    month.sort((a, b) => a - b);
    return { pingMedianMs: +ping[10].toFixed(1), monthMedianMs: +month[2].toFixed(1), monthRows: n };
  }, port);
  console.log(JSON.stringify(r));
  await b.close();
  srv.close();
});
