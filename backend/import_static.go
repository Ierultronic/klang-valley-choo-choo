package main

import (
	"archive/zip"
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ---------------------------------------------------------------------------
// ponytail: SOLID-S-002 — GTFS Static import, split from gtfs.go.
// ---------------------------------------------------------------------------

const baseURL = "https://api.data.gov.my"

var agencies = []string{"prasarana", "ktmb"}

var importAgencies = []struct {
	name string
	url  string
}{
	{"prasarana-rail", baseURL + "/gtfs-static/prasarana?category=rapid-rail-kl"},
	{"ktmb", baseURL + "/gtfs-static/ktmb"},
}

func ImportStaticURL(pool *pgxpool.Pool, name, url string) error {
	log.Printf("Importing GTFS static: %s", name)

	resp, err := http.Get(url)
	if err != nil {
		return fmt.Errorf("download %s: %w", name, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download %s: HTTP %d", name, resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("read %s: %w", name, err)
	}

	z, err := zip.NewReader(strings.NewReader(string(body)), int64(len(body)))
	if err != nil {
		return fmt.Errorf("zip %s: %w", name, err)
	}

	files := make(map[string]*zip.File)
	for _, f := range z.File {
		files[f.Name] = f
	}

	if f, ok := files["agency.txt"]; ok {
		importAgency(pool, f)
	}
	if f, ok := files["routes.txt"]; ok {
		importRoutes(pool, f)
	}
	if f, ok := files["trips.txt"]; ok {
		importTrips(pool, f)
	}
	if f, ok := files["stops.txt"]; ok {
		importStops(pool, f)
	}
	if f, ok := files["stop_times.txt"]; ok {
		importStopTimes(pool, f)
	}
	if f, ok := files["shapes.txt"]; ok {
		importShapes(pool, f)
	}
	if f, ok := files["calendar.txt"]; ok {
		importCalendar(pool, f)
	}
	if f, ok := files["frequencies.txt"]; ok {
		importFrequencies(pool, f)
	}

	log.Printf("Import complete: %s", name)
	return nil
}

func ImportStatic(pool *pgxpool.Pool, agency string) error {
	// ponytail: only supports ktmb; prasarana needs category param, use ImportStaticURL directly
	url := fmt.Sprintf("%s/gtfs-static/%s", baseURL, agency)
	return ImportStaticURL(pool, agency, url)
}

// readCSV reads a zip CSV file into a slice of header→value maps.
func readCSV(f *zip.File) ([]map[string]string, error) {
	r, err := f.Open()
	if err != nil {
		return nil, err
	}
	defer r.Close()

	reader := csv.NewReader(r)
	records, err := reader.ReadAll()
	if err != nil {
		return nil, err
	}
	if len(records) < 2 {
		return nil, nil
	}

	headers := make([]string, len(records[0]))
	for i, h := range records[0] {
		headers[i] = strings.TrimLeft(h, "\ufeff\uFEFF") // strip BOM
	}
	var rows []map[string]string
	for _, row := range records[1:] {
		m := make(map[string]string)
		for i, h := range headers {
			if i < len(row) {
				m[h] = row[i]
			}
		}
		rows = append(rows, m)
	}
	return rows, nil
}

// ---------------------------------------------------------------------------
// DRY-003 — generic CSV import helper using a callback mapper.
// Each importXYZ function now delegates to importCSV with a typed mapper.
// ---------------------------------------------------------------------------

// csvMapper converts a CSV row map into query args. Returns nil,nil to skip.
type csvMapper func(map[string]string) ([]any, error)

// importCSV reads a zip CSV file, maps each row via the callback, and executes
// the given SQL query. This replaces 8 structurally identical import functions.
func importCSV(pool *pgxpool.Pool, f *zip.File, query string, mapper csvMapper) error {
	rows, err := readCSV(f)
	if err != nil || len(rows) == 0 {
		return nil
	}
	for _, r := range rows {
		args, err := mapper(r)
		if err != nil {
			continue
		}
		if args == nil {
			continue
		}
		pool.Exec(context.Background(), query, args...)
	}
	return nil
}

// ---------------------------------------------------------------------------
// Individual import functions — each provides its own SQL + csvMapper.
// ---------------------------------------------------------------------------

func importAgency(pool *pgxpool.Pool, f *zip.File) {
	importCSV(pool, f,
		`INSERT INTO agencies (agency_id, agency_name, agency_url)
		 VALUES ($1, $2, $3) ON CONFLICT (agency_id) DO NOTHING`,
		func(r map[string]string) ([]any, error) {
			return []any{r["agency_id"], r["agency_name"], r["agency_url"]}, nil
		})
}

func importRoutes(pool *pgxpool.Pool, f *zip.File) {
	importCSV(pool, f,
		`INSERT INTO routes (route_id, agency_id, route_short_name, route_long_name, route_color, route_text_color, route_type)
		 VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (route_id) DO UPDATE SET route_long_name=EXCLUDED.route_long_name`,
		func(r map[string]string) ([]any, error) {
			rt, _ := strconv.Atoi(r["route_type"])
			return []any{r["route_id"], r["agency_id"], r["route_short_name"], r["route_long_name"],
				r["route_color"], r["route_text_color"], rt}, nil
		})
}

func importTrips(pool *pgxpool.Pool, f *zip.File) {
	importCSV(pool, f,
		`INSERT INTO trips (trip_id, route_id, shape_id, direction_id, service_id, trip_headsign)
		 VALUES ($1,$2,$3,$4,$5,$6)
		 ON CONFLICT (trip_id) DO UPDATE SET trip_headsign = EXCLUDED.trip_headsign`,
		func(r map[string]string) ([]any, error) {
			dir, _ := strconv.Atoi(r["direction_id"])
			return []any{r["trip_id"], r["route_id"], r["shape_id"], dir, r["service_id"], r["trip_headsign"]}, nil
		})
}

func importStops(pool *pgxpool.Pool, f *zip.File) {
	importCSV(pool, f,
		`INSERT INTO stops (stop_id, stop_name, stop_lat, stop_lon)
		 VALUES ($1,$2,$3,$4) ON CONFLICT (stop_id) DO UPDATE SET stop_name=EXCLUDED.stop_name`,
		func(r map[string]string) ([]any, error) {
			lat, _ := strconv.ParseFloat(r["stop_lat"], 64)
			lon, _ := strconv.ParseFloat(r["stop_lon"], 64)
			return []any{r["stop_id"], r["stop_name"], lat, lon}, nil
		})
}

func importFrequencies(pool *pgxpool.Pool, f *zip.File) {
	importCSV(pool, f,
		`INSERT INTO frequencies (trip_id, start_time, end_time, headway_secs)
		 VALUES ($1,$2,$3,$4)`,
		func(r map[string]string) ([]any, error) {
			hs, _ := strconv.Atoi(r["headway_secs"])
			return []any{r["trip_id"], r["start_time"], r["end_time"], hs}, nil
		})
}

// ponytail: KISS-005 — loop over day names instead of 7 separate strconv.Atoi calls.
func importCalendar(pool *pgxpool.Pool, f *zip.File) {
	dayNames := []string{"monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"}
	importCSV(pool, f,
		`INSERT INTO calendar (service_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, start_date, end_date)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (service_id) DO UPDATE SET
		 monday=EXCLUDED.monday, tuesday=EXCLUDED.tuesday, wednesday=EXCLUDED.wednesday,
		 thursday=EXCLUDED.thursday, friday=EXCLUDED.friday, saturday=EXCLUDED.saturday,
		 sunday=EXCLUDED.sunday`,
		func(r map[string]string) ([]any, error) {
			days := make([]any, 7)
			for i, d := range dayNames {
				v, _ := strconv.Atoi(r[d])
				days[i] = v
			}
			return []any{r["service_id"], days[0], days[1], days[2], days[3], days[4], days[5], days[6],
				r["start_date"], r["end_date"]}, nil
		})
}

// ponytail: sequential inserts for simplicity. Batch insert if >10k rows become slow.
func importStopTimes(pool *pgxpool.Pool, f *zip.File) {
	importCSV(pool, f,
		`INSERT INTO stop_times (trip_id, stop_id, arrival_time, departure_time, stop_sequence)
		 VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
		func(r map[string]string) ([]any, error) {
			seq, _ := strconv.Atoi(r["stop_sequence"])
			return []any{r["trip_id"], r["stop_id"], r["arrival_time"], r["departure_time"], seq}, nil
		})
}

func importShapes(pool *pgxpool.Pool, f *zip.File) {
	importCSV(pool, f,
		`INSERT INTO shapes (shape_id, shape_pt_lat, shape_pt_lon, shape_pt_sequence)
		 VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
		func(r map[string]string) ([]any, error) {
			lat, _ := strconv.ParseFloat(r["shape_pt_lat"], 64)
			lon, _ := strconv.ParseFloat(r["shape_pt_lon"], 64)
			seq, _ := strconv.Atoi(r["shape_pt_sequence"])
			return []any{r["shape_id"], lat, lon, seq}, nil
		})
}
