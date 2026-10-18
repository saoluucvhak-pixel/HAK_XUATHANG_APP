const {test}=require('node:test'),assert=require('node:assert/strict');
global.window=global;global.HAK={};
const M=require('../app/js/customs-model.js'),P=require('../app/js/customs-parser.js');

// Bản mô phỏng "Bản xác nhận nội dung tờ khai" (VNACCS): nhãn và giá trị nằm ở các ô khác nhau của cùng dòng.
const row=(...cells)=>cells;
const DECL=[
  row('<EXP>'),row('','','Số tờ khai','','308629701721','','','','','','Số tờ khai đầu tiên','','','','','','','','','-'),
  row('','','Mã phân loại kiểm tra','','','2','','','Mã loại hình','','','B11 3'),
  row('','','Tên cơ quan Hải quan tiếp nhận tờ khai','','','','','','','CKCDANANG'),
  row('','','Ngày đăng ký','','','11/06/2026 16:24:27','','','','','','','','','','Ngày thay đổi đăng ký','','','','','','','','','13/06/2026 14:27:23'),
  row('','','Người xuất khẩu'),row('','','','Mã','','0401447476'),row('','','','Tên','','Công Ty TNHH Hoàng Anh Khôi'),
  row('','','Người nhập khẩu'),row('','','','Mã'),row('','','','Tên','','INTERNATIONAL WOODCHIP CORPORATION PTE LTD'),
  row('','','Số vận đơn','','','','','122600042763790'),
  row('','','Phương tiện vận chuyển dự kiến','','','','','','9999','','','','MV. CONDOR EXPRESS V.2609'),
  row('','','Ngày hàng đi dự kiến','','','','','','20/06/2026'),
  row('','','Ký hiệu và số hiệu','','','','','TK CHUNG INVOICE VOI TK: 308629604753. CHUNG THU GIAM DINH SO: 26E04GPT00186-04'),
  row('','','Giấy phép xuất khẩu','','','','','','','','','Số hóa đơn','','','','A','-','HAKDN06/26'),
  row('','','4','','','','','','','','','Tổng trị giá hóa đơn','','','','','FOB - USD','-','1.056.000','','','','','-','A'),
  row('','','5','','','','','','','','','Tổng trị giá tính thuế','','','','','','VND','-','27.584.832.000'),
  row('','','','','','','','','','','','Tỷ giá tính thuế','','','','','USD','',' - 26.122'),
  row('','','Tổng số tiền thuế xuất khẩu','','','','','551696640','','','','VND'),
  row('','','Phần ghi chú','','','UTXK/ĐN-QC/0126. Hàng đã tập kết tại bãi công ty.'),
  row('','','Mã số hàng hóa','','','4401220090'),row('','','Mô tả hàng hóa','','','Dăm gỗ (Keo rừng trồng), khô kiệt, hàng rời +20%/-20%.#&VN'),
  row('','','','','','','','','','','','','','','Số lượng (1)','','6.000','','','','','','','','MDW'),
  row('','','','','','','','','','','','','','','Số lượng (2)','','13.000','','','','','','','','TNE'),
  row('','','Trị giá hóa đơn','','','1.056.000','','','','','','','','','Đơn giá hóa đơn','','','176','','','','USD'),
  row('','','Thuế suất','','','2%'),
];
test('đọc tờ khai VNACCS: số, ngày mở, loại hình, tàu, tiền, thuế, KL',()=>{
  const d=P.parseDeclarationRows(DECL);
  assert.equal(d.no,'308629701721');assert.equal(d.openDate,'2026-06-11');assert.equal(d.changedAt,'2026-06-13');assert.equal(d.type,'B11');
  assert.equal(d.office,'CKCDANANG');assert.equal(d.importer,'INTERNATIONAL WOODCHIP CORPORATION PTE LTD');assert.equal(d.exporter,'Công Ty TNHH Hoàng Anh Khôi');
  assert.equal(d.ship,'M/V CONDOR EXPRESS V.2609');assert.equal(d.invoiceNo,'HAKDN06/26');
  assert.equal(d.invoiceUsd,1056000);assert.equal(d.taxableVnd,27584832000);assert.equal(d.exchangeRate,26122);assert.equal(d.taxVnd,551696640);
  assert.equal(d.qtyBdmt,6000);assert.equal(d.qtyTon,13000);assert.equal(d.unitPrice,176);assert.equal(d.taxRate,2);
  assert.equal(d.hs,'4401220090');assert.equal(d.goods,'Dăm gỗ (Keo rừng trồng), khô kiệt, hàng rời +20%/-20%.');
  assert.equal(d.relatedNo,'308629604753');assert.equal(d.certNo,'26E04GPT00186-04');assert.deepEqual(d.warnings,[]);
});
test('số kiểu hải quan: nghìn "." thập phân ","',()=>{
  assert.equal(P.vn('1.078.598,4'),1078598.4);assert.equal(P.vn('563.502.948,1'),563502948.1);assert.equal(P.vn('551696640'),551696640);assert.equal(P.vn('6.128,4'),6128.4);assert.equal(P.vn(''),null);
});
test('file lạ (không phải tờ khai) → cảnh báo thiếu số tờ khai',()=>{
  const d=P.parseDeclarationRows([['Cột A','Cột B'],['1','2']]);
  assert.equal(d.no,'');assert.ok(d.warnings.some(w=>/SỐ TỜ KHAI/.test(w)));
});
test('OCR tờ khai in: ô cách nhau bằng " : " vẫn đọc được số, ngày, thuế',()=>{
  const t='Số tờ khai : 308629701721\nNgày đăng ký : 11/06/2026 16:24:27\nMã loại hình : B11\nTổng số tiền thuế xuất khẩu : 551696640 : VND';
  const d=P.parseDeclarationText(t);
  assert.equal(d.no,'308629701721');assert.equal(d.openDate,'2026-06-11');assert.equal(d.type,'B11');assert.equal(d.taxVnd,551696640);assert.deepEqual(d.warnings,[]);
});
test('giấy nộp tiền dạng bảng (2 dòng lệ phí mở tờ khai)',()=>{
  const t='GIẤY NỘP TIỀN VÀO NGÂN SÁCH NHÀ NƯỚC\nMẫu số C1- 02/NS\nSố: DN0206/26\nNgười nộp thuế: CÔNG TY TNHH HOÀNG ANH KHÔI\nMã số thuế: 0401447476\nSTT : Số tờ khai : Năm tờ khai : Sắc thuế : Số tiền : Mã tiểu mục : Mã chương\n1 : 308629604751 : 2026 : Lệ phí mở TTHQ : 20.000 : 2663 : 754\n2 : 308629701720 : 2026 : Lệ phí mở TTHQ : 20.000 : 2663 : 754\nTổng cộng: 40.000 Đ\nĐỐI TƯỢNG NỘP TIỀN\nNgày 12 tháng 06 năm 2026';
  const r=P.parseReceiptText(t);
  assert.equal(r.receiptNo,'DN0206/26');assert.equal(r.date,'2026-06-12');assert.equal(r.payerTax,'0401447476');assert.equal(r.total,40000);
  assert.equal(r.lines.length,2);assert.deepEqual(r.lines.map(x=>[x.no,x.amount,x.kind]),[['308629604751',20000,'fee'],['308629701720',20000,'fee']]);assert.deepEqual(r.warnings,[]);assert.equal(r.lines[0].content,'Lệ phí mở TTHQ');
});
test('giấy nộp tiền thuế xuất khẩu (số tờ khai ở dòng riêng)',()=>{
  const t='Số: QC0106/26\nNgười nộp thay: CÔNG TY TNHH HOÀNG ANH KHÔI QUẢNG NAM\nTờ khai HQ số(1): 308629701720 ngày: 11/06/2026 Loại hình XNK(1): B11\nSTT : Nội dung các khoản nộp NS (4) : Số tiền\nThuế xuất khẩu dăm gỗ : 551.696.640 đ\nTỔNG CỘNG : 551.696.640 đ\nNgày 12 tháng 06 năm 2026';
  const r=P.parseReceiptText(t);
  assert.equal(r.receiptNo,'QC0106/26');assert.equal(r.lines.length,1);assert.deepEqual([r.lines[0].no,r.lines[0].amount,r.lines[0].kind],['308629701720',551696640,'tax']);assert.equal(r.total,551696640);
});
test('giấy nộp tiền: số tờ khai bị OCR tách khoảng trắng vẫn nối lại; không đọc được → cảnh báo',()=>{
  const r=P.parseReceiptText('Số: DN0206/26\n1 : 3086 2960 4751 : 2026 : Lệ phí mở TTHQ : 20.000');
  assert.equal(r.lines[0].no,'308629604751');
  const bad=P.parseReceiptText('chữ rác');assert.equal(bad.lines.length,0);assert.ok(bad.warnings.length>=2);
});

