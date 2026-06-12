package ccp

import (
	"database/sql"
	"net/http"

	"karuta/internal/storage"

	"github.com/go-chi/chi/v5"
)

// RegisterRoutes registers all routes for the CCP module.
func RegisterRoutes(r chi.Router, db *sql.DB, jwtSecret string, authMiddleware func(http.Handler) http.Handler, stor storage.Storage) {
	if err := Migrate(db); err != nil {
		panic("ccp migrate: " + err.Error())
	}

	store := NewStore(db)
	hubMgr := NewCcpHubManager()
	localLiveHub := NewCcpLocalLiveHub()
	h := NewHandler(store, hubMgr, jwtSecret, stor)

	r.Get("/ws/ccp/rooms/{code}", h.ServeWS)
	r.Get("/ws/ccp-local", localLiveHub.ServeWS)

	r.Group(func(r chi.Router) {
		r.Use(authMiddleware)

		r.Post("/api/ccp/themes", h.CreateBank)
		r.Get("/api/ccp/themes", h.ListBanks)
		r.Get("/api/ccp/themes/{id}", h.GetBank)
		r.Put("/api/ccp/themes/{id}", h.UpdateBank)
		r.Delete("/api/ccp/themes/{id}", h.DeleteBank)

		r.Get("/api/ccp/themes/{id}/images", h.ListBankImages)
		r.Post("/api/ccp/themes/{id}/images", h.UploadBankImage)
		r.Delete("/api/ccp/themes/images/{id}", h.DeleteBankImage)

		r.Post("/api/ccp/rooms", h.CreateRoom)
		r.Get("/api/ccp/rooms", h.ListRooms)
		r.Get("/api/ccp/rooms/{code}", h.GetRoom)
		r.Put("/api/ccp/rooms/{code}", h.UpdateRoom)
		r.Post("/api/ccp/rooms/{code}/join", h.JoinRoom)
		r.Post("/api/ccp/rooms/{code}/ready", h.ReadyPlayer)
		r.Post("/api/ccp/rooms/{code}/remove-image", h.RemoveRoomImage)
		r.Post("/api/ccp/rooms/{code}/random-images", h.RandomRoomImages)
		r.Post("/api/ccp/rooms/{code}/add-image", h.AddRoomImage)

		r.Post("/api/ccp/games/{code}/start", h.StartGame)
		r.Get("/api/ccp/games/{code}/state", h.GetGameState)
		r.Post("/api/ccp/games/{code}/end-game", h.EndGame)
		r.Post("/api/ccp/games/{code}/reset", h.ResetGame)
	})
}
