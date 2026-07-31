package main

import (
	"context"
	"fmt"
	"net/http"
	"net/http/cookiejar"
	"strings"
	"time"

	"github.com/PuerkitoBio/goquery"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ---------------------------------------------------------------------------
// ponytail: Service Status Scraper — disabled. myrapid.com.my is an SPA.
// Will be removed in Phase 4 (YAGNI-001).
// ---------------------------------------------------------------------------

func FetchServiceStatus(pool *pgxpool.Pool) error {
	url := "https://myrapid.com.my/service-status/"
	jar, _ := cookiejar.New(nil)
	client := &http.Client{
		Jar:     jar,
		Timeout: 10 * time.Second,
	}
	resp, err := client.Get(url)
	if err != nil {
		return fmt.Errorf("fetch status page: %w", err)
	}
	defer resp.Body.Close()

	// ponytail: myrapid.com.my is an SPA (returns "Loading" or 403).
	// Scraping won't work. Will re-enable when they provide a public API.
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("status page returned HTTP %d (expected 200)", resp.StatusCode)
	}

	doc, err := goquery.NewDocumentFromReader(resp.Body)
	if err != nil {
		return fmt.Errorf("parse html: %w", err)
	}

	now := time.Now()
	doc.Find("tbody tr[data-row_id]").Each(func(_ int, row *goquery.Selection) {
		cells := row.Find("td")
		if cells.Length() < 6 {
			return
		}
		name := strings.TrimSpace(cells.Eq(0).Text())
		status := strings.TrimSpace(cells.Eq(2).Text())
		remarks := strings.TrimSpace(cells.Eq(3).Text())
		lineID := strings.TrimSpace(cells.Eq(5).Text())

		if name == "" {
			return
		}

		pool.Exec(context.Background(),
			`INSERT INTO service_status (line_id, line_name, status, remarks, updated_at)
			 VALUES ($1,$2,$3,$4,$5)
			 ON CONFLICT (line_id) DO UPDATE SET
			     line_name=EXCLUDED.line_name, status=EXCLUDED.status,
			     remarks=EXCLUDED.remarks, updated_at=EXCLUDED.updated_at`,
			lineID, name, status, remarks, now)
	})

	return nil
}
