# Uses the existing release key. Secrets stay in this process and are restored afterward.
[CmdletBinding()]
param(
    [string]$Keystore = 'C:\Users\Owner\AndroidKeys\FinanceBuilder\finance-builder-release.jks',
    [string]$KeyAlias = 'financebuilder'
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $Keystore -PathType Leaf)) {
    throw 'The existing keystore was not found. Supply -Keystore with its actual path.'
}
$signingNames = @('FINANCE_ANDROID_KEYSTORE', 'FINANCE_ANDROID_STORE_PASSWORD', 'FINANCE_ANDROID_KEY_ALIAS', 'FINANCE_ANDROID_KEY_PASSWORD')
$previousValues = @{}
foreach ($name in $signingNames) { $previousValues[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
function Read-PrivateValue([string]$Prompt) {
    $secureValue = Read-Host $Prompt -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer); $secureValue.Dispose() }
}
try {
    $env:FINANCE_ANDROID_KEYSTORE = (Resolve-Path -LiteralPath $Keystore).Path
    if (-not $env:FINANCE_ANDROID_KEY_ALIAS) { $env:FINANCE_ANDROID_KEY_ALIAS = $KeyAlias }
    if (-not $env:FINANCE_ANDROID_KEY_ALIAS) { $env:FINANCE_ANDROID_KEY_ALIAS = Read-Host 'Existing release key alias' }
    if (-not $env:FINANCE_ANDROID_STORE_PASSWORD) { $env:FINANCE_ANDROID_STORE_PASSWORD = Read-PrivateValue 'Existing keystore password' }
    if (-not $env:FINANCE_ANDROID_KEY_PASSWORD) { $env:FINANCE_ANDROID_KEY_PASSWORD = Read-PrivateValue 'Existing key password (enter the same password if shared)' }
    foreach ($name in $signingNames) {
        if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) { throw "Missing $name." }
    }
    $keytool = Join-Path $env:ProgramFiles 'Android\Android Studio\jbr\bin\keytool.exe'
    if (-not (Test-Path -LiteralPath $keytool)) { throw 'Android Studio bundled Java 21 was not found.' }
    & $keytool -list -keystore $env:FINANCE_ANDROID_KEYSTORE -alias $env:FINANCE_ANDROID_KEY_ALIAS -storepass:env FINANCE_ANDROID_STORE_PASSWORD | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'The existing keystore password or alias is invalid. No replacement key was created.' }
    & (Join-Path $PSScriptRoot '..\build-android.ps1') -Mode Release
} finally {
    foreach ($name in $signingNames) { [Environment]::SetEnvironmentVariable($name, $previousValues[$name], 'Process') }
    $previousValues.Clear()
}
