package main

import (
	"database/sql"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"

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
		log.Printf("administrator role updated: username=%s enabled=%t", *username, *enabled)
	default:
		usage()
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, "usage:")
	fmt.Fprintln(os.Stderr, "  karuta-admin backup-db -source PATH -destination PATH")
	fmt.Fprintln(os.Stderr, "  karuta-admin set-admin -database PATH -username NAME [-enabled=true]")
	os.Exit(2)
}

func setAdmin(database, username string, enabled bool) error {
	db, err := sql.Open("sqlite", database)
	if err != nil {
		return err
	}
	defer db.Close()
	result, err := db.Exec(`UPDATE users SET is_admin = ? WHERE username = ?`, enabled, username)
	if err != nil {
		return err
	}
	changed, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if changed != 1 {
		return fmt.Errorf("user %q not found", username)
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
