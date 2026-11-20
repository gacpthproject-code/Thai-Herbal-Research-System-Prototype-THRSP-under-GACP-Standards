#Requires -Version 5.1
<#
.SYNOPSIS
  Free space on the C: drive by removing stale, project-related caches that
  belong on D: or no longer need to exist.

.DESCRIPTION
  Generated 2026-04-27 after a Claude Code session found C: drive at 98.6%
  used (1.7 GB free). The project itself lives on D:; what remains on C:
  are shared dev caches and an unused old pnpm store from before the
  store-dir was migrated to D:\.pnpm-store.

  Each step is isolated and idempotent. Read each `Step` block before
  running. Pass -DryRun to print what would be deleted without touching
  anything.

  Order of operations:
    1) STOP Claude Desktop & Docker Desktop (we delete data they own)
    2) Delete Claude Desktop's vm_bundles (will redownload on next launch)
    3) Delete old pnpm store on C: (config already points to D:\.pnpm-store)
    4) Delete Playwright browser cache (will redownload on next E2E)
    5) Delete VS Code workspaceStorage entries that no longer match a path
       on disk (stale projects you no longer have)
    6) Trim Windows Update download cache (system-level safe trim)

  Not done by this script (decide first, then run separately):
    - Uninstalling Docker Desktop entirely
    - Moving WSL2 distros to D:
    - Removing the est-website project on OneDrive

.PARAMETER DryRun
  Print what would be deleted; do not delete.

.EXAMPLE
  .\cleanup-c-drive.ps1 -DryRun
  .\cleanup-c-drive.ps1
#>

[CmdletBinding()]
param(
  [switch]$DryRun
)

$ErrorActionPreference = 'Continue'

function Show-Drives {
  Get-Volume | Where-Object { $_.DriveLetter -in 'C','D' } |
    Select-Object DriveLetter,
      @{n='Free(GB)';e={[math]::Round($_.SizeRemaining/1GB,2)}},
      @{n='Used(GB)';e={[math]::Round(($_.Size-$_.SizeRemaining)/1GB,2)}} |
    Format-Table -AutoSize
}

function Get-DirSizeGB($path) {
  if (-not (Test-Path $path)) { return 0.0 }
  try {
    $sum = (Get-ChildItem -Path $path -Recurse -Force -File -ErrorAction SilentlyContinue |
      Measure-Object -Property Length -Sum).Sum
    if ($null -eq $sum) { return 0.0 }
    return [math]::Round($sum/1GB, 2)
  } catch { return -1 }
}

function Remove-PathSafe($path, $label) {
  $size = Get-DirSizeGB $path
  if (-not (Test-Path $path)) {
    Write-Host "  [skip] $label  ($path) — not present" -ForegroundColor DarkGray
    return
  }
  if ($DryRun) {
    Write-Host "  [DRY ] $label  $size GB at $path" -ForegroundColor Yellow
    return
  }
  Write-Host "  [del ] $label  $size GB at $path" -ForegroundColor Cyan
  Remove-Item $path -Recurse -Force -ErrorAction Continue
  if (Test-Path $path) {
    $remaining = Get-DirSizeGB $path
    Write-Host "         partial — $remaining GB remaining (may be locked)" -ForegroundColor Red
  } else {
    Write-Host "         OK" -ForegroundColor Green
  }
}

# ─── Pre-flight ──────────────────────────────────────────────────────────

Write-Host "=== Pre-flight: drive state ===" -ForegroundColor White
Show-Drives

# Detect running Claude Desktop (Microsoft Store packaged app), excluding
# the VS Code Claude Code extension's bundled `claude.exe`.
$claudeDesktop = Get-Process -ErrorAction SilentlyContinue | Where-Object {
  $_.ProcessName -like '*claude*' -and
  $_.Path -notlike '*\.vscode\extensions\*' -and
  $_.Path -notlike '*\node_modules\*'
}
if ($claudeDesktop) {
  Write-Host ""
  Write-Host "WARNING: Claude Desktop appears to still be running:" -ForegroundColor Yellow
  $claudeDesktop | Select-Object ProcessName, Id, Path | Format-Table -AutoSize -Wrap
  Write-Host "  Quit Claude Desktop and re-run this script." -ForegroundColor Yellow
  if (-not $DryRun) { exit 1 }
}

# Detect running Docker Desktop. We don't need to kill it for the
# operations in this script (we're not touching Docker data here),
# but flag it so the user knows.
$dockerDesktop = Get-Process -ErrorAction SilentlyContinue -Name 'Docker Desktop' -ErrorAction SilentlyContinue
if ($dockerDesktop) {
  Write-Host "  (Docker Desktop is running — fine, this script does not touch it.)"
}

