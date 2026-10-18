const { test } = require('node:test');
const assert = require('node:assert/strict');
global.HAKCore = { sf: require('../app/libs/hak-smart-filter/core.js') };
require('../app/libs/hak-smart-filter/browser.js');
const R = require('../app/js/report.js');
global.ExcelJS = require('../app/libs/exceljs.min.js');
const rec = (id, extra = {}) => ({ id, type:'xuatkhau', title:'Hồ sơ '+id, ship:'ĐẠI DƯƠNG', giao:'HAK', nhan:'Đà Nẵng', from:'01/10/2026', to:'02/10/2026', kg:12500, trips:2, retKg:2500, retTrips:1, updatedAt:1, ...extra });
test('Vietnamese query + type + inclusive dates use one unchanged source', () => {
 const rows=[rec('a'), rec('b',{type:'guikho',ship:'KHÁC'}),rec('c',{from:'03/10/2026',to:'03/10/2026'})];
 const before=JSON.stringify(rows); const m=R.compute(rows,{q:'dai duong',type:'xuatkhau',from:'2026-10-01',to:'2026-10-02'});
 assert.deepEqual(m.used.map(r=>r.id),['a']); assert.equal(m.byType.xuatkhau.delKg,10000); assert.equal(JSON.stringify(rows),before);
});
test('duplicate suppression and manual selection survive query filtering',()=>{
 const rows=[rec('old'),rec('new',{updatedAt:2})];
 assert.deepEqual(R.compute(rows,{q:'old'}).used,[]);
 assert.deepEqual(R.compute(rows,{q:'old',manual:{old:true}}).used.map(r=>r.id),['old']);
});
test('invalid and reversed calendar ranges fail explicitly',()=>{
 for(const opt of [{from:'2026-02-31'},{from:'2026-11-01',to:'2026-10-01'},{to:'2026-13-01'}]) assert.throws(()=>R.compute([],opt),RangeError);
 assert.equal(R.compute([rec('bad',{from:'31/02/2026'})],{from:'2026-02-01',to:'2026-03-31'}).used.length,0);
 assert.equal(R.compute([rec('leap',{from:'29/02/2024'})],{from:'2024-02-29',to:'2024-02-29'}).used.length,1);
});
test('empty filters and empty matches are safe',()=>{
 assert.equal(R.compute([],{}).used.length,0); assert.equal(R.compute([rec('a')],{q:'no match'}).used.length,0);
});
test('unshipped contracts respect query, type and company scope',()=>{
 global.HAK.Catalog={contracts:()=>[{id:'1',type:'xuatban',ship:'ĐẠI DƯƠNG',date:'2026-10-01',no:'HD01'},{id:'2',type:'uythac',ship:'KHÁC',date:'2026-10-01'}],relatedTo:(c,scope)=>scope.includes(c.id)};
 assert.deepEqual(R.xhLots([],{q:'dai duong',type:'xuatban',scope:['1']}).lots.map(l=>l.c.id),['1']);
 assert.equal(R.xhLots([],{q:'dai duong',type:'uythac'}).lots.length,0);
 delete global.HAK.Catalog;
});
test('Excel totals, units, selected records and filter scope round-trip',async()=>{
 const m=R.compute([rec('a'),rec('b',{ship:'KHÁC'})],{q:'dai duong'}); m.rangeText=m.filterText;
 const wb=await R.toExcel(m); const out=new global.ExcelJS.Workbook(); await out.xlsx.load(await wb.xlsx.writeBuffer());
 assert.equal(out.getWorksheet('Hồ sơ').getCell('A5').value,'Hồ sơ a');
 assert.equal(out.getWorksheet('Hồ sơ').rowCount,5);
 assert.equal(out.getWorksheet('Tổng hợp').getCell('G5').value,10);
 const mo=out.getWorksheet('Theo tháng'); assert.equal(mo.getCell('B6').value.result,10); assert.equal(mo.getCell('B6').value.formula,'SUM(B5:B5)');
 assert.match(out.getWorksheet('Tổng hợp').getCell('A2').value,/dai duong/);
 assert.equal(mo.pageSetup.printTitlesRow,'4:4');
});

