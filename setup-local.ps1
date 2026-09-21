$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

if (-not (Test-Path ".dev.vars")) {
  Copy-Item ".dev.vars.example" ".dev.vars"
  Write-Host "Created .dev.vars" -ForegroundColor Green
}

Write-Host ""
Write-Host "Local registration needs two private values:" -ForegroundColor Cyan
Write-Host "  1. SUPABASE_SECRET_KEY"
Write-Host "  2. EXPORT_SMTP_PASSWORD"
Write-Host ""
Write-Host "They are intentionally NOT stored inside the ZIP." -ForegroundColor Yellow
Write-Host "Fill them in the file that will open now, save it, then restart npm run dev."
Write-Host ""

Start-Process notepad.exe ".dev.vars"
