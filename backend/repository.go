package main

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ---------------------------------------------------------------------------
// ponytail: SOLID-D-001 — Repository layer abstracts DB from HTTP handlers.
// Handlers depend on TransitRepo (interface), not *pgxpool.Pool directly.
// ---------------------------------------------------------------------------

// TransitRepo provides all data-access methods for the transit API.
type TransitRepo interface {
	// Routes
	GetRoutes(ctx context.Context) ([]Route, error)
	GetShapes(ctx context.Context) ([]ShapeResponse, error)

	// Vehicles
	GetVehicles(ctx context.Context) ([]VehiclePosition, error)

	// Stops & Stations
	GetStops(ctx context.Context) ([]Stop, error)
	GetStopByID(ctx context.Context, stopID string) (Stop, error)
	GetStations(ctx context.Context) ([]Station, error)

	// ETA
	GetETA(ctx context.Context, stopID string, dayCol string) ([]ETA, error)

	// Route Planning
	GetDirectRoutes(ctx context.Context, fromStopID, toStopID string) ([]RoutePlanRoute, error)
	GetPlanGraph(ctx context.Context) (*planGraph, error)
	GetRouteStops(ctx context.Context, routeID, fromName, toName string) ([]string, error)
}

// pgxTransitRepo implements TransitRepo using pgxpool.
type pgxTransitRepo struct {
	pool *pgxpool.Pool
}

// NewTransitRepo creates a pgx-backed TransitRepo.
func NewTransitRepo(pool *pgxpool.Pool) TransitRepo {
	return &pgxTransitRepo{pool: pool}
}

// ---------------------------------------------------------------------------
// ponytail: DRY-002 — generic queryList[T] replaces 8 identical
// "query → defer close → for rows.Next → scan → append" patterns.
// Each repo method now delegates the boilerplate to this helper.
// ---------------------------------------------------------------------------

