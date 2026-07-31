package main

import (
	"context"
	"log"
	"strconv"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ---------------------------------------------------------------------------
// ponytail: KISS-006 — materialized transfer graph for the route planner.
// PopulateTransfers rebuilds the `transfers` table from GTFS data:
//   - 'named': stops sharing the same name on different stop_ids
//     (e.g. KL SENTRAL on MR1 vs 19100; MASJID JAMEK AG7/KJ13/SP7).
//   - 'walk':  stops within 500m haversine distance with different stop_ids
//     (e.g. KTM Bandar Tasek ↔ LRT Bandar Tasik Selatan, 19m apart).
// Both directions are stored so planner lookups are single-map hits.
// ---------------------------------------------------------------------------

const transferWalkRadiusM = 500

// haversineM is the SQL snippet computing distance in metres between two
// stops a/b. Kept here (not in db.go) because it is only used for transfers.
const haversineM = `6371000 * acos(least(1, greatest(-1,
	sin(radians(a.stop_lat))*sin(radians(b.stop_lat)) +
	cos(radians(a.stop_lat))*cos(radians(b.stop_lat))*cos(radians(b.stop_lon-a.stop_lon)))))`

func PopulateTransfers(pool *pgxpool.Pool) {
	ctx := context.Background()

	if _, err := pool.Exec(ctx, `TRUNCATE transfers`); err != nil {
		log.Printf("transfers: truncate failed: %v", err)
		return
	}

	// Same-name pairs (case/whitespace-insensitive), one direction.
	if _, err := pool.Exec(ctx, `
		INSERT INTO transfers (from_stop_id, to_stop_id, transfer_type, distance_m)
		SELECT a.stop_id, b.stop_id, 'named', 0
		FROM stops a
		JOIN stops b ON UPPER(TRIM(a.stop_name)) = UPPER(TRIM(b.stop_name))
			AND a.stop_id < b.stop_id`); err != nil {
		log.Printf("transfers: named insert failed: %v", err)
		return
	}
	// Same-name pairs, reverse direction.
	if _, err := pool.Exec(ctx, `
		INSERT INTO transfers (from_stop_id, to_stop_id, transfer_type, distance_m)
		SELECT b.stop_id, a.stop_id, 'named', 0
		FROM stops a
		JOIN stops b ON UPPER(TRIM(a.stop_name)) = UPPER(TRIM(b.stop_name))
			AND a.stop_id < b.stop_id`); err != nil {
		log.Printf("transfers: named reverse insert failed: %v", err)
		return
	}

	// Proximity pairs within the walk radius. The bbox prefilter keeps the
	// haversine computation on a tiny fraction of the 4,431 x 4,431 cross join.
	// ponytail: KISS — flat 500m radius; no footpath data available.
	for _, dir := range []string{"a.stop_id < b.stop_id", "b.stop_id < a.stop_id"} {
		q := `
		INSERT INTO transfers (from_stop_id, to_stop_id, transfer_type, distance_m)
		SELECT a.stop_id, b.stop_id, 'walk',
		       round(` + haversineM + `)::integer
		FROM stops a
		JOIN stops b ON ` + dir + `
			AND ABS(a.stop_lat - b.stop_lat) < 0.005
			AND ABS(a.stop_lon - b.stop_lon) < 0.005
		WHERE ` + haversineM + ` < ` + strconv.Itoa(transferWalkRadiusM) + `
		ON CONFLICT (from_stop_id, to_stop_id) DO NOTHING`
		if _, err := pool.Exec(ctx, q); err != nil {
			log.Printf("transfers: walk insert failed: %v", err)
			return
		}
	}

	var n int
	pool.QueryRow(ctx, `SELECT count(*) FROM transfers`).Scan(&n)
	log.Printf("transfers: populated %d transfer edges", n)

	// The planner graph embeds the transfers table — drop the stale cache so
	// the next route-plan request rebuilds it from the fresh data.
	invalidatePlanGraph()
}
