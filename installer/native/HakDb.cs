using System;
using System.IO;
using System.Text;
using System.Linq;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
/* HAKDB: lõi SQLite của HAKDocs. CÙNG hợp đồng với tools/hakdb/engine.cjs (bản tham chiếu Node, có bộ test) — sửa một nơi phải sửa nơi kia.
 * Gọi winsqlite3.dll (có sẵn trong Windows 10 1809+/11) bằng P/Invoke: không cần đóng gói DLL. Không có SQL từ trang web:
 * chỉ CRUD theo bảng / cột lấy từ schema (PRAGMA table_info), mọi giá trị là tham số. Tất cả thao tác chạy tuần tự dưới một khóa (một kết nối). */
class HakDbException : Exception {
 public string Code; public Dictionary<string,object> Extra=new Dictionary<string,object>();
 public HakDbException(string code,string message):base(message){Code=code;}
 public HakDbException With(string k,object v){Extra[k]=v;return this;}
}
static class Sqlite {
 const string Dll="winsqlite3.dll";
 public const int OK=0,ROW=100,DONE=101,OPEN_READWRITE=2,OPEN_CREATE=4,TRANSIENT=-1;
 [DllImport(Dll,CallingConvention=CallingConvention.Cdecl)] public static extern int sqlite3_open_v2(byte[] file,out IntPtr db,int flags,IntPtr vfs);
 [DllImport(Dll,CallingConvention=CallingConvention.Cdecl)] public static extern int sqlite3_close_v2(IntPtr db);
 [DllImport(Dll,CallingConvention=CallingConvention.Cdecl)] public static extern int sqlite3_prepare_v2(IntPtr db,byte[] sql,int n,out IntPtr stmt,IntPtr tail);
 [DllImport(Dll,CallingConvention=CallingConvention.Cdecl)] public static extern int sqlite3_step(IntPtr stmt);
 [DllImport(Dll,CallingConvention=CallingConvention.Cdecl)] public static extern int sqlite3_finalize(IntPtr stmt);
 [DllImport(Dll,CallingConvention=CallingConvention.Cdecl)] public static extern int sqlite3_bind_null(IntPtr stmt,int i);
 [DllImport(Dll,CallingConvention=CallingConvention.Cdecl)] public static extern int sqlite3_bind_int64(IntPtr stmt,int i,long v);
 [DllImport(Dll,CallingConvention=CallingConvention.Cdecl)] public static extern int sqlite3_bind_double(IntPtr stmt,int i,double v);
 [DllImport(Dll,CallingConvention=CallingConvention.Cdecl)] public static extern int sqlite3_bind_text(IntPtr stmt,int i,byte[] v,int n,IntPtr destructor);
 [DllImport(Dll,CallingConvention=CallingConvention.Cdecl)] public static extern int sqlite3_bind_blob(IntPtr stmt,int i,byte[] v,int n,IntPtr destructor);
 [DllImport(Dll,CallingConvention=CallingConvention.Cdecl)] public static extern int sqlite3_column_count(IntPtr stmt);
 [DllImport(Dll,CallingConvention=CallingConvention.Cdecl)] public static extern int sqlite3_column_type(IntPtr stmt,int i);
 [DllImport(Dll,CallingConvention=CallingConvention.Cdecl)] public static extern long sqlite3_column_int64(IntPtr stmt,int i);
 [DllImport(Dll,CallingConvention=CallingConvention.Cdecl)] public static extern double sqlite3_column_double(IntPtr stmt,int i);
 [DllImport(Dll,CallingConvention=CallingConvention.Cdecl)] public static extern IntPtr sqlite3_column_text(IntPtr stmt,int i);
 [DllImport(Dll,CallingConvention=CallingConvention.Cdecl)] public static extern IntPtr sqlite3_column_blob(IntPtr stmt,int i);
 [DllImport(Dll,CallingConvention=CallingConvention.Cdecl)] public static extern int sqlite3_column_bytes(IntPtr stmt,int i);
 [DllImport(Dll,CallingConvention=CallingConvention.Cdecl)] public static extern IntPtr sqlite3_column_name(IntPtr stmt,int i);
 [DllImport(Dll,CallingConvention=CallingConvention.Cdecl)] public static extern IntPtr sqlite3_errmsg(IntPtr db);
 [DllImport(Dll,CallingConvention=CallingConvention.Cdecl)] public static extern int sqlite3_changes(IntPtr db);
 [DllImport(Dll,CallingConvention=CallingConvention.Cdecl)] public static extern int sqlite3_busy_timeout(IntPtr db,int ms);
 [DllImport(Dll,CallingConvention=CallingConvention.Cdecl)] public static extern IntPtr sqlite3_libversion();
 public static byte[] U8(string s){return Encoding.UTF8.GetBytes(s+"\0");}
 public static string Str(IntPtr p){if(p==IntPtr.Zero)return null;int n=0;while(Marshal.ReadByte(p,n)!=0)n++;var b=new byte[n];Marshal.Copy(p,b,0,n);return Encoding.UTF8.GetString(b);}
}
class HakDb : IDisposable {
 const int Latest=1;
 public string File; IntPtr db=IntPtr.Zero; readonly object gate=new object();
 class Tbl { public List<string> Cols=new List<string>(); public Dictionary<string,string> Type=new Dictionary<string,string>(); public List<string> Pk=new List<string>(); public bool Rev,Company; public List<string> Blobs=new List<string>(); }
 Dictionary<string,Tbl> tables=new Dictionary<string,Tbl>();
 static readonly System.Text.RegularExpressions.Regex Ident=new System.Text.RegularExpressions.Regex("^[a-z_][a-z0-9_]*$");
 public static string LibVersion(){return Sqlite.Str(Sqlite.sqlite3_libversion());}
 public static HakDb Open(string file,string schemaSql){var h=new HakDb();h.File=file;Directory.CreateDirectory(Path.GetDirectoryName(file));h.OpenDb();h.Migrate(schemaSql);h.LoadMeta();return h;}
 void OpenDb(){
  if(Sqlite.sqlite3_open_v2(Sqlite.U8(File),out db,Sqlite.OPEN_READWRITE|Sqlite.OPEN_CREATE,IntPtr.Zero)!=Sqlite.OK)throw new HakDbException("io","Không mở được cơ sở dữ liệu: "+Err());
  Sqlite.sqlite3_busy_timeout(db,5000);
  // Khóa ngoại bật trên MỖI kết nối; WAL + synchronous=FULL (bền khi mất điện).
  Exec("PRAGMA foreign_keys=ON"); Exec("PRAGMA journal_mode=WAL"); Exec("PRAGMA synchronous=FULL"); Exec("PRAGMA trusted_schema=OFF");
  var v=LibVersion().Split('.'); if(Int32.Parse(v[0])<3||(Int32.Parse(v[0])==3&&Int32.Parse(v[1])<27))throw new HakDbException("io","SQLite của Windows quá cũ ("+LibVersion()+"); cần ≥ 3.27.");
 }
 string Err(){return Sqlite.Str(Sqlite.sqlite3_errmsg(db));}
 void Exec(string sql){var st=Prepare(sql);try{int rc;while((rc=Sqlite.sqlite3_step(st))==Sqlite.ROW){}if(rc!=Sqlite.DONE)throw Wrap(rc);}finally{Sqlite.sqlite3_finalize(st);}}
 IntPtr Prepare(string sql){IntPtr st;if(Sqlite.sqlite3_prepare_v2(db,Sqlite.U8(sql),-1,out st,IntPtr.Zero)!=Sqlite.OK)throw Wrap(1);return st;}
 Exception Wrap(int rc){var m=Err();
  if(m.IndexOf("FOREIGN KEY",StringComparison.OrdinalIgnoreCase)>=0)return new HakDbException("fk","Vi phạm khóa ngoại (bản ghi con trỏ tới cha không tồn tại hoặc cha còn con): "+m);
  if(m.IndexOf("UNIQUE",StringComparison.OrdinalIgnoreCase)>=0||m.IndexOf("PRIMARY KEY",StringComparison.OrdinalIgnoreCase)>=0)return new HakDbException("unique","Trùng khóa duy nhất: "+m);
  if(m.IndexOf("NOT NULL",StringComparison.OrdinalIgnoreCase)>=0)return new HakDbException("bad-request","Thiếu giá trị bắt buộc: "+m);
  if(m.IndexOf("chỉ được thêm",StringComparison.OrdinalIgnoreCase)>=0)return new HakDbException("bad-request",m);
  return new HakDbException("io",m);}
 void Bind(IntPtr st,int i,object v){
  if(v==null){Sqlite.sqlite3_bind_null(st,i);return;}
  if(v is bool){Sqlite.sqlite3_bind_int64(st,i,((bool)v)?1:0);return;}
  if(v is int){Sqlite.sqlite3_bind_int64(st,i,(int)v);return;}
  if(v is long){Sqlite.sqlite3_bind_int64(st,i,(long)v);return;}
  if(v is decimal||v is double||v is float){double d=Convert.ToDouble(v);if(Double.IsNaN(d)||Double.IsInfinity(d))throw new HakDbException("bad-request","Số không hợp lệ (NaN / Infinity)");
   if(d==Math.Floor(d)&&Math.Abs(d)<9007199254740992.0)Sqlite.sqlite3_bind_int64(st,i,(long)d);else Sqlite.sqlite3_bind_double(st,i,d);return;}
  if(v is string){var b=Encoding.UTF8.GetBytes((string)v);Sqlite.sqlite3_bind_text(st,i,b,b.Length,(IntPtr)Sqlite.TRANSIENT);return;}
  var dict=v as Dictionary<string,object>;
  if(dict!=null&&dict.ContainsKey("$b64")){var bytes=Convert.FromBase64String((string)dict["$b64"]);Sqlite.sqlite3_bind_blob(st,i,bytes,bytes.Length,(IntPtr)Sqlite.TRANSIENT);return;}
  throw new HakDbException("bad-request","Giá trị cột phải là số, chuỗi, null hoặc {$b64}");
 }
 object Col(IntPtr st,int i){
  switch(Sqlite.sqlite3_column_type(st,i)){
   case 1:return Sqlite.sqlite3_column_int64(st,i);
   case 2:return Sqlite.sqlite3_column_double(st,i);
   case 3:return Sqlite.Str(Sqlite.sqlite3_column_text(st,i));
   case 4:{int n=Sqlite.sqlite3_column_bytes(st,i);var b=new byte[n];if(n>0)Marshal.Copy(Sqlite.sqlite3_column_blob(st,i),b,0,n);return new Dictionary<string,object>{{"$b64",Convert.ToBase64String(b)}};}
   default:return null;}
 }
 List<Dictionary<string,object>> Rows(string sql,List<object> args){
  var st=Prepare(sql);var rows=new List<Dictionary<string,object>>();
  try{for(int i=0;i<args.Count;i++)Bind(st,i+1,args[i]);int rc;
   while((rc=Sqlite.sqlite3_step(st))==Sqlite.ROW){var r=new Dictionary<string,object>();int n=Sqlite.sqlite3_column_count(st);for(int c=0;c<n;c++)r[Sqlite.Str(Sqlite.sqlite3_column_name(st,c))]=Col(st,c);rows.Add(r);}
   if(rc!=Sqlite.DONE)throw Wrap(rc);}
  finally{Sqlite.sqlite3_finalize(st);}
  return rows;
 }
 long Run(string sql,List<object> args){
  var st=Prepare(sql);
  try{for(int i=0;i<args.Count;i++)Bind(st,i+1,args[i]);int rc=Sqlite.sqlite3_step(st);if(rc!=Sqlite.DONE&&rc!=Sqlite.ROW)throw Wrap(rc);return Sqlite.sqlite3_changes(db);}
  finally{Sqlite.sqlite3_finalize(st);}
 }
 void Migrate(string schemaSql){
  var has=Rows("SELECT 1 AS x FROM sqlite_master WHERE type='table' AND name='meta'",new List<object>());
  int cur=0;
  if(has.Count>0){var r=Rows("SELECT value FROM meta WHERE key='schema_version'",new List<object>());if(r.Count>0)cur=Int32.Parse((string)r[0]["value"]);}
  if(cur>Latest)throw new HakDbException("bad-request","Cơ sở dữ liệu thuộc phiên bản mới hơn ("+cur+" > "+Latest+"): hãy cập nhật ứng dụng.");
  if(cur<1){
   Exec("BEGIN IMMEDIATE");
   try{
    foreach(var stmt in SplitSql(schemaSql))Exec(stmt);
    Run("INSERT INTO meta(key,value) VALUES('schema_version',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",new List<object>{"1"});
    Run("INSERT OR IGNORE INTO meta(key,value) VALUES('created_at',?)",new List<object>{DateTime.UtcNow.ToString("o")});
    Exec("COMMIT");
   }catch{try{Exec("ROLLBACK");}catch{}throw;}
  }
 }
 /* Tách schema thành từng câu: tôn trọng khối BEGIN…END của trigger và chuỗi trong nháy đơn. */
 static List<string> SplitSql(string sql){
  var outList=new List<string>();var sb=new StringBuilder();bool q=false;int depth=0;
  var lines=sql.Replace("\r\n","\n").Split('\n');
  foreach(var raw in lines){
   var line=raw;int cmt=-1;bool inq=false;
   for(int i=0;i<line.Length;i++){if(line[i]=='\'')inq=!inq;else if(!inq&&line[i]=='-'&&i+1<line.Length&&line[i+1]=='-'){cmt=i;break;}}
   if(cmt>=0)line=line.Substring(0,cmt);
   if(line.Trim().Length==0)continue;
   var up=line.ToUpperInvariant();
   if(System.Text.RegularExpressions.Regex.IsMatch(up,@"\bCREATE\s+TRIGGER\b"))depth=1;
   sb.Append(line).Append('\n');
   foreach(char ch in line){if(ch=='\'')q=!q;}
   var t=line.TrimEnd();
   if(!q&&t.EndsWith(";")){
    if(depth==1){if(System.Text.RegularExpressions.Regex.IsMatch(up,@"\bEND\s*;\s*$")){depth=0;outList.Add(sb.ToString().Trim().TrimEnd(';'));sb.Clear();}}
    else{outList.Add(sb.ToString().Trim().TrimEnd(';'));sb.Clear();}
   }
  }
  if(sb.ToString().Trim().Length>0)outList.Add(sb.ToString().Trim().TrimEnd(';'));
  return outList;
 }
 void LoadMeta(){
  tables.Clear();
  foreach(var nm in Rows("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",new List<object>())){
   var name=(string)nm["name"];var t=new Tbl();
   var cols=Rows("PRAGMA table_info("+name+")",new List<object>());
   foreach(var c in cols){var cn=(string)c["name"];var ty=((string)c["type"]??"").ToUpperInvariant();t.Cols.Add(cn);t.Type[cn]=ty;if(ty=="BLOB")t.Blobs.Add(cn);if(cn=="rev")t.Rev=true;if(cn=="company_id")t.Company=true;}
   t.Pk=cols.Where(c=>Convert.ToInt64(c["pk"])>0).OrderBy(c=>Convert.ToInt64(c["pk"])).Select(c=>(string)c["name"]).ToList();
   tables[name]=t;
  }
 }
 Tbl Tb(string name){Tbl t;if(String.IsNullOrEmpty(name)||name=="meta"||!tables.TryGetValue(name,out t))throw new HakDbException("bad-request","Bảng không được phép: "+name);return t;}
 void ChkCol(Tbl t,string c,string table){if(!Ident.IsMatch(c)||!t.Cols.Contains(c))throw new HakDbException("bad-request","Cột không có trong "+table+": "+c);}
 public string Meta(string key){lock(gate){var r=Rows("SELECT value FROM meta WHERE key=?",new List<object>{key});return r.Count>0?(string)r[0]["value"]:null;}}
 public void SetMeta(string key,string value){lock(gate){Run("INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",new List<object>{key,value});}}
 /* Kích hoạt SQLite làm nguồn chính: chỉ khi toàn vẹn đạt, chưa kích hoạt và số bản ghi từng bảng khớp expected. */
 public Dictionary<string,object> Activate(Dictionary<string,object> expected){
  if(Meta("active_backend")=="sqlite")throw new HakDbException("bad-request","Cơ sở dữ liệu đã được kích hoạt");
  var chk=Check();if(!(bool)chk["ok"])throw new HakDbException("bad-request","Kiểm tra toàn vẹn chưa đạt, không kích hoạt");
  if(expected==null||expected.Count==0)throw new HakDbException("bad-request","Thiếu số bản ghi cần đối chiếu (expected)");
  var counts=Counts();var diff=new List<object>();
  foreach(var kv in expected){object a;bool has=counts.TryGetValue(kv.Key,out a);if(!has||Convert.ToInt64(a)!=Convert.ToInt64(kv.Value))diff.Add(new Dictionary<string,object>{{"table",kv.Key},{"expected",Convert.ToInt64(kv.Value)},{"actual",has?a:null}});}
  if(diff.Count>0)throw new HakDbException("bad-request","Số bản ghi không khớp nguồn, không kích hoạt").With("diff",diff);
  SetMeta("active_backend","sqlite");SetMeta("activated_at",DateTime.UtcNow.ToString("o"));
  return new Dictionary<string,object>{{"active",true},{"counts",counts}};
 }
 public Dictionary<string,object> Deactivate(){lock(gate){Run("DELETE FROM meta WHERE key='active_backend'",new List<object>());}SetMeta("deactivated_at",DateTime.UtcNow.ToString("o"));return new Dictionary<string,object>{{"active",false}};}
 public Dictionary<string,object> Reset(){
  if(Meta("active_backend")=="sqlite")throw new HakDbException("bad-request","Đang là nguồn chính, không được làm sạch. Hãy quay lui (deactivate) trước.");
  lock(gate){Exec("BEGIN IMMEDIATE");try{Exec("PRAGMA defer_foreign_keys=ON");foreach(var n in tables.Keys.ToList()){if(n=="meta"||n=="audit_log"||n=="sqlite_sequence")continue;Exec("DELETE FROM "+n);}Exec("COMMIT");}catch{try{Exec("ROLLBACK");}catch{}throw;}}
  return new Dictionary<string,object>{{"reset",true}};
 }
 public int SchemaVersion(){return Int32.Parse(Meta("schema_version"));}
 static Dictionary<string,object> D(object o){return o as Dictionary<string,object>;}
 static object[] A(object o){var arr=o as object[];if(arr!=null)return arr;var l=o as System.Collections.ArrayList;if(l!=null)return l.ToArray();return null;}
 bool InScope(Tbl t,Dictionary<string,object> row,List<string> scope){if(!t.Company||scope==null)return true;object c;if(!row.TryGetValue("company_id",out c)||c==null)return true;return scope.Contains(Convert.ToString(c));}
 Dictionary<string,object> KeyOf(Tbl t,string table,object key){
  var k=D(key);if(k==null){if(t.Pk.Count!=1)throw new HakDbException("bad-request","Thiếu khóa chính của "+table);k=new Dictionary<string,object>{{t.Pk[0],key}};}
  if(k.Count!=t.Pk.Count||!t.Pk.All(c=>k.ContainsKey(c)&&k[c]!=null))throw new HakDbException("bad-request","Thiếu khóa chính của "+table+" ("+String.Join(", ",t.Pk)+")");return k;}
 string KeySql(Tbl t){return String.Join(" AND ",t.Pk.Select(c=>c+"=?"));}
 List<object> KeyArgs(Tbl t,Dictionary<string,object> k){return t.Pk.Select(c=>k[c]).ToList();}
 long? CurRev(Tbl t,string table,Dictionary<string,object> k){var r=Rows("SELECT "+(t.Rev?"rev":"1 AS rev")+" FROM "+table+" WHERE "+KeySql(t),KeyArgs(t,k));return r.Count>0?(long?)Convert.ToInt64(r[0]["rev"]):null;}
 /* ifRev: ABSENT = không kiểm; null = phải chưa có; số = phải đúng phiên bản */
 Dictionary<string,object> OneOp(Dictionary<string,object> op,List<string> scope){
  var table=(string)op["table"];var t=Tb(table);var kind=(string)op["op"];
  bool hasIf=op.ContainsKey("ifRev");object ifRev=hasIf?op["ifRev"]:null;
  if(kind=="put"){
   var row=D(op["row"])??new Dictionary<string,object>();foreach(var c in row.Keys)ChkCol(t,c,table);
   foreach(var pk in t.Pk)if(!row.ContainsKey(pk)||row[pk]==null)throw new HakDbException("bad-request","Thiếu khóa chính "+pk+" của "+table);
   if(!InScope(t,row,scope))throw new HakDbException("scope","Ngoài phạm vi công ty được phép ("+table+")").With("table",table);
   var k=KeyOf(t,table,t.Pk.ToDictionary(c=>c,c=>row[c]));var cur=CurRev(t,table,k);
   if(t.Company&&cur!=null&&scope!=null){var old=Rows("SELECT company_id FROM "+table+" WHERE "+KeySql(t),KeyArgs(t,k));if(old.Count>0&&old[0]["company_id"]!=null&&!scope.Contains(Convert.ToString(old[0]["company_id"])))throw new HakDbException("scope","Bản ghi thuộc công ty ngoài phạm vi").With("table",table);}
   if(hasIf&&t.Rev){
    if(ifRev==null&&cur!=null)throw new HakDbException("conflict","Bản ghi đã tồn tại ("+table+")").With("table",table).With("key",row[t.Pk[0]]).With("expected",null).With("actual",cur);
    if(ifRev!=null&&(cur==null||cur.Value!=Convert.ToInt64(ifRev)))throw new HakDbException("conflict","Bản ghi đã đổi bởi nơi khác ("+table+")").With("table",table).With("key",row[t.Pk[0]]).With("expected",Convert.ToInt64(ifRev)).With("actual",cur);
   }
   var cols=row.Keys.Where(c=>c!="rev").ToList();
   if(cur==null){var ic=new List<string>(cols);var iv=cols.Select(c=>row[c]).ToList();if(t.Rev){ic.Add("rev");iv.Add(1L);}
    Run("INSERT INTO "+table+"("+String.Join(",",ic)+") VALUES("+String.Join(",",ic.Select(x=>"?"))+")",iv);
    return new Dictionary<string,object>{{"table",table},{"key",row[t.Pk[0]]},{"rev",t.Rev?(object)1L:null},{"created",true}};}
   var uc=cols.Where(c=>!t.Pk.Contains(c)).ToList();var sets=uc.Select(c=>c+"=?").ToList();var sv=uc.Select(c=>row[c]).ToList();if(t.Rev)sets.Add("rev=rev+1");
   if(sets.Count>0){sv.AddRange(KeyArgs(t,k));Run("UPDATE "+table+" SET "+String.Join(",",sets)+" WHERE "+KeySql(t),sv);}
   return new Dictionary<string,object>{{"table",table},{"key",row[t.Pk[0]]},{"rev",t.Rev?(object)(cur.Value+1):null},{"created",false}};
  }
  if(kind=="del"){
   string wsql;List<object> wargs;
   if(op.ContainsKey("key")){var k=KeyOf(t,table,op["key"]);wsql=KeySql(t);wargs=KeyArgs(t,k);
    if(hasIf&&t.Rev){var cur=CurRev(t,table,k);if(ifRev==null?cur!=null:(cur==null||cur.Value!=Convert.ToInt64(ifRev)))throw new HakDbException("conflict","Bản ghi đã đổi bởi nơi khác ("+table+")").With("table",table).With("actual",cur);}}
   else{var w=Where(t,table,D(op.ContainsKey("where")?op["where"]:null)??new Dictionary<string,object>());if(w.Item1.Length==0)throw new HakDbException("bad-request","Xóa theo điều kiện cần where không rỗng");wsql=w.Item1;wargs=w.Item2;}
   if(t.Company&&scope!=null){var a=new List<object>(wargs);a.AddRange(scope.Cast<object>());var bad=Rows("SELECT COUNT(*) AS n FROM "+table+" WHERE ("+wsql+") AND company_id IS NOT NULL AND company_id NOT IN ("+(scope.Count>0?String.Join(",",scope.Select(x=>"?")):"''")+")",a);if(Convert.ToInt64(bad[0]["n"])>0)throw new HakDbException("scope","Có bản ghi ngoài phạm vi công ty được phép").With("table",table);}
   return new Dictionary<string,object>{{"table",table},{"deleted",Run("DELETE FROM "+table+" WHERE "+wsql,wargs)}};
  }
  if(kind=="append"){
   if(table!="audit_log")throw new HakDbException("bad-request","append chỉ dùng cho audit_log");
   var arow=D(op["row"])??new Dictionary<string,object>();foreach(var c in arow.Keys)ChkCol(t,c,table);
   if(arow.ContainsKey("seq"))throw new HakDbException("bad-request","Không được tự đặt seq của nhật ký");
   if(!InScope(t,arow,scope))throw new HakDbException("scope","Ngoài phạm vi công ty được phép ("+table+")").With("table",table);
   var acols=arow.Keys.ToList();Run("INSERT INTO "+table+"("+String.Join(",",acols)+") VALUES("+String.Join(",",acols.Select(x=>"?"))+")",acols.Select(x=>arow[x]).ToList());
   var seqRows=Rows("SELECT last_insert_rowid() AS s",new List<object>());
   return new Dictionary<string,object>{{"table",table},{"seq",Convert.ToInt64(seqRows[0]["s"])}};
  }
  if(kind=="clear"){
   if(!(op.ContainsKey("confirm")&&op["confirm"] is bool&&(bool)op["confirm"]))throw new HakDbException("bad-request","Xóa toàn bảng cần confirm:true");
   if(table=="audit_log"||table=="quarantine")throw new HakDbException("bad-request","Bảng "+table+" không được xóa toàn bộ");
   if(t.Company&&scope!=null)throw new HakDbException("scope","Tài khoản giới hạn công ty không được xóa toàn bảng "+table);
   return new Dictionary<string,object>{{"table",table},{"deleted",Run("DELETE FROM "+table,new List<object>())}};
  }
  if(kind=="guard"){var k=KeyOf(t,table,op["key"]);var cur=CurRev(t,table,k);
   if(ifRev==null?cur!=null:(cur==null||cur.Value!=Convert.ToInt64(ifRev)))throw new HakDbException("conflict","Bản ghi đã đổi bởi nơi khác ("+table+")").With("table",table).With("key",op["key"]).With("expected",ifRev).With("actual",cur);
   return new Dictionary<string,object>{{"table",table},{"rev",cur}};}
  throw new HakDbException("bad-request","Thao tác không hỗ trợ: "+kind);
 }
 public List<Dictionary<string,object>> Tx(object opsObj,List<string> scope){
  var ops=A(opsObj);if(ops==null||ops.Length==0)throw new HakDbException("bad-request","ops phải là mảng không rỗng");if(ops.Length>20000)throw new HakDbException("bad-request","Quá nhiều thao tác trong một giao dịch");
  lock(gate){
   Exec("BEGIN IMMEDIATE");var res=new List<Dictionary<string,object>>();
   try{for(int i=0;i<ops.Length;i++){try{res.Add(OneOp(D(ops[i]),scope));}catch(HakDbException e){e.With("opIndex",i);throw;}}Exec("COMMIT");return res;}
   catch{try{Exec("ROLLBACK");}catch{}throw;}
  }
 }
 Tuple<string,List<object>> Where(Tbl t,string table,Dictionary<string,object> where){
  var parts=new List<string>();var args=new List<object>();
  foreach(var kv in where){ChkCol(t,kv.Key,table);var cond=kv.Value;var cd=D(cond);
   if(cond!=null&&cd!=null&&!cd.ContainsKey("$b64")){
    foreach(var o in cd){
     if(o.Key=="in"){var arr=A(o.Value);if(arr==null||arr.Length==0)throw new HakDbException("bad-request","in cần mảng không rỗng");parts.Add(kv.Key+" IN ("+String.Join(",",arr.Select(x=>"?"))+")");args.AddRange(arr);}
     else{string sym;switch(o.Key){case "gt":sym=">";break;case "gte":sym=">=";break;case "lt":sym="<";break;case "lte":sym="<=";break;case "ne":sym="<>";break;default:throw new HakDbException("bad-request","Toán tử không hỗ trợ: "+o.Key);}parts.Add(kv.Key+sym+"?");args.Add(o.Value);}
    }
   }else if(cond==null)parts.Add(kv.Key+" IS NULL");else{parts.Add(kv.Key+"=?");args.Add(cond);}
  }
  return Tuple.Create(String.Join(" AND ",parts),args);
 }
 public Dictionary<string,object> Query(Dictionary<string,object> q,List<string> scope){
  var table=(string)q["table"];var t=Tb(table);
  List<string> wanted;if(q.ContainsKey("cols")&&q["cols"]!=null)wanted=A(q["cols"]).Select(x=>(string)x).ToList();else wanted=t.Cols.Where(c=>!t.Blobs.Contains(c)).ToList();
  foreach(var c in wanted)ChkCol(t,c,table);
  var w=Where(t,table,D(q.ContainsKey("where")?q["where"]:null)??new Dictionary<string,object>());
  var args=new List<object>(w.Item2);var conds=new List<string>();if(w.Item1.Length>0)conds.Add(w.Item1);
  if(t.Company&&scope!=null){conds.Add("(company_id IS NULL OR company_id IN ("+(scope.Count>0?String.Join(",",scope.Select(x=>"?")):"''")+"))");args.AddRange(scope.Cast<object>());}
  var from=" FROM "+table+(conds.Count>0?" WHERE "+String.Join(" AND ",conds):"");
  var outD=new Dictionary<string,object>();
  lock(gate){
   if(q.ContainsKey("count")&&q["count"] is bool&&(bool)q["count"])outD["total"]=Convert.ToInt64(Rows("SELECT COUNT(*) AS n"+from,args)[0]["n"]);
   var sel="SELECT "+String.Join(",",wanted)+from;
   if(q.ContainsKey("order")&&q["order"]!=null)sel+=" ORDER BY "+String.Join(",",A(q["order"]).Select(o=>{var p=A(o);var c=(string)p[0];ChkCol(t,c,table);return c+(p.Length>1&&String.Equals(Convert.ToString(p[1]),"desc",StringComparison.OrdinalIgnoreCase)?" DESC":" ASC");}));
   long lim=q.ContainsKey("limit")&&q["limit"]!=null?Math.Min(Convert.ToInt64(q["limit"]),200000):50000;sel+=" LIMIT "+lim;
   if(q.ContainsKey("offset")&&q["offset"]!=null&&Convert.ToInt64(q["offset"])>0)sel+=" OFFSET "+Convert.ToInt64(q["offset"]);
   outD["rows"]=Rows(sel,args);
  }
  return outD;
 }
 public Dictionary<string,object> Counts(){lock(gate){var o=new Dictionary<string,object>();foreach(var n in tables.Keys)o[n]=Convert.ToInt64(Rows("SELECT COUNT(*) AS n FROM "+n,new List<object>())[0]["n"]);return o;}}
 public Dictionary<string,object> Check(){lock(gate){
  var ic=Rows("PRAGMA integrity_check",new List<object>()).Select(r=>Convert.ToString(r.Values.First())).ToList();var fk=Rows("PRAGMA foreign_key_check",new List<object>());
  return new Dictionary<string,object>{{"ok",ic.Count==1&&ic[0]=="ok"&&fk.Count==0},{"integrity",ic},{"foreignKeys",fk},{"schema",SchemaVersion()}};}}
 /* Bản sao nhất quán: VACUUM INTO tệp .part rồi đổi tên; đích phải CHƯA tồn tại. */
 public Dictionary<string,object> Backup(string dest){
  if(System.IO.File.Exists(dest))throw new HakDbException("bad-request","Tệp đích đã tồn tại: "+dest);
  Directory.CreateDirectory(Path.GetDirectoryName(dest));var tmp=dest+".part";
  lock(gate){try{if(System.IO.File.Exists(tmp))System.IO.File.Delete(tmp);Run("VACUUM INTO ?",new List<object>{tmp});System.IO.File.Move(tmp,dest);}
   catch(HakDbException){try{System.IO.File.Delete(tmp);}catch{}throw;}
   catch(Exception e){try{System.IO.File.Delete(tmp);}catch{}throw new HakDbException("io","Sao lưu thất bại: "+e.Message);}}
  string sha;using(var s=System.IO.File.OpenRead(dest))using(var h=SHA256.Create())sha=BitConverter.ToString(h.ComputeHash(s)).Replace("-","").ToLowerInvariant();
  return new Dictionary<string,object>{{"path",dest},{"sha256",sha},{"size",new FileInfo(dest).Length},{"schema",SchemaVersion()}};
 }
 public void Dispose(){lock(gate){if(db!=IntPtr.Zero){Sqlite.sqlite3_close_v2(db);db=IntPtr.Zero;}}}
}
