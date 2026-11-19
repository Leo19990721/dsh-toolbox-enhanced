#requires -Version 7.0
param([string]$NodePath, [string]$PnpmPath, [switch]$InstalledRuntime)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json
$node = if ($NodePath) { $NodePath } else { (Get-Command node -ErrorAction Stop).Source }
function Invoke-Node([string[]]$NodeArgs, [hashtable]$ExtraEnv = @{}, [string]$Executable = $node) {
  $start = [System.Diagnostics.ProcessStartInfo]::new($Executable)
  $start.WorkingDirectory = $root
  foreach ($arg in $NodeArgs) { $start.ArgumentList.Add($arg) }
  foreach ($name in $ExtraEnv.Keys) { $start.Environment[$name] = $ExtraEnv[$name] }
  if ([System.IO.Path]::GetFileName($Executable) -match 'Harness|Electron') { $start.Environment['ELECTRON_RUN_AS_NODE'] = '1' }
  $start.UseShellExecute = $false; $start.CreateNoWindow = $true
  $start.RedirectStandardOutput = $true; $start.RedirectStandardError = $true
  $process = [System.Diagnostics.Process]::Start($start)
  $stderr = $process.StandardError.ReadToEndAsync()
  $stdout = $process.StandardOutput.ReadToEnd()
  $process.WaitForExit()
  [Console]::Out.Write($stdout); [Console]::Error.Write($stderr.Result)
  if ($process.ExitCode -ne 0) { throw "Node command failed ($($process.ExitCode)): $($NodeArgs -join ' ')" }
}
Invoke-Node -NodeArgs @('scripts/build-enhanced.mjs')
if ($InstalledRuntime) {
  if (!$env:DSH_INSTALL_DIR -or !$env:DSH_NODE_EXECUTABLE) { throw 'InstalledRuntime requires DSH_INSTALL_DIR and DSH_NODE_EXECUTABLE.' }
  Invoke-Node -NodeArgs @('scripts/test.mjs', '--installed-runtime') -Executable $env:DSH_NODE_EXECUTABLE
} else {
  Invoke-Node -NodeArgs @('scripts/test.mjs')
}
foreach ($file in @('host.js','client.js','src/client-shell.js','src/startup-timeout.js')) { Invoke-Node -NodeArgs @('--check', $file) }
$tarball = Join-Path $root ".local-install/dsh-toolbox-enhanced-$($manifest.version).tgz"
if ($PnpmPath) { Invoke-Node -NodeArgs @($PnpmPath, 'pack', '--out', $tarball) }
else { Push-Location $root; try { & pnpm pack --out $tarball; if ($LASTEXITCODE -ne 0) { throw 'pnpm pack failed' } } finally { Pop-Location } }
Invoke-Node -NodeArgs @('--test', 'test/release.test.mjs') -ExtraEnv @{ RELEASE_TGZ = $tarball }
$hash = (Get-FileHash -LiteralPath $tarball -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -LiteralPath ($tarball + '.sha256') -Value ($hash + '  ' + [System.IO.Path]::GetFileName($tarball)) -Encoding utf8NoBOM
Write-Output "Release ready: $tarball"
