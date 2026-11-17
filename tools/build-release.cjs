// Create a clean portable app tree without recovery/reset utilities.
const fs = require('node:fs'),
  path = require('node:path');
const target = path.resolve('dist/app');
if (fs.existsSync(target)) throw Error('dist/app already exists; choose a new build directory before rebuilding.');
fs.cpSync('app', target, {
  recursive: true,
  filter: (src) => !/^((MoKhoa_1Lan.*|XoaSach_DuLieu.*)\.html|\.hakquality\.json)$/i.test(path.basename(src)),
});
console.log('Portable release prepared in dist/app.');
