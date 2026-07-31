package main

import (
	"log"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ---------------------------------------------------------------------------
// ponytail: SOLID-S-001 — admin handler (import) + service status.
// handleImport still takes *pgxpool.Pool directly since it triggers
// GTFS import logic (gtfs.go) which needs raw DB access for bulk writes.
// ---------------------------------------------------------------------------

func handleServiceStatus(repo TransitRepo) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		statuses, err := repo.GetServiceStatus(r.Context())
		if err != nil {
			jsonError(w, err.Error(), 500)
			return
		}

		jsonResponse(w, ServiceStatusResponse{
			Statuses: statuses,
			Time:     time.Now().Format(time.RFC3339),
		})
	}
}

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
