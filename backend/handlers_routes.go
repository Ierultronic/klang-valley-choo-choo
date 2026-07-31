package main

import (
	"net/http"
)

// ---------------------------------------------------------------------------
// ponytail: SOLID-S-001 — route handlers. Depends on TransitRepo (interface).
// ---------------------------------------------------------------------------

func handleRoutes(repo TransitRepo) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		routes, err := repo.GetRoutes(r.Context())
		if err != nil {
			jsonError(w, err.Error(), 500)
			return
		}
		jsonResponse(w, routes)
	}
}

func handleShapes(repo TransitRepo) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		shapes, err := repo.GetShapes(r.Context())
		if err != nil {
			jsonError(w, err.Error(), 500)
			return
		}
		jsonResponse(w, shapes)
	}
}
