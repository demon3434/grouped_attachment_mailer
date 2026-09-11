/*
 * 多部门点对点一键发送邮件启动器 (launcher.cs)
 *
 * 功能：
 *   1. 启动 runtime/node.exe lib/server.js
 *   2. 轮询等待服务器就绪，自动打开浏览器
 *   3. 系统托盘显示图标，右键菜单：打开网页 / 启停服务 / 退出
 *   4. 系统托盘图标随服务状态切换（启用/停止两套 ico）
 *   5. 关闭服务、退出程序时自动终止 node 进程，释放端口
 *
 * 编译（Win7/Win10 .NET Framework 4.0）：
 *   C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe
 *     /target:winexe /platform:x86
 *     /reference:System.Windows.Forms.dll
 *     /reference:System.Drawing.dll
 *     /win32icon:"icons/图标(服务已启用).ico"
 *     /out:多部门点对点一键发送邮件.exe launcher.cs
 */

using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

class Launcher
{
    // ====== Win32 API ======
    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    static extern int MessageBox(IntPtr hWnd, string text, string caption, uint type);

    const uint MB_ICONERROR = 0x10;
    const uint MB_OK = 0x0;
    const uint MB_ICONINFORMATION = 0x40;
    const uint MB_ICONQUESTION = 0x20;
    const uint MB_YESNO = 0x4;

    // ====== 状态 ======
    static string ExeDir
    {
        get { return Path.GetDirectoryName(Process.GetCurrentProcess().MainModule.FileName); }
    }