# ─── Step 2: Claude Desktop vm_bundles ───────────────────────────────────

Write-Host ""
Write-Host "=== Step 2: Claude Desktop vm_bundles (~11 GB) ===" -ForegroundColor White
Remove-PathSafe `
  'C:\Users\charo\AppData\Local\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\vm_bundles' `
  'vm_bundles'

# Old claude-code CLI version 2.1.111 (current is 2.1.119 / 2.1.120)
Remove-PathSafe `
  'C:\Users\charo\AppData\Local\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\claude-code\2.1.111' `
  'claude-code 2.1.111 (old)'

# ─── Step 3: Old pnpm store on C: ────────────────────────────────────────
# pnpm's current store is at D:\.pnpm-store (verified via `pnpm store path`)
# so this directory is leftover from before the migration.

Write-Host ""
Write-Host "=== Step 3: Old pnpm store on C: (~1.3 GB) ===" -ForegroundColor White
Remove-PathSafe 'C:\Users\charo\AppData\Local\pnpm\store\v3'  'pnpm v3 store (old)'
Remove-PathSafe 'C:\Users\charo\AppData\Local\pnpm\store\v10' 'pnpm v10 store (old)'

# ─── Step 4: Playwright browser cache ────────────────────────────────────
# Playwright will redownload browsers on the next E2E run (~5 min).

Write-Host ""
Write-Host "=== Step 4: Playwright browser cache (~0.7 GB) ===" -ForegroundColor White
Remove-PathSafe 'C:\Users\charo\AppData\Local\ms-playwright' 'ms-playwright'

# ─── Step 5: VS Code workspaceStorage stale entries ──────────────────────
# Each entry under workspaceStorage references a workspace by hash. If the
# referenced workspace folder no longer exists on disk, the cache is dead.

Write-Host ""
Write-Host "=== Step 5: VS Code workspaceStorage (stale only) ===" -ForegroundColor White
$wsRoot = 'C:\Users\charo\AppData\Roaming\Code\User\workspaceStorage'
if (Test-Path $wsRoot) {
  $stale = @()
  Get-ChildItem $wsRoot -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    $meta = Join-Path $_.FullName 'workspace.json'
    if (Test-Path $meta) {
      try {
        $j = Get-Content $meta -Raw | ConvertFrom-Json
        $folder = $null
        if ($j.folder) { $folder = $j.folder -replace '^file:///','' -replace '%3A',':' }
        if ($j.configuration) { $folder = $j.configuration -replace '^file:///','' -replace '%3A',':' }
        if ($folder -and -not (Test-Path $folder)) {
          $stale += [PSCustomObject]@{ Hash = $_.Name; Folder = $folder; Path = $_.FullName }
        }
      } catch {}
    }
  }
  if ($stale.Count -gt 0) {
    Write-Host "  Found $($stale.Count) stale workspaceStorage entries:"
    $stale | Format-Table Hash, Folder -AutoSize
    foreach ($s in $stale) { Remove-PathSafe $s.Path "stale ws $($s.Hash)" }
  } else {
    Write-Host "  No stale entries — skipping."
  }
} else {
  Write-Host "  workspaceStorage absent."
}

# ─── Step 6: Windows Update download cache (safe to trim) ────────────────
# This is the on-disk cache of update payloads already applied. Windows
# regenerates it on demand. Net Stop wuauserv is required; revert at end.
# We attempt a soft trim; if elevation is missing, this step no-ops.

Write-Host ""
Write-Host "=== Step 6: Windows Update download cache (~variable) ===" -ForegroundColor White
$wuPath = 'C:\Windows\SoftwareDistribution\Download'
$wuSize = Get-DirSizeGB $wuPath
Write-Host "  $wuPath = $wuSize GB"
Write-Host "  (skipped here — requires admin elevation; run from an elevated"
Write-Host "   PowerShell:  net stop wuauserv;  Remove-Item '$wuPath\*' -Recurse -Force;  net start wuauserv)"

# ─── Wrap up ─────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "=== Final drive state ===" -ForegroundColor White
Show-Drives

Write-Host ""
Write-Host "Done. If C: is still tight, consider:" -ForegroundColor White
Write-Host "  - Uninstall Docker Desktop (you said Docker runs on the server, not local)" -ForegroundColor White
Write-Host "  - Move WSL2 distros to D: with: wsl --export <distro> + wsl --import to D:" -ForegroundColor White
Write-Host "  - The OneDrive\GitHub\est-website project is on C: (652 MB) — not GACP" -ForegroundColor White
