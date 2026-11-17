(function(root){
'use strict';
const HAK=root.HAK=root.HAK||{};
const labels={no:'Số hợp đồng',ship:'Tàu / chuyến',date:'Ngày ký',priceUsd:'Đơn giá',currency:'Tiền tệ',qty:'Khối lượng BDMT',contractProduct:'Tên hàng hóa hợp đồng',contractQty:'KL hợp đồng (BDMT)',deliverId:'Bên giao trên chứng thư',receiverId:'Bên nhận trên chứng thư',certNo:'Số chứng thư',certDate:'Ngày chứng thư',mt:'Tấn tươi (MT)',bdmt:'Tấn khô (BDMT)',moisture:'Độ ẩm (%)',fromDate:'Ngày cân từ',toDate:'Ngày cân đến',product:'Hàng hóa thực hiện',tkhq:'Số tờ khai HQ'};
function number(s){s=s.replace(/\s/g,'');const a=s.lastIndexOf(','),b=s.lastIndexOf('.');if(a>=0&&b>=0)return Number(s.replace(a>b?/\./g:/,/g,'').replace(',','.'));if(/^[1-9]\d{0,2}([.,]\d{3})+$/.test(s))return Number(s.replace(/[.,]/g,''));return Number(s.replace(',','.'));}
const READER_VERSION='2.9.6';
function contractNumber(input){
 const source=String(input||'');let normalized='';const offsets=[];
 // Match without accents, but recover the original code (including Đ) from its source offsets.
 for(let i=0;i<source.length;){const ch=String.fromCodePoint(source.codePointAt(i)),plain=ch.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'D');for(let j=0;j<plain.length;j++){normalized+=plain[j];offsets.push(i);}i+=ch.length;}offsets.push(source.length);
 const code='[A-Z0-9][A-Z0-9/._„”“·,\\u2010-\\u2015\\u2212-]*(?:[ \\t]*\\/[ \\t]*[A-Z0-9._„”“·,\\u2010-\\u2015\\u2212-]+)*';
 const rules=[
  {rank:4,re:new RegExp('(?:^|\\n)[ \\t]*PURCHASE\\s*ORDER\\s*(?:NUMBER|NO\\.?)[^\\n]*?[:：]\\s*('+code+')','gim')},
  {rank:4,re:/(?:^|\n|[ \t]{2,})[ \t]*(?:P\.?O\.?)[ \t]*(?:NO\.?|NUMBER|#)[ \t]*[:：]?[ \t]*([A-Z0-9][A-Z0-9/._]*(?:[ \t]*-[ \t]*[A-Z0-9][A-Z0-9/._]*)+)/gim},   // v2.19.5: PO tiếng Anh "PO No.: 2 -2026CY" (khoảng trắng quanh dấu gạch bị bỏ)   // PO: "PURCHASE ORDER NUMBER …:0626LH-HAK2607004" (chữ Hán giữa nhãn và số bị OCR thành rác)
  {rank:4,re:new RegExp('(?:^|\\n)[ \\t]*(?:CONTRACT\\s*(?:NO\\.?|NUMBER|#)|(?:HOP\\s*DONG|HD)\\s*(?:SO|S6|S0|NO\\.?)|S[O06]\\s*(?:HOP\\s*DONG|HD))\\s*[:：#.\\-]?\\s*('+code+')','gim')},
  {rank:3,re:/(?:^|\n)[ \t]*(IWC[ \t]*\/[ \t]*[A-Z][A-Z0-9/._-]*?\d{2}[ \t]*[-\u2010-\u2015\u2212„”“·,][ \t]*\d{3,8})(?=[ \t]*(?:$|[:：]))/gim},
  {rank:3,re:/^(IWC[ \t]*\/[ \t]*[A-Z0-9/._-]+)[ \t]*$/gim},
  {rank:2,re:new RegExp('(?:^|\\n)[ \\t]*S[O06]\\s*[:：]\\s*('+code+')','gim')},
  // A scanned heading may lose the short label "Số:" completely. Only accept known contract prefixes.
  {rank:1,re:/^(\s*(?:UTXK|HDUTXK|HDMB|HDXK|HDBH)[ \t]*\/[ \t]*[A-Z0-9][A-Z0-9/._\u2010-\u2015\u2212-]*(?:[ \t]*\/[ \t]*[A-Z0-9._\u2010-\u2015\u2212-]+)*)[ \t]*$/gim}
 ];
 const candidates=[];
 for(const rule of rules){let m;while((m=rule.re.exec(normalized))){const at=m.index+m[0].indexOf(m[1]),raw=source.slice(offsets[at],offsets[at+m[1].length]),value=raw.replace(/\s/g,'').replace(/[\u2010-\u2015\u2212]/g,'-').replace(/(\d)[„”“·,](?=\d{3,8}$)/g,(/^IWC\//i.test(raw.trim())?'$1-':'$&'));if(/[„”“·,]/.test(value)||/^IWC\/(?:VA|VN|FOB|CIF)\//i.test(value))continue;if(value.length<3||value.length>120||!/[0-9]/.test(value))continue;const line=normalized.slice(0,at).split('\n').filter(x=>x.trim()).length;const result={key:'no',value,evidence:source.slice(offsets[m.index],offsets[m.index+m[0].length]),rank:rule.rank,line,at};if(raw.replace(/\s/g,'')!==value)result.correction='Đã chuẩn hóa dấu phân cách OCR; đối chiếu với PDF gốc.';candidates.push(result);}}
 candidates.sort((a,b)=>(a.line<14?0:1)-(b.line<14?0:1)||b.rank-a.rank||a.at-b.at);
 if(!candidates.length)return null;const best=candidates[0];delete best.rank;delete best.line;delete best.at;return best;
}
function contractNumberFromPages(pages){
 for(const p of (pages||[]).slice().sort((a,b)=>Number(a.page)-Number(b.page))){const result=contractNumber((p.rowsText||p.text||'')+'\n'+(p.text||''));if(result)return Object.assign(result,{page:p.page});}
 return null;
}

function contractPrice(source){
 if(HAK.DocExtract){const robust=HAK.DocExtract.price(source,number);if(robust)return robust;}   // v2.13.0: chịu lỗi OCR ("USD17 4.00" = 174,00; nhãn và số ở 2 dòng)
 const candidates=[];
 for(const raw of String(source||'').split('\n')){
  const line=raw.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d');
  if(/(?:phi|fee|commission|tai khoan|account|penalty|demurrage)/i.test(line))continue;
  if(!/(?:gia\s+(?:dam|go|ban|hang)|don\s*gia|unit\s*price|price\s*:|per\s*bone\s*dry\s*metric\s*ton)/i.test(line))continue;
  const money='(USD|US\\s*\\$|VND|VN[DĐ]|EUR|JPY|CNY|\\$)';
  const amount='([0-9]+(?:[.,][0-9O]+)*(?:[ \u00a0][0-9]{3})*)';
  const after=new RegExp(amount+'\\s*'+money+'(?=\\s|/|$|[-.,])','i').exec(line);
  const before=after?null:new RegExp(money+'\\s*'+amount,'i').exec(line);
  if(!after&&!before)continue;
  const value=number((after?after[1]:before[2]).replace(/O/g,'0'));
  const rawCurrency=(after?after[2]:before[1]).toUpperCase().replace(/\s/g,'');
  const currency=/^(?:USD|US\$|\$)$/.test(rawCurrency)?'USD':/^VN/.test(rawCurrency)?'VND':rawCurrency;
  if(Number.isFinite(value)&&value>0)candidates.push({value,currency,evidence:raw});
 }
 const distinct=candidates.filter((c,i)=>candidates.findIndex(x=>x.value===c.value&&x.currency===c.currency)===i);
 return distinct.length===1&&['USD','VND'].includes(distinct[0].currency)?distinct[0]:null;
}
function parse(text,kind){
 if(kind==='certificate'&&HAK.DocExtract)text=HAK.DocExtract.tidy(text);   // bỏ dấu nháy lạc (TU'OI), nối "23.789, 17"
 const original=text; text=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,c=>c==='đ'?'d':'D');
 const found=[];const add=(key,re,convert)=>{const m=re.exec(text);if(m){const value=convert?convert(m[1]):m[1].trim();if(value!==''&&value!=null&&!Number.isNaN(value))found.push({key,value,evidence:original.slice(m.index,m.index+m[0].length)});}};
 if(kind==='certificate'){
  if(HAK.DocExtract){const X=HAK.DocExtract,v=X.vessel(original),pr=X.product(original),per=X.inspectionPeriod(original);
   if(v)found.push({key:'ship',value:v.value,evidence:v.evidence});
   if(pr)found.push({key:'product',value:pr.value,evidence:pr.evidence});
   if(per)found.push({key:'fromDate',value:per.from,evidence:per.evidence},{key:'toDate',value:per.to,evidence:per.evidence});}
  add('ship',/\bMV\.?\s+([A-Z][A-Z0-9 ._-]*?V\.?\s*\d+[A-Z0-9]*)/i,s=>'MV '+s.trim());
  add('certNo',/(?:^|\n)\s*S[o6]\s*[:：]\s*([A-Z0-9][A-Z0-9/._-]{5,})/i);
  add('mt',/([\d.,]+)\s*(?:TAN TUOI|WET (?:METRIC )?TONS?|GMT)\b/i,number);
  add('bdmt',/([\d.,]+)\s*(?:TAN KHO|BDMT)\b/i,number);
  add('fromDate',/(?:Th[o0]i gian gi[aå]m dinh)[\s\S]{0,35}?ng[aå]y\s*(\d{1,2}[/.-]\d{1,2}[/.-]\d{4})/i,iso);
  add('toDate',/(?:Th[o0]i gian gi[aå]m dinh)[^\n]*?den\s*ng[aå]y\s*(\d{1,2}[/.-]\d{1,2}[/.-]\d{4})/i,iso);
  add('certNo',/(?:certificate\s*(?:no\.?|number)|s[oố]\s*(?:ch[uứ]ng\s*th[uư])?\s*[:：])\s*([A-Z0-9][A-Z0-9/._-]{5,})/i);
  add('mt',/(?:wet\s*(?:weight|quantity)|kh[oố]i\s*l[uượơ]ng\s*(?:t[uươơ]i|[uướơ]t))[^\d\n]{0,35}([\d.,]+)\s*(?:MT|t[aấ]n)?/i,number);
  add('bdmt',/(?:dry\s*(?:weight|quantity)|kh[oố]i\s*l[uượơ]ng\s*kh[oô])[^\d\n]{0,35}([\d.,]+)\s*(?:BDMT)?/i,number);
  add('moisture',/(?:moisture(?:\s*content)?|(?:[dđ][oộq0]|E>Q)\s*[aẩ]m)[^\d\n]{0,35}([\d.,]+)\s*%/i,number);
 }else{
  const no=contractNumber(original);if(no)found.push(no);
  const price=contractPrice(original);if(price){found.push({key:'priceUsd',value:price.value,evidence:price.evidence},{key:'currency',value:price.currency,evidence:price.evidence});}
  const monthDate=s=>{const m=/^(\d+)[- ]([A-Za-z]+)\s+(\d+)$/.exec(s),months=['January','February','March','April','May','June','July','August','September','October','November','December'];return iso(m[1]+'/'+(months.findIndex(x=>x.toLowerCase()===m[2].toLowerCase())+1)+'/'+m[3]);};
  const MONTHS='(?:January|February|March|April|May|June|July|August|September|October|November|December)';
  add('date',new RegExp('(?:^|\\n)(\\d{1,2}[- ]'+MONTHS+'\\s+\\d{4})','i'),monthDate);
  add('date',/(?:^|\n)\s*date\b[^\n\d]{0,24}(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/i,s=>{const [y,m,d]=s.split(/[-/.]/);const t=new Date(+y,+m-1,+d);return t.getFullYear()===+y&&t.getMonth()===+m-1&&t.getDate()===+d?y+'-'+m.padStart(2,'0')+'-'+d.padStart(2,'0'):null;});   // PO: "DATE 日期: 2026-6-26"
  add('date',new RegExp('(?:^|\\n)\\s*date\\s*[:：]\\s*(\\d{1,2}[- ]'+MONTHS+'\\s+\\d{4})','i'),monthDate);
  if(!found.some(x=>x.key==='date')){   // v2.19.5: PO không có nhãn "Date": "03 February 2026" (bỏ ngày ETA / ETD / hiệu lực / ngày của hợp đồng khung)
   const re=new RegExp('(\\d{1,2})(?:st|nd|rd|th)?[ -]+('+MONTHS+')[ ,]+(\\d{4})','gi');let dm;
   while((dm=re.exec(text))){const from=text.lastIndexOf('\n',dm.index)+1,to=text.indexOf('\n',dm.index),line=text.slice(from,to<0?text.length:to).toLowerCase();if(/\b(?:eta|etd|etb|laycan|dated|agreement|valid|expir\w*)\b/.test(line))continue;const v=monthDate(dm[1]+'-'+dm[2]+' '+dm[3]);if(v)found.push({key:'date',value:v,evidence:original.slice(dm.index,dm.index+dm[0].length)});break;}
  }   // v2.13.0: "Date: 27-July 2026"
  add('ship',/(?:tau|vessel)\s*[:：]?\s*((?:MV\.?\s*)?[A-Z][A-Z0-9 ._-]*?V[.\-]?\s*\d+[A-Z0-9]*)/i);
  add('qty',/(?:S[o6]\s*lu[qou]+ng)\s*la\s*[:：]?\s*([\d.,]+)\s*BDMT/i,number);
  add('date',/l.{0,2}p\s*(?:vao)?\s*ngay\s*(\d{1,2}\s*thang\s*\d{1,2}\s*nam\s*\d{4})/i,s=>iso(s.replace(/\s*(?:thang|nam)\s*/g,'/')));
  add('ship',/(?:vessel|t[aà]u)\s*[:：]?\s*((?:M\.?\s*V\.?\s*)?[A-Z][A-Z0-9 ._-]{3,65})/);
  add('qty',/(?:quantity|kh[oố]i\s*l[uượơ]ng)[^\d\n]{0,35}([\d.,]+)\s*BDMT/i,number);
 }
 add(kind==='certificate'?'certDate':'date',/(?:date|ng[aà]y)\s*[:：]?\s*(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4})/i,s=>{const [d,m,y]=s.split(/[/.\-]/);const date=new Date(+y,+m-1,+d);return date.getFullYear()===+y&&date.getMonth()===+m-1&&date.getDate()===+d?y+'-'+m.padStart(2,'0')+'-'+d.padStart(2,'0'):null;});
 if(kind==='certificate'&&!found.some(x=>x.key==='moisture')){const mt=found.find(x=>x.key==='mt'),bd=found.find(x=>x.key==='bdmt');if(mt&&bd&&mt.value>0&&bd.value>0&&bd.value<=mt.value)found.push({key:'moisture',value:Math.round((1-bd.value/mt.value)*1e6)/1e4,evidence:'TÍNH TỪ KHỐI LƯỢNG, chưa đọc trực tiếp dòng độ ẩm: (1 − '+bd.value+' / '+mt.value+') × 100. Cần đối chiếu phần trăm trên chứng thư.',derived:true});}
 const unique=found.filter((x,i)=>found.findIndex(y=>y.key===x.key)===i);
 return unique.filter(x=>!['moisture','mt','bdmt','qty','priceUsd'].includes(x.key)||(+x.value>=0&&(x.key!=='moisture'||+x.value<100)));
}
function iso(s){const [d,m,y]=s.split(/[/.\-]/);const a=new Date(+y,+m-1,+d);return a.getFullYear()===+y&&a.getMonth()===+m-1&&a.getDate()===+d?y+'-'+m.padStart(2,'0')+'-'+d.padStart(2,'0'):null;}
let draft=[],panel,kind,epoch=0,busy=false,loadError='',options={};
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
const base64=bytes=>{let s='';for(let i=0;i<bytes.length;i+=16384)s+=String.fromCharCode.apply(null,bytes.subarray(i,i+16384));return btoa(s);};
const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function api(path,data){const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),600000);try{const r=await fetch('http://127.0.0.1:31879/'+path,{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json','X-HAK-Client':'documents-v1','X-HAK-Token':window.HAK_DOCS_TOKEN||''}:{},body:data?JSON.stringify(data):undefined,signal:ctl.signal});const j=await r.json();if(!r.ok)throw Error(j.error||'OCR không thành công');return j;}finally{clearTimeout(t);}}
function showPDF(rec){const url=URL.createObjectURL(new Blob([bytes(rec.base64)],{type:'application/pdf'}));const a=el('a','Mở / tải PDF gốc');a.href=url;a.target='_blank';a.rel='noopener';a.title=rec.name;panel.append(a);setTimeout(()=>URL.revokeObjectURL(url),600000);}
function render(){if(!panel)return;panel.replaceChildren();panel.append(el('strong',kind==='certificate'?'Chứng thư PDF đính kèm':'Hợp đồng PDF đính kèm'));panel.append(el('p','PDF gốc được lưu cùng hồ sơ. OCR chạy trên máy; kiểm tra đề xuất với bản gốc trước khi điền.','small muted'));if(kind==='contract')panel.append(el('small','Bộ đọc số hợp đồng '+READER_VERSION,'d-block muted mb-2'));
 const input=el('input');input.type='file';input.accept='.pdf,application/pdf';input.multiple=true;input.className='form-control';input.disabled=busy;panel.append(input);
 input.onchange=async()=>{const token=epoch;let error='';try{busy=true;input.disabled=true;for(const file of input.files){if(file.size>26*1024*1024)throw Error('Mỗi PDF tối đa 26 MB');const raw=new Uint8Array(await file.arrayBuffer());if(String.fromCharCode(...raw.slice(0,5))!=='%PDF-')throw Error('Tệp không phải PDF');const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)),x=>x.toString(16).padStart(2,'0')).join('');if(token!==epoch)return;if(!draft.some(x=>x.id===hash))draft.push({id:hash,name:file.name,base64:base64(raw),size:file.size,createdAt:new Date().toISOString(),fresh:true});}}catch(e){error=e.message;}finally{if(token===epoch){busy=false;render();if(error)panel.append(el('p',error,'text-danger'));}}};
 for(const rec of draft){const row=el('div',null,'border rounded p-2 mt-2');row.append(el('span',rec.name+' · '+Math.round(rec.size/1024)+' KB '));const open=el('button','PDF gốc','btn btn-sm btn-outline-secondary');open.type='button';open.onclick=()=>showPDF(rec);row.append(open);
 const read=el('button','Đọc bằng OCR Windows','btn btn-sm btn-outline-primary ms-2');read.type='button';read.disabled=busy;read.onclick=()=>ocr(rec);row.append(read);const remove=el('button','Bỏ đính kèm','btn btn-sm btn-outline-danger ms-2');remove.type='button';remove.disabled=busy;remove.onclick=()=>{draft=draft.filter(x=>x!==rec);render();};row.append(remove);panel.append(row);}
 panel.append(el('p','Nếu OCR chưa kết nối, mở app bằng native\\HAKDocs.exe (bản setup sẽ có lối tắt).','small muted mt-2'));
}
async function ocr(rec){const token=epoch;busy=true;render();const status=el('p','Đang đọc PDF bằng Windows OCR…');panel.append(status);try{const result=await api('ocr',{base64:rec.base64,kind});if(token!==epoch)return;status.textContent='Đã đọc '+result.pages.length+' trang · OCR '+result.language+'. Luôn đối chiếu số liệu với PDF gốc.';const text=result.pages.map(p=>(p.rowsText||p.text)+'\n'+(p.supplementalText||'')).join('\n');const details=el('details'),summary=el('summary','Xem chữ OCR');details.append(summary,el('pre',text,'small text-wrap'));panel.append(details);
 if(kind==='contract'&&HAK.ContractParser){renderContractSuggestions(result.pages,rec);return;}
 renderCertificateReview(result.pages,text);
 }catch(e){if(token===epoch)status.textContent='Chưa đọc được: '+e.message+'. Kiểm tra app được mở bằng HAKDocs.exe.';}finally{if(token===epoch){busy=false;panel.querySelectorAll('button').forEach(b=>b.disabled=false);panel.querySelector('input[type=file]').disabled=false;}}}
function renderContractSuggestions(pages,rec){
 const result=HAK.ContractParser.extract(pages),review=el('div',null,'border rounded p-2 mt-2');
 review.append(el('strong','Đề xuất từ hợp đồng — chọn và đối chiếu trước khi điền'));
 const numberProposal=contractNumberFromPages(pages);const common=parse(pages.map(p=>(p.rowsText||p.text)+'\n'+p.text).join('\n'),'contract').filter(s=>!['qty','ship','no'].includes(s.key));if(numberProposal)common.unshift(numberProposal);if(result.product)common.push({key:'contractProduct',value:result.product,evidence:'Tên hàng từ nội dung hợp đồng'});if(result.lots.length)common.push({key:'contractQty',value:result.lots.reduce((n,l)=>n+l.qty,0),evidence:result.lots.map(l=>'Trang '+l.page+': '+l.evidence).join('; ')});
 const selected=[];
 function offer(label,value,evidence,apply,pre){const row=el('label',null,'d-block p-2 border-bottom'),check=el('input');check.type='checkbox';check.checked=!!pre;row.append(check,document.createTextNode(' '+label+': '+value),el('small',evidence,'d-block muted'));review.append(row);selected.push({check,apply,auto:!!pre,label});}
 const typeTarget=document.getElementById('cf-type');if(typeTarget)offer('Hình thức hợp đồng',result.type==='uythac'?'Ủy thác xuất khẩu':'Xuất khẩu','Theo nội dung PDF',()=>{typeTarget.value=result.type;typeTarget.dispatchEvent(new Event('input',{bubbles:true}));});
 for(const s of common){const target=document.getElementById('cf-'+s.key);if(!target)continue;if(s.key==='no'){
  const box=el('div',null,'border border-primary rounded p-3 mt-2 mb-2'),label=el('label',null,'d-block fw-semibold'),check=el('input');check.type='checkbox';label.append(check,document.createTextNode(' Số hợp đồng nhận dạng được'));
  const value=el('input',null,'form-control mt-2');value.type='text';value.value=s.value;value.setAttribute('aria-label','Số hợp đồng OCR đề xuất');
  const status=el('p','Có thể sửa ký tự OCR (ví dụ Đ/D) trước khi điền.','small muted mt-1 mb-0');
  const applyNumber=()=>{const v=value.value.trim();if(!v){status.textContent='Chưa có số hợp đồng để điền.';return;}target.value=v;target.dispatchEvent(new Event('input',{bubbles:true}));status.textContent='Đã điền số hợp đồng: '+v;check.checked=false;};
  const button=el('button',target.value?'Thay số hợp đồng hiện có':'Điền số hợp đồng','btn btn-primary mt-2');button.type='button';button.dataset.ocrContractNumber='';button.onclick=applyNumber;
  box.append(label,value,el('small','Trang '+s.page+' · '+s.evidence,'d-block muted mt-1'));if(s.correction)box.append(el('small',s.correction,'d-block text-warning'));box.append(button,status);review.append(box);selected.push({check,apply:applyNumber});if(!target.value){applyNumber();target.classList.add('ocr-filled');}continue;
 }offer(labels[s.key],s.value,s.evidence+(target.value&&!['currency'].includes(s.key)?' · hiện có: '+target.value:''),()=>fill(target,s.key,s.value),!target.value);}
 if(!common.some(x=>x.key==='priceUsd'))review.append(el('p','Chưa đọc được ĐƠN GIÁ trên PDF (OCR có thể bỏ sót dòng giá in đậm / gạch chân). Xem chữ OCR hoặc PDF gốc rồi nhập tay ô Đơn giá.','text-warning'));
 if(!result.lots.length)review.append(el('p','Chưa đọc được KHỐI LƯỢNG (BDMT) trên PDF. Xem chữ OCR hoặc PDF gốc rồi nhập tay ô KL hợp đồng.','text-warning'));
 if(!numberProposal)review.append(el('p','Chưa nhận dạng chắc chắn số hợp đồng. Xem chữ OCR và đối chiếu PDF để nhập số.','text-warning'));
 for(const [role,title] of [['exporter','Bên xuất khẩu / nhận ủy thác'],['principal','Bên ủy thác'],['buyer','Bên mua hàng']]){
  const party=result.parties[role],target=document.getElementById('cf-'+role+'Id');if(!party||!target)continue;
  const customers=options.customers?options.customers():[],matched=HAK.ContractParser.matchParty(party,customers);
  offer(title,matched?matched.name:party.name,'Trang '+party.page+' · '+party.evidence+(party.tax?' · MST: '+party.tax:'')+(party.address?' · Địa chỉ: '+party.address:''),()=>{
   target.value=matched?matched.id:'__new';target.dispatchEvent(new Event('input',{bubbles:true}));target.classList.add('ocr-filled');
   if(!matched)fillNewParty('cf-'+role+'Id',party);
  },!target.value);
  if(matched&&!matched.address&&party.address)offer('Địa chỉ của '+matched.name,party.address,'Khách hàng này chưa có địa chỉ trong Danh mục — bổ sung từ hợp đồng',()=>saveAddress(matched,party.address),true);
 }
 if(result.lots.length)review.append(el('p','KL hợp đồng được cộng từ các lô trên PDF. Chỉ thêm chi tiết hợp đồng khi giao hàng; OCR hợp đồng không tạo dòng thực hiện.','small muted'));
 const done=[];selected.filter(x=>x.auto).forEach(x=>{try{x.apply();done.push(x.label);x.check.checked=false;x.check.parentNode.classList.add('text-success');}catch(e){}});
 if(done.length)review.insertBefore(el('p','Đã tự điền '+done.length+' ô trống: '+done.join(', ')+'. Các ô tô vàng là chữ OCR — đối chiếu với PDF gốc rồi mới Lưu.','small text-success mb-1 mt-1'),review.children[1]||null);
 const apply=el('button','Điền các mục đã tick','btn btn-primary mt-2');apply.type='button';apply.onclick=()=>{
  selected.filter(x=>!x.auto&&x.check.checked).forEach(x=>{x.apply();x.check.checked=false;});
 };review.append(apply);panel.append(review);
}
function certificateParties(pages){
 const lines=pages.flatMap(p=>(p.rowsText||p.text).split(/\r?\n/).map(text=>({text:text.trim(),page:p.page}))).filter(l=>l.text),fold=HAK.ContractParser.fold;
 const companies=lines.filter(l=>/(?:cong ty|ty tnhh|company limited|corporation pte|co\.,?\s*ltd)/.test(fold(l.text)));
 const clean=l=>{let name=l.text.replace(/^.*?(?=(?:C[ÔO]NG TY|TY TNHH|INTERNATIONAL|[A-Z &]+CORPORATION))/i,'').replace(/^TY TNHH/i,'CÔNG TY TNHH').trim();return {name,tax:'',page:l.page,evidence:l.text};};
 const result={};
 for(const [role,label] of [['deliverId',/(?:ngu.?oi xuat khau|ben giao|shipper|exporter)/],['receiverId',/(?:ngu.?oi mua hang|ben nhan|buyer|consignee)/]]){
  const line=lines.find(l=>label.test(fold(l.text))&&/(?:cong ty|ty tnhh|company|corporation)/.test(fold(l.text)));if(line){const f=fold(line.text),m=label.exec(f);result[role]=clean({text:line.text.slice(m.index+m[0].length).replace(/^\s*[:：]\s*/,''),page:line.page});}
 }
 if(!result.deliverId&&companies[0])result.deliverId=clean(companies[0]);
 if(!result.receiverId&&companies[1])result.receiverId=clean(companies[1]);
 if(HAK.DocExtract){const rich=HAK.DocExtract.certificateParties(pages);for(const role of Object.keys(rich)){if(!result[role]&&rich[role].name)result[role]={name:rich[role].name,tax:'',page:rich[role].page,evidence:rich[role].evidence};if(result[role]){result[role].address=rich[role].address||'';result[role].name=HAK.DocExtract.tidyName(result[role].name);}}}   // v2.13.0: địa chỉ ngay dưới tên bên
 return result;
}
/** Điền 1 ô từ đề xuất OCR: ô chọn thì chọn / thêm tùy chọn; ô số thì hiện dạng Việt (6.500, 13.010,81); rồi báo cho form biết. */
function fill(target,key,value){
 const foldKey=HAK.ContractParser?HAK.ContractParser.fold:(x=>String(x).toLowerCase());
 if(target.tagName==='SELECT'){let opt=Array.from(target.options).find(o=>o.value===String(value)||foldKey(o.textContent)===foldKey(String(value)));if(!opt){opt=document.createElement('option');opt.value=String(value);opt.textContent=value+' (OCR — bổ sung khi lưu)';target.append(opt);}target.value=opt.value;}
 else if(target.dataset&&target.dataset.numfmt&&HAK.NumFmt&&value!==''&&!Number.isNaN(Number(value)))target.value=HAK.NumFmt.txt(Number(value),target.dataset.numfmt);
 else target.value=value;
 target.classList.add('ocr-filled');target.dispatchEvent(new Event('input',{bubbles:true}));
}
/** Bên mới (chưa có trong Danh mục): điền tên + địa chỉ (+ MST) vào các ô "mới". */
function fillNewParty(selectId,party){
 const n=document.getElementById(selectId+'-newName');if(n)n.value=party.name||'';
 const a=document.getElementById(selectId+'-newAddr');if(a&&party.address)a.value=party.address;
 const t=document.getElementById(selectId+'-newTax');if(t&&party.tax)t.value=party.tax;
}
/** Khách hàng đã có nhưng chưa có địa chỉ → bổ sung địa chỉ đọc từ chứng thư / hợp đồng. */
function saveAddress(customer,address){
 if(!HAK.Catalog||!HAK.Catalog.upsertCustomer)return;
 const res=HAK.Catalog.upsertCustomer({id:customer.id,kind:customer.kind,name:customer.name,address,country:customer.country,tax:customer.tax,note:customer.note});
 if(res&&res.error){if(HAK.UI)HAK.UI.toast(res.error,'error');return;}
 if(HAK.Catalog.persist)HAK.Catalog.persist();
 customer.address=address;
}
/** Khung đề xuất dùng chung: tick sẵn + TỰ ĐIỀN các ô đang trống (tô nền vàng); ô đã có dữ liệu thì để bạn tick tay. */
function makeReview(title){
 const review=el('div',null,'border rounded p-2 mt-2'),selected=[];review.append(el('strong',title));
 const offer=(label,value,evidence,apply,pre)=>{const row=el('label',null,'d-block p-2 border-bottom'),check=el('input');check.type='checkbox';check.checked=!!pre;row.append(check,document.createTextNode(' '+label+': '+value),el('small',evidence,'d-block muted'));review.append(row);selected.push({check,apply,auto:!!pre,label});};
 const finish=(container)=>{
  const done=[];selected.filter(x=>x.auto).forEach(x=>{try{x.apply();done.push(x.label);x.check.checked=false;x.check.parentNode.classList.add('text-success');}catch(e){}});
  if(done.length){review.insertBefore(el('p','Đã tự điền '+done.length+' ô trống: '+done.join(', ')+'. Các ô tô vàng là chữ OCR — đối chiếu với PDF gốc rồi mới Lưu.','small text-success mb-1 mt-1'),review.children[1]||null);}
  const rest=selected.filter(x=>!x.auto);
  if(rest.length){const apply=el('button','Điền các mục đã tick','btn btn-primary mt-2');apply.type='button';apply.onclick=()=>{selected.filter(x=>!x.auto&&x.check.checked).forEach(x=>{x.apply();x.check.checked=false;});};review.append(apply);}
  if(!selected.length)review.append(el('p','Chưa nhận dạng chắc chắn ô dữ liệu nào. Xem chữ OCR và nhập tay sau khi đối chiếu.','text-warning'));
  container.append(review);
 };
 return {offer,finish,selected};
}
function renderCertificateReview(pages,text){
 const suggestions=parse(text,'certificate'),parties=certificateParties(pages),R=makeReview('Đề xuất từ chứng thư — ô trống được tự điền');
 for(const s of suggestions){const target=document.getElementById('cf-'+s.key);if(!target)continue;R.offer(labels[s.key]+(s.derived?' — tính từ khối lượng':''),s.value,s.evidence+(target.value?' · hiện có: '+target.value:''),()=>fill(target,s.key,s.value),!target.value&&!s.derived);}
 const customers=options.customers?options.customers():[];
 for(const [key,party] of Object.entries(parties)){
  const target=document.getElementById('cf-'+key);if(!target||!party.name)continue;
  const matched=HAK.ContractParser.matchParty(party,customers);
  R.offer(labels[key],(matched?matched.name:party.name),'Trang '+party.page+' · '+party.evidence+(party.address?' · Địa chỉ: '+party.address:''),()=>{target.value=matched?matched.id:'__new';target.dispatchEvent(new Event('input',{bubbles:true}));target.classList.add('ocr-filled');if(!matched)fillNewParty('cf-'+key,party);},!target.value);
  if(matched&&!matched.address&&party.address)R.offer('Địa chỉ của '+matched.name,party.address,'Khách hàng này chưa có địa chỉ trong Danh mục — bổ sung từ chứng thư',()=>saveAddress(matched,party.address),true);
 }
 R.finish(panel);
}
async function mount(container,type,ids,opts){options=opts||{};const token=++epoch;kind=type;draft=[];busy=true;loadError='';panel=el('div',null,'col-12');container.append(panel);panel.textContent='Đang mở tệp đính kèm…';try{const files=await Promise.all(ids.map(id=>HAK.DB.get('attachments',id)));if(token!==epoch)return;if(files.some(x=>!x))throw Error('Thiếu PDF đã đính kèm. Hãy khôi phục từ Sao lưu toàn bộ để giữ tệp gốc.');draft=files;busy=false;render();}catch(e){if(token===epoch){busy=false;loadError=e.message;panel.textContent=loadError;panel.classList.add('text-danger');}}}
async function commit(){if(loadError)throw Error(loadError);if(busy)throw Error('Đợi đọc / tải PDF xong rồi lưu.');if(draft.length&&!HAK.DB.usable())throw Error('Bộ nhớ trình duyệt chưa sẵn sàng để lưu PDF bền vững.');for(const rec of draft){const saved=Object.assign({},rec);delete saved.fresh;await HAK.DB.put('attachments',saved);}return draft.map(x=>x.id);}
HAK.Documents={ocr:(base64,kind)=>api('ocr',{base64,kind:kind||'document'}),mount,commit,parse,number,contractNumber,contractNumberFromPages,readerVersion:READER_VERSION,certificateParties};
if(typeof module==='object'&&module.exports)module.exports={parse,number,contractNumber,contractNumberFromPages,readerVersion:READER_VERSION,certificateParties};
})(typeof window!=='undefined'?window:globalThis);
