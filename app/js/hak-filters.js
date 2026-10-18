/* HAK app adapter for the vendored HAK_SMART_FILTER UI and headless engine. */
(function(root) {
 'use strict';
 const HAK=root.HAK=root.HAK||{}, SF=root.HAKSmartFilter.core;
 function h(tag,attrs,kids) {
  const e=document.createElement(tag);
  Object.entries(attrs||{}).forEach(([k,v])=>{if(k==='text')e.textContent=v;else if(k==='value')e.value=v;else e.setAttribute(k,v);});
  (kids||[]).filter(Boolean).forEach(c=>e.appendChild(typeof c==='string'?document.createTextNode(c):c));return e;
 }
 let UI;
 const api = () => UI || (UI=root.HAKUI.smartFilter.create({h,
  btn:(text,cls,action,title)=>{const b=h('button',{type:'button',class:'b '+(cls||''),text,title:title||text});b.addEventListener('click',action);return b;},
  toast:s=>HAK.UI.toast(s,'warning'),storage:()=>root.localStorage,
  dateField:(iso,attrs)=>h('input',Object.assign({type:'date',value:iso||''},attrs)),
  dateIso:el=>!el.validity.valid?null:el.value,
  askText:(title,label,opt,done)=>{
   // A nested dialog keeps the draft filter and its focus intact.
   const d=h('dialog',{class:'hak-preset-dialog','aria-label':title});
   const name=h('input',{type:'text',class:'form-control',maxlength:'80','aria-label':label});
   const error=h('div',{class:'text-danger small',role:'alert'});
   const close=()=>{d.close();d.remove();};
   const save=h('button',{type:'button',class:'btn btn-primary',text:'Lưu'});
   save.addEventListener('click',()=>{if(!name.value.trim()){error.textContent='Nhập tên bộ lọc.';name.focus();return;}const v=name.value;close();done(v);});
   const cancel=h('button',{type:'button',class:'btn btn-outline-secondary',text:'Hủy'});cancel.addEventListener('click',close);
   d.append(h('h3',{class:'h5',text:title}),h('label',{text:label},[name]),error,h('div',{class:'d-flex justify-content-end gap-2 mt-3'},[cancel,save]));
   document.body.append(d);d.showModal();name.focus();d.addEventListener('close',()=>d.remove());
  }
 }));
 function assertState(state) {
  for(const key of ['tu','den'])if(state[key] && (!/^\d{4}-\d{2}-\d{2}$/.test(state[key])||SF.parseVN(state[key])!==state[key]))throw new RangeError('Ngày lọc không hợp lệ.');
  const issue=SF.dateProblem(state);if(issue)throw new RangeError('Từ ngày phải nhỏ hơn hoặc bằng đến ngày.');
 }
 function multi(key,label,options,value) {return {key,label,type:'multi',options,match:(r,sel)=>SF.inSet(sel,value(r))};}
 function day(value) {
  if(typeof value==='number')return Number.isFinite(value)?new Date(value).toISOString().slice(0,10):'';
  return SF.parseVN(String(value||'').trim())||'';
 }
 function dateMatch(value,from,to){const d=day(value);return !!d&&(!from||d>=from)&&(!to||d<=to);}
 function mount(host,opt) {
  const el=typeof host==='string'?document.querySelector(host):host;if(!el)throw Error('Missing filter host: '+host);
  const cfg={screenId:opt.screenId,fields:opt.fields||[],matchQ:opt.matchQ,matchDate:opt.matchDate};
  const engine=root.HAKSmartFilter.createFilter(cfg,{initialState:opt.initialState});
  let view;
  const change=()=>{if(opt.onApply)opt.onApply(engine.getState());};
  const set=s=>{try{assertState(s);engine.setState(s);}catch(e){HAK.UI.toast(e.message,'warning');return false;}return true;};
  const read=()=>{const rows=opt.source?opt.source():[];const r=engine.filter(rows);if(opt.summary)r.summary=opt.summary(r);return r;};
  const uiCfg=Object.assign({},cfg,{quickFields:opt.quickFields||['q'].concat(cfg.fields.slice(0,2).map(f=>f.key)),advancedFields:['q'].concat(opt.matchDate?['dates']:[],cfg.fields.map(f=>f.key)),
   periods:()=>Array.from(new Set((opt.source?opt.source():[]).map(r=>day(r.dateStr||r.from||r.date||r.at||r.updatedAt)).filter(Boolean).map(d=>d.slice(0,7)))).sort().reverse().map(value=>({value,label:value.slice(5)+'/'+value.slice(0,4)})),
   searchPlaceholder:opt.searchPlaceholder||'Tìm không dấu…',state:{get:engine.getState,set},dataSource:read,
   summary:opt.summary||((r)=>[{label:'Bộ lọc',value:SF.activeCount(r.state)}]),onApply:change,onReset:opt.onReset});
  view=api().mount(uiCfg);el.replaceChildren(view.el);
  return {filter:rows=>engine.filter(rows),getState:engine.getState,setState:(s,notify)=>{if(set(s)){if(notify)change();view.refresh();return true;}return false;},refresh:()=>view.refresh(),describe:engine.describe,el:view.el};
 }

 const tripFields = options => [
  multi('plate','Biển số',()=>options('plate'),r=>r.plate),
  multi('carrier','Đơn vị vận chuyển',()=>options('carrier'),r=>r.carrier),
  {key:'warnings',label:'Chỉ dòng có cảnh báo',type:'bool',match:r=>!!(r.warn&&r.warn.length)}
 ];
 function tripConfig(options){return {screenId:'trips',fields:tripFields(options||(()=>[])),matchQ:(r,q)=>SF.hay([r.ticket,r.plate,r.driver,r.carrier,r.note,r.weigher]).includes(q),matchDate:(r,f,t)=>dateMatch(r.dateStr||r.ts1,f,t)};}
 function trips(rows,state){assertState(state);const allowed={sel:['plate','carrier'],one:[],flag:['warnings']};for(const kind of Object.keys(allowed))for(const key of Object.keys(state[kind]||{}))if(!allowed[kind].includes(key))throw new RangeError('Điều kiện lọc không được hỗ trợ: '+key);return root.HAKSmartFilter.createFilter(tripConfig(),{initialState:state}).filter(rows).rows;}
 HAK.Filters={mount,multi,day,dateMatch,assertState,core:SF,tripConfig,trips};
})(typeof window!=='undefined'?window:globalThis);
