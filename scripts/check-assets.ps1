$repo = Split-Path -Parent $PSScriptRoot

$required = @(
    "public\assets\background.png",
    "public\assets\thank-you-background.png",
    "public\assets\thank-you-card.png",
    "public\assets\logo.png",
    "public\assets\Changlong-Catalogue.pdf"
)

$ok = $true

foreach ($relative in $required) {
    $path = Join-Path $repo $relative
    if (Test-Path $path) {
        $item = Get-Item $path
        $sizeMB = [math]::Round($item.Length / 1MB, 2)
        Write-Host "OK      $relative ($sizeMB MB)"
    } else {
        Write-Host "MISSING $relative"
        $ok = $false
    }
}

if (-not $ok) {
    Write-Host ""
    Write-Host "Do not deploy until the missing required asset is added."
    exit 1
}

Write-Host ""
Write-Host "All required assets are present."
