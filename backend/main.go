package main

import (
	"log"
	"net/http"
	"os"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		databaseURL = "postgres://transit:***@localhost:5432/kv_transit"
	}

	pool, err := Connect(databaseURL)
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	if err := RunMigrations(pool); err != nil {
		log.Fatal(err)
	}

	// ponytail: SOLID-D-001 — repository layer; handlers depend on interface, not pool
	repo := NewTransitRepo(pool)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/routes", handleRoutes(repo))
	mux.HandleFunc("GET /api/vehicles", handleVehicles(repo))
	mux.HandleFunc("GET /api/stops", handleStops(repo))
	mux.HandleFunc("GET /api/stations", handleStations(repo))
	mux.HandleFunc("GET /api/stations/{stop_id}/eta", handleStationETA(repo))
	mux.HandleFunc("GET /api/shapes", handleShapes(repo))
	mux.HandleFunc("GET /api/route-plan", handleRoutePlan(repo))
	mux.HandleFunc("GET /api/service-status", handleServiceStatus(repo))
	mux.HandleFunc("POST /api/admin/import", handleImport(pool))

	StartScheduler(pool)

	log.Printf("Server starting on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, corsMiddleware(mux)))
}
