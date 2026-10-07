#!/usr/bin/env bash
# =============================================================================
# 一键部署（原地替换版）—— 在服务器上以 root 运行
#
#   流程：校验发布包 → 备份(库 + 旧二进制 + 旧前端) → 停服 → 替换 → 起服
#         → 健康检查(/readyz) → 失败自动回滚 → 清理旧备份
#
# 用法（把发布包和本脚本放同一目录，或显式指定包路径）：
#   sudo ./deploy-oneclick.sh                    # 自动找 karuta-*.tar.zst
#   sudo ./deploy-oneclick.sh /tmp/karuta-fe-xxx.tar.zst
#
# 两种包都用同一个脚本（自动识别）：
#   整包   karuta-<版本>.tar.zst      → 后端 + 前端，会停服几秒
#   仅前端 karuta-fe-<版本>.tar.zst   → 只换前端，不重启服务
#   打包见同目录 build-release.sh
#
# 可覆盖的环境变量（不确定就别设，脚本会自动探测）：
#   KARUTA_APP_DIR      默认 /opt/karuta
#   KARUTA_SERVICE      默认 karuta           systemd 服务名
#   KARUTA_DATA_DIR     默认 /data
#   KARUTA_DB_PATH      默认 $DATA_DIR/karuta.db
#   KARUTA_BACKUP_DIR   默认 $DATA_DIR/karuta-backups
#   KARUTA_READY_URL    默认 http://127.0.0.1:8080/readyz
#   KARUTA_SITE_URL     默认 http://127.0.0.1/         前端验收用
#   KARUTA_KEEP_BACKUPS 默认 5               每类备份保留份数
#   SKIP_VERIFY=1       跳过 sha256 校验
# =============================================================================
set -Eeuo pipefail

APP_DIR="${KARUTA_APP_DIR:-/opt/karuta}"
SERVICE="${KARUTA_SERVICE:-karuta}"
DATA_DIR="${KARUTA_DATA_DIR:-/data}"
DB_PATH="${KARUTA_DB_PATH:-$DATA_DIR/karuta.db}"
BACKUP_DIR="${KARUTA_BACKUP_DIR:-$DATA_DIR/karuta-backups}"
READY_URL="${KARUTA_READY_URL:-http://127.0.0.1:8080/readyz}"
SITE_URL="${KARUTA_SITE_URL:-http://127.0.0.1/}"
KEEP_BACKUPS="${KARUTA_KEEP_BACKUPS:-5}"

STAMP="$(date +%Y%m%d-%H%M%S)"
WORK_DIR=""
BACKED_BIN=""
BACKED_FE=""

c_info() { printf '\033[36m>>\033[0m %s\n' "$*"; }
c_ok()   { printf '\033[32mOK\033[0m %s\n' "$*"; }
c_warn() { printf '\033[33m!!\033[0m %s\n' "$*"; }
c_err()  { printf '\033[31mXX\033[0m %s\n' "$*" >&2; }
die()    { c_err "$*"; exit 1; }

