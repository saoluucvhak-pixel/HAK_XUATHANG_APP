// Dùng trình duyệt đã cài trên Windows CI cho cả tiến trình E2E con.
const Module = require('node:module');
if (process.env.HAK_BROWSER_CHANNEL) {
  const load = Module._load;
  Module._load = function (request) {
    const value = load.apply(this, arguments);
    if (request === 'playwright' && value.chromium && !value.chromium.__hakChannel) {
      value.chromium.__hakChannel = true;
      const launch = value.chromium.launch.bind(value.chromium);
      value.chromium.launch = (options = {}, ...rest) =>
        launch(options.executablePath || options.channel ? options : { ...options, channel: process.env.HAK_BROWSER_CHANNEL }, ...rest);
    }
    return value;
  };
}