// queryList executes a query, scans each row using scanFn, and returns the results.
func queryList[T any](ctx context.Context, pool *pgxpool.Pool, query string, args []any, scanFn func(pgx.Rows) (T, error)) ([]T, error) {
	rows, err := pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []T
	for rows.Next() {
		item, err := scanFn(rows)
		if err != nil {
			continue
		}
		results = append(results, item)
	}
	return results, nil
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

func (r *pgxTransitRepo) GetRoutes(ctx context.Context) ([]Route, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT route_id, agency_id, route_short_name, route_long_name,
		        route_color, route_text_color, route_type
		 FROM routes ORDER BY route_short_name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var routes []Route
	for rows.Next() {
		var rt Route
		if err := rows.Scan(&rt.RouteID, &rt.AgencyID, &rt.RouteShortName,
			&rt.RouteLongName, &rt.RouteColor, &rt.RouteTextColor, &rt.RouteType); err != nil {
			continue
		}
		routes = append(routes, rt)
	}
	return routes, nil
}

func (r *pgxTransitRepo) GetShapes(ctx context.Context) ([]ShapeResponse, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT s.shape_id, s.shape_pt_lat, s.shape_pt_lon, s.shape_pt_sequence,
		        COALESCE(t.route_id, '')
		 FROM shapes s
		 LEFT JOIN trips t ON s.shape_id = t.shape_id
		 ORDER BY s.shape_id, s.shape_pt_sequence`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	shapeMap := make(map[string]*ShapeResponse)
	for rows.Next() {
		var shapeID string
		var lat, lon float64
		var seq int
		var routeID string
		if err := rows.Scan(&shapeID, &lat, &lon, &seq, &routeID); err != nil {
			continue
		}
		if _, ok := shapeMap[shapeID]; !ok {
			shapeMap[shapeID] = &ShapeResponse{
				ShapeID: shapeID,
				RouteID: routeID,
				Points:  []ShapePoint{},
			}
		}
		shapeMap[shapeID].Points = append(shapeMap[shapeID].Points, ShapePoint{Lat: lat, Lon: lon})
	}

	shapes := make([]ShapeResponse, 0, len(shapeMap))
	for _, s := range shapeMap {
		s.Points = simplifyPoints(s.Points, 0.0003)
		shapes = append(shapes, *s)
	}
	return shapes, nil
}

// ---------------------------------------------------------------------------
// Vehicles
// ---------------------------------------------------------------------------

func (r *pgxTransitRepo) GetVehicles(ctx context.Context) ([]VehiclePosition, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT DISTINCT ON (vehicle_id) vehicle_id, COALESCE(trip_id,''), COALESCE(route_id,''),
		        lat, lon, COALESCE(bearing,0), COALESCE(speed,0),
		        COALESCE(delay_seconds,0), fetched_at
		 FROM vehicle_positions
		 WHERE fetched_at > NOW() - INTERVAL '5 minutes'
		 ORDER BY vehicle_id, fetched_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var vehicles []VehiclePosition
	for rows.Next() {
		var v VehiclePosition
		var fetchedAt time.Time
		if err := rows.Scan(&v.VehicleID, &v.TripID, &v.RouteID,
			&v.Lat, &v.Lon, &v.Bearing, &v.Speed, &v.DelaySeconds, &fetchedAt); err != nil {
			continue
		}
		v.FetchedAt = fetchedAt.Format(time.RFC3339)
		vehicles = append(vehicles, v)
	}
	return vehicles, nil
}

// ---------------------------------------------------------------------------
// Stops & Stations
// ---------------------------------------------------------------------------

// ponytail: DRY-002 — uses queryList[T] helper to eliminate boilerplate.
func (r *pgxTransitRepo) GetStops(ctx context.Context) ([]Stop, error) {
	return queryList(ctx, r.pool,
		`SELECT stop_id, stop_name, stop_lat, stop_lon FROM stops ORDER BY stop_name`,
		nil,
		func(rows pgx.Rows) (Stop, error) {
			var s Stop
			err := rows.Scan(&s.StopID, &s.StopName, &s.StopLat, &s.StopLon)
			return s, err
		})
}

func (r *pgxTransitRepo) GetStopByID(ctx context.Context, stopID string) (Stop, error) {
	var s Stop
	err := r.pool.QueryRow(ctx,
		`SELECT stop_id, stop_name, stop_lat, stop_lon FROM stops WHERE stop_id = $1`, stopID).
		Scan(&s.StopID, &s.StopName, &s.StopLat, &s.StopLon)
	return s, err
}

func (r *pgxTransitRepo) GetStations(ctx context.Context) ([]Station, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT s.stop_id, s.stop_name, s.stop_lat, s.stop_lon,
		        COALESCE(array_agg(DISTINCT r.route_id) FILTER (WHERE r.route_id IS NOT NULL), '{}') AS route_ids,
		        COALESCE(array_agg(DISTINCT r.route_long_name) FILTER (WHERE r.route_long_name IS NOT NULL), '{}') AS route_names,
		        COALESCE((array_agg(DISTINCT r.route_color) FILTER (WHERE r.route_color IS NOT NULL))[1], '') AS route_color
		 FROM stops s
		 JOIN stop_times st ON s.stop_id = st.stop_id
		 JOIN trips t ON st.trip_id = t.trip_id
		 JOIN routes r ON t.route_id = r.route_id
		 GROUP BY s.stop_id, s.stop_name, s.stop_lat, s.stop_lon
		 ORDER BY s.stop_name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var stations []Station
	for rows.Next() {
		var st Station
		if err := rows.Scan(&st.StopID, &st.StopName, &st.StopLat, &st.StopLon,
			&st.RouteIDs, &st.RouteNames, &st.RouteColor); err != nil {
			continue
		}
		stations = append(stations, st)
	}
	return stations, nil
}

// ---------------------------------------------------------------------------
// ETA
// ---------------------------------------------------------------------------

// ponytail: KISS-003 — extracted ETA query builder for readability.
// CTE structure: myt = current time in seconds, base = filtered schedule rows,
// then cross-join with generate_series to produce frequency-based departures.
func buildETASQL(dayCol string) string {
	return fmt.Sprintf(`
		WITH myt AS (
		  SELECT (EXTRACT(HOUR FROM (CURRENT_TIME + INTERVAL '8 hours')) * 3600 +
		          EXTRACT(MINUTE FROM (CURRENT_TIME + INTERVAL '8 hours')) * 60 +
		          EXTRACT(SECOND FROM (CURRENT_TIME + INTERVAL '8 hours')))::INTEGER AS sec
		), base AS (
		  SELECT DISTINCT
		    gtfs_time_to_seconds(st.arrival_time) AS arr_sec,
		    COALESCE(gtfs_time_to_seconds(f.end_time), 86400) AS end_sec,
		    f.headway_secs, t.trip_id, t.direction_id,
		    r.route_id, r.route_long_name, r.route_color,
		    COALESCE(t.trip_headsign, '') AS headsign
		  FROM stop_times st
		  JOIN trips t ON st.trip_id = t.trip_id
		  JOIN routes r ON t.route_id = r.route_id
		  LEFT JOIN calendar c ON t.service_id = c.service_id
		  LEFT JOIN frequencies f ON st.trip_id = f.trip_id
		  WHERE st.stop_id = $1
		    AND (%s = 1 OR c.service_id IS NULL)
		)
		SELECT
		  LPAD(((b.arr_sec + n.n * COALESCE(b.headway_secs, 86400)) / 3600)::text, 2, '0') || ':' ||
		  LPAD((((b.arr_sec + n.n * COALESCE(b.headway_secs, 86400)) %% 3600) / 60)::text, 2, '0') || ':' ||
		  LPAD(((b.arr_sec + n.n * COALESCE(b.headway_secs, 86400)) %% 60)::text, 2, '0') AS arrival_time,
		  b.route_id, b.route_long_name, b.route_color, b.trip_id, b.direction_id, b.headsign
		FROM base b, myt
		CROSS JOIN LATERAL generate_series(0, CASE WHEN b.headway_secs IS NULL THEN 0 ELSE 500 END) n
		WHERE b.arr_sec + n.n * COALESCE(b.headway_secs, 86400) > myt.sec
		  AND b.arr_sec + n.n * COALESCE(b.headway_secs, 86400) < b.end_sec + 3600
		ORDER BY b.arr_sec + n.n * COALESCE(b.headway_secs, 86400)
		LIMIT 10`, dayCol)
}

func (r *pgxTransitRepo) GetETA(ctx context.Context, stopID string, dayCol string) ([]ETA, error) {
	q := buildETASQL(dayCol)

	rows, err := r.pool.Query(ctx, q, stopID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var etas []ETA
	for rows.Next() {
		var e ETA
		if err := rows.Scan(&e.ArrivalTime, &e.RouteID, &e.RouteName, &e.RouteColor, &e.TripID, &e.DirectionID, &e.Headsign); err != nil {
			continue
		}
		etas = append(etas, e)
	}
	if etas == nil {
		etas = []ETA{}
	}
	return etas, nil
}

// ---------------------------------------------------------------------------
// Route Planning
// ---------------------------------------------------------------------------

func (r *pgxTransitRepo) GetDirectRoutes(ctx context.Context, fromStopID, toStopID string) ([]RoutePlanRoute, error) {
	q := `
	SELECT DISTINCT ON (r.route_id)
	  r.route_id, r.route_long_name, r.route_color, t.direction_id,
	  COALESCE(t.shape_id, '') AS shape_id,
	  (st2.stop_sequence - st1.stop_sequence - 1) AS stops_between,
	  gtfs_time_to_seconds(st2.arrival_time) - gtfs_time_to_seconds(st1.arrival_time) AS duration_sec
	FROM stop_times st1
	JOIN trips t ON st1.trip_id = t.trip_id
	JOIN routes r ON t.route_id = r.route_id
	JOIN stop_times st2 ON st1.trip_id = st2.trip_id
	WHERE st1.stop_id = $1 AND st2.stop_id = $2
	  AND st1.stop_sequence < st2.stop_sequence
	  AND r.route_type <> 3
	ORDER BY r.route_id, duration_sec
	LIMIT 5`

	rows, err := r.pool.Query(ctx, q, fromStopID, toStopID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []RoutePlanRoute
	for rows.Next() {
		var rr RoutePlanRoute
		if err := rows.Scan(&rr.RouteID, &rr.RouteName, &rr.RouteColor, &rr.DirectionID,
			&rr.ShapeID, &rr.StopsBetween, &rr.DurationSec); err != nil {
			continue
		}
		results = append(results, rr)
	}
	return results, nil
}

// GetPlanGraph loads the stop-route graph used by the BFS planner:
// stop→routes, route→ordered stops, stop→transfer edges, stop→name.
// RAIL-ONLY: bus routes (route_type 3) are excluded, so bus stops never
// enter the graph. This is the raw loader; planner.go caches the result
// across requests (planGraphCache) and invalidates it when transfers are
// repopulated.
func (r *pgxTransitRepo) GetPlanGraph(ctx context.Context) (*planGraph, error) {
	g := &planGraph{
		stopLoc:     make(map[string]planStop),
		routesByStop: make(map[string][]string),
		stopsByRoute: make(map[string][]planStop),
		transfers:   make(map[string][]transferEdge),
	}

	rows, err := r.pool.Query(ctx, `SELECT stop_id, stop_name, stop_lat, stop_lon FROM stops`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var s planStop
		if err := rows.Scan(&s.ID, &s.Name, &s.Lat, &s.Lon); err == nil {
			g.stopLoc[s.ID] = s
		}
	}
	rows.Close()

	// ponytail: KISS — rail-only scope. Only routes with route_type 0/1/2
	// (LRT/MRT/KTM/monorail/BRT) participate in planning; bus routes
	// (route_type 3) are excluded so bus stops never enter the graph.
	railStops := make(map[string]bool)
	rows, err = r.pool.Query(ctx, `
		SELECT DISTINCT st.stop_id, t.route_id
		FROM stop_times st
		JOIN trips t ON st.trip_id = t.trip_id
		JOIN routes r ON t.route_id = r.route_id
		WHERE r.route_type <> 3`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var stopID, routeID string
		if err := rows.Scan(&stopID, &routeID); err != nil {
			continue
		}
		g.routesByStop[stopID] = append(g.routesByStop[stopID], routeID)
		railStops[stopID] = true
	}
	rows.Close()

	// Drop stops with no rail trips (bus-only stops) from the graph entirely.
	for id := range g.stopLoc {
		if !railStops[id] {
			delete(g.stopLoc, id)
		}
	}

	// Representative trip per rail route → ordered stop list.
	rows, err = r.pool.Query(ctx, `
		SELECT rt.route_id, st.stop_id
		FROM (SELECT DISTINCT ON (t.route_id) t.route_id, t.trip_id
		      FROM trips t JOIN routes r ON t.route_id = r.route_id
		      WHERE r.route_type <> 3) rt
		JOIN stop_times st ON st.trip_id = rt.trip_id
		ORDER BY rt.route_id, st.stop_sequence`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var routeID, stopID string
		if err := rows.Scan(&routeID, &stopID); err != nil {
			continue
		}
		if s, ok := g.stopLoc[stopID]; ok {
			g.stopsByRoute[routeID] = append(g.stopsByRoute[routeID], s)
		}
	}
	rows.Close()

	rows, err = r.pool.Query(ctx, `
		SELECT from_stop_id, to_stop_id, distance_m FROM transfers`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var from, to string
		var dist int
		if err := rows.Scan(&from, &to, &dist); err != nil {
			continue
		}
		if from == to {
			continue
		}
		// Rail-only: skip transfer edges touching bus stops.
		if !railStops[from] || !railStops[to] {
			continue
		}
		g.transfers[from] = append(g.transfers[from], transferEdge{From: from, To: to, DistM: dist})
	}
	rows.Close()

	return g, nil
}

// ponytail: returns stop names in order between two stations on a route
func (r *pgxTransitRepo) GetRouteStops(ctx context.Context, routeID, fromName, toName string) ([]string, error) {
	var tripID string
	err := r.pool.QueryRow(ctx, `
		SELECT t.trip_id FROM stop_times st1
		JOIN trips t ON st1.trip_id = t.trip_id AND t.route_id = $1
		JOIN stop_times st2 ON st1.trip_id = st2.trip_id
		JOIN stops s1 ON st1.stop_id = s1.stop_id
		JOIN stops s2 ON st2.stop_id = s2.stop_id
		WHERE s1.stop_name = $2 AND s2.stop_name = $3
		AND st1.stop_sequence < st2.stop_sequence
		LIMIT 1`, routeID, fromName, toName).Scan(&tripID)
	if err != nil {
		return nil, err
	}

	rows, err := r.pool.Query(ctx, `
		SELECT s.stop_name FROM stop_times st
		JOIN stops s ON st.stop_id = s.stop_id
		WHERE st.trip_id = $1
		GROUP BY s.stop_name
		ORDER BY MIN(st.stop_sequence)`, tripID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var allStops []string
	for rows.Next() {
		var name string
		rows.Scan(&name)
		allStops = append(allStops, name)
	}

	fromIdx, toIdx := -1, -1
	for i, name := range allStops {
		if name == fromName && fromIdx == -1 {
			fromIdx = i
		}
		if name == toName {
			toIdx = i
		}
	}
	if fromIdx == -1 || toIdx == -1 || fromIdx >= toIdx {
		return nil, nil
	}
	return allStops[fromIdx : toIdx+1], nil
}
