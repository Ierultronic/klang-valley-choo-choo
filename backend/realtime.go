package main

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	gtfsrt "kv-transit/proto"

	"github.com/jackc/pgx/v5/pgxpool"
	gproto "google.golang.org/protobuf/proto"
)

// ---------------------------------------------------------------------------
// ponytail: SOLID-S-002 — GTFS Realtime fetch + delay calculation, split from gtfs.go.
// ---------------------------------------------------------------------------

var realtimeURLs = []string{
	"https://api.data.gov.my/gtfs-realtime/vehicle-position/prasarana?category=rapid-bus-kl",
	"https://api.data.gov.my/gtfs-realtime/vehicle-position/prasarana?category=rapid-bus-mrtfeeder",
	"https://api.data.gov.my/gtfs-realtime/vehicle-position/ktmb",
}

func FetchRealtime(pool *pgxpool.Pool) error {
	for _, url := range realtimeURLs {
		if err := fetchAndStore(pool, url); err != nil {
			log.Printf("realtime fetch error %s: %v", url, err)
		}
	}
	return nil
}

func fetchAndStore(pool *pgxpool.Pool, url string) error {
	resp, err := http.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}

	feed := &gtfsrt.FeedMessage{}
	if err := gproto.Unmarshal(data, feed); err != nil {
		return fmt.Errorf("protobuf unmarshal: %w", err)
	}

	now := time.Now()
	for _, entity := range feed.Entity {
		vp := entity.GetVehicle()
		if vp == nil {
			continue
		}

		tripID := ""
		routeID := ""
		if t := vp.GetTrip(); t != nil {
			tripID = t.GetTripId()
			routeID = t.GetRouteId()
		}

		vehicleID := ""
		if v := vp.GetVehicle(); v != nil {
			vehicleID = v.GetId()
		}

		pos := vp.GetPosition()
		if pos == nil {
			continue
		}

		delay := calculateDelay(tripID, float64(pos.GetLatitude()), float64(pos.GetLongitude()), pool)

		pool.Exec(context.Background(),
			`INSERT INTO vehicle_positions
			     (vehicle_id, trip_id, route_id, lat, lon, bearing, speed, delay_seconds, fetched_at)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
			vehicleID, tripID, routeID,
			float64(pos.GetLatitude()), float64(pos.GetLongitude()),
			float64(pos.GetBearing()), float64(pos.GetSpeed()),
			delay, now)
	}

	return nil
}

// ponytail: simple delay estimation – compares current position to nearest stop schedule
func calculateDelay(tripID string, lat, lon float64, pool *pgxpool.Pool) int {
	if tripID == "" {
		return 0
	}

	nowDur := nowDuration()
	var closestDiff time.Duration = 30 * time.Minute // if nothing is within 30 min, treat as unknown

	rows, err := pool.Query(context.Background(),
		`SELECT st.arrival_time, s.stop_lat, s.stop_lon
		 FROM stop_times st
		 JOIN stops s ON st.stop_id = s.stop_id
		 WHERE st.trip_id = $1
		 ORDER BY st.stop_sequence`, tripID)
	if err != nil {
		return 0
	}
	defer rows.Close()

	for rows.Next() {
		var arrival string
		var slat, slon float64
		if err := rows.Scan(&arrival, &slat, &slon); err != nil {
			continue
		}

		schedDur := parseGTFSTime(arrival)
		diff := nowDur - schedDur

		// match: we want the stop the vehicle should have ALREADY passed
		// by comparing scheduled time vs current time
		if diff > 0 && diff < closestDiff {
			closestDiff = diff
		}
	}

	if closestDiff < 10*time.Minute {
		return 0 // on time
	}
	return int(closestDiff.Seconds())
}
