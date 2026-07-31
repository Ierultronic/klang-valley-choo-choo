package main

import (
	"log"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ---------------------------------------------------------------------------
// ponytail: SOLID-S-001 — admin handler (import).
// handleImport takes *pgxpool.Pool directly since GTFS import needs raw DB access.
// ---------------------------------------------------------------------------

func handleImport(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		go func() {
			for _, a := range importAgencies {
				if err := ImportStaticURL(pool, a.name, a.url); err != nil {
					log.Printf("import %s: %v", a.name, err)
				}
			}
		}()
		jsonResponse(w, map[string]string{"status": "import started"})
	}
}
