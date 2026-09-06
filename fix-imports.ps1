# Fix all broken lib import paths in one go

$fixes = @(
    @{ File = "app\api\personal\notify\room_details\route.js"; Old = "../../../../../lib"; New = "../../../../lib" },
    @{ File = "app\api\personal\tournament\resolve\route.js"; Old = "../../../../../lib"; New = "../../../../lib" },
    @{ File = "app\api\personal\tournament\active\route.js"; Old = "../../../../../lib"; New = "../../../../lib" },
    @{ File = "app\api\personal\notify\global\route.js"; Old = "../../../../../lib"; New = "../../../../lib" },
    @{ File = "app\api\personal\notify\personal\route.js"; Old = "../../../../../lib"; New = "../../../../lib" },
    @{ File = "app\api\personal\tournament\players\route.js"; Old = "../../../../../lib"; New = "../../../../lib" },
    @{ File = "app\api\cron\tournament-reminders\route.js"; Old = "../../../../lib"; New = "../../../lib" }
)

foreach ($fix in $fixes) {
    if (Test-Path $fix.File) {
        (Get-Content $fix.File -Raw) -replace [regex]::Escape($fix.Old), $fix.New | Set-Content $fix.File -NoNewline
        Write-Host "Fixed: $($fix.File)" -ForegroundColor Green
    } else {
        Write-Host "NOT FOUND (skip): $($fix.File)" -ForegroundColor Yellow
    }
}

Write-Host "`nDone. Ab 'lib' folder ka location bhi verify kar lo:" -ForegroundColor Cyan
if (Test-Path "app\lib\notifications") {
    Write-Host "app\lib\notifications OK hai" -ForegroundColor Green
} elseif (Test-Path "lib\notifications") {
    Write-Host "lib\notifications root mein hai — ise app\lib\ ke andar move karna padega!" -ForegroundColor Red
    Write-Host "Chalao: Move-Item lib\notifications app\lib\notifications" -ForegroundColor Yellow
} else {
    Write-Host "notifications folder hi nahi mila — check karo ki files bani hain ya nahi" -ForegroundColor Red
}