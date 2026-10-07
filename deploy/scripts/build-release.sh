#!/usr/bin/env bash
# =============================================================================
# 打发布包（在开发机/CI 上运行，产物交给服务器上的 deploy-oneclick.sh）
#
# 产出（落在仓库根目录）：
#   karuta-<版本>.tar.zst      整包：karuta-server + karuta-admin + VERSION + frontend/dist
#   karuta-fe-<版本>.tar.zst   仅前端：dist/（用于"只换前端、不重启服务"的更新）
#   *.sha256                   校验和（deploy-oneclick.sh 会自动核对）
#
# 用法：
#   ./build-release.sh                 # 版本号默认 <日期>-1，如 20261005-1
#   ./build-release.sh 20261005-3      # 指定版本号（会写进 /version 接口）
#
# 环境变量：
#   SKIP_TESTS=1   跳过 go test / 前端测试（赶时间时用，不推荐）
#   TAR=...        指定带 zstd 的 tar（Windows Git Bash 下可用 /c/Windows/System32/tar.exe）
# =============================================================================
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VERSION="${1:-$(date +%Y%m%d)-1}"
TAR="${TAR:-tar}"

c_info() { printf '\033[36m>>\033[0m %s\n' "$*"; }
c_ok()   { printf '\033[32mOK\033[0m %s\n' "$*"; }
c_warn() { printf '\033[33m!!\033[0m %s\n' "$*"; }
die()    { printf '\033[31mXX\033[0m %s\n' "$*" >&2; exit 1; }

case "$VERSION" in
  *[!A-Za-z0-9._-]*|'') die "版本号只能含字母/数字/._-：$VERSION" ;;
esac

command -v go  >/dev/null 2>&1 || die "缺少 go"
command -v npm >/dev/null 2>&1 || die "缺少 npm"

# tar 需要 zstd 支持（GNU tar + zstd 或 bsdtar）；Windows Git Bash 自带的 tar 不支持
probe_tar() { # 真打一个临时包做往返验证，比看 --help 可靠
  local t="$1" tmpd rc
  tmpd="$(mktemp -d)" || return 1
  ( cd "$tmpd" && printf 'x' > probe.txt && "$t" --zstd -cf out.tar.zst probe.txt ) >/dev/null 2>&1
  rc=$?
  rm -rf "$tmpd"
  return $rc
}
if ! probe_tar "$TAR"; then
  for c in /c/Windows/System32/tar.exe /mnt/c/Windows/System32/tar.exe; do
    if [[ -x "$c" ]] && probe_tar "$c"; then TAR="$c"; break; fi
  done
fi
if ! probe_tar "$TAR"; then
  die "当前 tar 不支持 --zstd（Linux: yum install -y zstd；Windows: TAR=/c/Windows/System32/tar.exe ./build-release.sh $VERSION）"
fi

cd "$ROOT"
c_info "仓库根目录：$ROOT"
c_info "版本号：$VERSION"

# ---------------------------------------------------------------------------
# 1) 测试（默认跑，SKIP_TESTS=1 跳过）
# ---------------------------------------------------------------------------
if [[ "${SKIP_TESTS:-0}" != "1" ]]; then
  c_info "后端测试 go test ./..."
  ( cd backend && go test ./... >/dev/null )
  c_ok "后端测试通过"
  c_info "前端检查（design:lint + 单测）"
  ( cd frontend && [[ -d node_modules ]] || npm ci )
  ( cd frontend && npm run design:lint >/dev/null )
  ( cd frontend && NODE_ENV=test npx vitest run --reporter=basic >/dev/null )
  c_ok "前端检查通过"
else
  c_warn "已跳过测试（SKIP_TESTS=1）"
fi

# ---------------------------------------------------------------------------
# 2) 前端生产构建 → data/dist
# ---------------------------------------------------------------------------
c_info "构建前端（vite build → data/dist）"
( cd frontend && [[ -d node_modules ]] || npm ci )
( cd frontend && npm run build >/dev/null )
c_ok "前端产物：data/dist"

# ---------------------------------------------------------------------------
# 3) 交叉编译 Linux amd64 二进制
# ---------------------------------------------------------------------------
c_info "交叉编译 Linux 二进制（CGO_ENABLED=0 GOOS=linux GOARCH=amd64）"
rm -rf release
mkdir -p release/frontend
( cd backend &&
  CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath \
    -ldflags "-s -w -X main.version=$VERSION -X main.commit=${GIT_COMMIT:-local} -X main.buildTime=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    -o ../release/karuta-server ./cmd/server ) || die "karuta-server 编译失败"
( cd backend &&
  CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath \
    -ldflags "-s -w" -o ../release/karuta-admin ./cmd/admin ) || die "karuta-admin 编译失败"
c_ok "二进制：release/karuta-server、release/karuta-admin"

cp -R data/dist release/frontend/dist
printf '%s\n' "$VERSION" > release/VERSION

# ---------------------------------------------------------------------------
# 4) 打包 + 校验和
# ---------------------------------------------------------------------------
FULL="karuta-$VERSION.tar.zst"
FE="karuta-fe-$VERSION.tar.zst"
rm -f "$FULL" "$FE" "$FULL.sha256" "$FE.sha256"

c_info "打包整包：$FULL"
"$TAR" --zstd -cf "$FULL" -C release .
c_info "打包仅前端：$FE"
"$TAR" --zstd -cf "$FE" -C release/frontend dist

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'
  else shasum -a 256 "$1" | awk '{print $1}'
  fi
}
for f in "$FULL" "$FE"; do
  printf '%s  %s\n' "$(sha256_of "$f")" "$f" > "$f.sha256"
done

# ---------------------------------------------------------------------------
# 5) 结果
# ---------------------------------------------------------------------------
printf '\n'
c_ok "打包完成"
for f in "$FULL" "$FE"; do
  printf '  %-32s %12s B  %s\n' "$f" "$(stat -c%s "$f" 2>/dev/null || stat -f%z "$f")" "$(awk '{print substr($1,1,16)}' "$f.sha256")..."
done
printf '  前端主 JS：%s\n' "$(grep -o 'assets/index-[A-Za-z0-9._-]*\.js' data/dist/index.html | head -1)"
printf '\n'
c_info "上传到服务器（同一个目录）："
c_info "  deploy/scripts/deploy-oneclick.sh  +  $FE（+ 同名 .sha256）"
c_info "服务器执行：sudo ./deploy-oneclick.sh $FE"
