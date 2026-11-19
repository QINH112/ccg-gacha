# 窗口级截图：抓取微信开发者工具主窗口（含模拟器），用于 P7 人工验收证据。
# 用法: powershell -ExecutionPolicy Bypass -File tools/capture_devtools_window.ps1 [-OutFile D:\kaifa\design\review\xxx.png] [-TitleLike 微信开发者工具]
param(
  [string]$OutFile = "",
  [string]$TitleLike = "微信开发者工具",
  [string]$ProcessName = "微信开发者工具"
)

Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinCapture {
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr hWnd, out int pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint flags);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int cmd);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@

$pids = @(Get-Process -Name $ProcessName -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
if ($pids.Count -eq 0) { Write-Output "capture-failed: process '$ProcessName' not running"; exit 2 }

$candidates = New-Object System.Collections.ArrayList
$callback = [WinCapture+EnumWindowsProc]{
  param($hWnd, $lParam)
  if (-not [WinCapture]::IsWindowVisible($hWnd)) { return $true }
  $sb = New-Object System.Text.StringBuilder 512
  [void][WinCapture]::GetWindowText($hWnd, $sb, $sb.Capacity)
  $title = $sb.ToString()
  if ([string]::IsNullOrWhiteSpace($title)) { return $true }
  $procId = 0
  [void][WinCapture]::GetWindowThreadProcessId($hWnd, [ref]$procId)
  if ($script:pids -notcontains $procId) { return $true }
  $rect = New-Object WinCapture+RECT
  [void][WinCapture]::GetWindowRect($hWnd, [ref]$rect)
  $w = $rect.Right - $rect.Left
  $h = $rect.Bottom - $rect.Top
  if ($w -lt 640 -or $h -lt 480) { return $true }
  [void]$script:candidates.Add([pscustomobject]@{ Handle = $hWnd; Title = $title; Width = $w; Height = $h; Match = ($title -like "*$script:TitleLike*") })
  return $true
}
$script:pids = $pids
$script:candidates = $candidates
[void][WinCapture]::EnumWindows($callback, [IntPtr]::Zero)

$window = $candidates | Where-Object { $_.Match } | Sort-Object -Property @{ Expression = { $_.Width * $_.Height } } -Descending | Select-Object -First 1
if (-not $window) { $window = $candidates | Sort-Object -Property @{ Expression = { $_.Width * $_.Height } } -Descending | Select-Object -First 1 }
if (-not $window) { Write-Output "capture-failed: no visible window for '$ProcessName'"; exit 3 }

[void][WinCapture]::ShowWindow($window.Handle, 9)
[void][WinCapture]::SetForegroundWindow($window.Handle)
Start-Sleep -Milliseconds 700

$bmp = New-Object System.Drawing.Bitmap $window.Width, $window.Height
$graphics = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $graphics.GetHdc()
$ok = [WinCapture]::PrintWindow($window.Handle, $hdc, 2)
$graphics.ReleaseHdc($hdc)
$graphics.Dispose()
if (-not $ok) {
  $graphics2 = [System.Drawing.Graphics]::FromImage($bmp)
  $graphics2.CopyFromScreen($window.Handle.ToInt32() * 0 + 0, 0, 0, 0, $bmp.Size)
  $graphics2.Dispose()
}

if ([string]::IsNullOrWhiteSpace($OutFile)) {
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $OutFile = Join-Path "D:\kaifa\design\review" "devtools-window-$stamp.png"
}
$dir = Split-Path -Parent $OutFile
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
$bmp.Save($OutFile, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output "capture-ok title='$($window.Title)' size=$($window.Width)x$($window.Height) file=$OutFile"
