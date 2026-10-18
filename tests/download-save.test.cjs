const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(result,error){const requests=[],notices=[],hints=[];const window={HAK:{UI:{toast:(...x)=>{if(x[1]==='error'||x[1]==='warning')notices.push(x);else hints.push(x);}}}};const ctx={setTimeout,clearTimeout,AbortController,window,console,Uint8Array,Blob,btoa,fetch:async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});if(error)throw error;return {ok:true,json:async()=>result};}};vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../app/js/word.js'),'utf8'),ctx);return {files:window.HAK.Word.Files,requests,notices,hints};}
test('each download requests a Windows Save As dialog with exact bytes and suggested filename',async()=>{const {files,requests}=setup({path:'C:/Test/output.xlsx',canceled:false});for(let i=0;i<2;i++)assert.equal(await files.saveBlob(new Blob([new Uint8Array([0,255,42])]),'output.xlsx'),'C:/Test/output.xlsx');assert.equal(requests.length,2);assert.equal(requests[0].url,'http://127.0.0.1:31879/save-download');assert.equal(requests[0].body.name,'output.xlsx');assert.deepEqual([...Buffer.from(requests[0].body.base64,'base64')],[0,255,42]);});
test('cancel returns without another download or success',async()=>{const {files,requests,notices}=setup({canceled:true});assert.equal(await files.saveBlob(new Blob(['test']),'a.docx'),false);assert.equal(requests.length,1);assert.equal(notices.length,0);});
test('unavailable helper reports failure and does not silently use browser download',async()=>{const {files,requests,notices}=setup(null,new TypeError('offline'));assert.equal(await files.saveBlob(new Blob(['test']),'a.zip'),false);assert.equal(requests.length,1);assert.equal(notices.length,1);});

test('successful save notifies file history with actual selected path and history warning',async()=>{const {files}=setup({path:'D:/Exports/renamed.xlsx',canceled:false,warning:'History unavailable'});let saved;const source=fs.readFileSync(require.resolve('../app/js/word.js'),'utf8');const window={HAK:{Downloads:{saved:(...args)=>saved=args}}};const ctx={setTimeout,clearTimeout,AbortController,window,Uint8Array,Blob,btoa,fetch:async()=>({ok:true,json:async()=>({path:'D:/Exports/renamed.xlsx',canceled:false,warning:'History unavailable'})})};vm.createContext(ctx);vm.runInContext(source,ctx);assert.equal(await window.HAK.Word.Files.saveBlob(new Blob(['test']),'original.xlsx'),'D:/Exports/renamed.xlsx');assert.deepEqual(saved,['D:/Exports/renamed.xlsx','History unavailable']);});
test('busy helper (409) is retried until it accepts the file instead of failing',async()=>{
 let calls=0;const notices=[];const window={HAK:{UI:{toast:(...x)=>notices.push(x)}}};
 const ctx={setTimeout:(f)=>setTimeout(f,0),clearTimeout,AbortController,window,console,Uint8Array,Blob,btoa,Error,fetch:async()=>{calls++;return calls<3?{ok:false,status:409,json:async()=>({error:'OCR is processing another document. Please wait.'})}:{ok:true,status:200,json:async()=>({path:'C:/x/a.docx',canceled:false})};}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../app/js/word.js'),'utf8'),ctx);
 assert.equal(await window.HAK.Word.Files.saveBlob(new Blob(['x']),'a.docx'),'C:/x/a.docx');assert.equal(calls,3);
});
test('network failure and oversized files give clear Vietnamese reasons',async()=>{
 const {files,notices}=setup(null,new TypeError('Failed to fetch'));assert.equal(await files.saveBlob(new Blob(['x']),'a.docx'),false);assert.match(notices[0][0],/không kết nối được trình hỗ trợ lưu tệp/);
 const big=setup({path:'x',canceled:false});assert.equal(await big.files.saveBlob(new Blob([new Uint8Array(28*1024*1024)]),'b.zip'),false);assert.equal(big.requests.length,0);assert.match(big.notices[0][0],/quá lớn/);
});

test('a visible hint tells the user a Windows Save dialog is opening (it may sit behind the browser)',async()=>{
 const {files,hints}=setup({path:'C:/x/a.docx',canceled:false});await files.saveBlob(new Blob(['x']),'a.docx');
 assert.equal(hints.length,1);assert.match(hints[0][0],/hộp Lưu của Windows/);assert.match(hints[0][0],/taskbar/);
});
