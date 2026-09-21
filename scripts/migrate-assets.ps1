$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
$publicAssets = Join-Path $repo "public\assets"
$oldAssets = Join-Path $repo "assets"

New-Item -ItemType Directory -Path $publicAssets -Force | Out-Null

Write-Host "Repo:" $repo
Write-Host ""

$backgroundCandidates = @(
    (Join-Path $oldAssets "background.png"),
    (Join-Path $repo "background.png")
)

$catalogueCandidates = @(
    (Join-Path $oldAssets "Changlong-Catalogue.pdf"),
    (Join-Path $repo "Changlong-Catalogue.pdf")
)

$background = $backgroundCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
$catalogue = $catalogueCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($background) {
    Copy-Item $background (Join-Path $publicAssets "background.png") -Force
    Write-Host "BACKGROUND copied:" $background
} else {
    Write-Host "BACKGROUND missing. Put background.png in public\assets."
}

if ($catalogue) {
    Copy-Item $catalogue (Join-Path $publicAssets "Changlong-Catalogue.pdf") -Force
    Write-Host "CATALOGUE copied:" $catalogue
} else {
    Write-Host "CATALOGUE missing. Put Changlong-Catalogue.pdf in public\assets."
}

Write-Host ""
Write-Host "Run .\scripts\check-assets.ps1 to verify."
