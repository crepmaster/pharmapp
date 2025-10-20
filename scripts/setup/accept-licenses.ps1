# Accept Android Licenses Script
Write-Host "Accepting Android SDK Licenses..." -ForegroundColor Yellow
Write-Host "This will automatically accept all licenses." -ForegroundColor Gray
Write-Host ""

# Run flutter doctor --android-licenses with automatic yes responses
$process = Start-Process -FilePath "flutter" -ArgumentList "doctor", "--android-licenses" -NoNewWindow -Wait -PassThru

if ($process.ExitCode -eq 0) {
    Write-Host "Android licenses accepted successfully!" -ForegroundColor Green
} else {
    Write-Host "There was an issue accepting licenses. Please run manually:" -ForegroundColor Yellow
    Write-Host "flutter doctor --android-licenses" -ForegroundColor White
}
