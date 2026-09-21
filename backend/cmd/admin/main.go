package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strconv"

	"karuta/backend/storage"
	"karuta/backend/store"

	"golang.org/x/crypto/bcrypt"
	_ "modernc.org/sqlite"
)

func main() {
	if len(os.Args) < 2 {
		usage()
	}
	switch os.Args[1] {
	case "backup-db":
		fs := flag.NewFlagSet("backup-db", flag.ExitOnError)
		source := fs.String("source", "./karuta.db", "source SQLite database")
		destination := fs.String("destination", "", "new backup file path")
		_ = fs.Parse(os.Args[2:])
		if *destination == "" {
			log.Fatal("-destination is required")
		}
		if err := backupDatabase(*source, *destination); err != nil {
			log.Fatalf("backup database: %v", err)
		}
		log.Printf("database backup created: %s", *destination)
	case "set-admin":
		fs := flag.NewFlagSet("set-admin", flag.ExitOnError)
		database := fs.String("database", "./karuta.db", "SQLite database path")
		username := fs.String("username", "", "existing username")
		enabled := fs.Bool("enabled", true, "grant or revoke administrator role")
		_ = fs.Parse(os.Args[2:])
		if *username == "" {
			log.Fatal("-username is required")
		}
		if err := setAdmin(*database, *username, *enabled); err != nil {
			log.Fatalf("set admin: %v", err)
		}
	case "reset-password":
		fs := flag.NewFlagSet("reset-password", flag.ExitOnError)
		database := fs.String("database", "./karuta.db", "SQLite database path")
		username := fs.String("username", "", "existing username")
		password := fs.String("password", "", "new password (min 6 chars)")
		_ = fs.Parse(os.Args[2:])
		if *username == "" || *password == "" {
			log.Fatal("-username and -password are required")
		}
		if err := resetPassword(*database, *username, *password); err != nil {
			log.Fatalf("reset password: %v", err)
		}
		log.Printf("password reset for %q", *username)
	case "media":
		// 形式：karuta-admin media gc [-database PATH] [-dry-run] [-yes]
		if len(os.Args) < 3 || os.Args[2] != "gc" {
			usage()
		}
		fs := flag.NewFlagSet("media gc", flag.ExitOnError)
		database := fs.String("database", "../data/karuta.db", "SQLite database path")
		dryRun := fs.Bool("dry-run", true, "list orphans without deleting anything")
		yes := fs.Bool("yes", false, "skip confirmation prompt")
		_ = fs.Parse(os.Args[3:])
		if err := mediaGC(*database, *dryRun, *yes); err != nil {
			log.Fatalf("media gc: %v", err)
		}
	default:
		usage()
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, "usage:")
	fmt.Fprintln(os.Stderr, "  karuta-admin backup-db -source PATH -destination PATH")
	fmt.Fprintln(os.Stderr, "  karuta-admin set-admin -database PATH -username NAME [-enabled=true]")
	fmt.Fprintln(os.Stderr, "  karuta-admin reset-password -database PATH -username NAME -password NEW")
	fmt.Fprintln(os.Stderr, "  karuta-admin media gc -database PATH [-dry-run=false] [-yes]")
	os.Exit(2)
}

// mediaGC 媒体垃圾回收（B2 资产生命周期）：
// 1) 列出 pending_delete（业务引用已归零）与孤儿（ready 但无任何真实引用）；
// 2) 非dry-run 时对两者物理删除 COS 对象并标记 deleted。
// COS 凭据来自环境变量 COS_SECRET_ID / COS_SECRET_KEY / COS_BUCKET / COS_REGION；
// 凭据缺失时只能 dry-run 列表（数据库仍会更新为 pending_delete/deleted 吗？
// 不会——物理删除不可用时整体保持只读，避免状态与对象存储不一致）。
func mediaGC(database string, dryRun, yes bool) error {
	db, err := sql.Open("sqlite", database)
	if err != nil {
		return err
	}
	defer db.Close()
	assets := store.NewMediaAssetStore(db)

	pending, err := assets.ListPendingDelete()
	if err != nil {
		return fmt.Errorf("list pending_delete: %w", err)
	}
	orphans, err := assets.ListOrphans()
	if err != nil {
		return fmt.Errorf("list orphans: %w", err)
	}

	var totalBytes int64
	fmt.Println("== pending_delete (business references removed) ==")
	for _, o := range pending {
		fmt.Printf("  %s  %s  %d bytes\n", o.ObjectKey, o.Kind, o.SizeBytes)
		totalBytes += o.SizeBytes
	}
	fmt.Println("== orphans (ready but unreferenced, older than 1 day) ==")
	for _, o := range orphans {
		fmt.Printf("  %s  %s  %d bytes\n", o.ObjectKey, o.Kind, o.SizeBytes)
		totalBytes += o.SizeBytes
	}
	fmt.Printf("total: %d object(s), %d bytes\n", len(pending)+len(orphans), totalBytes)

	if dryRun {
		fmt.Println("dry-run: nothing deleted. Re-run with -dry-run=false to apply.")
		return nil
	}
	if !yes {
		fmt.Print("physically delete the objects above from COS? [y/N] ")
		var answer string
		if _, err := fmt.Scanln(&answer); err != nil || (answer != "y" && answer != "Y") {
			fmt.Println("aborted.")
			return nil
		}
	}

	// 物理删除需要 COS 凭据。
	cosStorage, err := storage.NewCOSStorage(
		os.Getenv("COS_SECRET_ID"), os.Getenv("COS_SECRET_KEY"),
		os.Getenv("COS_BUCKET"), os.Getenv("COS_REGION"), "")
	if err != nil {
		return fmt.Errorf("init COS storage (set COS_* env vars): %w", err)
	}
	ctx := context.Background()
	deleted := 0
	for _, o := range append(append([]store.Orphan{}, pending...), orphans...) {
		if err := cosStorage.Delete(ctx, o.ObjectKey); err != nil {
			log.Printf("delete %s failed: %v (skipped)", o.ObjectKey, err)
			continue
		}
		if err := assets.MarkDeleted(o.ObjectKey); err != nil {
			log.Printf("mark deleted %s failed: %v", o.ObjectKey, err)
			continue
		}
		deleted++
	}
	fmt.Printf("deleted %d/%d object(s)\n", deleted, len(pending)+len(orphans))
	return nil
}

