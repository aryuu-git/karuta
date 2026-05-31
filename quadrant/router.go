package quadrant

import (
	"database/sql"
	"net/http"

	"github.com/go-chi/chi/v5"
)

func RegisterRoutes(r chi.Router, db *sql.DB, jwtSecret string, authMiddleware func(http.Handler) http.Handler) {
	if err := Migrate(db); err != nil {
		panic("quadrant migrate: " + err.Error())
	}

	store := NewStore(db)
	hubMgr := NewHubManager()
	h := NewHandler(store, hubMgr, jwtSecret)

	// WebSocket (no auth middleware, uses query token)
	r.Get("/ws/quadrant/rooms/{id}", h.ServeWS)

	// Protected API routes
	r.Group(func(r chi.Router) {
		r.Use(authMiddleware)

		// Banks
		r.Post("/api/quadrant/banks", h.CreateBank)
		r.Get("/api/quadrant/banks", h.ListBanks)
		r.Get("/api/quadrant/banks/{id}", h.GetBank)
		r.Put("/api/quadrant/banks/{id}", h.UpdateBank)
		r.Delete("/api/quadrant/banks/{id}", h.DeleteBank)

		// Items
		r.Post("/api/quadrant/banks/{id}/items", h.CreateItem)
		r.Get("/api/quadrant/banks/{id}/items", h.ListItems)
		r.Delete("/api/quadrant/items/{id}", h.DeleteItem)

		// Labels
		r.Post("/api/quadrant/banks/{id}/labels", h.CreateLabel)
		r.Get("/api/quadrant/banks/{id}/labels", h.ListLabels)
		r.Delete("/api/quadrant/labels/{id}", h.DeleteLabel)

		// Questions
		r.Post("/api/quadrant/banks/{id}/questions", h.CreateQuestion)
		r.Get("/api/quadrant/banks/{id}/questions", h.ListQuestions)
		r.Get("/api/quadrant/questions/{id}", h.GetQuestion)
		r.Delete("/api/quadrant/questions/{id}", h.DeleteQuestion)

		// Rooms
		r.Post("/api/quadrant/rooms", h.CreateRoom)
		r.Get("/api/quadrant/rooms", h.ListRooms)
		r.Get("/api/quadrant/rooms/{id}", h.GetRoom)
		r.Post("/api/quadrant/rooms/join", h.JoinRoom)
		r.Post("/api/quadrant/rooms/{id}/ready", h.ReadyPlayer)
		r.Post("/api/quadrant/rooms/{id}/start", h.StartGame)
		r.Delete("/api/quadrant/rooms/{id}", h.CloseRoom)
	})
}
