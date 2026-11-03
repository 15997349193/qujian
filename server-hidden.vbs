' Photo sync server - hidden launcher (no black window)
' Runs start-server-hidden.cmd with a hidden console window.
' Works from any folder: uses its own folder, or falls back to Downloads.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
If Not fso.FileExists(dir & "\start-server-hidden.cmd") Then dir = "C:\Users\bogei\Downloads"
If fso.FileExists(dir & "\start-server-hidden.cmd") Then
  sh.CurrentDirectory = dir
  sh.Run """" & dir & "\start-server-hidden.cmd""", 0, False
End If
