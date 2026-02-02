# Miraç Birben Deprem API Servisi - Server Management Script

Write-Host "🌍 Miraç Birben Deprem API Servisi" -ForegroundColor Green
Write-Host "===================================" -ForegroundColor Green

# Check if port 3000 is in use
$portCheck = netstat -ano | Select-String ":3000"
if ($portCheck) {
    Write-Host "⚠️  Port 3000 is already in use:" -ForegroundColor Yellow
    Write-Host $portCheck -ForegroundColor Yellow
    
    $response = Read-Host "Do you want to stop the existing process? (y/n)"
    if ($response -eq 'y' -or $response -eq 'Y') {
        $pid = ($portCheck -split '\s+')[-1]
        Stop-Process -Id $pid -Force
        Write-Host "✅ Stopped process $pid" -ForegroundColor Green
        Start-Sleep -Seconds 2
    } else {
        Write-Host "❌ Cannot start server while port is in use" -ForegroundColor Red
        exit 1
    }
}

# Start the server
Write-Host "🚀 Starting Miraç Birben Deprem API Servisi (Production Mode)..." -ForegroundColor Cyan
Write-Host "🌐 Server: http://127.0.0.1:3000" -ForegroundColor Yellow
Write-Host "📡 API: http://127.0.0.1:3000/api" -ForegroundColor Yellow
npm start