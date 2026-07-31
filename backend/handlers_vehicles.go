package main

import (
	"net/http"
	"time"
)

// ---------------------------------------------------------------------------
// ponytail: SOLID-S-001 — vehicle handler. Depends on TransitRepo (interface).
// ---------------------------------------------------------------------------

func handleVehicles(repo TransitRepo) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vehicles, err := repo.GetVehicles(r.Context())
		if err != nil {
			jsonError(w, err.Error(), 500)
			return
		}

		jsonResponse(w, VehicleResponse{
			Vehicles: vehicles,
			Count:    len(vehicles),
			Time:     time.Now().Format(time.RFC3339),
		})
	}
}
