package main

import (
	"bytes"
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"

	"karuta/internal/storage"
)

func main() {
	secretID := os.Getenv("COS_SECRET_ID")
	secretKey := os.Getenv("COS_SECRET_KEY")
	bucket := os.Getenv("COS_BUCKET")
	region := os.Getenv("COS_REGION")
	uploadDir := os.Getenv("UPLOAD_DIR")

	if secretID == "" || secretKey == "" {
		log.Fatal("请设置 COS_SECRET_ID 和 COS_SECRET_KEY")
	}
	if bucket == "" {
		bucket = "karuta-1321249409"
	}
	if region == "" {
		region = "ap-shanghai"
	}
	if uploadDir == "" {
		uploadDir = "./frontend/uploads"
	}

	cos, err := storage.NewCOSStorage(secretID, secretKey, bucket, region, "")
	if err != nil {
		log.Fatal(err)
	}

	fmt.Printf("=== COS 迁移 ===\n")
	fmt.Printf("源目录: %s\n", uploadDir)
	fmt.Printf("Bucket: %s / %s\n\n", bucket, region)

	var totalUploaded int64
	var totalSkipped int64
	var totalFailed int64

	for _, sub := range []string{"audio", "covers"} {
		dir := filepath.Join(uploadDir, sub)
		entries, err := os.ReadDir(dir)
		if err != nil {
			fmt.Printf("[%s] 目录不存在或无法读取: %v\n", sub, err)
			continue
		}

		fmt.Printf("[%s] 发现 %d 个文件，开始上传...\n", sub, len(entries))

		var wg sync.WaitGroup
		sem := make(chan struct{}, 10) // 10 并发

		for _, entry := range entries {
			if entry.IsDir() {
				continue
			}
			wg.Add(1)
			sem <- struct{}{}
			go func(name string) {
				defer wg.Done()
				defer func() { <-sem }()

				key := sub + "/" + name
				if cos.Exists(context.Background(), key) {
					atomic.AddInt64(&totalSkipped, 1)
					return
				}

				data, err := os.ReadFile(filepath.Join(dir, name))
				if err != nil {
					atomic.AddInt64(&totalFailed, 1)
					return
				}

				ct := detectContentType(name)
				if err := cos.Put(context.Background(), key, bytes.NewReader(data), int64(len(data)), ct); err != nil {
					fmt.Printf("  ❌ %s: %v\n", key, err)
					atomic.AddInt64(&totalFailed, 1)
					return
				}
				atomic.AddInt64(&totalUploaded, 1)
			}(entry.Name())
		}
		wg.Wait()
		fmt.Printf("[%s] 完成\n\n", sub)
	}

	fmt.Printf("=== 迁移结果 ===\n")
	fmt.Printf("上传: %d | 跳过(已存在): %d | 失败: %d\n", totalUploaded, totalSkipped, totalFailed)
}

func detectContentType(name string) string {
	lower := strings.ToLower(name)
	switch {
	case strings.HasSuffix(lower, ".mp3"):
		return "audio/mpeg"
	case strings.HasSuffix(lower, ".wav"):
		return "audio/wav"
	case strings.HasSuffix(lower, ".m4a"):
		return "audio/mp4"
	case strings.HasSuffix(lower, ".flac"):
		return "audio/flac"
	case strings.HasSuffix(lower, ".ogg"):
		return "audio/ogg"
	case strings.HasSuffix(lower, ".jpg"), strings.HasSuffix(lower, ".jpeg"):
		return "image/jpeg"
	case strings.HasSuffix(lower, ".png"):
		return "image/png"
	case strings.HasSuffix(lower, ".webp"):
		return "image/webp"
	}
	return "application/octet-stream"
}
