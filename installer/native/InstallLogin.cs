using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;
using System.Windows.Forms;

internal static class InstallLogin
{
    private const int Iterations = 210000;
    private const string Variable = "window.HAK_INSTALL_LOGIN = ";
    private const string FileName = "install-login.js";

    public static int Configure(string root)
    {
        using (var form = new Form())
        {
            form.Text = "HAK · Chọn chế độ sử dụng";
            form.StartPosition = FormStartPosition.CenterScreen;
            form.FormBorderStyle = FormBorderStyle.FixedDialog;
            form.MaximizeBox = false;
            form.MinimizeBox = false;
            form.TopMost = true;
            form.AutoScaleMode = AutoScaleMode.Dpi;
            form.AutoSize = true;
            form.AutoSizeMode = AutoSizeMode.GrowAndShrink;
            var fields = new TableLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, Padding = new Padding(14), ColumnCount = 2 };
            fields.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            fields.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 290));
            form.Controls.Add(fields);

            AddWide(fields, new Label { Text = "Chọn cách mở ứng dụng HAK trên máy này.", AutoSize = true });
            var skip = new Button { Text = "Bỏ qua · Một người sử dụng", AutoSize = true };
            AddWide(fields, skip);
            AddWide(fields, new Label { Text = "Hoặc tạo tài khoản để đăng nhập", AutoSize = true, Margin = new Padding(3, 12, 3, 5) });
            var name = AddInput(fields, "Họ tên", 80, false);
            var username = AddInput(fields, "Tên đăng nhập", 32, false);
            var password = AddInput(fields, "Mật khẩu (ít nhất 6 ký tự)", 256, true);
            var confirm = AddInput(fields, "Nhập lại mật khẩu", 256, true);
            var create = new Button { Text = "Tạo tài khoản", AutoSize = true };
            AddWide(fields, create);
            form.AcceptButton = create;

            skip.Click += delegate
            {
                try
                {
                    Write(root, new { v = 2, mode = "single", profileId = "local", users = new object[0] });
                    form.DialogResult = DialogResult.OK;
                }
                catch (Exception)
                {
                    ShowError(form, "Không lưu được chế độ sử dụng. Hãy thử lại.");
                }
            };
            create.Click += delegate
            {
                var displayName = name.Text.Trim();
                var login = username.Text.Trim().ToLowerInvariant();
                if (displayName.Length == 0 || !Regex.IsMatch(login, @"\A[a-z0-9._-]{2,32}\z"))
                {
                    ShowError(form, "Nhập họ tên và tên đăng nhập 2–32 ký tự (chữ không dấu, số hoặc dấu . _ -).");
                    return;
                }
                if (password.Text.Length < 6 || password.Text != confirm.Text)
                {
                    ShowError(form, "Mật khẩu phải có ít nhất 6 ký tự và hai lần nhập phải khớp.");
                    return;
                }
                try
                {
                    var id = "u" + Guid.NewGuid().ToString("N");
                    var stamp = Guid.NewGuid().ToString("N");
                    var verifier = VerifyWith(password.Text);
                    var code = Guid.NewGuid().ToString("N").Substring(0, 12).ToUpperInvariant();
                    var recovery = VerifyWith(code);
                    Write(root, new
                    {
                        v = 2,
                        mode = "account",
                        profileId = id,
                        users = new[] { new { id, username = login, name = displayName, stamp, verifier.alg, verifier.iter, verifier.salt, verifier.hash } },
                        rec = new { recovery.alg, recovery.iter, recovery.salt, recovery.hash }
                    });
                    password.Clear();
                    confirm.Clear();
                    ShowRecovery(form, Regex.Replace(code, @"(.{4})(?=.)", "$1-"));
                    form.DialogResult = DialogResult.OK;
                }
                catch (Exception)
                {
                    ShowError(form, "Không lưu được tài khoản. Hãy thử lại.");
                }
            };
            return form.ShowDialog() == DialogResult.OK ? 0 : 2;
        }
    }

    private static void AddWide(TableLayoutPanel layout, Control control)
    {
        layout.Controls.Add(control, 0, layout.RowCount++);
        layout.SetColumnSpan(control, layout.ColumnCount);
    }

    private static TextBox AddInput(TableLayoutPanel layout, string label, int length, bool password)
    {
        var row = layout.RowCount++;
        layout.Controls.Add(new Label { Text = label, AutoSize = true, Anchor = AnchorStyles.Left }, 0, row);
        var input = new TextBox { Dock = DockStyle.Top, AccessibleName = label, MaxLength = length, UseSystemPasswordChar = password };
        layout.Controls.Add(input, 1, row);
        return input;
    }

    private static void ShowError(Form form, string message)
    {
        MessageBox.Show(form, message, "HAK", MessageBoxButtons.OK, MessageBoxIcon.Warning);
    }

    private static void ShowRecovery(Form owner, string code)
    {
        using (var form = new Form())
        {
            form.Text = "HAK · Mã khôi phục";
            form.StartPosition = FormStartPosition.CenterParent;
            form.FormBorderStyle = FormBorderStyle.FixedDialog;
            form.MaximizeBox = false;
            form.MinimizeBox = false;
            form.ControlBox = false;
            form.AutoScaleMode = AutoScaleMode.Dpi;
            form.AutoSize = true;
            form.AutoSizeMode = AutoSizeMode.GrowAndShrink;
            var fields = new TableLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, Padding = new Padding(14), ColumnCount = 1 };
            form.Controls.Add(fields);
            AddWide(fields, new Label { Text = "Sao chép và cất mã để đặt lại mật khẩu khi cần.", AutoSize = true });
            AddWide(fields, new TextBox { Text = code, ReadOnly = true, Dock = DockStyle.Top, AccessibleName = "Mã khôi phục" });
            var next = new Button { Text = "Tôi đã cất mã · Tiếp tục", AutoSize = true, DialogResult = DialogResult.OK };
            AddWide(fields, next);
            form.AcceptButton = next;
            form.ShowDialog(owner);
        }
    }

    private sealed class Verifier
    {
        public string alg = "p2", salt, hash;
        public int iter = Iterations;
    }

    private static Verifier VerifyWith(string secret)
    {
        var salt = Guid.NewGuid().ToString("N");
        using (var derivation = new Rfc2898DeriveBytes(secret, Encoding.UTF8.GetBytes(salt), Iterations, HashAlgorithmName.SHA256))
        {
            var hash = BitConverter.ToString(derivation.GetBytes(32)).Replace("-", "").ToLowerInvariant();
            return new Verifier { salt = salt, hash = hash };
        }
    }

    private static void Write(string root, object state)
    {
        // This staging file carries only salted verifiers. The app clears it after committing its copy.
        var json = new JavaScriptSerializer().Serialize(new { id = Guid.NewGuid().ToString("N"), state });
        File.WriteAllText(Path.Combine(root, "js", FileName), Variable + json + ";", new UTF8Encoding(false));
    }

    public static bool Consume(string root, string id)
    {
        if (!Regex.IsMatch(id, @"\A[0-9a-f]{32}\z")) return false;
        var file = Path.Combine(root, "js", FileName);
        if (!File.Exists(file)) return false;
        var script = File.ReadAllText(file, Encoding.UTF8);
        if (script == Variable + "null;") return true;
        if (!script.StartsWith(Variable, StringComparison.Ordinal) || !script.EndsWith(";", StringComparison.Ordinal)) return false;
        var seed = new JavaScriptSerializer().DeserializeObject(script.Substring(Variable.Length, script.Length - Variable.Length - 1)) as System.Collections.Generic.Dictionary<string, object>;
        if (seed == null || !seed.ContainsKey("id") || !String.Equals(seed["id"] as string, id, StringComparison.Ordinal)) return false;
        var cleared = file + ".cleared";
        try
        {
            File.WriteAllText(cleared, Variable + "null;", new UTF8Encoding(false));
            File.Replace(cleared, file, null);
        }
        finally
        {
            if (File.Exists(cleared)) File.Delete(cleared);
        }
        return true;
    }
}
