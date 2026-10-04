# One-time local setup: creates the fleetflow database, writes .env and loads demo data.
# Run from the backend folder:
#   powershell -ExecutionPolicy Bypass -File scripts\setup_local.ps1

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot)

$psql = "C:\Program Files\PostgreSQL\17\bin\psql.exe"
$python = ".\.venv\Scripts\python.exe"

$secure = Read-Host "PostgreSQL password for user 'postgres'" -AsSecureString
$password = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
$env:PGPASSWORD = $password

try {
    $exists = & $psql -U postgres -h localhost -tAc "SELECT 1 FROM pg_database WHERE datname = 'fleetflow'"
    if ($LASTEXITCODE -ne 0) { throw "Could not connect to PostgreSQL. Check the password and try again." }

    if ("$exists".Trim() -eq "1") {
        Write-Host "Database 'fleetflow' already exists."
    } else {
        & $psql -U postgres -h localhost -c "CREATE DATABASE fleetflow" | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Could not create the database." }
        Write-Host "Database 'fleetflow' created."
    }
} finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}

# Passwords with symbols like @ or # must be URL-encoded inside the connection string
$encodedPassword = [uri]::EscapeDataString($password)
$jwtSecret = & $python -c "import secrets; print(secrets.token_hex(32))"
$envFile = @"
DATABASE_URL=postgresql+psycopg://postgres:$encodedPassword@localhost:5432/fleetflow
JWT_SECRET=$jwtSecret
ACCESS_TOKEN_MINUTES=60
"@
# Write without a byte-order mark so the settings loader reads the first line correctly
[IO.File]::WriteAllText((Join-Path (Get-Location) ".env"), $envFile, (New-Object Text.UTF8Encoding $false))
Write-Host ".env written."

& $python -m scripts.init_db --seed
if ($LASTEXITCODE -ne 0) { throw "Creating tables failed." }

Write-Host ""
Write-Host "All set. Start the API with:  .\.venv\Scripts\uvicorn.exe app.main:app --reload"
Write-Host "Then open http://localhost:8000/docs"
