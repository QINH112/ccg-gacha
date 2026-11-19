# 向微信开发者工具窗口注入鼠标点击/拖动（窗口相对坐标），用于驱动模拟器并配合窗口级截图产出 P7 证据。
# 用法:
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/click_devtools_window.ps1 -Points "1423,754"
#   powershell ... -Points "1200,700;1200,650" -DelayMs 800
#   powershell ... -Drag "1250,500;1250,300" -DelayMs 400
param(
  [string]$Points = "",
  [string]$Drag = "",
  [string]$ProcessName = "微信开发者工具",
  [int]$DelayMs = 700
)

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinInput {
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr hWnd, out int pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@

$procIds = @(Get-Process -Name $ProcessName -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
if ($procIds.Count -eq 0) { Write-Output "click-failed: process not running"; exit 2 }

$list = New-Object System.Collections.ArrayList
$script:procIds = $procIds
$script:list = $list
$cb = [WinInput+EnumWindowsProc]{
  param($hWnd, $lParam)
  if (-not [WinInput]::IsWindowVisible($hWnd)) { return $true }
  $sb = New-Object System.Text.StringBuilder 512
  [void][WinInput]::GetWindowText($hWnd, $sb, $sb.Capacity)
  if ([string]::IsNullOrWhiteSpace($sb.ToString())) { return $true }
  $procId = 0
  [void][WinInput]::GetWindowThreadProcessId($hWnd, [ref]$procId)
  if ($script:procIds -notcontains $procId) { return $true }
  $rect = New-Object WinInput+RECT
  [void][WinInput]::GetWindowRect($hWnd, [ref]$rect)
  [void]$script:list.Add([pscustomobject]@{ Handle = $hWnd; Title = $sb.ToString(); Left = $rect.Left; Top = $rect.Top; Width = ($rect.Right - $rect.Left); Height = ($rect.Bottom - $rect.Top) })
  return $true
}
[void][WinInput]::EnumWindows($cb, [IntPtr]::Zero)

$win = $list | Sort-Object -Property @{ Expression = { $_.Width * $_.Height } } -Descending | Select-Object -First 1
if (-not $win) { Write-Output "click-failed: no window"; exit 3 }
[void][WinInput]::SetForegroundWindow($win.Handle)
Start-Sleep -Milliseconds 300

function To-Screen([int]$x, [int]$y) { return @(($win.Left + $x), ($win.Top + $y)) }

function Click-Point([int]$x, [int]$y) {
  $p = To-Screen $x $y
  [void][WinInput]::SetCursorPos([int]$p[0], [int]$p[1])
  Start-Sleep -Milliseconds 80
  [WinInput]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 60
  [WinInput]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
}

$log = @()
if ($Points) {
  foreach ($pair in ($Points -split ";")) {
    if ([string]::IsNullOrWhiteSpace($pair)) { continue }
    $xy = $pair -split ","
    Click-Point ([int]$xy[0]) ([int]$xy[1])
    $log += "click $($xy[0]),$($xy[1])"
    Start-Sleep -Milliseconds $DelayMs
  }
}
if ($Drag) {
  $parts = $Drag -split ";"
  $from = $parts[0] -split ","
  $to = $parts[1] -split ","
  $p1 = To-Screen ([int]$from[0]) ([int]$from[1])
  $p2 = To-Screen ([int]$to[0]) ([int]$to[1])
  [void][WinInput]::SetCursorPos([int]$p1[0], [int]$p1[1])
  Start-Sleep -Milliseconds 120
  [WinInput]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
  $steps = 12
  for ($i = 1; $i -le $steps; $i++) {
    $x = [int]($p1[0] + ($p2[0] - $p1[0]) * $i / $steps)
    $y = [int]($p1[1] + ($p2[1] - $p1[1]) * $i / $steps)
    [void][WinInput]::SetCursorPos($x, $y)
    Start-Sleep -Milliseconds 25
  }
  Start-Sleep -Milliseconds 120
  [WinInput]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
  $log += "drag $Drag"
  Start-Sleep -Milliseconds $DelayMs
}

Write-Output ("click-ok window='{0}' at {1},{2} size {3}x{4} actions: {5}" -f $win.Title, $win.Left, $win.Top, $win.Width, $win.Height, ($log -join ", "))
