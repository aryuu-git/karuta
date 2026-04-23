package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"karuta/internal/config"
	"karuta/internal/handler"
	"karuta/internal/middleware"
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

	// WebSocket hub manager
	hubManager := ws.NewHubManager()

	// Handlers
	authH := handler.NewAuthHandler(s, cfg.JWTSecret)
	deckH := handler.NewDeckHandler(s, cfg.UploadDir)
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

	// Protected routes
	r.Group(func(r chi.Router) {
		r.Use(authMiddleware)

		r.Get("/api/me", authH.Me)
		r.Get("/api/me/stats", authH.MyStats)

		// Deck routes
		r.Post("/api/decks", deckH.CreateDeck)
		r.Get("/api/decks", deckH.ListDecks)
		r.Get("/api/decks/public", deckH.ListPublicDecks)
		r.Post("/api/decks/{id}/share", deckH.ShareDeck)
		r.Get("/api/decks/{id}", deckH.GetDeck)
		r.Patch("/api/decks/{id}", deckH.UpdateDeck)
		r.Delete("/api/decks/{id}", deckH.DeleteDeck)
		r.Post("/api/decks/{id}/cards", deckH.AddCard)
		r.Delete("/api/decks/{id}/cards/{cardID}", deckH.DeleteCard)

		// Room routes
		r.Get("/api/rooms", roomH.ListRooms)
		r.Post("/api/rooms", roomH.CreateRoom)
		r.Post("/api/rooms/join", roomH.JoinRoom)
		r.Get("/api/rooms/{id}", roomH.GetRoom)
		r.Post("/api/rooms/{id}/start", roomH.StartRoom)
		r.Post("/api/rooms/{id}/next-card", roomH.NextCard)
		r.Post("/api/rooms/{id}/spectate", roomH.SetSpectate)
		r.Post("/api/rooms/{id}/force-end", roomH.ForceEndRoom)
		r.Post("/api/rooms/{id}/pause", roomH.PauseRoom)
		r.Post("/api/rooms/{id}/resume", roomH.ResumeRoom)
		r.Post("/api/rooms/{id}/play-card", roomH.PlayCard)
		r.Delete("/api/rooms/{id}", roomH.CloseRoom)
	})

	// WebSocket endpoint (auth via query token)
	r.Get("/ws/rooms/{id}", wsH.ServeWS)

	// Static file serving for uploads
	uploadsFS := http.StripPrefix("/uploads/", http.FileServer(http.Dir(cfg.UploadDir)))
	r.Get("/uploads/*", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		uploadsFS.ServeHTTP(w, r)
	})

	addr := fmt.Sprintf(":%s", cfg.Port)
	log.Printf("karuta server listening on %s", addr)
	if err := http.ListenAndServe(addr, r); err != nil {
		log.Fatalf("server error: %v", err)
	}
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
