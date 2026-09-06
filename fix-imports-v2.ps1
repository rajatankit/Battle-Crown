$fixes = @(
    @{ File = "app\api\personal\notify\room_details\route.js"; Ups = 4 },
    @{ File = "app\api\personal\notify\global\route.js"; Ups = 4 },
    @{ File = "app\api\personal\notify\personal\route.js"; Ups = 4 },
    @{ File = "app\api\personal\tournament\resolve\route.js"; Ups = 4 },
    @{ File = "app\api\personal\tournament\active\route.js"; Ups = 4 },
    @{ File = "app\api\personal\tournament\players\route.js"; Ups = 4 },
    @{ File = "app\api\personal\slides\attach\route.js"; Ups = 4 },
    @{ File = "app\api\cron\tournament-reminders\route.js"; Ups = 3 }
)

foreach ($fix in $fixes) {
    if (Test-Path $fix.File) {
        $correctPrefix = ("../" * $fix.Ups) + "lib"
        $content = Get-Content $fix.File -Raw
        $newContent = $content -replace '(\.\./)+lib', $correctPrefix
        Set-Content -Path $fix.File -Value $newContent -NoNewline
        Write-Host "Fixed: $($fix.File) -> $correctPrefix" -ForegroundColor Green
    } else {
        Write-Host "NOT FOUND: $($fix.File)" -ForegroundColor Yellow
    }
}

Write-Host "`nDone. Ab build chalao: npm run build" -ForegroundColor Cyan