cleanup() {
  local rc=$?
  if [[ -n "$WORK_DIR" && -d "$WORK_DIR" ]]; then rm -rf "$WORK_DIR" || true; fi
  exit $rc
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# 0) 前置检查
# ---------------------------------------------------------------------------
if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then sed -n '2,30p' "$0"; exit 0; fi
if [[ ${EUID:-$(id -u)} -ne 0 ]]; then die "请用 root 运行：sudo $0"; fi

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARCHIVE="${1:-}"
if [[ -z "$ARCHIVE" ]]; then
  CANDIDATES=()
  for d in "$SELF_DIR" "$PWD" /tmp; do
    [[ -d "$d" ]] || continue
    while IFS= read -r f; do [[ -n "$f" ]] && CANDIDATES+=("$f"); done \
      < <(find "$d" -maxdepth 1 -name 'karuta-*.tar.zst' 2>/dev/null | sort)
  done
  if [[ ${#CANDIDATES[@]} -eq 0 ]]; then
    die "没找到发布包：把 karuta-*.tar.zst 放到脚本同目录/当前目录，或作为参数传入"
  fi
  ARCHIVE="${CANDIDATES[-1]}"
  if [[ ${#CANDIDATES[@]} -gt 1 ]]; then
    c_warn "找到多个发布包，用最后一个；如需指定请显式传参"
    printf '     %s\n' "${CANDIDATES[@]}"
  fi
fi
if [[ ! -f "$ARCHIVE" ]]; then die "发布包不存在：$ARCHIVE"; fi

# ---------------------------------------------------------------------------
# 1) 校验发布包（同目录有 .sha256 就自动核对）
# ---------------------------------------------------------------------------
if [[ "${SKIP_VERIFY:-0}" != "1" && -f "$ARCHIVE.sha256" ]]; then
  EXPECTED="$(awk '{print $1}' "$ARCHIVE.sha256" | head -1 | tr 'A-Z' 'a-z')"
  ACTUAL="$(sha256sum "$ARCHIVE" | awk '{print $1}')"
  if [[ "$EXPECTED" != "$ACTUAL" ]]; then
    die "发布包校验和不匹配（期望 $EXPECTED，实际 $ACTUAL）"
  fi
  c_ok "校验和通过：${ACTUAL:0:16}..."
else
  c_warn "未做校验和核对（缺 $ARCHIVE.sha256）"
fi

# ---------------------------------------------------------------------------
# 2) 探测真实路径（以后端 systemd 单元的 ExecStart 为准）
# ---------------------------------------------------------------------------
BIN_PATH="$APP_DIR/karuta-server"
EXEC_PATH="$(systemctl show -p ExecStart --value "$SERVICE" 2>/dev/null | sed -n 's/.*path=\([^ ;]*\).*/\1/p' || true)"
if [[ -n "$EXEC_PATH" ]]; then
  BIN_PATH="$EXEC_PATH"
  c_info "systemd 探测到后端二进制：$BIN_PATH"
else
  c_warn "未能探测 ExecStart，回退用：$BIN_PATH"
fi
APP_DIR="$(dirname "$BIN_PATH")"

FE_DIR="$APP_DIR/frontend/dist"
if [[ ! -f "$FE_DIR/index.html" && -f "$APP_DIR/frontend/index.html" ]]; then
  FE_DIR="$APP_DIR/frontend"
fi
c_info "应用目录：$APP_DIR"
c_info "数据库：  $DB_PATH"
c_info "前端目录：$FE_DIR"

# ---------------------------------------------------------------------------
# 3) 解包到暂存目录，判断模式（整包 / 仅前端）
# ---------------------------------------------------------------------------
command -v tar >/dev/null 2>&1 || die "缺少 tar"
WORK_DIR="$(mktemp -d /tmp/karuta-deploy-XXXXXX)"
if ! tar --zstd -xf "$ARCHIVE" -C "$WORK_DIR"; then
  die "解包失败（缺 zstd 支持？yum install -y zstd）"
fi

SRC_BIN=""
SRC_ADMIN=""
SRC_FE=""
if [[ -f "$WORK_DIR/karuta-server" ]]; then SRC_BIN="$WORK_DIR/karuta-server"; fi
if [[ -f "$WORK_DIR/karuta-admin"  ]]; then SRC_ADMIN="$WORK_DIR/karuta-admin"; fi
if   [[ -f "$WORK_DIR/frontend/dist/index.html" ]]; then SRC_FE="$WORK_DIR/frontend/dist"
elif [[ -f "$WORK_DIR/dist/index.html" ]];          then SRC_FE="$WORK_DIR/dist"
fi

MODE="full"
if [[ -z "$SRC_BIN" && -n "$SRC_FE" ]]; then MODE="frontend-only"; fi

if [[ "$MODE" == "full" ]]; then
  [[ -n "$SRC_BIN" ]] || die "整包里没有 karuta-server"
  [[ -n "$SRC_FE"  ]] || die "整包里没有前端 dist/index.html"
  c_info "模式：整包部署（后端 + 前端）"
else
  c_info "模式：仅前端部署（不含后端二进制，不重启服务）"
fi

WAS_ACTIVE=0
if systemctl is-active --quiet "$SERVICE"; then WAS_ACTIVE=1; fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR" 2>/dev/null || true

# ---------------------------------------------------------------------------
# 4) 备份
# ---------------------------------------------------------------------------
c_info "备份到 $BACKUP_DIR"
if [[ "$MODE" == "full" && "$WAS_ACTIVE" == "1" ]]; then
  systemctl stop "$SERVICE"
  c_ok "已停服 $SERVICE（停服后 SQLite 会 checkpoint，文件复制才一致）"
fi

if [[ -f "$DB_PATH" ]]; then
  DB_BAK="$BACKUP_DIR/karuta.db.$STAMP"
  cp -p "$DB_PATH" "$DB_BAK"
  for ext in -wal -shm; do
    if [[ -f "$DB_PATH$ext" ]]; then cp -p "$DB_PATH$ext" "$DB_BAK$ext"; fi
  done
  c_ok "数据库已备份：$DB_BAK"
else
  c_warn "数据库不存在，跳过：$DB_PATH"
fi

if [[ "$MODE" == "full" && -f "$BIN_PATH" ]]; then
  BACKED_BIN="$BACKUP_DIR/karuta-server.$STAMP"
  cp -p "$BIN_PATH" "$BACKED_BIN"
  c_ok "旧二进制已备份：$BACKED_BIN"
fi

if [[ -n "$SRC_FE" && -f "$FE_DIR/index.html" ]]; then
  BACKED_FE="$BACKUP_DIR/frontend-dist.$STAMP"
  cp -a "$FE_DIR" "$BACKED_FE"
  c_ok "旧前端已备份：$BACKED_FE"
fi

# ---------------------------------------------------------------------------
# 5) 替换（同目录临时文件 + mv，避免覆盖到一半）
# ---------------------------------------------------------------------------
install_file() {
  local src="$1" dst="$2" tmp
  mkdir -p "$(dirname "$dst")"
  tmp="$(dirname "$dst")/.$(basename "$dst").new.$$"
  cp -f "$src" "$tmp"
  chmod 0755 "$tmp"
  mv -f "$tmp" "$dst"
}

if [[ "$MODE" == "full" ]]; then
  install_file "$SRC_BIN" "$BIN_PATH"
  c_ok "后端已替换：$BIN_PATH"
  if [[ -n "$SRC_ADMIN" ]]; then
    install_file "$SRC_ADMIN" "$APP_DIR/karuta-admin"
    c_ok "管理 CLI 已更新：$APP_DIR/karuta-admin"
  fi
fi

if [[ -n "$SRC_FE" ]]; then
  NEW_FE="$APP_DIR/frontend/.dist.new.$STAMP"
  rm -rf "$NEW_FE"
  cp -a "$SRC_FE" "$NEW_FE"
  rm -rf "$FE_DIR"
  mv "$NEW_FE" "$FE_DIR"
  c_ok "前端已替换：$FE_DIR"
fi

# ---------------------------------------------------------------------------
# 6) 起服 + 健康检查（失败自动回滚）
# ---------------------------------------------------------------------------
rollback() {
  c_warn "开始回滚"
  if [[ -n "$BACKED_BIN" && -f "$BACKED_BIN" ]]; then
    install_file "$BACKED_BIN" "$BIN_PATH"
    c_ok "后端已还原"
  fi
  if [[ -n "$BACKED_FE" && -d "$BACKED_FE" ]]; then
    rm -rf "$FE_DIR"
    cp -a "$BACKED_FE" "$FE_DIR"
    c_ok "前端已还原"
  fi
  if [[ "$WAS_ACTIVE" == "1" ]]; then systemctl start "$SERVICE" || true; fi
  c_warn "已回滚到旧版本（数据库未改动）。备份在：$BACKUP_DIR"
}

if [[ "$MODE" == "full" ]]; then
  c_info "启动 $SERVICE"
  if ! systemctl start "$SERVICE"; then
    rollback
    die "systemctl start 失败，已回滚"
  fi

  OK=0
  for _ in $(seq 1 30); do
    if curl -fsS --max-time 2 "$READY_URL" >/dev/null 2>&1; then OK=1; break; fi
    sleep 1
  done
  if [[ "$OK" != "1" ]]; then
    c_err "健康检查失败：30s 内 $READY_URL 未就绪，最近日志："
    journalctl -u "$SERVICE" -n 20 --no-pager || true
    rollback
    die "部署失败，已回滚"
  fi
  c_ok "健康检查通过：$(curl -fsS --max-time 2 "$READY_URL" 2>/dev/null || true)"
else
  MISSING=0
  while read -r asset; do
    [[ -z "$asset" ]] && continue
    if [[ ! -f "$FE_DIR$asset" ]]; then
      c_err "前端资源缺失：$FE_DIR$asset"
      MISSING=1
    fi
  done < <(grep -o '/assets/[A-Za-z0-9._-]*' "$FE_DIR/index.html" | sort -u)
  if [[ "$MISSING" != "0" ]]; then
    rollback
    die "前端部署失败，已回滚"
  fi
  c_ok "前端资源自检通过"
  if curl -fsS --max-time 3 "$SITE_URL" >/dev/null 2>&1; then
    c_ok "站点可访问：$SITE_URL"
  else
    c_warn "站点 $SITE_URL 无响应（nginx 未跑或地址不同），文件已就位"
  fi
fi

# ---------------------------------------------------------------------------
# 7) 清理旧备份（每类只留最近 KEEP_BACKUPS 份）
# ---------------------------------------------------------------------------
if [[ "$KEEP_BACKUPS" =~ ^[0-9]+$ ]] && [[ "$KEEP_BACKUPS" -gt 0 ]]; then
  for prefix in 'karuta.db.' 'karuta-server.' 'frontend-dist.'; do
    mapfile -t OLD < <(find "$BACKUP_DIR" -maxdepth 1 -name "${prefix}*" 2>/dev/null | sort | head -n "-$KEEP_BACKUPS")
    for f in "${OLD[@]:-}"; do
      if [[ -n "$f" && "$f" != "$BACKUP_DIR/$prefix$STAMP"* ]]; then rm -rf "$f"; fi
    done
  done
fi

# ---------------------------------------------------------------------------
# 8) 收尾
# ---------------------------------------------------------------------------
printf '\n'
c_ok "部署完成"
c_info "前端版本自查：curl -s $SITE_URL | grep -o 'assets/index-[^\"]*\\.js'"
if [[ "$MODE" == "frontend-only" ]]; then
  c_info "本次仅换前端：浏览器 Ctrl+F5 强刷即可"
fi
