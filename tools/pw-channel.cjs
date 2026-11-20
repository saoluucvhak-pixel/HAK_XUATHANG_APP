/* Nạp trước (node --require tools/pw-channel.cjs, hoặc NODE_OPTIONS) để MỌI script e2e — kể cả tiến trình con — mở trình duyệt đã cài theo
 * HAK_BROWSER_CHANNEL (vd msedge trên máy Windows CI không có Chromium của Playwright). Không đặt biến → không đổi gì.
 * Script đã tự chỉ định executablePath / channel thì giữ nguyên. */
const Module = require('node:module');
const channel = process.env.HAK_BROWSER_CHANNEL;
if (channel) {
  const origLoad = Module._load;
  Module._load = function (request) {
    const m = origLoad.apply(this, arguments);
    if (request === 'playwright' && m && m.chromium && !m.chromium.__hakChannel) {
      m.chromium.__hakChannel = true;
      const launch = m.chromium.launch.bind(m.chromium);
      m.chromium.launch = (opt, ...rest) => {
        const o = Object.assign({}, opt || {});
        if (!o.executablePath && !o.channel) o.channel = channel;
        return launch(o, ...rest);
      };
    }
    return m;
  };
}
