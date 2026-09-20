package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"karuta/backend/config"
	"karuta/backend/handler"
	"karuta/backend/media"
	"karuta/backend/middleware"
	"karuta/backend/security"
	"karuta/backend/storage"
	"karuta/backend/store"
	"karuta/backend/ws"

	"github.com/go-chi/chi/v5"
	chiMiddleware "github.com/go-chi/chi/v5/middleware"
)

var (
	version   = "dev"
	commit    = "unknown"
	buildTime = "unknown"
)

func main() {
	cfg := config.Load()
	if err := cfg.Validate(); err != nil {
		log.Fatalf("invalid configuration: %v", err)
	}

	appCtx, stopSignals := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stopSignals()

	// Ensure the data directory exists (default: ./data/karuta.db)
	if dir := filepath.Dir(cfg.DBPath); dir != "." {
		if err := os.MkdirAll(dir, 0755); err != nil {
			log.Fatalf("create data dir %s: %v", dir, err)
		}
	}
	db, err := store.OpenDB(cfg.DBPath)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer db.Close()

	s := store.NewStore(db)
	if aborted, err := s.Rooms.AbortInterrupted(); err != nil {
		log.Fatalf("recover interrupted rooms: %v", err)
	} else if aborted > 0 {
		log.Printf("recovery: marked %d interrupted karuta room(s) as aborted", aborted)
	}

	// Initialize COS storage: the only media backend. Server-local storage
	// has been removed; media objects live exclusively in COS.
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
	var stor storage.Storage = cosStorage
	log.Printf("storage: COS enabled (bucket=%s, region=%s)", cfg.COSBucket, cfg.COSRegion)
	// Server uplink is poor: hand clients absolute media URLs so downloads
	// never traverse this server. Requires public-read objects.
	storage.SetMediaBaseURL(cosStorage.PublicBaseURL())
	log.Printf("media: download URLs served directly from %s", cosStorage.PublicBaseURL())
	if cfg.COSFixCacheOnStart {
		log.Printf("storage: COS cache-header repair enabled for this startup")
		go cosStorage.FixCacheHeaders(appCtx)
	}

	// WebSocket hub manager
	hubManager := ws.NewHubManager()
	wsTickets := security.NewWSTicketManager(30 * time.Second)

	// Media service: content-addressed dedup shared by upload handlers.
	mediaSvc := media.NewService(stor, s.MediaAssets)

	// Handlers
	authH, err := handler.NewAuthHandler(s, stor, mediaSvc, cfg.JWTSecret, cfg.InviteRequired)
	if err != nil {
		log.Fatalf("init auth handler: %v", err)
	}
	deckH := handler.NewDeckHandler(s)
	cardH := handler.NewCardHandler(s, stor, mediaSvc)
	roomH := handler.NewRoomHandler(s, hubManager)
	wsH := handler.NewWSHandler(s, hubManager, wsTickets)
	authMiddleware := middleware.Auth(cfg.JWTSecret)

	r := chi.NewRouter()
	authRateLimit := middleware.RateLimit(20, time.Minute)
	uploadRateLimit := middleware.RateLimit(30, time.Minute)
	wsTicketRateLimit := middleware.RateLimit(120, time.Minute)
	proxyRateLimit := middleware.RateLimit(120, time.Minute)

	// Global middleware
	r.Use(chiMiddleware.RealIP)
	r.Use(chiMiddleware.Logger)
	r.Use(chiMiddleware.Recoverer)
	r.Use(corsMiddleware)

	// Operational endpoints intentionally do not require authentication so the
	// local service manager and reverse proxy can verify a release.
	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	})
	r.Get("/readyz", func(w http.ResponseWriter, req *http.Request) {
		ctx, cancel := context.WithTimeout(req.Context(), 2*time.Second)
		defer cancel()
		if err := db.PingContext(ctx); err != nil {
			http.Error(w, `{"status":"not_ready"}`, http.StatusServiceUnavailable)
			return
		}
		schemaVersion, err := store.SchemaVersion(db)
		if err != nil || schemaVersion != store.CurrentSchemaVersion {
			http.Error(w, `{"status":"not_ready","reason":"schema"}`, http.StatusServiceUnavailable)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"status": "ready", "version": version, "commit": commit, "schema_version": schemaVersion})
	})
	r.Get("/version", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"version": version, "commit": commit, "build_time": buildTime})
	})

	// Auth routes (no JWT required)
	r.With(authRateLimit).Post("/api/auth/register", authH.Register)
	r.With(authRateLimit).Post("/api/auth/login", authH.Login)
	r.With(authRateLimit).Post("/api/auth/guest", authH.GuestLogin)
	r.Get("/api/auth/invite-status", authH.InviteStatus)

	// Public proxy (no auth needed)
	bangumiPublic := handler.NewBangumiHandler(cfg.BangumiToken)
	r.With(proxyRateLimit).Get("/api/bangumi/image", bangumiPublic.ProxyImage)

	// Protected routes
	r.Group(func(r chi.Router) {
		r.Use(authMiddleware)
		r.With(wsTicketRateLimit).Post("/api/ws-ticket", wsH.IssueTicket)

		r.Get("/api/me", authH.Me)
		r.Post("/api/me/guest-recovery", authH.IssueGuestRecovery)
		r.Patch("/api/me", authH.UpdateMe)
		r.Get("/api/me/stats", authH.MyStats)
		r.With(uploadRateLimit).Post("/api/me/avatar", authH.UploadAvatar)
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
		r.With(uploadRateLimit).Post("/api/cards", cardH.CreateCard)
		r.Patch("/api/cards/{id}", cardH.UpdateCard)
		r.Delete("/api/cards/{id}", cardH.DeleteCard)
		r.Post("/api/cards/batch-share", cardH.BatchUpdateShareLevel)
		r.Post("/api/cards/{id}/clone", cardH.CloneCard)
		r.With(uploadRateLimit).Post("/api/cards/{id}/cover", cardH.UpdateCover)
		r.With(uploadRateLimit).Post("/api/cards/{id}/audios", cardH.AddAudio)
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

	// WebSocket endpoint (auth via short-lived, single-use query ticket)
	r.Get("/ws/rooms/{id}", wsH.ServeWS)

	// /uploads redirect for legacy relative media references: forward to COS.
	// Current API responses carry absolute COS URLs and never hit this route.
	r.Get("/uploads/*", func(w http.ResponseWriter, req *http.Request) {
		path := strings.TrimPrefix(req.URL.Path, "/uploads/")
		if path == "" || path == "/" {
			http.NotFound(w, req)
			return
		}
		cosURL := stor.URL(path)
		if cosURL == "" {
			http.NotFound(w, req)
			return
		}
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		w.Header().Set("CDN-Cache-Control", "max-age=31536000")
		http.Redirect(w, req, cosURL, http.StatusFound)
	})

	addr := net.JoinHostPort(cfg.BindAddr, cfg.Port)
	server := &http.Server{
		Addr:              addr,
		Handler:           r,
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       2 * time.Minute,
	}
	serverErr := make(chan error, 1)
	go func() {
		log.Printf("karuta server listening on %s (version=%s commit=%s)", addr, version, commit)
		serverErr <- server.ListenAndServe()
	}()

	select {
	case err := <-serverErr:
		if !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server error: %v", err)
		}
	case <-appCtx.Done():
		log.Printf("shutdown requested; stopping active room connections")
		hubManager.StopAll()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			log.Printf("graceful shutdown timed out: %v", err)
			_ = server.Close()
		}
	}
}

// corsMiddleware shares its origin policy with the WebSocket upgraders.
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" {
			if !security.OriginAllowed(r) {
				http.Error(w, "origin not allowed", http.StatusForbidden)
				return
			}
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Add("Vary", "Origin")
		}
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