test('carrier aggregation retains precision and returned weights',()=>{
 const a=R.aggCarrierDaily([{date:'01/10/2026',carrier:'A',kg:100.25,ret:false},{date:'01/10/2026',carrier:'A',kg:50.125,ret:true}]);
 assert.equal(a.byDate[0].kg,150.375); assert.equal(a.byCarrier[0].retKg,50.125);
});
test('contract Excel preserves original header rows and adds report scope separately',async()=>{
 const wb=await R.toExcelXuatHang([],[],[],'Loại: Xuất bán · Công ty: HAK');
 assert.equal(wb.getWorksheet('NL_PC_XH').getCell('A1').value,'Số phiếu');
 assert.match(wb.getWorksheet('Phạm vi báo cáo').getCell('A2').value,/Công ty: HAK/);
});

test('report preserves explicit child links and never reassigns an unknown child by matching ship',()=>{global.HAK.Catalog={contracts:()=>[{id:'other-child',type:'xuatkhau',ship:'SAME VESSEL'}],contract:(id,opts)=>id==='archived-child'&&opts.history?{id,type:'xuatkhau',ship:'SAME VESSEL',tkhq:'OLD-TK'}:null};const record={...rec('archive'),type:'xuatkhau',ship:'SAME VESSEL',contract:'missing-child'};const missing=R.xhLots([record],{});assert.equal(missing.unlinked.length,1);assert.ok(missing.lots.some(l=>!l.c&&l.recs.length));const old=R.xhLots([{...record,contract:'archived-child'}],{});assert.equal(old.unlinked.length,0);assert.equal(old.lots.find(l=>l.recs.length).c.tkhq,'OLD-TK');delete global.HAK.Catalog;});

test('contract report uses the foreign buyer role and preserves customs leading zeros',()=>{global.HAK.Catalog={customer:id=>({buyer:{name:'Foreign Buyer',address:'Buyer Address'},agent:{name:'Export Agent'}}[id]||null),dryActual:()=>null,TYPES:{uythac:{label:'Ủy thác'}}};global.HAK.Config={data:{warehouses:[]}};const rows=R.xhSheetRows([{c:{id:'child',type:'uythac',tkhq:'000012345678',buyerId:'buyer',customerId:'agent',product:'Wood'},type:'uythac',ship:'QA',recs:[],trips:0,kg:0,retTrips:0,retKg:0,delKg:0}],[],[])[0].rows[0];assert.equal(rows[2],'000012345678');assert.equal(rows[4],'Foreign Buyer');assert.equal(rows[6],'Wood');delete global.HAK.Catalog;delete global.HAK.Config;});

test('HAK export stores real calendar dates and numeric quantities with explicit formats',async()=>{
 global.HAK.Config={data:{warehouses:[]}};
 const lot={c:{id:'qa',date:'2026-06-04',currency:'USD',priceUsd:176,mt:1234.567,bdmt:600.125},type:'xuatkhau',ship:'QA',recs:[],trips:0,kg:0,retTrips:0,retKg:0,delKg:0};
 const wb=await R.toExcelXuatHang([lot],[],[],'QA');const copy=new global.ExcelJS.Workbook();await copy.xlsx.load(await wb.xlsx.writeBuffer());const ws=copy.getWorksheet('NL_DH_XB');
 assert.equal(ws.getCell('B2').numFmt,'dd/mm/yyyy');assert.ok(ws.getCell('B2').value instanceof Date);assert.equal(ws.getCell('B2').value.toISOString().slice(0,10),'2026-06-04');
 assert.equal(ws.getCell('H2').value,176);assert.equal(ws.getCell('H2').numFmt,'#,##0.00');assert.equal(ws.getCell('I2').value,1234.567);assert.equal(ws.getCell('I2').numFmt,'#,##0.00');delete global.HAK.Config;
});
test('yearly totals follow record start date and the Excel has a "Theo năm" sheet', async () => {
 const m=R.compute([rec('a',{ship:'T1',from:'25/12/2025',to:'28/12/2025'}),rec('b',{ship:'T2',from:'01/01/2026',to:'02/01/2026'}),rec('c',{ship:'T3',from:'05/01/2026',to:'06/01/2026'})],{});
 assert.deepEqual(m.years.map(([y,v])=>[y,v.xuatkhau]),[['2025',10000],['2026',20000]]);
 const only=R.compute([rec('a',{from:'25/12/2025',to:'28/12/2025'}),rec('b',{ship:'T2',from:'01/01/2026',to:'02/01/2026'})],{from:'2026-01-01',to:'2026-12-31'});
 assert.deepEqual(only.years.map(([y])=>y),['2026']);
 const wb=await R.toExcel(m); assert.ok(wb.worksheets.some(w=>w.name==='Theo năm'));
});
