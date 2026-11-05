'use strict';
// The PowerShell program behind the mischief probe. It is long-lived for the length of ONE prank
// (spawned when a prank is about to start, stdin closed when it ends) and answers one-line requests
// "id|command" with "id#json". It is plain text passed with -Command (no -EncodedCommand, no files).
//
// WHAT IT NEVER DOES (acceptance rule 1/2, enforced by test/mischief.safety.test.js):
//   * no input of any kind (no SendInput/SendKeys/PostMessage/clipboard/hooks), no window or icon moves, no registry or file writes
//   * for text it asks for BOUNDING RECTANGLES ONLY. It never reads the characters, the values, names or
//     contents of documents, nor of desktop icons (their file names are not even requested).
// UI Automation is read-only here: FindAll / Current.BoundingRectangle / IsPassword / GetVisibleRanges / GetBoundingRectangles.
const DLL = [
  '[DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(System.IntPtr c);',
  '[DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow();',
  '[DllImport("user32.dll")] public static extern bool GetWindowRect(System.IntPtr h, out RECT r);',
  '[DllImport("user32.dll")] public static extern int GetClassName(System.IntPtr h, System.Text.StringBuilder s, int m);',
  '[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(System.IntPtr h, out uint pid);',
  '[DllImport("user32.dll")] public static extern bool GetGUIThreadInfo(uint t, ref GTI i);',
  '[DllImport("user32.dll")] public static extern bool ClientToScreen(System.IntPtr h, ref PT p);',
  '[DllImport("user32.dll")] public static extern bool IsZoomed(System.IntPtr h);',
  '[DllImport("user32.dll")] public static extern bool IsIconic(System.IntPtr h);',
  '[DllImport("user32.dll")] public static extern System.IntPtr WindowFromPoint(PT p);',
  '[DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(System.IntPtr h, int a, out RECT r, int sz);',
  'public struct RECT { public int l, t, r, b; }',
  'public struct PT { public int x, y; }',
  '[System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)] public struct GTI { public int cb, fl; public System.IntPtr a, f, c, mo, ms, ca; public RECT rc; }',
].join(' ');

