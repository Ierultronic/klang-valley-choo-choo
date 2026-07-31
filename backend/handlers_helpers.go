package main

import (
	"encoding/json"
	"net/http"
)

// ---------------------------------------------------------------------------
// ponytail: SOLID-S-001 — shared HTTP helpers extracted from handlers.go.
// ---------------------------------------------------------------------------

func jsonResponse(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

func jsonError(w http.ResponseWriter, msg string, code int) {
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// ponytail: drop points closer than minDist degrees (~33m). Map zoom never shows detail finer than this.
func simplifyPoints(pts []ShapePoint, minDist float64) []ShapePoint {
	if len(pts) < 2 {
		return pts
	}
	r := make([]ShapePoint, 0, len(pts)/10)
	r = append(r, pts[0])
	last := pts[0]
	for _, p := range pts[1:] {
		dLat := p.Lat - last.Lat
		dLon := p.Lon - last.Lon
		if dLat*dLat+dLon*dLon >= minDist*minDist {
			r = append(r, p)
			last = p
		}
	}
	return r
}
