#Requires -Version 5.1
<#
.SYNOPSIS
  Associates .pr (Parithi source) files with the Parithi icon and makes
  them open in VS Code by default, for the CURRENT USER only.

.DESCRIPTION
  Writes under HKEY_CURRENT_USER\Software\Classes - no administrator
  rights are required, and nothing outside your own user profile is
  touched. Per-user file associations here take precedence over any
  machine-wide (HKEY_CLASSES_ROOT) default for the same extension.

  Run generate-ico.mjs first (or from the repo root:
  "node tools/windows-file-icon/generate-ico.mjs") so parithi.ico exists
  next to this script.

.PARAMETER IconPath
  Path to the .ico file. Defaults to parithi.ico next to this script.

.PARAMETER EditorPath
  Path to Code.exe. Auto-detected from the usual install locations, or
  from "code" on PATH, if not given.

.EXAMPLE
  .\Register-ParithiFileType.ps1

.EXAMPLE
  .\Register-ParithiFileType.ps1 -EditorPath "D:\Apps\VSCode\Code.exe"

.NOTES
  Reversible: run Unregister-ParithiFileType.ps1 to remove everything
  this script adds.
#>
[CmdletBinding()]
param(
  [string]$IconPath = (Join-Path $PSScriptRoot 'parithi.ico'),
  [string]$EditorPath
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $IconPath)) {
  Write-Error "Icon not found at '$IconPath'. Generate it first: node `"$PSScriptRoot\generate-ico.mjs`""
  exit 1
}
$IconPath = (Resolve-Path $IconPath).Path

if (-not $EditorPath) {
  $candidates = @(
    "$env:LOCALAPPDATA\Programs\Microsoft VS Code\Code.exe",
    "$env:ProgramFiles\Microsoft VS Code\Code.exe",
    "${env:ProgramFiles(x86)}\Microsoft VS Code\Code.exe"
  )
  $EditorPath = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1

  if (-not $EditorPath) {
    $codeCmd = Get-Command code -ErrorAction SilentlyContinue
    if ($codeCmd) { $EditorPath = $codeCmd.Source }
  }
}

if (-not $EditorPath -or -not (Test-Path $EditorPath)) {
  Write-Error "Could not find VS Code automatically. Re-run with -EditorPath pointing at Code.exe, e.g.:`n  .\Register-ParithiFileType.ps1 -EditorPath `"C:\path\to\Code.exe`""
  exit 1
}
$EditorPath = (Resolve-Path $EditorPath).Path

$progId = 'Parithi.SourceFile'
$classesRoot = 'HKCU:\Software\Classes'

Write-Host "Icon:   $IconPath"
Write-Host "Editor: $EditorPath"
Write-Host ""

New-Item -Path "$classesRoot\.pr" -Force | Out-Null
Set-ItemProperty -Path "$classesRoot\.pr" -Name '(Default)' -Value $progId

New-Item -Path "$classesRoot\$progId" -Force | Out-Null
Set-ItemProperty -Path "$classesRoot\$progId" -Name '(Default)' -Value 'Parithi Source File'

New-Item -Path "$classesRoot\$progId\DefaultIcon" -Force | Out-Null
Set-ItemProperty -Path "$classesRoot\$progId\DefaultIcon" -Name '(Default)' -Value "$IconPath,0"

New-Item -Path "$classesRoot\$progId\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path "$classesRoot\$progId\shell\open\command" -Name '(Default)' -Value "`"$EditorPath`" `"%1`""

Write-Host "Registry updated under $classesRoot\.pr and $classesRoot\$progId" -ForegroundColor Green

# Explorer caches icons aggressively - restarting it is the reliable way
# to see the new icon immediately, without logging off.
$confirm = Read-Host "Restart Windows Explorer now to refresh the icon cache? [Y/n]"
if ($confirm -eq '' -or $confirm -match '^[Yy]') {
  Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 500
  Start-Process explorer.exe
  Write-Host "Explorer restarted." -ForegroundColor Green
} else {
  Write-Host "Skipped. The icon will appear after your next sign-in, or run:`n  Stop-Process -Name explorer -Force; Start-Process explorer.exe" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Done. Double-clicking a .pr file now opens it in VS Code, with the Parithi icon in Explorer." -ForegroundColor Green
