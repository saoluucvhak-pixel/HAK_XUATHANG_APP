from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
from lxml import etree as E
from io import BytesIO
import base64,json,re,sys
p=Path(sys.argv[1]) if len(sys.argv)>1 else Path('app/js/bkls-form01.js');data=base64.b64decode(re.search(r'="(.*)";',p.read_text(encoding='utf-8')).group(1));z=ZipFile(BytesIO(data));parts={n:z.read(n) for n in z.namelist()}
W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';ns={'w':W};d=E.fromstring(parts['word/document.xml']);assets=(Path(sys.argv[2]) if len(sys.argv)>2 else Path('app/js/bkls-assets.js')).read_text(encoding='utf-8');m=re.search(r'qr\s*:\s*"(?:data:image/jpeg;base64,)?([A-Za-z0-9+/=]+)"',assets)
if not m:
 m=re.search(r"qr\s*:\s*'(?:data:image/jpeg;base64,)?([A-Za-z0-9+/=]+)'",assets)
if not m:raise Exception('QR asset not found')
if b'rIdHAKQR' in parts['word/document.xml']:raise SystemExit('Current QR is already present; nothing changed.')
parts['word/media/hak-current-qr.jpeg']=base64.b64decode(m.group(1));rel=E.fromstring(parts['word/_rels/document.xml.rels']);E.SubElement(rel,'{http://schemas.openxmlformats.org/package/2006/relationships}Relationship',Id='rIdHAKQR',Type=R+'/image',Target='media/hak-current-qr.jpeg');parts['word/_rels/document.xml.rels']=E.tostring(rel,encoding='UTF-8',xml_declaration=True)
# Put the current QR in the upper right header cell; inline avoids floating-image overlap.
cell=d.find('.//w:tbl/w:tr/w:tc[2]',ns)
q=E.fromstring('''<w:p xmlns:w="'''+W+'''" xmlns:r="'''+R+'''" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="right"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="540000" cy="540000"/><wp:docPr id="8901" name="Mã QR theo mẫu HAK hiện hành"/><wp:cNvGraphicFramePr/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="8901" name="HAK QR"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdHAKQR"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="540000" cy="540000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>''');cell.append(q)
parts['word/document.xml']=E.tostring(d,encoding='UTF-8',xml_declaration=True,standalone=True)
ct=E.fromstring(parts['[Content_Types].xml']);C='{http://schemas.openxmlformats.org/package/2006/content-types}'
if not any(n.get('Extension')=='jpeg' for n in ct):E.SubElement(ct,C+'Default',Extension='jpeg',ContentType='image/jpeg')
parts['[Content_Types].xml']=E.tostring(ct,encoding='UTF-8',xml_declaration=True)
b=BytesIO()
with ZipFile(b,'w',ZIP_DEFLATED) as out:
 for n,v in parts.items():out.writestr(n,v)
p.write_text('window.HAK=window.HAK||{};window.HAK.BklsForm01='+json.dumps(base64.b64encode(b.getvalue()).decode())+';\n',encoding='utf-8')
print('Restored current HAK QR in top right header')
