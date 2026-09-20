package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"karuta/backend/media"
)

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]string{"error": code, "message": message})
}

func isUniqueConstraintError(err error) bool {
	if err == nil {
		return false
	}
	return strings.Contains(err.Error(), "UNIQUE constraint failed")
}


// writeMediaPutError 将 media.Put 的错误映射为响应：
// 配额超限返回 413 QUOTA_EXCEEDED（前端可直接识别并提示）；其余统一 500。
func writeMediaPutError(w http.ResponseWriter, err error) {
	if errors.Is(err, media.ErrQuotaExceeded) {
		writeError(w, http.StatusRequestEntityTooLarge, "QUOTA_EXCEEDED",
			"上传额度已满：媒体总容量或今日上传次数已达上限 (>_<)")
		return
	}
	writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to save media file")
}
