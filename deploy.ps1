# ========== 修改这里 ==========
$SERVER = "root@your-server"   # 替换为你的服务器 IP
$LOCAL  = "D:\aryuu_workspace\karuta"
# ==============================

Write-Host "🌸 开始部署..." -ForegroundColor Magenta

# 1. 编译后端（Linux 二进制）
Write-Host "`n[1/4] 编译后端..." -ForegroundColor Yellow
$env:GOOS="linux"; $env:GOARCH="amd64"
& go build -o "$LOCAL\karuta-server-linux" "$LOCAL\cmd\server"
if ($LASTEXITCODE -ne 0) { Write-Host "❌ 后端编译失败！" -ForegroundColor Red; exit 1 }
Write-Host "✓ 后端编译完成" -ForegroundColor Green

# 2. 编译前端
Write-Host "`n[2/4] 编译前端..." -ForegroundColor Yellow
Set-Location "$LOCAL\frontend"
& npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "❌ 前端编译失败！" -ForegroundColor Red; Set-Location $LOCAL; exit 1 }
Write-Host "✓ 前端编译完成" -ForegroundColor Green
Set-Location $LOCAL

# 3. 上传到服务器
Write-Host "`n[3/4] 上传文件..." -ForegroundColor Yellow
& scp "$LOCAL\karuta-server-linux" "${SERVER}:/opt/karuta/karuta-server"
& scp -r "$LOCAL\frontend\dist\*" "${SERVER}:/opt/karuta/frontend/dist/"
Write-Host "✓ 文件上传完成" -ForegroundColor Green

# 4. 重启服务
Write-Host "`n[4/4] 重启服务..." -ForegroundColor Yellow
& ssh $SERVER "chmod +x /opt/karuta/karuta-server && systemctl restart karuta"
Write-Host "✓ 服务重启完成" -ForegroundColor Green

Write-Host "`n🌸 部署完成！(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧" -ForegroundColor Magenta
