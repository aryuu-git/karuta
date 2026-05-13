package main

import (
	"bytes"
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"karuta/internal/config"
	"karuta/internal/handler"
	"karuta/internal/middleware"
	"karuta/internal/storage"
	"karuta/internal/store"
	"karuta/internal/ws"

	"github.com/go-chi/chi/v5"
	chiMiddleware "github.com/go-chi/chi/v5/middleware"
)

func main() {
	cfg := config.Load()

	// Ensure upload directories exist
	for _, sub := range []string{"audio", "covers"} {
		dir := filepath.Join(cfg.UploadDir, sub)
		if err := os.MkdirAll(dir, 0755); err != nil {
			log.Fatalf("create upload dir %s: %v", dir, err)
		}
	}

	// Open database
	db, err := store.OpenDB(cfg.DBPath)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer db.Close()

	s := store.NewStore(db)

	// Initialize storage backend
	var stor storage.Storage
	if cfg.COSEnabled {
		cosStorage, err := storage.NewCOSStorage(
			cfg.COSSecretID,
			cfg.COSSecretKey,
			cfg.COSBucket,
			cfg.COSRegion,
			cfg.COSCDNDomain,
		)
		if err != nil {
			log.Fatalf("init cos storage: %v", err)
		}
		stor = cosStorage
		log.Printf("storage: COS enabled (bucket=%s, region=%s)", cfg.COSBucket, cfg.COSRegion)
		// Background: fix cache headers on existing COS objects
		go cosStorage.FixCacheHeaders(context.Background())
	} else {
		stor = storage.NewLocalStorage(cfg.UploadDir)
		log.Printf("storage: local filesystem (%s)", cfg.UploadDir)
	}

	// Background: migrate local files to COS
	if cfg.COSEnabled {
		go migrateLocalToCOS(cfg.UploadDir, stor)
	}

	// WebSocket hub manager
	hubManager := ws.NewHubManager()

	// Handlers
	authH := handler.NewAuthHandler(s, stor, cfg.JWTSecret, cfg.InviteRequired)
	deckH := handler.NewDeckHandler(s, cfg.UploadDir)
	cardH := handler.NewCardHandler(s, cfg.UploadDir, stor)
	roomH := handler.NewRoomHandler(s, hubManager)
	wsH := handler.NewWSHandler(s, hubManager, cfg.JWTSecret)

	// Auth middleware
	authMiddleware := middleware.Auth(cfg.JWTSecret)

	r := chi.NewRouter()

	// Global middleware
	r.Use(chiMiddleware.Logger)
	r.Use(chiMiddleware.Recoverer)
	r.Use(corsMiddleware)

	// Auth routes (no JWT required)
	r.Post("/api/auth/register", authH.Register)
	r.Post("/api/auth/login", authH.Login)
	r.Post("/api/auth/guest", authH.GuestLogin)

	// Public proxy (no auth needed)
	bangumiPublic := handler.NewBangumiHandler(cfg.BangumiToken)
	r.Get("/api/bangumi/image", bangumiPublic.ProxyImage)

	// Protected routes
	r.Group(func(r chi.Router) {
		r.Use(authMiddleware)

		r.Get("/api/me", authH.Me)
		r.Patch("/api/me", authH.UpdateMe)
		r.Get("/api/me/stats", authH.MyStats)
		r.Post("/api/me/avatar", authH.UploadAvatar)
		r.Post("/api/me/invites", authH.GenerateInvite)
		r.Get("/api/me/invites", authH.ListMyInvites)
		r.Get("/api/admin/users", authH.AdminListUsers)
		r.Post("/api/admin/users/{id}/disable", authH.AdminToggleUser)
		r.Post("/api/admin/users/{id}/admin", authH.AdminSetAdmin)
		r.Post("/api/admin/invite-toggle", authH.AdminToggleInvite)
		r.Get("/api/admin/invite-status", authH.AdminInviteStatus)

		// Deck routes
		r.Post("/api/decks", deckH.CreateDeck)
		r.Get("/api/decks/mine", deckH.ListMyDecks)
		r.Get("/api/decks/public", deckH.ListPublicDecks)
		r.Get("/api/decks/editable", deckH.ListEditableDecks)
		r.Get("/api/decks/{id}", deckH.GetDeck)
		r.Patch("/api/decks/{id}", deckH.UpdateDeck)
		r.Delete("/api/decks/{id}", deckH.DeleteDeck)
		r.Post("/api/decks/{id}/share", deckH.ShareDeck)
		r.Post("/api/decks/{id}/cards", deckH.AddCardsToDeck)
		r.Delete("/api/decks/{id}/cards/{cardID}", deckH.RemoveCardFromDeck)
		r.Post("/api/decks/{id}/clone", deckH.CloneDeck)

		// Card routes (library)
		r.Get("/api/cards/mine", cardH.ListMyCards)
		r.Get("/api/cards/tags", cardH.ListPublicTags)
		r.Get("/api/cards/public", cardH.ListPublicCards)
		r.Get("/api/cards/{id}", cardH.GetCard)
		r.Post("/api/cards", cardH.CreateCard)
		r.Patch("/api/cards/{id}", cardH.UpdateCard)
		r.Delete("/api/cards/{id}", cardH.DeleteCard)
		r.Post("/api/cards/batch-share", cardH.BatchUpdateShareLevel)
		r.Post("/api/cards/{id}/clone", cardH.CloneCard)
		r.Post("/api/cards/{id}/cover", cardH.UpdateCover)
		r.Post("/api/cards/{id}/audios", cardH.AddAudio)
		r.Patch("/api/cards/{id}/audios/{audioID}", cardH.UpdateAudio)
		r.Delete("/api/cards/{id}/audios/{audioID}", cardH.DeleteAudio)

		// Room routes
		bangumiH := handler.NewBangumiHandler(cfg.BangumiToken)
		r.Get("/api/bangumi/search", bangumiH.Search)

		r.Get("/api/rooms", roomH.ListRooms)
		r.Post("/api/rooms", roomH.CreateRoom)
		r.Post("/api/rooms/join", roomH.JoinRoom)
		r.Get("/api/rooms/{id}", roomH.GetRoom)
		r.Post("/api/rooms/{id}/start", roomH.StartRoom)
		r.Post("/api/rooms/{id}/next-card", roomH.NextCard)
		r.Post("/api/rooms/{id}/spectate", roomH.SetSpectate)
		r.Post("/api/rooms/{id}/kick", roomH.KickPlayer)
		r.Post("/api/rooms/{id}/claim-seat", roomH.ClaimSeat)
		r.Post("/api/rooms/{id}/leave-seat", roomH.LeaveSeat)
		r.Post("/api/rooms/{id}/kick-seat", roomH.KickFromSeat)
		r.Post("/api/rooms/{id}/force-end", roomH.ForceEndRoom)
		r.Post("/api/rooms/{id}/pause", roomH.PauseRoom)
		r.Post("/api/rooms/{id}/resume", roomH.ResumeRoom)
		r.Post("/api/rooms/{id}/play-card", roomH.PlayCard)
		r.Delete("/api/rooms/{id}", roomH.CloseRoom)
	})

	// WebSocket endpoint (auth via query token)
	r.Get("/ws/rooms/{id}", wsH.ServeWS)

	// Static file serving for uploads with COS redirect support
	uploadsFS := http.StripPrefix("/uploads/", http.FileServer(http.Dir(cfg.UploadDir)))
	r.Get("/uploads/*", func(w http.ResponseWriter, req *http.Request) {
		path := strings.TrimPrefix(req.URL.Path, "/uploads/")
		if path == "" || path == "/" {
			http.NotFound(w, req)
			return
		}
		if cfg.COSEnabled {
			cosURL := stor.URL(path)
			if cosURL != "" {
				w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
				w.Header().Set("CDN-Cache-Control", "max-age=31536000")
				http.Redirect(w, req, cosURL, http.StatusFound)
				return
			}
		}
		// Fallback to local file serving
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		uploadsFS.ServeHTTP(w, req)
	})

	addr := fmt.Sprintf(":%s", cfg.Port)
	log.Printf("karuta server listening on %s", addr)
	if err := http.ListenAndServe(addr, r); err != nil {
		log.Fatalf("server error: %v", err)
	}
}

