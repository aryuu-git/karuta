.PHONY: dev build run frontend-dev frontend-build clean

# 启动后端（开发模式）
run:
	go run ./cmd/server

# 编译后端
build-server:
	go build -o karuta-server ./cmd/server

# 编译前端
frontend-build:
	cd frontend && npm run build

# 前端开发服务器
frontend-dev:
	cd frontend && npm run dev

# 完整构建（前端 + 后端）
build: frontend-build build-server

# 清理
clean:
	rm -f karuta-server
	rm -rf frontend/dist
