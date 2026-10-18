using System;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Security.Cryptography;
using System.Diagnostics;
using System.Drawing;
using System.Windows.Forms;
using Microsoft.Win32;
using System.Collections.Generic;
[assembly: AssemblyTitle("HAK - Quản lý xuất hàng Setup")]
[assembly: AssemblyVersion("2.11.1.0")]
class HAKSetup : Form {
 const string ProductKey = @"Software\HAK\QuanLyXuatHang";
 const string UninstallKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\HAK_QuanLyXuatHang";
 const string PayloadHash = "614b4417c418265fedaeb7f836680038a284747e832ae190b641772cea446299";
 readonly Label info = new Label(); readonly Button install = new Button(); readonly CheckBox launch = new CheckBox();
 readonly string target; readonly bool uninstall;
 static string DefaultTarget() { using(var k=Registry.CurrentUser.OpenSubKey(ProductKey)) { var p=k==null?null:k.GetValue("InstallDir") as string; if(!String.IsNullOrWhiteSpace(p)) return Path.GetFullPath(p); } return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"HAK","QuanLyXuatHang"); }
 HAKSetup(bool removing) {
  uninstall=removing;target=DefaultTarget(); Text=removing?"Gỡ cài đặt HAK":"Cài đặt / Cập nhật HAK"; ClientSize=new Size(620,330); FormBorderStyle=FormBorderStyle.FixedDialog; MaximizeBox=false; StartPosition=FormStartPosition.CenterScreen; Font=new Font("Segoe UI",10); BackColor=Color.FromArgb(245,247,250);
  var title=new Label{Text="HAK · QUẢN LÝ XUẤT HÀNG",Font=new Font("Segoe UI",17,FontStyle.Bold),Location=new Point(24,22),Size=new Size(575,38)}; Controls.Add(title);
  info.Location=new Point(24,77);info.Size=new Size(570,163);info.Text=(removing?"Gỡ các tệp chương trình và lối tắt. Dữ liệu trong trình duyệt được giữ nguyên.":"Cài ứng dụng chạy offline bằng Chrome / Edge.\nSao lưu dữ liệu trong app trước khi cập nhật. Giữ đúng thư mục và trình duyệt đã dùng.")+"\n\nThư mục: "+target;Controls.Add(info);
  launch.Text="Mở ứng dụng sau khi cài";launch.Location=new Point(24,244);launch.Size=new Size(360,27);launch.Checked=true;launch.Visible=!removing;Controls.Add(launch);
  install.Text=removing?"Gỡ cài đặt":"Cài đặt / Cập nhật";install.Location=new Point(385,280);install.Size=new Size(210,34);install.Click+=Run;Controls.Add(install);
 }
 static string Hex(byte[] bytes) {using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();}
 static byte[] Payload() { using(var s=Assembly.GetExecutingAssembly().GetManifestResourceStream("HAK.Payload"))using(var m=new MemoryStream()){s.CopyTo(m);var a=m.ToArray();if(Hex(a)!=PayloadHash)throw new Exception("Gói cài đặt bị hỏng (checksum không khớp).");return a;} }
 static string SafePath(string root,string relative) {var full=Path.GetFullPath(Path.Combine(root,relative));if(!full.StartsWith(Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar)+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))throw new Exception("Đường dẫn trong gói cài không hợp lệ.");return full;}
 static void Extract(string root) {
  Directory.CreateDirectory(root);
  using(var m=new MemoryStream(Payload()))using(var zip=new ZipArchive(m,ZipArchiveMode.Read))foreach(var e in zip.Entries){if(String.IsNullOrEmpty(e.Name))continue;var p=SafePath(root,e.FullName);Directory.CreateDirectory(Path.GetDirectoryName(p));using(var input=e.Open())using(var output=File.Create(p))input.CopyTo(output);}
 }
 static List<string> Names() {var names=new List<string>();using(var m=new MemoryStream(Payload()))using(var z=new ZipArchive(m,ZipArchiveMode.Read))foreach(var e in z.Entries)if(!String.IsNullOrEmpty(e.Name))names.Add(e.FullName);return names;}
 static string ShortcutPath(bool desktop) {return Path.Combine(Environment.GetFolderPath(desktop?Environment.SpecialFolder.DesktopDirectory:Environment.SpecialFolder.Programs),desktop?"HAK - Quan ly xuat hang.lnk":@"HAK\Quan ly xuat hang.lnk");}
 static void Shortcut(string path,string root) {
  Directory.CreateDirectory(Path.GetDirectoryName(path));var type=Type.GetTypeFromProgID("WScript.Shell");dynamic shell=Activator.CreateInstance(type);dynamic link=shell.CreateShortcut(path);link.TargetPath=Path.Combine(root,"native","HAKDocs.exe");link.WorkingDirectory=root;link.IconLocation=Path.Combine(root,"app.ico")+",0";link.Save();
 }
 static void Register(string root) {
  using(var k=Registry.CurrentUser.CreateSubKey(ProductKey))k.SetValue("InstallDir",root);
  using(var k=Registry.CurrentUser.CreateSubKey(UninstallKey)) { k.SetValue("DisplayName","HAK - Quản lý xuất hàng");k.SetValue("DisplayVersion","2.11.1");k.SetValue("Publisher","HAK Group");k.SetValue("InstallLocation",root);k.SetValue("DisplayIcon",Path.Combine(root,"app.ico"));k.SetValue("UninstallString","\""+Path.Combine(root,"HAKSetup.exe")+"\" --uninstall");k.SetValue("NoModify",1,RegistryValueKind.DWord);k.SetValue("NoRepair",1,RegistryValueKind.DWord); }
 }
 void Run(object sender,EventArgs args) {
  if(uninstall && MessageBox.Show(this,"Gỡ ứng dụng HAK? Dữ liệu trình duyệt vẫn được giữ nguyên.","Xác nhận",MessageBoxButtons.YesNo,MessageBoxIcon.Question)!=DialogResult.Yes)return;
  install.Enabled=false; UseWaitCursor=true;
  var helper=Path.GetFullPath(Path.Combine(target,"native","HAKDocs.exe"));
  foreach(var process in Process.GetProcessesByName("HAKDocs")){try{if(String.Equals(Path.GetFullPath(process.MainModule.FileName),helper,StringComparison.OrdinalIgnoreCase)){process.Kill();process.WaitForExit(5000);}}catch{}finally{process.Dispose();}}
  try {
   if(uninstall) {foreach(var f in Names()){var p=SafePath(target,f);if(File.Exists(p))File.Delete(p);}foreach(var d in new[]{true,false}){var p=ShortcutPath(d);if(File.Exists(p))File.Delete(p);}Registry.CurrentUser.DeleteSubKeyTree(UninstallKey,false);Registry.CurrentUser.DeleteSubKeyTree(ProductKey,false);info.Text="Đã gỡ chương trình và lối tắt. Dữ liệu trình duyệt được giữ nguyên.\n\nTệp bộ cài HAKSetup.exe còn trong thư mục cũ có thể xóa sau khi đóng cửa sổ này."; }
   else {
    var stage=Path.Combine(Path.GetTempPath(),"HAK-stage-"+Guid.NewGuid().ToString("N"));var backup=Path.Combine(Path.GetTempPath(),"HAK-backup-"+Guid.NewGuid().ToString("N"));var changed=new List<string>();
    try {
     Extract(stage); Directory.CreateDirectory(target);
     // Back up replaced files for rollback; only touch paths listed in this payload.
     var files=Names();files.Add("HAKSetup.exe");
     foreach(var f in files){var dst=SafePath(target,f);if(File.Exists(dst)){var old=SafePath(backup,f);Directory.CreateDirectory(Path.GetDirectoryName(old));File.Copy(dst,old,true);}}
     try {
      foreach(var f in files){var dst=SafePath(target,f);Directory.CreateDirectory(Path.GetDirectoryName(dst));var src=f=="HAKSetup.exe"?Application.ExecutablePath:SafePath(stage,f);if(!String.Equals(Path.GetFullPath(src),dst,StringComparison.OrdinalIgnoreCase)){changed.Add(f);File.Copy(src,dst,true);}}
     }catch {foreach(var f in changed){var old=SafePath(backup,f);var dst=SafePath(target,f);if(File.Exists(old))File.Copy(old,dst,true);else if(File.Exists(dst))File.Delete(dst);}throw;}
     Shortcut(ShortcutPath(true),target);Shortcut(ShortcutPath(false),target);Register(target);
    } finally {if(Directory.Exists(stage))Directory.Delete(stage,true);if(Directory.Exists(backup))Directory.Delete(backup,true);}
    info.Text="Đã cài đặt thành công.\n\nThư mục: "+target+"\n\nĐã tạo lối tắt trên Desktop và Start Menu.";if(launch.Checked)Process.Start(new ProcessStartInfo(Path.Combine(target,"native","HAKDocs.exe")){UseShellExecute=true});
   }
   install.Text="Đóng"; install.Click-=Run;install.Click+=(s,e)=>Close();launch.Visible=false;
  } catch(Exception e) {MessageBox.Show(this,e.Message,"Chưa hoàn tất",MessageBoxButtons.OK,MessageBoxIcon.Error);}finally{UseWaitCursor=false;install.Enabled=true;}
 }
 [STAThread] static int Main(string[] args) {
  try { if(args.Length==2 && args[0]=="--verify") {var root=Path.GetFullPath(args[1]);Extract(root);Console.WriteLine("Payload SHA256 verified; extracted "+Names().Count+" files.");return 0;} Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);Application.Run(new HAKSetup(args.Length>0 && args[0]=="--uninstall"));return 0; }catch(Exception e){Console.Error.WriteLine(e.ToString());return 1;}
 }
}
