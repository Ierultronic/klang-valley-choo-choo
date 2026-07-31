package main

import (
	"net/http"
	"time"
)

// ---------------------------------------------------------------------------
// ponytail: SOLID-S-001 — stop & station handlers. Depends on TransitRepo (interface).
// ---------------------------------------------------------------------------

func handleStops(repo TransitRepo) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		stops, err := repo.GetStops(r.Context())
		if err != nil {
			jsonError(w, err.Error(), 500)
			return
		}
		jsonResponse(w, stops)
	}
}

func handleStations(repo TransitRepo) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// ?rail=1 → rail-only stations (same predicate the frontend used to
		// apply client-side). Default stays unchanged for other consumers.
		railOnly := r.URL.Query().Get("rail") == "1"
		stations, err := repo.GetStations(r.Context(), railOnly)
		if err != nil {
			jsonError(w, err.Error(), 500)
			return
		}
		jsonResponse(w, stations)
	}
}

func handleStationETA(repo TransitRepo) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		stopID := r.PathValue("stop_id")
		if stopID == "" {
			jsonError(w, "stop_id required", 400)
			return
		}

		// ponytail: KISS-007 — map weekday to DB column name
		dayColumns := map[time.Weekday]string{
			time.Sunday:    "c.sunday",
			time.Monday:    "c.monday",
			time.Tuesday:   "c.tuesday",
			time.Wednesday: "c.wednesday",
			time.Thursday:  "c.thursday",
			time.Friday:    "c.friday",
			time.Saturday:  "c.saturday",
		}
		dayCol := dayColumns[time.Now().Weekday()]

		etas, err := repo.GetETA(r.Context(), stopID, dayCol)
		if err != nil {
			jsonError(w, err.Error(), 500)
			return
		}
		jsonResponse(w, etas)
	}
}