const LINES = [
  "$ErrorActionPreference = 'SilentlyContinue'",
  "Add-Type -AssemblyName UIAutomationClient",
  "Add-Type -AssemblyName UIAutomationTypes",
  "Add-Type -Namespace SB -Name N -MemberDefinition '" + DLL + "'",
  "[void][SB.N]::SetProcessDpiAwarenessContext([IntPtr](-4))",   // per-monitor v2: every rect we report is in PHYSICAL pixels
  "$A = [Windows.Automation.AutomationElement]",
  "function J($r) { if ($r) { '[' + ($r -join ',') + ']' } else { 'null' } }",
  "function WCls($h) { $sb = New-Object System.Text.StringBuilder 128; [void][SB.N]::GetClassName($h, $sb, 128); $sb.ToString() }",
  "function Rc($e) { $r = $e.Current.BoundingRectangle; if ($r.IsEmpty -or $r.Width -le 0 -or $r.Height -le 0) { $null } else { @([int]$r.X, [int]$r.Y, [int]$r.Width, [int]$r.Height) } }",
  "function Frame($h) { $r = New-Object SB.N+RECT; if ([SB.N]::DwmGetWindowAttribute($h, 9, [ref]$r, 16) -ne 0) { [void][SB.N]::GetWindowRect($h, [ref]$r) }; @($r.l, $r.t, ($r.r - $r.l), ($r.b - $r.t)) }",
  "function Fg() {",
  "  $h = [SB.N]::GetForegroundWindow(); if ($h -eq [IntPtr]::Zero) { return 'null' }",
  "  $pid2 = 0; [void][SB.N]::GetWindowThreadProcessId($h, [ref]$pid2); $pn = ''; try { $pn = [Diagnostics.Process]::GetProcessById($pid2).ProcessName } catch {}",
  "  '{\"h\":' + $h.ToInt64() + ',\"p\":\"' + ($pn -replace '[^A-Za-z0-9_.-]', '') + '\",\"c\":\"' + ((WCls $h) -replace '[^A-Za-z0-9_.-]', '') + '\",\"z\":' + ([int][SB.N]::IsZoomed($h)) + ',\"i\":' + ([int][SB.N]::IsIconic($h)) + ',\"r\":' + (J (Frame $h)) + '}'",
  "}",
  "function Scan() {",
  "  $items = @(); $bar = 'null'",
  "  $tb = $A::RootElement.FindFirst('Children', (New-Object Windows.Automation.PropertyCondition($A::ClassNameProperty, 'Shell_TrayWnd')))",
  "  if ($tb) {",
  "    $bar = J (Rc $tb)",
  "    foreach ($e in $tb.FindAll('Descendants', [Windows.Automation.Condition]::TrueCondition)) {",
  "      $c = $e.Current; $k = ''",
  "      if ($c.ClassName -eq 'Taskbar.TaskListButtonAutomationPeer') { $k = 'btn' } elseif ($c.AutomationId -eq 'StartButton') { $k = 'start' } elseif ($c.ClassName -like 'SystemTray.*' -and $c.AutomationId -eq 'SystemTrayIcon') { $k = 'tray' }",
  "      if ($k) { $n = ''; if ($k -eq 'tray') { $n = (([string]$c.Name -replace '[^A-Za-z ]', ' ').Trim() -split ' ')[0] }; $items += '{\"k\":\"' + $k + '\",\"c\":\"' + ($c.ClassName -replace '[^A-Za-z0-9_.]', '') + '\",\"n\":\"' + $n + '\",\"r\":' + (J (Rc $e)) + '}' }",
  "    }",
  "  }",
  "  $desk = @()",
  "  foreach ($w in $A::RootElement.FindAll('Children', [Windows.Automation.Condition]::TrueCondition)) {",
  "    $wc = $w.Current.ClassName; if ($wc -ne 'Progman' -and $wc -ne 'WorkerW') { continue }",
  "    foreach ($e in $w.FindAll('Descendants', (New-Object Windows.Automation.PropertyCondition($A::ControlTypeProperty, [Windows.Automation.ControlType]::ListItem)))) {",
  "      $r = Rc $e; if (-not $r -or $desk.Count -ge 80) { continue }",
  "      $pt = New-Object SB.N+PT; $pt.x = $r[0] + [int]($r[2] / 2); $pt.y = $r[1] + [int]($r[3] / 2); $cl = WCls ([SB.N]::WindowFromPoint($pt))",
  "      if ($cl -eq 'SysListView32' -or $cl -eq 'SHELLDLL_DefView' -or $cl -eq 'Progman' -or $cl -eq 'WorkerW') { $desk += (J $r) }",
  "    }",
  "  }",
  "  '{\"bar\":' + $bar + ',\"items\":[' + ($items -join ',') + '],\"desk\":[' + ($desk -join ',') + '],\"fg\":' + (Fg) + '}'",
  "}",
  // text: rectangles of the visible text lines of the focused document. NOT its content.
  "function Doc() {",
  "  $fe = $A::FocusedElement; if (-not $fe) { return $null }",
  "  if ($fe.Current.IsPassword) { return 'pw' }",
  "  $tp = $null",
  "  if ($fe.TryGetCurrentPattern([Windows.Automation.TextPattern]::Pattern, [ref]$tp)) { return $tp }",
  "  $h = [SB.N]::GetForegroundWindow(); $we = $A::FromHandle($h)",
  "  $doc = $we.FindFirst('Descendants', (New-Object Windows.Automation.PropertyCondition($A::ControlTypeProperty, [Windows.Automation.ControlType]::Document)))",
  "  if ($doc) { if ($doc.Current.IsPassword) { return 'pw' }; if ($doc.TryGetCurrentPattern([Windows.Automation.TextPattern]::Pattern, [ref]$tp)) { return $tp } }",
  "  $null",
  "}",
  "function Lines() {",
  "  $tp = Doc; if ($tp -is [string]) { return '{\"pw\":true,\"l\":[]}' }; if (-not $tp) { return '{\"pw\":false,\"l\":[]}' }",
  "  $out = @(); foreach ($v in $tp.GetVisibleRanges()) { foreach ($b in $v.GetBoundingRectangles()) { if ($b.Width -gt 0 -and $out.Count -lt 120) { $out += (J @([int]$b.X, [int]$b.Y, [int]$b.Width, [int]$b.Height)) } } }",
  "  '{\"pw\":false,\"l\":[' + ($out -join ',') + ']}'",
  "}",
  // the caret, two independent ways: the classic system caret, and the rectangle of the UIA selection (a collapsed selection is the caret)
  "function Caret($withSel) {",
  "  $h = [SB.N]::GetForegroundWindow(); $tid = [SB.N]::GetWindowThreadProcessId($h, [ref]0); $g = New-Object SB.N+GTI; $g.cb = [Runtime.InteropServices.Marshal]::SizeOf($g); $cr = 'null'",
  "  if ([SB.N]::GetGUIThreadInfo($tid, [ref]$g) -and $g.ca -ne [IntPtr]::Zero) { $p = New-Object SB.N+PT; $p.x = $g.rc.l; $p.y = $g.rc.t; [void][SB.N]::ClientToScreen($g.ca, [ref]$p); $cr = J @($p.x, $p.y, ($g.rc.r - $g.rc.l), ($g.rc.b - $g.rc.t)) }",
  "  $sr = 'null'; $f1 = 'null'",
  "  if ($withSel) { $tp = Doc; if ($tp -and -not ($tp -is [string])) { foreach ($s in $tp.GetSelection()) { foreach ($b in $s.GetBoundingRectangles()) { $sr = J @([int]$b.X, [int]$b.Y, [int]$b.Width, [int]$b.Height); break }; break }; foreach ($v in $tp.GetVisibleRanges()) { foreach ($b in $v.GetBoundingRectangles()) { $f1 = J @([int]$b.X, [int]$b.Y, [int]$b.Width, [int]$b.Height); break }; break } } }",
  "  '{\"fg\":' + (Fg) + ',\"c\":' + $cr + ',\"s\":' + $sr + ',\"v\":' + $f1 + '}'",
  "}",
  "while ($null -ne ($line = [Console]::In.ReadLine())) {",
  "  $p = $line.Split('|'); $id = $p[0]; $o = 'null'",
  "  try { switch ($p[1]) { 'scan' { $o = Scan } 'text' { $o = Lines } 'tick' { $o = Caret $false } 'tick2' { $o = Caret $true } 'fg' { $o = Fg } } } catch { $o = 'null' }",
  "  [Console]::Out.WriteLine($id + '#' + $o); [Console]::Out.Flush()",
  "}",
];
const SCRIPT = LINES.join('\n');

// Anything on this list appearing in the script fails the safety test.
const FORBIDDEN = ['GetText', 'SendInput', 'SendKeys', 'PostMessage', 'SendMessage', 'keybd_event', 'mouse_event', 'SetCursorPos', 'Clipboard',
  'SetWindowsHookEx', 'SetWinEventHook', 'Registry', 'New-ItemProperty', 'Set-ItemProperty', 'Out-File', 'Set-Content', 'Add-Content', 'WriteAllText',
  'InvokePattern', 'ValuePattern', 'SetValue', 'SetFocus', 'MoveWindow', 'SetWindowPos', 'ShowWindow', 'SetForegroundWindow', 'EncodedCommand', 'DownloadString', 'Invoke-Expression', 'iex ', 'Start-Process', 'Net.WebClient'];
module.exports = { SCRIPT, FORBIDDEN };
