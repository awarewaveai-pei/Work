' Zero-window launcher for the Docker Desktop runtime scheduled tasks.
' powershell.exe -WindowStyle Hidden still creates a console window and then
' hides it - under an interactive task that flashes a window on every run
' (2026-09-07: the operator saw it). WScript.Shell.Run with window style 0
' creates the process with no window at all.
' Usage: wscript.exe //B //Nologo <this.vbs> <script.ps1> [args...]
' Each argument after the script path is individually quoted (critic review
' 2026-09-07 M5: unquoted concatenation silently truncated any argument
' containing a space, with no visible error - reproduced with a real
' multi-word argument).
Option Explicit
Dim sh, i, args, cmd, rc, arg
If WScript.Arguments.Count < 1 Then WScript.Quit 2
Set sh = CreateObject("WScript.Shell")
args = ""
For i = 1 To WScript.Arguments.Count - 1
    arg = WScript.Arguments(i)
    args = args & " """ & Replace(arg, """", """""") & """"
Next
cmd = "powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File """ & WScript.Arguments(0) & """" & args
rc = sh.Run(cmd, 0, True)
WScript.Quit rc