// resetPassword 管理员/机主本地重置密码（忘记密码的恢复通道）。
// 拒绝游客（游客无密码体系，应走转正）；写审计（actor=target，source=cli-local）。
func resetPassword(database, username, newPassword string) error {
	if len(newPassword) < 6 {
		return fmt.Errorf("password must be at least 6 characters")
	}
	db, err := sql.Open("sqlite", database)
	if err != nil {
		return err
	}
	defer db.Close()

	var userID int64
	var isGuest bool
	if err := db.QueryRow(`SELECT id, COALESCE(is_guest, FALSE) FROM users WHERE username = ?`, username).Scan(&userID, &isGuest); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("user %q not found", username)
		}
		return err
	}
	if isGuest {
		return fmt.Errorf("user %q is a guest account (no password); upgrade first", username)
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), 12)
	if err != nil {
		return err
	}
	if _, err := db.Exec(`UPDATE users SET password = ? WHERE id = ?`, string(hash), userID); err != nil {
		return err
	}
	details, _ := json.Marshal(map[string]string{"action": "password_reset"})
	if _, err := db.Exec(
		`INSERT INTO admin_audit_logs(actor_id, action, target_type, target_id, details, source_ip) VALUES (?, 'user.password_reset_cli', 'user', ?, ?, 'cli-local')`,
		userID, strconv.FormatInt(userID, 10), string(details),
	); err != nil {
		return fmt.Errorf("write audit log: %w", err)
	}
	return nil
}

func setAdmin(database, username string, enabled bool) error {
	db, err := sql.Open("sqlite", database)
	if err != nil {
		return err
	}
	defer db.Close()

	var userID int64
	var isGuest bool
	if err := db.QueryRow(
		`SELECT id, COALESCE(is_guest, FALSE) FROM users WHERE username = ?`, username,
	).Scan(&userID, &isGuest); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("user %q not found", username)
		}
		return err
	}
	// 与 API 路径同语义（修复 #3）：游客是临时身份，不可授予管理员。
	if enabled && isGuest {
		return fmt.Errorf("user %q is a guest account; guests cannot be granted administrator", username)
	}
	if _, err := db.Exec(`UPDATE users SET is_admin = ? WHERE id = ?`, enabled, userID); err != nil {
		return err
	}
	// CLI 提权同样落审计（修复 #5）：否则「谁用 CLI 改了管理员」在审计表无痕。
	// actor 记为目标自身（CLI 无操作者身份），source_ip 标记 cli-local。
	details, _ := json.Marshal(map[string]bool{"is_admin": enabled, "cli": true})
	if _, err := db.Exec(
		`INSERT INTO admin_audit_logs(actor_id, action, target_type, target_id, details, source_ip) VALUES (?, 'user.admin_changed_cli', 'user', ?, ?, 'cli-local')`,
		userID, strconv.FormatInt(userID, 10), string(details),
	); err != nil {
		return fmt.Errorf("write audit log: %w", err)
	}
	return nil
}

func backupDatabase(source, destination string) error {
	sourceAbs, err := filepath.Abs(source)
	if err != nil {
		return err
	}
	destinationAbs, err := filepath.Abs(destination)
	if err != nil {
		return err
	}
	if sourceAbs == destinationAbs {
		return fmt.Errorf("source and destination must differ")
	}
	if _, err := os.Stat(sourceAbs); err != nil {
		return fmt.Errorf("source: %w", err)
	}
	if _, err := os.Stat(destinationAbs); err == nil {
		return fmt.Errorf("destination already exists")
	} else if !os.IsNotExist(err) {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(destinationAbs), 0750); err != nil {
		return err
	}

	db, err := sql.Open("sqlite", sourceAbs)
	if err != nil {
		return err
	}
	defer db.Close()
	db.SetMaxOpenConns(1)
	if _, err := db.Exec("PRAGMA busy_timeout=10000"); err != nil {
		return err
	}
	// SQLite VACUUM INTO produces a transactionally consistent standalone
	// database, including data that currently resides in the WAL.
	if _, err := db.Exec("VACUUM INTO ?", destinationAbs); err != nil {
		return err
	}
	return nil
}
