#Requires -Version 5.1
<#
.SYNOPSIS
  Removes the .pr file association added by Register-ParithiFileType.ps1,
  restoring Windows' previous default for .pr files (if any).

.NOTES
  Only removes what the register script adds - HKCU\Software\Classes\.pr
  and HKCU\Software\Classes\Parithi.SourceFile. Nothing machine-wide or
  outside your user profile is touched.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$progId = 'Parithi.SourceFile'
$classesRoot = 'HKCU:\Software\Classes'

$removed = $false

if (Test-Path "$classesRoot\.pr") {
  $current = (Get-ItemProperty -Path "$classesRoot\.pr" -Name '(Default)' -ErrorAction SilentlyContinue).'(Default)'
  if ($current -eq $progId) {
    Remove-Item -Path "$classesRoot\.pr" -Recurse -Force
    Write-Host "Removed $classesRoot\.pr" -ForegroundColor Green
    $removed = $true
  } else {
    Write-Host "$classesRoot\.pr points at '$current', not '$progId' - leaving it alone." -ForegroundColor Yellow
  }
}

if (Test-Path "$classesRoot\$progId") {
  Remove-Item -Path "$classesRoot\$progId" -Recurse -Force
  Write-Host "Removed $classesRoot\$progId" -ForegroundColor Green
  $removed = $true
}

if ($removed) {
  $confirm = Read-Host "Restart Windows Explorer now to refresh the icon cache? [Y/n]"
  if ($confirm -eq '' -or $confirm -match '^[Yy]') {
    Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
    Start-Process explorer.exe
  }
  Write-Host "Done." -ForegroundColor Green
} else {
  Write-Host "Nothing to remove." -ForegroundColor Yellow
}
