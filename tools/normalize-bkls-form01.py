from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
from lxml import etree as E
import base64,json,sys
if len(sys.argv)!=3:raise SystemExit('Usage: normalize-bkls-form01.py reference.docx output.js')
src=Path(sys.argv[1]);destination=Path(sys.argv[2])
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'};W='{'+ns['w']+'}'
def ensure(parent,name):
 n=parent.find('w:'+name,ns)
 if n is None:n=E.SubElement(parent,W+name)
 return n
def font(rp,size=23):
 f=ensure(rp,'rFonts');f.attrib.clear()
 for k in ['ascii','hAnsi','eastAsia','cs']:f.set(W+k,'Times New Roman')
 for k in ['sz','szCs']:ensure(rp,k).set(W+'val',str(size))
 for k in ['spacing','position','w','fitText']:
  for n in rp.findall('w:'+k,ns):rp.remove(n)
with ZipFile(src) as z:parts={n:z.read(n) for n in z.namelist()}
d=E.fromstring(parts['word/document.xml']);styles=E.fromstring(parts['word/styles.xml'])
for section in d.findall('.//w:sectPr',ns):
 size=ensure(section,'pgSz');size.attrib.clear();size.set(W+'w','11907');size.set(W+'h','16840');size.set(W+'code','9')
 margin=ensure(section,'pgMar')
 for k,v in {'top':1134,'right':1134,'bottom':1134,'left':1701,'header':720,'footer':720,'gutter':0}.items():margin.set(W+k,str(v))
for rp in d.findall('.//w:rPr',ns):font(rp)
for p in d.findall('.//w:p',ns):
 pp=ensure(p,'pPr');sp=ensure(pp,'spacing')
 for k,v in {'before':'0','after':'0','line':'240','lineRule':'auto'}.items():sp.set(W+k,v)
 for k in ['beforeAutospacing','afterAutospacing','beforeLines','afterLines']:sp.attrib.pop(W+k,None)
 font(ensure(pp,'rPr'))
 t=''.join(p.xpath('.//w:t/text()',namespaces=ns)).strip()
 if t in ['BẢNG KÊ LÂM SẢN','BẢNG KÊ CHI TIẾT']:
  ensure(pp,'jc').set(W+'val','center')
  for rp in p.findall('.//w:rPr',ns):font(rp,26)
 # Remove the sample QR picture, not a real generated QR; keep every declaration and note.
 for drawing in p.findall('.//w:drawing',ns):
  if drawing.xpath('.//*[local-name()="blip"]') and not drawing.xpath('.//w:t',namespaces=ns):drawing.getparent().remove(drawing)
 if t=='BẢNG KÊ CHI TIẾT':ensure(pp,'pageBreakBefore')
 if t=='BẢNG KÊ CHI TIẾT' or t.startswith('(Kèm theo Bảng kê') or any(t.startswith(str(i)+'. Thông tin chi tiết') for i in range(1,6)):ensure(pp,'keepNext')
for table in d.findall('.//w:tbl',ns):
 rows=table.findall('w:tr',ns)
 for index,row in enumerate(rows):
  ensure(ensure(row,'trPr'),'cantSplit')
  for p in row.findall('.//w:p',ns):
   pp=ensure(p,'pPr')
   if index<len(rows)-1:ensure(pp,'keepNext')
   else:
    for keep in pp.findall('w:keepNext',ns):pp.remove(keep)
 if len(rows)>3:
  first=''.join(rows[0].xpath('.//w:t/text()',namespaces=ns))
  if 'TT' in first:
   ensure(ensure(rows[0],'trPr'),'tblHeader')
   if not ''.join(rows[1].xpath('.//w:t/text()',namespaces=ns)).strip().startswith('1'):ensure(ensure(rows[1],'trPr'),'tblHeader')
 grid=table.find('w:tblGrid',ns)
 if grid is None:continue
 cols=grid.findall('w:gridCol',ns);total=sum(int(x.get(W+'w','0')) for x in cols)
 if total<=0:continue
 factor=9072/total
 for col in cols:col.set(W+'w',str(round(int(col.get(W+'w','0'))*factor)))
 for cell in table.findall('w:tr/w:tc',ns):
  tcw=cell.find('w:tcPr/w:tcW',ns)
  if tcw is not None and tcw.get(W+'type')=='dxa':tcw.set(W+'w',str(round(int(tcw.get(W+'w','0'))*factor)))
 tw=ensure(ensure(table,'tblPr'),'tblW');tw.set(W+'w','9072');tw.set(W+'type','dxa')
for rp in styles.findall('.//w:rPr',ns):font(rp)
defaults=ensure(styles,'docDefaults');font(ensure(ensure(defaults,'rPrDefault'),'rPr'))
pp=ensure(ensure(defaults,'pPrDefault'),'pPr');sp=ensure(pp,'spacing')
for k,v in {'before':'0','after':'0','line':'240','lineRule':'auto'}.items():sp.set(W+k,v)
parts['word/document.xml']=E.tostring(d,encoding='UTF-8',xml_declaration=True,standalone=True)
parts['word/styles.xml']=E.tostring(styles,encoding='UTF-8',xml_declaration=True,standalone=True)
# If a fallback alternate drawing exists, it is the same illustrative sample QR.
for n in d.xpath('//*[local-name()="pict"]'):
 if n.xpath('.//*[local-name()="imagedata"]') and not n.xpath('.//w:t',namespaces=ns):n.getparent().remove(n)
parts['word/document.xml']=E.tostring(d,encoding='UTF-8',xml_declaration=True,standalone=True)
from io import BytesIO
buffer=BytesIO()
with ZipFile(buffer,'w',ZIP_DEFLATED) as z:
 for n,b in parts.items():z.writestr(n,b)
destination.write_text("window.HAK=window.HAK||{};window.HAK.BklsForm01="+json.dumps(base64.b64encode(buffer.getvalue()).decode())+';\n',encoding='utf-8')
print('HAK A4 profile written; reference left unchanged.')