test('thuế phải nộp theo khai bổ sung mới nhất; còn phải nộp = phải nộp − đã nộp thuế',()=>{
  const d=M.newDecl({no:'308629701721',taxVnd:551696640,supplements:[{no:'308629701722',round:2,taxVnd:563502948}],payments:[{amount:551696640,kind:'tax'},{amount:20000,kind:'fee'}]});
  const t=M.totals(d);
  assert.equal(t.payable,563502948);assert.equal(t.extra,11806308);assert.equal(t.paidTax,551696640);assert.equal(t.paidFee,20000);assert.equal(t.remaining,11806308);
  d.supplements[0].deletedAt='x';assert.equal(M.totals(d).payable,551696640);assert.equal(M.totals(d).remaining,0);
});
test('hợp đồng chuyển Đã hoàn thành khi mọi tờ khai đã thông quan',()=>{
  const a=M.newDecl({no:'111111111111',contractId:'c1',status:'cleared'}),b=M.newDecl({no:'222222222222',contractId:'c1',status:'waiting'}),other=M.newDecl({no:'333333333333',contractId:'c2'});
  assert.equal(M.contractStatus([a,b,other],'c1').code,'running');assert.equal(M.contractStatus([a,b,other],'c1').cleared,1);
  M.setStatus(b,'cleared','2026-06-30');assert.equal(M.contractStatus([a,b,other],'c1').code,'done');assert.equal(M.contractStatus([a,b,other],'c1').label,'Đã hoàn thành');
  assert.equal(M.contractStatus([a,b,other],'c3').code,'running','hợp đồng chưa có tờ khai vẫn Đang thực hiện');
  b.deletedAt='x';assert.equal(M.contractStatus([a,b],'c1').code,'done','tờ khai đã xóa không tính');
  assert.equal(M.statusDate(b,'cleared'),'2026-06-30');assert.throws(()=>M.setStatus(b,'xyz'));
});
test('số tờ khai trùng bị chặn; ghi lại cùng tờ khai tăng revision',()=>{
  let data={customs:[]};let r=M.upsert(data,{no:'308629701721'});assert.ok(!r.error);data=r.data;
  assert.match(M.upsert(data,{no:'308629701721'}).error,/đã có/);assert.match(M.upsert(data,{no:'12'}).error,/dãy số/);assert.match(M.upsert(data,{no:''}).error,/Chưa nhập/);
  const id=data.customs[0].id;r=M.upsert(data,Object.assign({},data.customs[0],{ship:'M/V X'}));assert.equal(r.data.customs.length,1);assert.equal(r.data.customs[0].revision,1);assert.equal(r.data.customs[0].id,id);
});
test('gộp bản sao lưu: bảng con gộp theo id, ô trống không ghi đè',()=>{
  const local=[M.newDecl({id:'tk-1',no:'308629701721',ship:'A',payments:[{id:'p1',amount:1,kind:'tax'}]})];
  const incoming=[{id:'tk-1',no:'308629701721',ship:'',taxVnd:5,payments:[{id:'p1',amount:1,kind:'tax'},{id:'p2',amount:2,kind:'fee'}],statusLog:[]},{id:'tk-2',no:'308629701722'}];
  const m=M.merge(local,incoming);
  assert.equal(m.length,2);assert.equal(m[0].ship,'A');assert.equal(m[0].taxVnd,5);assert.equal(m[0].payments.length,2);
});
test('giấy nộp tiền mẫu mới: Mã hiệu, Số, Số tham chiếu, người nộp, kỳ thuế, mã chương, NDKT, ĐBHC',()=>{
  const t='GIẤY NỘP TIỀN VÀO NGÂN SÁCH NHÀ NƯỚC : Mã hiệu: 262021301A\nTiền mặt : Chuyển khoản : Số: 6753554\nLoại tiền: VNĐ USD Khác : Số tham chiếu: 20202026100713485801\nNSNN: Công Ty TNHH Hoàng Anh Khôi : Mã số thuế: 0401447476\nKỳ thuế/ : Nội dung các khoản nộp : Số nguyên tệ : Số tiền VND : Mã : Mã : Mã\n13/08/2026 : Thue xuat khau : 815.572.800 : 815.572.800 : 754 : 1851 : 48TTT\nTổng cộng: 815.572.800 : 815.572.800\nNgày 14 tháng 08 năm 2026';
  const r=P.parseReceiptText(t);
  assert.equal(r.receiptNo,'6753554');assert.equal(r.formCode,'262021301A');assert.equal(r.refNo,'20202026100713485801');
  assert.equal(r.payer,'Công Ty TNHH Hoàng Anh Khôi');assert.equal(r.payerTax,'0401447476');assert.equal(r.date,'2026-08-14');assert.equal(r.total,815572800);
  assert.equal(r.lines.length,1);const l=r.lines[0];
  assert.deepEqual([l.amount,l.kind,l.periodDate,l.chapter,l.ndkt,l.dbhc,l.content],[815572800,'tax','2026-08-13','754','1851','48TTT','Thue xuat khau']);
  assert.deepEqual(r.warnings,[]);
});
test('giấy nộp tiền mẫu mới: OCR tách ô lẫn lộn, số tham chiếu tách khoảng trắng, không số tờ khai → gán số tờ khai duy nhất trên giấy',()=>{
  const t='Mã hiệu : 262021301A Số : 6753554\nSố tham chiếu : 2020 2026 1007 1348 5801\nNgười nộp thuế : CÔNG TY TNHH HOÀNG ANH KHÔI\nTờ khai HQ số: 308847091251\n13/08/2026 Thuế xuất khẩu 815.572.800 815.572.800 754 1851 48TTT\nTổng cộng 815.572.800';
  const r=P.parseReceiptText(t);
  assert.equal(r.refNo,'20202026100713485801');assert.equal(r.receiptNo,'6753554');assert.equal(r.payer,'CÔNG TY TNHH HOÀNG ANH KHÔI');
  assert.equal(r.lines.length,1);assert.equal(r.lines[0].no,'308847091251');assert.equal(r.lines[0].chapter,'754');assert.equal(r.total,815572800);
});
test('giấy nộp tiền: số tờ khai ghi dạng nhãn, bị tách khoảng trắng / dấu chấm, hoặc nằm ở dòng nội dung',()=>{
  const base='Mã hiệu: 262021301A Số: 6753554\nSố tham chiếu: 20202026100713485801\n13/08/2026 : Thue xuat khau : 815.572.800 : 815.572.800 : 754 : 1851 : 48TTT\nTổng cộng: 815.572.800';
  for(const extra of['Nộp thuế xuất khẩu theo TK 308847091251 ngày 13/08/2026','Tờ khai số: 3088 4709 1251','Số tờ khai : : 308.847.091.251','Nội dung: Nop thue XK to khai so 308847091251']){
    const r=P.parseReceiptText(base+'\n'+extra);
    assert.equal(r.lines.length,1,extra);assert.equal(r.lines[0].no,'308847091251',extra);assert.equal(r.lines[0].amount,815572800,extra);assert.equal(r.refNo,'20202026100713485801');
  }
  const same=P.parseReceiptText('13/08/2026 : Thue xuat khau 308847091251 : 815.572.800 : 815.572.800 : 754');assert.equal(same.lines[0].no,'308847091251');
});
test('giấy nộp tiền thuế (mẫu cũ, ảnh chụp): số DN0106/26, tờ khai + ngày + loại hình, số tiền, NDKT, chương',()=>{
  const t='GIẤY NỘP TIỀN VÀO NGÂN SÁCH NHÀ NƯỚC : Mã hiệu: ........ : Số: DN0106/26\nNgười nộp thuế: CÔNG TY TNHH HOÀNG ANH KHÔI\nMã số thuế: 0401447476\nNgười nộp thay: ......\nTên cơ quan quản lý thu: HẢI QUAN CỬA KHẨU CẢNG ĐÀ NẴNG\nTờ khai HQ số(1): 308629604751 ngày: 11/06/2026 Loại hình XNK(1): B11 : Phần dành cho NH ủy nhiệm\nSTT : Nội dung các khoản nộp NS (4) : Số tiền : Mã NDKT : Mã chương\nThuế xuất khẩu dăm gỗ : 1.103.393.280 đ : 1851 : 754\nTỔNG CỘNG : 1.103.393.280 đ\nTổng số tiền ghi bằng chữ: Một tỷ, một trăm lẻ ba triệu\nĐỐI TƯỢNG NỘP TIỀN\nNgày 12 tháng 06 năm 2026';
  const r=P.parseReceiptText(t);
  assert.equal(r.receiptNo,'DN0106/26');assert.equal(r.formCode,'');assert.equal(r.date,'2026-06-12');assert.equal(r.payerTax,'0401447476');assert.equal(r.payer,'CÔNG TY TNHH HOÀNG ANH KHÔI');
  assert.equal(r.lines.length,1);const l=r.lines[0];
  assert.deepEqual([l.no,l.declDate,l.declType,l.amount,l.kind,l.ndkt,l.chapter],['308629604751','2026-06-11','B11',1103393280,'tax','1851','754']);assert.equal(r.total,1103393280);assert.deepEqual(r.warnings,[]);
});
test('giấy nộp tiền thuế bổ sung: người nộp thay, số QC0206/26, 11.806.308 cho tờ khai …722',()=>{
  const t='Số: QC0206/26\nNgười nộp thuế: CÔNG TY TNHH HOÀNG ANH KHÔI\nNgười nộp thay: CÔNG TY TNHH HOÀNG ANH KHÔI QUẢNG NAM\nMã số thuế: 4000956057\nĐề nghị NH (KBNN): Đầu tư & Phát triển Việt Nam trích TK số: 5626999999\nTờ khai HQ số(1): 308629701722 ngày: 21/06/2026 Loại hình XNK(1): B11\nThuế xuất khẩu dăm gỗ : 11.806.308 đ : 1851 : 754\nTỔNG CỘNG : 11.806.308 đ\nNgày 22 tháng 06 năm 2026';
  const r=P.parseReceiptText(t);
  assert.equal(r.receiptNo,'QC0206/26');assert.equal(r.date,'2026-06-22');assert.equal(r.lines.length,1);assert.deepEqual([r.lines[0].no,r.lines[0].amount,r.lines[0].declDate],['308629701722',11806308,'2026-06-21']);
});
test('giấy nộp tiền: số tờ khai bị OCR nhầm chữ/số hoặc thiếu chữ số vẫn được đề xuất (kèm cờ nghi ngờ); chữ thuần dùng bù khi chữ ghép cột không có số',()=>{
  const row='13/08/2026 : Thuế xuất khẩu : 815.572.800 : 815.572.800 : 754 : 1851';
  let r=P.parseReceiptText('Tờ khai HQ số(1): 3O8629604751 ngày: 11/06/2026\n'+row);
  assert.equal(r.lines[0].no,'308629604751');assert.equal(r.lines[0].noFuzzy,true);
  r=P.parseReceiptText('Tờ khai số: 30862960475\n'+row);assert.equal(r.lines[0].no,'30862960475');assert.equal(r.lines[0].noFuzzy,true);
  r=P.parseReceiptText(row,'To khai HQ so(1): 308629604751 ngay: 11/06/2026 Loai hinh XNK(1): B11');
  assert.equal(r.lines[0].no,'308629604751');assert.equal(r.lines[0].noFuzzy,false);assert.equal(r.lines[0].declDate,'2026-06-11');
  r=P.parseReceiptText('Mã số thuế: 0401447476\nSố tham chiếu: 20202026100713485801\n'+row);assert.equal(r.lines[0].no,'','không nhầm MST / số tham chiếu thành số tờ khai');
});
test('giấy nộp tiền: đọc người nộp thuế khi thiếu dấu ":", tên ở dòng kế, nhãn sai chính tả; có người nộp thay',()=>{
  const row='\n13/08/2026 : Thuế xuất khẩu : 815.572.800 : 815.572.800 : 754 : 1851';
  assert.equal(P.parseReceiptText('Người nộp thuế CÔNG TY TNHH HOÀNG ANH KHÔI\nMã số thuế: 0401447476'+row).payer,'CÔNG TY TNHH HOÀNG ANH KHÔI');
  assert.equal(P.parseReceiptText('Người nộp thuế:\nCÔNG TY TNHH HOÀNG ANH KHÔI\nMã số thuế: 0401447476'+row).payer,'CÔNG TY TNHH HOÀNG ANH KHÔI');
  assert.equal(P.parseReceiptText('Nguời nộp thuê : CÔNG TY TNHH HOÀNG ANH KHÔI : Mã số thuế : 0401447476'+row).payer,'CÔNG TY TNHH HOÀNG ANH KHÔI');
  assert.equal(P.parseReceiptText('Người nộp thuế: CÔNG TY TNHH HOÀNG ANH KHÔI Mã số thuế: 0401447476'+row).payer,'CÔNG TY TNHH HOÀNG ANH KHÔI');
  const two=P.parseReceiptText('Người nộp thuế: CÔNG TY TNHH HOÀNG ANH KHÔI\nMã số thuế: 0401447476\nNgười nộp thay: CÔNG TY TNHH HOÀNG ANH KHÔI QUẢNG NAM\nMã số thuế: 4000956057'+row);
  assert.equal(two.payer,'CÔNG TY TNHH HOÀNG ANH KHÔI');assert.equal(two.agent,'CÔNG TY TNHH HOÀNG ANH KHÔI QUẢNG NAM');assert.equal(two.payerTax,'0401447476');
  assert.equal(P.parseReceiptText('Hải quan cửa khẩu\nNSNN: Công Ty TNHH Hoàng Anh Khôi : Mã số thuế: 0401447476'+row).payer,'Công Ty TNHH Hoàng Anh Khôi');
  assert.equal(P.parseReceiptText('Người nộp thay: ........\nCÔNG TY TNHH HOÀNG ANH KHÔI\nMã số thuế: 0401447476'+row).payer,'CÔNG TY TNHH HOÀNG ANH KHÔI','không có nhãn rõ → lấy dòng tên công ty đầu tiên');
});
test('điều kiện gắn đợt giao hàng: Xuất khẩu / Ủy thác cần tàu + tờ khai; Xuất bán / Trao đổi không cần',()=>{
  const decl=[M.newDecl({no:'308629701721',contractId:'c1'})];
  const xk={id:'c1',type:'xuatkhau',details:[{id:'d1',ship:'M/V A'}]};
  assert.deepEqual([M.readiness(xk,decl).ok,M.readiness(xk,decl).detailId],[true,'d1']);
  assert.deepEqual(M.readiness(xk,[]).missing,['tờ khai hải quan']);
  assert.deepEqual(M.readiness({id:'c2',type:'uythac',details:[]},decl).missing,['tàu','tờ khai hải quan']);
  assert.deepEqual(M.readiness({id:'c3',type:'uythac',details:[{id:'d3',ship:''}]},[]).missing,['tàu','tờ khai hải quan']);
  assert.equal(M.readiness({id:'c1',type:'xuatkhau',details:[{id:'d1',ship:'M/V A',deletedAt:'x'}]},decl).ok,false);
  const ban={id:'c4',type:'xuatban',details:[]};assert.deepEqual([M.readiness(ban,[]).need,M.readiness(ban,[]).ok],[false,true]);
  assert.equal(M.readiness({id:'c5',type:'traodoi',details:[{id:'d5'}]},[]).detailId,'d5');
  const other=[M.newDecl({no:'308629701722',contractId:'c9'})];assert.equal(M.readiness(xk,other).ok,false,'tờ khai của hợp đồng khác không tính');
});
