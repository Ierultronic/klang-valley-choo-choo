package main

import (
	"context"
	"github.com/jackc/pgx/v5/pgxpool"
)

func Connect(databaseURL string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, err
	}
	pool, err := pgxpool.NewWithConfig(context.Background(), cfg)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(context.Background()); err != nil {
		return nil, err
	}
	return pool, nil
}

const schemaSQL = `
CREATE TABLE IF NOT EXISTS agencies (
    agency_id TEXT PRIMARY KEY,
    agency_name TEXT NOT NULL,
    agency_url TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS routes (
    route_id TEXT PRIMARY KEY,
    agency_id TEXT REFERENCES agencies(agency_id),
    route_short_name TEXT,
    route_long_name TEXT,
    route_color TEXT,
    route_text_color TEXT,
    route_type INTEGER
);

CREATE TABLE IF NOT EXISTS trips (
    trip_id TEXT PRIMARY KEY,
    route_id TEXT REFERENCES routes(route_id),
    shape_id TEXT,
    direction_id INTEGER,
    service_id TEXT,
    trip_headsign TEXT
);

CREATE TABLE IF NOT EXISTS stops (
    stop_id TEXT PRIMARY KEY,
    stop_name TEXT NOT NULL,
    stop_lat DOUBLE PRECISION,
    stop_lon DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS frequencies (
    id SERIAL PRIMARY KEY,
    trip_id TEXT,
    start_time TEXT,
    end_time TEXT,
    headway_secs INTEGER
);
CREATE INDEX IF NOT EXISTS idx_frequencies_trip ON frequencies(trip_id);

CREATE TABLE IF NOT EXISTS calendar (
    service_id TEXT PRIMARY KEY,
    monday INTEGER DEFAULT 0,
    tuesday INTEGER DEFAULT 0,
    wednesday INTEGER DEFAULT 0,
    thursday INTEGER DEFAULT 0,
    friday INTEGER DEFAULT 0,
    saturday INTEGER DEFAULT 0,
    sunday INTEGER DEFAULT 0,
    start_date TEXT,
    end_date TEXT
);

CREATE TABLE IF NOT EXISTS stop_times (
    id SERIAL PRIMARY KEY,
    trip_id TEXT,
    stop_id TEXT,
    arrival_time TEXT,
    departure_time TEXT,
    stop_sequence INTEGER
);
CREATE INDEX IF NOT EXISTS idx_stop_times_trip ON stop_times(trip_id);
CREATE INDEX IF NOT EXISTS idx_stop_times_stop ON stop_times(stop_id);

CREATE TABLE IF NOT EXISTS shapes (
    id SERIAL PRIMARY KEY,
    shape_id TEXT,
    shape_pt_lat DOUBLE PRECISION,
    shape_pt_lon DOUBLE PRECISION,
    shape_pt_sequence INTEGER
);

CREATE TABLE IF NOT EXISTS vehicle_positions (
    id SERIAL PRIMARY KEY,
    vehicle_id TEXT,
    trip_id TEXT,
    route_id TEXT,
    lat DOUBLE PRECISION,
    lon DOUBLE PRECISION,
    bearing REAL,
    speed REAL,
    delay_seconds INTEGER DEFAULT 0,
    fetched_at TIMESTAMP DEFAULT NOW()
);

-- ponytail: KISS-006 — materialized transfer graph for route planning.
-- Named pairs: same stop name on different stop_ids (same-platform interchanges).
-- Walk pairs: stops within 500m walking distance (haversine). Populated by PopulateTransfers().
CREATE TABLE IF NOT EXISTS transfers (
    from_stop_id TEXT NOT NULL,
    to_stop_id TEXT NOT NULL,
    transfer_type TEXT NOT NULL DEFAULT 'walk',
    distance_m INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (from_stop_id, to_stop_id)
);
CREATE INDEX IF NOT EXISTS idx_transfers_from ON transfers(from_stop_id);

CREATE INDEX IF NOT EXISTS idx_vp_fetched ON vehicle_positions(fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_vp_vehicle ON vehicle_positions(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_stop_times_trip ON stop_times(trip_id);
CREATE INDEX IF NOT EXISTS idx_shapes_sid ON shapes(shape_id);
CREATE INDEX IF NOT EXISTS idx_trips_route ON trips(route_id);
CREATE INDEX IF NOT EXISTS idx_trips_shape ON trips(shape_id);

-- ponytail: YAGNI-003 — service_status table disabled; scraper (myrapid.com.my) is SPA, can't scrape.
-- CREATE TABLE IF NOT EXISTS service_status (
--     line_id TEXT PRIMARY KEY,
--     line_name TEXT,
--     status TEXT,
--     remarks TEXT,
--     updated_at TIMESTAMP DEFAULT NOW()
-- );

-- ponytail: YAGNI-004 — import_log table deleted; never written to. Re-add when import logging is needed.

-- ponytail: drop FK constraints from previous runs — GTFS data has orphans we don't control
ALTER TABLE IF EXISTS stop_times DROP CONSTRAINT IF EXISTS stop_times_trip_id_fkey;
ALTER TABLE IF EXISTS stop_times DROP CONSTRAINT IF EXISTS stop_times_stop_id_fkey;
ALTER TABLE IF EXISTS trips DROP CONSTRAINT IF EXISTS trips_route_id_fkey;
ALTER TABLE IF EXISTS routes DROP CONSTRAINT IF EXISTS routes_agency_id_fkey;
ALTER TABLE IF EXISTS trips ADD COLUMN IF NOT EXISTS trip_headsign TEXT;

-- ponytail: DRY-004 — function to convert GTFS "HH:MM:SS" time string to seconds.
-- Eliminates duplicate CAST(split_part(...)) formulas across ETA and route-plan queries.
CREATE OR REPLACE FUNCTION gtfs_time_to_seconds(t TEXT) RETURNS INTEGER AS $$
BEGIN
    RETURN CAST(split_part(t, ':', 1) AS INTEGER) * 3600
         + CAST(split_part(t, ':', 2) AS INTEGER) * 60
         + CAST(split_part(t, ':', 3) AS INTEGER);
END;
$$ LANGUAGE plpgsql IMMUTABLE;
`

func RunMigrations(pool *pgxpool.Pool) error {
	_, err := pool.Exec(context.Background(), schemaSQL)
	return err
}