    /// <summary>
    /// 从 conf.json 读取端口配置，找不到则回退 8460。
    /// </summary>
    static int ReadConfigPort()
    {
        try
        {
            string confPath = Path.Combine(ExeDir, "conf.json");
            if (!File.Exists(confPath)) return 8460;
            string json = File.ReadAllText(confPath, System.Text.Encoding.UTF8);
            System.Text.RegularExpressions.Match m =
                System.Text.RegularExpressions.Regex.Match(json, @"""port""\s*:\s*(\d+)");
            if (m.Success) return int.Parse(m.Groups[1].Value);
        }
        catch { }
        return 8460;
    }

    static Process nodeProc = null;
    static int serverPort = -1;
    static bool serverRunning = false;
    static bool isOurProcess = false;  // 服务是否由本启动器启动
    static NotifyIcon trayIcon;
    static ContextMenuStrip trayMenu;
    static ToolStripMenuItem miOpen;
    static ToolStripMenuItem miToggle;
    static ToolStripMenuItem miExit;

    // 图标文件路径（与 exe 同目录）
    static string iconOn;
    static string iconOff;

    // 托盘菜单彩色图标（GDI+ 手绘）
    static Bitmap iconBmpOpen;   // 蓝色地球
    static Bitmap iconBmpStart;  // 绿色播放
    static Bitmap iconBmpStop;   // 红色停止
    static Bitmap iconBmpExit;   // 红色叉

    // Mutex 用于防止重复打开
    static Mutex mutex;

    [STAThread]
    static int Main(string[] args)
    {
        // 图标文件路径（exe 同级 icons 子目录）
        iconOn = Path.Combine(ExeDir, "icons", "图标(服务已启用).ico");
        iconOff = Path.Combine(ExeDir, "icons", "图标(服务已停止).ico");

        // 尝试获取 Mutex，判断启动器是否已在运行
        bool createdNew;
        mutex = new Mutex(true, "多部门点对点一键发送邮件_SingleInstance", out createdNew);

        // 先检测端口是否已有服务在运行
        int existingPort = DetectExistingServer();

        if (existingPort > 0)
        {
            // 服务已开启，无论启动器是否在运行都打开浏览器
            OpenBrowser(existingPort);

            if (!createdNew)
            {
                // 启动器已在运行，打开浏览器后直接退出
                return 0;
            }

            // 启动器没在运行，接管已有服务并显示托盘图标
            serverPort = existingPort;
            serverRunning = true;
            isOurProcess = false;

            CreateTrayIcon();
            UpdateTray("多部门点对点一键发送邮件 (端口 " + existingPort + ")", true, true);

            Thread watcher = new Thread(ServerWatcher);
            watcher.IsBackground = true;
            watcher.Start();
        }
        else
        {
            // 服务没开启，必须启动服务
            if (!createdNew)
            {
                // 启动器已在运行，第二个实例启动服务后退出
                StartServerAndWait();
                return 0;
            }

            // 启动器没在运行，正常启动
            isOurProcess = true;
            Thread starter = new Thread(StartServer);
            starter.IsBackground = true;
            starter.Start();

            CreateTrayIcon();

            Thread watcher = new Thread(ServerWatcher);
            watcher.IsBackground = true;
            watcher.Start();
        }

        // 消息循环（WinForms）
        Application.Run();
        return 0;
    }

    /// <summary>
    /// 检测 conf.json 配置的端口上是否已有服务在运行。
    /// </summary>
    static int DetectExistingServer()
    {
        int port = ReadConfigPort();
        if (IsHealthOk(port)) return port;
        return -1;
    }

    /// <summary>
    /// 无任务栏图标的 ContextMenuStrip
    /// 添加 WS_EX_TOOLWINDOW 扩展样式，防止在无主窗体时在任务栏出现图标
    /// </summary>
    class NoTaskbarContextMenuStrip : ContextMenuStrip
    {
        protected override CreateParams CreateParams
        {
            get
            {
                CreateParams cp = base.CreateParams;
                cp.ExStyle |= 0x00000080; // WS_EX_TOOLWINDOW
                return cp;
            }
        }
    }

    // ====== 托盘 ======
    static void CreateTrayIcon()
    {
        trayMenu = new NoTaskbarContextMenuStrip();
        // 自定义渲染：大字号、充足内边距、彩色图标+文字垂直居中
        trayMenu.Renderer = new ModernTrayRenderer();
        trayMenu.ShowImageMargin = true;
        trayMenu.ImageScalingSize = new Size(24, 24);
        trayMenu.Font = new Font("Microsoft YaHei UI", 11F);

        // 生成 GDI+ 手绘彩色图标
        iconBmpOpen = DrawGlobeIcon(24);
        iconBmpStart = DrawPlayIcon(24);
        iconBmpStop = DrawStopIcon(24);
        iconBmpExit = DrawExitIcon(24);

        miOpen = CreateMenuItem("打开网页", new Padding(4, 10, 16, 10));
        miOpen.Image = iconBmpOpen;
        miOpen.Click += delegate { OpenBrowser(); };

        miToggle = CreateMenuItem("停止服务", new Padding(4, 10, 16, 10));
        miToggle.Image = iconBmpStop;
        miToggle.Click += delegate { ToggleServer(); };

        var sep = new ToolStripSeparator();
        sep.Margin = new Padding(0, 4, 0, 4);

        miExit = CreateMenuItem("退出", new Padding(4, 10, 16, 10));
        miExit.Image = iconBmpExit;
        miExit.Click += delegate { ExitApp(); };

        trayMenu.Items.Add(miOpen);
        trayMenu.Items.Add(miToggle);
        trayMenu.Items.Add(sep);
        trayMenu.Items.Add(miExit);

        trayIcon = new NotifyIcon();
        trayIcon.Icon = LoadIcon(false);
        trayIcon.Text = "多部门点对点一键发送邮件";
        trayIcon.ContextMenuStrip = trayMenu;
        trayIcon.Visible = true;
        trayIcon.MouseClick += (sender, e) => {
            if (e.Button == MouseButtons.Left)
            {
                typeof(NotifyIcon).GetMethod("ShowContextMenu",
                    System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic)
                    .Invoke(trayIcon, null);
            }
        };
    }

    static ToolStripMenuItem CreateMenuItem(string text, Padding padding)
    {
        var item = new ToolStripMenuItem();
        item.Text = text;
        item.Padding = padding;
        return item;
    }

    /// <summary>
    /// 自定义菜单渲染器：文字垂直居中、浅色高亮、现代风格。
    /// </summary>
    class ModernTrayRenderer : ToolStripProfessionalRenderer
    {
        public ModernTrayRenderer() : base(new ModernTrayColors()) { }

        protected override void OnRenderMenuItemBackground(ToolStripItemRenderEventArgs e)
        {
            var item = e.Item;
            var g = e.Graphics;
            var rect = new Rectangle(2, 0, item.Width - 4, item.Height - 1);

            if (item.Selected)
            {
                using (var brush = new SolidBrush(Color.FromArgb(230, 240, 255)))
                using (var pen = new Pen(Color.FromArgb(100, 160, 220)))
                {
                    g.FillRectangle(brush, rect);
                    g.DrawRectangle(pen, rect);
                }
            }
            else
            {
                g.Clear(Color.White);
            }
        }

        protected override void OnRenderItemImage(ToolStripItemImageRenderEventArgs e)
        {
            // 居中绘制图标在 image margin 区域内
            if (e.Image == null) return;
            var rect = e.ImageRectangle;
            if (rect.IsEmpty || rect.Width == 0 || rect.Height == 0) return;
            e.Graphics.DrawImage(e.Image, rect);
        }

        protected override void OnRenderItemText(ToolStripItemTextRenderEventArgs e)
        {
            // 文字垂直居中：使用完整 item 高度而非系统给的 TextRectangle
            var g = e.Graphics;
            var font = e.Item.Font ?? trayMenu.Font;
            var rect = new Rectangle(e.TextRectangle.X, 0, e.TextRectangle.Width, e.Item.Height);
            var sf = new StringFormat
            {
                Alignment = StringAlignment.Near,
                LineAlignment = StringAlignment.Center,
                FormatFlags = StringFormatFlags.NoWrap
            };
            var color = e.Item.Selected ? Color.FromArgb(30, 80, 160) : Color.FromArgb(50, 50, 50);
            using (var brush = new SolidBrush(color))
            {
                g.DrawString(e.Text, font, brush, rect, sf);
            }
        }

        protected override void OnRenderSeparator(ToolStripSeparatorRenderEventArgs e)
        {
            var g = e.Graphics;
            var rect = e.Item.ContentRectangle;
            using (var pen = new Pen(Color.FromArgb(220, 220, 220)))
            {
                int y = rect.Y + rect.Height / 2;
                g.DrawLine(pen, rect.Left, y, rect.Right, y);
            }
        }
    }

    class ModernTrayColors : ProfessionalColorTable
    {
        public override Color MenuBorder { get { return Color.FromArgb(200, 200, 200); } }
        public override Color MenuItemBorder { get { return Color.FromArgb(100, 160, 220); } }
        public override Color MenuItemSelected { get { return Color.FromArgb(230, 240, 255); } }
        public override Color MenuStripGradientBegin { get { return Color.White; } }
        public override Color MenuStripGradientEnd { get { return Color.White; } }
        public override Color MenuItemSelectedGradientBegin { get { return Color.FromArgb(230, 240, 255); } }
        public override Color MenuItemSelectedGradientEnd { get { return Color.FromArgb(230, 240, 255); } }
    }

    // ====== GDI+ 手绘彩色菜单图标 ======

    /// <summary>蓝色地球图标（打开网页）</summary>
    static Bitmap DrawGlobeIcon(int s)
    {
        var bmp = new Bitmap(s, s);
        using (var g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.Clear(Color.Transparent);

            // 蓝色圆球底
            using (var brush = new SolidBrush(Color.FromArgb(100, 180, 235)))
                g.FillEllipse(brush, 3, 3, s - 7, s - 7);
            // 蓝色边框
            using (var pen = new Pen(Color.FromArgb(30, 120, 215), 2))
                g.DrawEllipse(pen, 3, 3, s - 7, s - 7);
            // 经线（竖椭圆）
            using (var pen = new Pen(Color.FromArgb(30, 120, 215), 1.5f))
                g.DrawEllipse(pen, s / 2 - 4, 3, 8, s - 7);
            // 赤道（横线）
            using (var pen = new Pen(Color.FromArgb(30, 120, 215), 1.5f))
                g.DrawLine(pen, 3, s / 2, s - 4, s / 2);
        }
        return bmp;
    }

    /// <summary>绿色播放图标（启动服务）</summary>
    static Bitmap DrawPlayIcon(int s)
 {
        var bmp = new Bitmap(s, s);
        using (var g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.Clear(Color.Transparent);

            // 绿色圆底
            using (var brush = new SolidBrush(Color.FromArgb(34, 170, 68)))
                g.FillEllipse(brush, 2, 2, s - 5, s - 5);
            // 白色三角播放符
            var pts = new PointF[] {
                new PointF(s * 0.36f, s * 0.28f),
                new PointF(s * 0.36f, s * 0.72f),
                new PointF(s * 0.74f, s * 0.50f)
            };
            using (var brush = new SolidBrush(Color.White))
                g.FillPolygon(brush, pts);
        }
        return bmp;
    }

    /// <summary>红色停止图标（停止服务）</summary>
    static Bitmap DrawStopIcon(int s)
    {
        var bmp = new Bitmap(s, s);
        using (var g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.Clear(Color.Transparent);

            // 红色圆底
            using (var brush = new SolidBrush(Color.FromArgb(220, 53, 69)))
                g.FillEllipse(brush, 2, 2, s - 5, s - 5);
            // 白色方形停止符
            using (var brush = new SolidBrush(Color.White))
            {
                float m = s * 0.30f;
                g.FillRectangle(brush, m, m, s - 2 * m - 1, s - 2 * m - 1);
            }
        }
        return bmp;
    }

    /// <summary>红色叉图标（退出）</summary>
    static Bitmap DrawExitIcon(int s)
    {
        var bmp = new Bitmap(s, s);
        using (var g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.Clear(Color.Transparent);

            // 红色圆底
            using (var brush = new SolidBrush(Color.FromArgb(220, 53, 69)))
                g.FillEllipse(brush, 2, 2, s - 5, s - 5);
            // 白色 X
            using (var pen = new Pen(Color.White, 2.5f))
            {
                float m = s * 0.30f;
                g.DrawLine(pen, m, m, s - m - 1, s - m - 1);
                g.DrawLine(pen, s - m - 1, m, m, s - m - 1);
            }
        }
        return bmp;
    }

    /// <summary>
    /// 从文件加载图标，找不到则回退到系统默认图标。
    /// </summary>
    static Icon LoadIcon(bool running)
    {
        string path = running ? iconOn : iconOff;
        try
        {
            if (File.Exists(path))
                return new Icon(path);
        }
        catch { }
        return SystemIcons.Application;
    }

    /// <summary>
    /// 切换托盘图标。
    /// </summary>
    static void SwitchTrayIcon(bool running)
    {
        if (trayIcon == null) return;
        Icon old = trayIcon.Icon;
        trayIcon.Icon = LoadIcon(running);
        if (old != null) old.Dispose();
    }

    // ====== 托盘菜单事件 ======
    static void OpenBrowser()
    {
        if (serverPort > 0 && serverRunning)
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = "http://localhost:" + serverPort;
                psi.UseShellExecute = true;
                Process.Start(psi);
            }
            catch { }
        }
        else
        {
            MessageBox(IntPtr.Zero, "服务未运行，请先启动服务。", "多部门点对点一键发送邮件", MB_OK | MB_ICONINFORMATION);
        }
    }

    static void ToggleServer()
    {
        if (serverRunning)
        {
            StopServer();
        }
        else
        {
            // 通过托盘菜单重新启动服务，标记为本进程启动
            isOurProcess = true;
            Thread t = new Thread(StartServer);
            t.IsBackground = true;
            t.Start();
        }
    }

    static void ExitApp()
    {
        if (serverRunning)
        {
            // 先尝试优雅关闭（调 /api/shutdown）
            StopServer();
            Thread.Sleep(500);
        }
        // 只有自己启动的 node 进程才强制结束
        if (isOurProcess && nodeProc != null && !nodeProc.HasExited)
        {
            try { nodeProc.Kill(); } catch { }
        }
        // 释放菜单图标资源
        if (iconBmpOpen != null) iconBmpOpen.Dispose();
        if (iconBmpStart != null) iconBmpStart.Dispose();
        if (iconBmpStop != null) iconBmpStop.Dispose();
        if (iconBmpExit != null) iconBmpExit.Dispose();

        trayIcon.Visible = false;
        Application.Exit();
    }

    // ====== 服务器管理 ======
    static void StartServer()
    {
        string baseDir = ExeDir;
        string nodeExe = Path.Combine(baseDir, "runtime", "node.exe");
        string serverJs = Path.Combine(baseDir, "lib", "server.js");

        if (!File.Exists(nodeExe))
        {
            ShowError("未找到 runtime\\node.exe，请确认程序目录完整。");
            return;
        }
        if (!File.Exists(serverJs))
        {
            ShowError("未找到 lib\\server.js，请确认程序目录完整。");
            return;
        }

        // 更新菜单状态
        UpdateTray("正在启动...", false, false);

        ProcessStartInfo psi = new ProcessStartInfo();
        psi.FileName = nodeExe;
        psi.Arguments = "\"" + serverJs + "\"";
        psi.WorkingDirectory = Path.Combine(baseDir, "lib");
        psi.UseShellExecute = false;
        psi.CreateNoWindow = true;
        psi.EnvironmentVariables["EXE_DIR"] = baseDir;

        try
        {
            nodeProc = Process.Start(psi);
        }
        catch (Exception ex)
        {
            ShowError("启动服务器失败: " + ex.Message);
            UpdateTray("服务未运行", false, true);
            return;
        }

        // 轮询等待服务器就绪
        int port = FindReadyPort(nodeProc);
        if (port > 0)
        {
            serverPort = port;
            serverRunning = true;
            UpdateTray("多部门点对点一键发送邮件 (端口 " + port + ")", true, true);
            OpenBrowser();
            // ServerWatcher 已在 Main 中统一启动，此处不再重复
        }
        else
        {
            if (nodeProc != null && !nodeProc.HasExited)
            {
                try { nodeProc.Kill(); } catch { }
            }
            ShowError("服务器启动超时，请检查配置。");
            UpdateTray("服务未运行", false, true);
        }
    }

    static void StopServer()
    {
        // 优先调用 /api/shutdown 优雅关闭
        if (serverPort > 0)
        {
            try
            {
                HttpWebRequest req = (HttpWebRequest)WebRequest.Create(
                    "http://127.0.0.1:" + serverPort + "/api/shutdown");
                req.Method = "POST";
                req.Timeout = 3000;
                req.GetResponse().Close();
            }
            catch { }
        }

        // 只有自己启动的 node 进程才等待退出/强制结束
        if (isOurProcess && nodeProc != null && !nodeProc.HasExited)
        {
            nodeProc.WaitForExit(3000);
            if (!nodeProc.HasExited)
            {
                try { nodeProc.Kill(); } catch { }
            }
        }

        serverRunning = false;
        serverPort = -1;
        UpdateTray("多部门点对点一键发送邮件 (已停止)", false, true);
    }

    /// <summary>
    /// 第二个实例：只启动服务并等就绪，不创建托盘，启动成功后退出。
    /// </summary>
    static void StartServerAndWait()
    {
        string baseDir = ExeDir;
        string nodeExe = Path.Combine(baseDir, "runtime", "node.exe");
        string serverJs = Path.Combine(baseDir, "lib", "server.js");

        if (!File.Exists(nodeExe) || !File.Exists(serverJs)) return;

        ProcessStartInfo psi = new ProcessStartInfo();
        psi.FileName = nodeExe;
        psi.Arguments = "\"" + serverJs + "\"";
        psi.WorkingDirectory = Path.Combine(baseDir, "lib");
        psi.UseShellExecute = false;
        psi.CreateNoWindow = true;
        psi.EnvironmentVariables["EXE_DIR"] = baseDir;

        try { nodeProc = Process.Start(psi); } catch { return; }

        int port = FindReadyPort(nodeProc);
        if (port > 0)
        {
            // 启动成功，打开浏览器
            OpenBrowser(port);
        }
    }

    /// <summary>
    /// 后台轮询 /api/health，检测服务上下线状态。
    /// 始终运行：服务下线后继续轮询，检测服务是否重新上线。
    /// </summary>
    static void ServerWatcher()
    {
        while (true)
        {
            Thread.Sleep(3000);
            int port = ReadConfigPort();

            if (serverRunning)
            {
                // 服务运行中：检测是否下线
                if (!IsHealthOk(port))
                {
                    // 服务已被关闭
                    if (isOurProcess && nodeProc != null && !nodeProc.HasExited)
                    {
                        try { nodeProc.WaitForExit(2000); } catch { }
                        if (!nodeProc.HasExited)
                        {
                            try { nodeProc.Kill(); } catch { }
                        }
                    }
                    serverRunning = false;
                    serverPort = -1;
                    UpdateTray("多部门点对点一键发送邮件 (已停止)", false, true);
                }
            }
            else
            {
                // 服务已停止：检测是否重新上线（被第二个实例启动）
                if (IsHealthOk(port))
                {
                    serverPort = port;
                    serverRunning = true;
                    isOurProcess = false;  // 不是本实例启动的
                    UpdateTray("多部门点对点一键发送邮件 (端口 " + port + ")", true, true);
                }
            }
        }
    }

    // ====== 轮询检测服务器就绪 ======
    static int FindReadyPort(Process nodeProc)
    {
        int startPort = ReadConfigPort();
        // 轮询 startPort ~ startPort+10，最多 15 秒
        for (int port = startPort; port <= startPort + 10; port++)
        {
            for (int i = 0; i < 75; i++)
            {
                if (nodeProc.HasExited) return -1;
                if (IsHealthOk(port)) return port;
                Thread.Sleep(200);
            }
        }
        return -1;
    }

    static bool IsHealthOk(int port)
    {
        try
        {
            HttpWebRequest req = (HttpWebRequest)WebRequest.Create(
                "http://127.0.0.1:" + port + "/api/health");
            req.Timeout = 1500;
            using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
            {
                return resp.StatusCode == HttpStatusCode.OK;
            }
        }
        catch
        {
            return false;
        }
    }

    // ====== UI 更新（线程安全） ======
    static void UpdateTray(string tooltip, bool running, bool canToggle)
    {
        if (trayIcon == null) return;
        // NotifyIcon 没有 InvokeRequired，使用 trayMenu 代替判断
        if (trayMenu != null && trayMenu.InvokeRequired)
        {
            trayMenu.Invoke(new Action(() => UpdateTray(tooltip, running, canToggle)));
            return;
        }
        // tooltip 最长 63 字符
        if (tooltip.Length > 63) tooltip = tooltip.Substring(0, 63);
        trayIcon.Text = tooltip;

        // 切换托盘图标
        SwitchTrayIcon(running);

        if (running)
        {
            miToggle.Text = "停止服务";
            miToggle.Image = iconBmpStop;
            miToggle.Enabled = true;
            miOpen.Enabled = true;
        }
        else
        {
            miToggle.Text = "启动服务";
            miToggle.Image = iconBmpStart;
            miToggle.Enabled = canToggle;
            miOpen.Enabled = false;
        }
    }

    // ====== 辅助 ======
    static void OpenBrowser(int port)
    {
        try
        {
            ProcessStartInfo psi = new ProcessStartInfo();
            psi.FileName = "http://localhost:" + port;
            psi.UseShellExecute = true;
            Process.Start(psi);
        }
        catch { }
    }

    static void ShowError(string msg)
    {
        try
        {
            MessageBox(IntPtr.Zero, msg, "多部门点对点一键发送邮件", MB_OK | MB_ICONERROR);
        }
        catch { }
    }
}
