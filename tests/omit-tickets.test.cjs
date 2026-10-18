const {test}=require('node:test'),assert=require('node:assert/strict');
global.HAKCore={sf:require('../app/libs/hak-smart-filter/core.js')};require('../app/libs/hak-smart-filter/browser.js');require('../app/js/hak-filters.js');require('../app/js/excel.js');require('../app/js/generator.js');
const G=global.HAK.Generator;
const row=(idx,ticket,plate,net,ts1)=>({idx,uid:'A.xlsx#'+idx,ticket,plate,net,ts1,time1:'05/10/2026',dateStr:'05/10/2026',warn:[]});
const rows=[row(8,'PC001','43C-1',26150,1),row(9,'PC002','43C-2',25320,2),row(10,'PC003','92C-3',27500,3)];
test('omitted tickets count as if they did not exist and the source rows stay unchanged',()=>{
 const before=JSON.stringify(rows),omit=[G.omitKey(rows[1])];
 const kept=G.filterRows(rows,{omit});
 assert.deepEqual(kept.map(r=>r.ticket),['PC001','PC003']);
 assert.equal(G.summarize(kept).kg,26150+27500); assert.equal(G.summarize(kept).trips,2);
 assert.equal(JSON.stringify(rows),before);
});
test('omit key survives a re-import with different row numbers and is cleared by an empty list',()=>{
 const moved=rows.map((r,i)=>Object.assign({},r,{idx:r.idx+20,uid:'B.xlsx#'+(r.idx+20)}));
 assert.deepEqual(G.filterRows(moved,{omit:[G.omitKey(rows[0])]}).map(r=>r.ticket),['PC002','PC003']);
 assert.equal(G.filterRows(rows,{omit:[]}).length,3);
});
test('omitting works together with other filters and with every ticket omitted',()=>{
 assert.deepEqual(G.filterRows(rows,{omit:[G.omitKey(rows[0])],smart:{q:'92c'}}).map(r=>r.ticket),['PC003']);
 assert.equal(G.filterRows(rows,{omit:rows.map(G.omitKey)}).length,0);
});