// migrateLocalToCOS uploads local files to COS in background.
func migrateLocalToCOS(uploadDir string, stor storage.Storage) {
	for _, sub := range []string{"audio", "covers"} {
		dir := filepath.Join(uploadDir, sub)
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		migrated := 0
		for _, entry := range entries {
			if entry.IsDir() {
				continue
			}
			key := sub + "/" + entry.Name()
			if stor.Exists(context.Background(), key) {
				continue
			}
			filePath := filepath.Join(dir, entry.Name())
			data, err := os.ReadFile(filePath)
			if err != nil {
				continue
			}
			contentType := "application/octet-stream"
			if strings.HasSuffix(entry.Name(), ".mp3") {
				contentType = "audio/mpeg"
			} else if strings.HasSuffix(entry.Name(), ".jpg") || strings.HasSuffix(entry.Name(), ".jpeg") {
				contentType = "image/jpeg"
			} else if strings.HasSuffix(entry.Name(), ".png") {
				contentType = "image/png"
			} else if strings.HasSuffix(entry.Name(), ".webp") {
				contentType = "image/webp"
			} else if strings.HasSuffix(entry.Name(), ".wav") {
				contentType = "audio/wav"
			} else if strings.HasSuffix(entry.Name(), ".m4a") {
				contentType = "audio/mp4"
			} else if strings.HasSuffix(entry.Name(), ".flac") {
				contentType = "audio/flac"
			} else if strings.HasSuffix(entry.Name(), ".ogg") {
				contentType = "audio/ogg"
			}
			if err := stor.Put(context.Background(), key, bytes.NewReader(data), int64(len(data)), contentType); err != nil {
				log.Printf("[cos-migrate] failed to upload %s: %v", key, err)
				continue
			}
			migrated++
		}
		if migrated > 0 {
			log.Printf("[cos-migrate] uploaded %d files from %s/", migrated, sub)
		}
	}
	log.Printf("[cos-migrate] background migration complete")
}

// corsMiddleware allows all origins for development.
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Accept-Ranges", "bytes")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
