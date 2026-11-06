# EasyPrint Credential & Default Secrets Scanner (PowerShell)
# Fails with exit code 1 if any known default passwords appear in source or docs.

$forbiddenPatterns = @(
    "Owner@123",
    "Admin@EasyPrint2026!",
    "Admin@123456"
)

$found = 0
Write-Host "[Secrets Check] Scanning repository for forbidden default credential patterns..." -ForegroundColor Cyan

# Check if git is available
$isGit = $false
try {
    $gitCheck = git rev-parse --is-inside-work-tree 2>$null
    if ($gitCheck -eq "true") { $isGit = $true }
} catch {
    $isGit = $false
}

if ($isGit) {
    foreach ($pattern in $forbiddenPatterns) {
        $gitMatches = git grep -n -I --untracked -F "$pattern" -- ':!scripts/check-secrets.*' ':!.env' 2>$null
        if ($gitMatches) {
            Write-Host "[ERROR] Forbidden pattern '$pattern' found:" -ForegroundColor Red
            Write-Host $gitMatches -ForegroundColor Yellow
            $found = 1
        }
    }
} else {
    $excludedDirs = @('node_modules', '.git', 'dist', 'bin', 'obj', 'publish', '.data', '.redis')
    $files = Get-ChildItem -Path . -Recurse -File | Where-Object {
        $fullName = $_.FullName
        $skip = $false
        foreach ($d in $excludedDirs) {
            if ($fullName -like "*\$d\*") { $skip = $true; break }
        }
        (-not $skip) -and ($_.Name -notmatch '^check-secrets\.(sh|ps1)$') -and ($_.Name -ne '.env')
    }

    foreach ($pattern in $forbiddenPatterns) {
        $matches = $files | Select-String -Pattern $pattern -SimpleMatch
        if ($matches) {
            Write-Host "[ERROR] Forbidden pattern '$pattern' found:" -ForegroundColor Red
            foreach ($m in $matches) {
                Write-Host "  $($m.Path):$($m.LineNumber): $($m.Line.Trim())" -ForegroundColor Yellow
            }
            $found = 1
        }
    }
}

if ($found -ne 0) {
    Write-Host "`n==========================================================================" -ForegroundColor Red
    Write-Host " [SECURITY VIOLATION] Known default credentials found in repository!" -ForegroundColor Red
    Write-Host " Replace them with environment variable placeholders (e.g. <OWNER_SEED_PASSWORD>)" -ForegroundColor Red
    Write-Host "==========================================================================`n" -ForegroundColor Red
    exit 1
}

Write-Host "[OK] No default secrets detected across repository." -ForegroundColor Green
exit 0
