# Run from frontend. Release mode never creates or substitutes a signing key.
param([ValidateSet('Release','Debug','VerifyUnsigned')][string]$Mode = 'Release')
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
if (-not (Test-Path -LiteralPath (Join-Path $env:JAVA_HOME 'bin\java.exe'))) { throw 'Set JAVA_HOME to a Java 21 JDK.' }
if ($Mode -eq 'Release') {
    foreach ($key in @('FINANCE_ANDROID_KEYSTORE','FINANCE_ANDROID_STORE_PASSWORD','FINANCE_ANDROID_KEY_ALIAS','FINANCE_ANDROID_KEY_PASSWORD')) {
        if (-not [Environment]::GetEnvironmentVariable($key)) { throw "Missing $key. Read ANDROID_RELEASE.md; never put passwords in source files." }
    }
    if (-not (Test-Path -LiteralPath $env:FINANCE_ANDROID_KEYSTORE)) { throw 'Signing keystore does not exist.' }
}
$env:VITE_API_BASE_URL = 'https://finance-builder-api.onrender.com'
npm run android:sync
if ($LASTEXITCODE -ne 0) { throw 'Mobile build or Capacitor sync failed.' }
$androidProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'android'))
$projectHasher = [System.Security.Cryptography.SHA256]::Create()
try {
    $projectDigest = $projectHasher.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($androidProjectRoot.ToLowerInvariant()))
    $projectKey = ([System.BitConverter]::ToString($projectDigest)).Replace('-', '').ToLowerInvariant().Substring(0, 12)
} finally { $projectHasher.Dispose() }
$buildRoot = Join-Path $env:LOCALAPPDATA "FinanceBuilder\android\$projectKey\outputs"
# OneDrive placeholders can be readable yet fail Gradle's regular-file check.
# Materialize a plain, immutable asset snapshot outside the synced source tree.
$assetRoot = Join-Path $buildRoot ("asset-snapshots\" + [Guid]::NewGuid().ToString('N'))
$sourceAssets = Join-Path $androidProjectRoot 'app\src\main\assets'
New-Item -ItemType Directory -Path $assetRoot -Force | Out-Null
foreach ($asset in Get-ChildItem -LiteralPath $sourceAssets -File -Recurse) {
    $relative = [IO.Path]::GetRelativePath($sourceAssets, $asset.FullName)
    $destination = Join-Path $assetRoot $relative
    New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
    [IO.File]::WriteAllBytes($destination, [IO.File]::ReadAllBytes($asset.FullName))
}
Push-Location -LiteralPath (Join-Path $PSScriptRoot 'android')
try {
    $gradleArgs = @("-PfinanceBuildRoot=$buildRoot", "-PfinanceAssetRoot=$assetRoot", '--console=plain', '--no-daemon')
    if ($Mode -eq 'Debug') { $gradleArgs += 'assembleDebug' }
    else { $gradleArgs += 'assembleRelease' }
    if ($Mode -eq 'VerifyUnsigned') { $gradleArgs += '-PfinanceUnsignedVerification=true' }
    & .\gradlew.bat @gradleArgs
    if ($LASTEXITCODE -ne 0) { throw 'Gradle failed.' }
} finally { Pop-Location }
$variant = if ($Mode -eq 'Debug') { 'debug' } else { 'release' }
$name = if ($Mode -eq 'VerifyUnsigned') { 'app-release-unsigned.apk' } else { "app-$variant.apk" }
$apkPath = Join-Path $buildRoot "app\outputs\apk\$variant\$name"
if ($Mode -eq 'Release') {
    & (Join-Path $env:ANDROID_HOME 'build-tools\36.0.0\apksigner.bat') verify --verbose --print-certs $apkPath
    if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed. Do not distribute.' }
}
Get-Item -LiteralPath $apkPath | Select-Object FullName,Length
Get-FileHash -LiteralPath $apkPath -Algorithm SHA256
if ($Mode -ne 'Release') { Write-Warning 'Verification build only. Do not publish this as the official Finance Builder app.' }
