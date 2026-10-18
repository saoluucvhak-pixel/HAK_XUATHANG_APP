from pathlib import Path
import base64
root=Path(__file__).resolve().parents[1]
parts=[]
for p in sorted((root/'tools/vendor/xmldom').glob('*.js')):
 parts.append(repr(p.stem)+':function(module,exports,require){\n'+p.read_text(encoding='utf-8')+'\n}')
xml="(function(){var modules={"+','.join(parts)+"},cache={};function req(name){name=name.replace(/^\\.\\//,'');if(cache[name])return cache[name].exports;var module=cache[name]={exports:{}};modules[name](module,module.exports,req);return module.exports;}var dom=req('index');self.DOMParser=dom.DOMParser;self.XMLSerializer=dom.XMLSerializer;self.XMLDocument=dom.Document;})();\n"
source='var window=self;\n'+xml+(root/'app/libs/pizzip.min.js').read_text(encoding='utf-8')+'\n;'+(root/'app/libs/docxtemplater.min.js').read_text(encoding='utf-8')+'\n;'+(root/'app/workers/docx-handler.js').read_text(encoding='utf-8')
(root/'app/js/docx-worker-source.js').write_text("window.HAK=window.HAK||{};window.HAK.DocxWorkerSource='"+base64.b64encode(source.encode()).decode()+"';\n",encoding='utf-8')
