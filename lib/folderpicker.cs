using System;
using System.Windows.Forms;
using System.Runtime.InteropServices;

namespace FolderPicker
{
    class Program
    {
        // ===== P/Invoke: Window management (center + foreground) =====

        [DllImport("user32.dll")]
        static extern IntPtr SetWindowsHookEx(int idHook, HookProc lpfn, IntPtr hInstance, int threadId);
        [DllImport("user32.dll")]
        static extern bool UnhookWindowsHookEx(IntPtr idHook);
        [DllImport("user32.dll")]
        static extern IntPtr CallNextHookEx(IntPtr idHook, int nCode, IntPtr wParam, IntPtr lParam);
        [DllImport("user32.dll")]
        static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
        [DllImport("user32.dll")]
        static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);
        [DllImport("user32.dll")]
        static extern int GetSystemMetrics(int nIndex);
        [DllImport("kernel32.dll")]
        static extern int GetCurrentThreadId();
        [DllImport("user32.dll")]
        static extern bool SetForegroundWindow(IntPtr hWnd);
        [DllImport("user32.dll")]
        static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")]
        static extern int GetWindowThreadProcessId(IntPtr hWnd, out int pid);
        [DllImport("user32.dll")]
        static extern bool AttachThreadInput(int idAttach, int idAttachTo, bool fAttach);
        [DllImport("user32.dll")]
        static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint flags);
        [DllImport("user32.dll")]
        static extern bool BringWindowToTop(IntPtr hWnd);
        [DllImport("user32.dll")]
        static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        delegate IntPtr HookProc(int code, IntPtr wParam, IntPtr lParam);

        [StructLayout(LayoutKind.Sequential)]
        struct RECT { public int Left, Top, Right, Bottom; }

        const int WH_CBT = 5;
        const int HCBT_ACTIVATE = 5;
        const int SM_CXSCREEN = 0;
        const int SM_CYSCREEN = 1;
        static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
        static readonly IntPtr HWND_NOTOPMOST = new IntPtr(-2);
        const uint SWP_NOSIZE = 0x0001;
        const uint SWP_NOMOVE = 0x0002;
        const uint SWP_SHOWWINDOW = 0x0040;
        const int SW_SHOW = 5;

        // ===== P/Invoke: SHBrowseForFolder =====

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        struct BROWSEINFO
        {
            public IntPtr hwndOwner;
            public IntPtr pidlRoot;
            public IntPtr pszDisplayName;
            public string lpszTitle;
            public uint ulFlags;
            public IntPtr lpfn;
            public IntPtr lParam;
            public int iImage;
        }

        [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
        static extern IntPtr SHBrowseForFolder(ref BROWSEINFO bi);

        [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
        static extern bool SHGetPathFromIDList(IntPtr pidl, IntPtr pszPath);

        [DllImport("shell32.dll")]
        static extern void CoTaskMemFree(IntPtr ptr);

        const uint BIF_RETURNONLYFSDIRS = 0x0001;
        const uint BIF_USENEWUI = 0x0050;
        const uint BIF_NONEWFOLDERBUTTON = 0x0200;

        // ===== State =====

        static IntPtr _hookHandle = IntPtr.Zero;
        static HookProc _hookProc;
        static IntPtr _dialogHwnd = IntPtr.Zero;
        static int _screenW, _screenH;

        static void ForceForegroundAndCenter()
        {
            if (_dialogHwnd == IntPtr.Zero) return;
            RECT rect;
            if (GetWindowRect(_dialogHwnd, out rect))
            {
                int w = rect.Right - rect.Left;
                int h = rect.Bottom - rect.Top;
                int x = (_screenW - w) / 2;
                int y = (_screenH - h) / 2;
                if (x < 0) x = 0;
                if (y < 0) y = 0;
                MoveWindow(_dialogHwnd, x, y, w, h, true);
            }

            IntPtr foreHwnd = GetForegroundWindow();
            int dummy;
            int foreThread = GetWindowThreadProcessId(foreHwnd, out dummy);
            int myThread = GetCurrentThreadId();
            if (foreThread != myThread)
            {
                AttachThreadInput(myThread, foreThread, true);
                SetForegroundWindow(_dialogHwnd);
                AttachThreadInput(myThread, foreThread, false);
            }
            else
            {
                SetForegroundWindow(_dialogHwnd);
            }

            SetWindowPos(_dialogHwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
            BringWindowToTop(_dialogHwnd);
            ShowWindow(_dialogHwnd, SW_SHOW);
        }

        static IntPtr CBTProc(int nCode, IntPtr wParam, IntPtr lParam)
        {
            if (nCode == HCBT_ACTIVATE)
            {
                _dialogHwnd = wParam;
                ForceForegroundAndCenter();
            }
            return CallNextHookEx(_hookHandle, nCode, wParam, lParam);
        }

        static void WriteStdout(string text)
        {
            var bytes = System.Text.Encoding.UTF8.GetBytes(text);
            var stream = Console.OpenStandardOutput();
            stream.Write(bytes, 0, bytes.Length);
            stream.Flush();
        }

        [STAThread]
        static int Main(string[] args)
        {
            string title = "\u8bf7\u9009\u62e9\u9644\u4ef6\u6839\u76ee\u5f55";
            if (args.Length > 0)
                title = args[0];

            try
            {
                _screenW = GetSystemMetrics(SM_CXSCREEN);
                _screenH = GetSystemMetrics(SM_CYSCREEN);

                // Install CBT hook for centering + foreground
                bool removedTopmost = false;
                _hookProc = new HookProc(CBTProc);
                _hookHandle = SetWindowsHookEx(WH_CBT, _hookProc, IntPtr.Zero, GetCurrentThreadId());

                var timer = new Timer();
                timer.Interval = 50;
                int ticks = 0;
                timer.Tick += (s, e) =>
                {
                    ticks++;
                    if (_dialogHwnd != IntPtr.Zero)
                        ForceForegroundAndCenter();
                    if (ticks >= 16 && !removedTopmost)
                    {
                        removedTopmost = true;
                        SetWindowPos(_dialogHwnd, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
                        SetForegroundWindow(_dialogHwnd);
                    }
                    if (ticks >= 20)
                    {
                        timer.Stop();
                        timer.Dispose();
                    }
                };
                timer.Start();

                // Show folder browser dialog (BIF_USENEWUI = address bar + nav tree + resizable)
                BROWSEINFO bi = new BROWSEINFO();
                bi.hwndOwner = IntPtr.Zero;
                bi.pidlRoot = IntPtr.Zero;
                bi.pszDisplayName = IntPtr.Zero;
                bi.lpszTitle = title;
                bi.ulFlags = BIF_RETURNONLYFSDIRS | BIF_USENEWUI | BIF_NONEWFOLDERBUTTON;
                bi.lpfn = IntPtr.Zero;
                bi.lParam = IntPtr.Zero;
                bi.iImage = 0;

                IntPtr pidl = SHBrowseForFolder(ref bi);

                // Cleanup
                timer.Stop();
                timer.Dispose();
                if (_hookHandle != IntPtr.Zero)
                    UnhookWindowsHookEx(_hookHandle);

                if (pidl != IntPtr.Zero)
                {
                    IntPtr pathPtr = Marshal.AllocCoTaskMem(260 * 2);
                    SHGetPathFromIDList(pidl, pathPtr);
                    string folderPath = Marshal.PtrToStringUni(pathPtr);
                    Marshal.FreeCoTaskMem(pathPtr);
                    CoTaskMemFree(pidl);

                    if (!string.IsNullOrEmpty(folderPath))
                    {
                        WriteStdout(folderPath);
                        return 0;
                    }
                    return 1;
                }
                return 1; // user cancelled
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine(ex.Message);
                return 2;
            }
        }
    }
}
