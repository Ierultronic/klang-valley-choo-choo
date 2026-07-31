package main

import (
	"net/http"
)

// ---------------------------------------------------------------------------
// ponytail: SOLID-S-001 — route planner handler.
// Direct routes first, then BFS multi-transfer journeys (max 2 transfers).
// Depends on TransitRepo (interface).
// ---------------------------------------------------------------------------

func handleRoutePlan(repo TransitRepo) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		from := r.URL.Query().Get("from")
		to := r.URL.Query().Get("to")
		if from == "" || to == "" {
			jsonError(w, "from and to params required", 400)
			return
		}

		ctx := r.Context()

		fromStop, err := repo.GetStopByID(ctx, from)
		if err != nil {
			jsonError(w, "from stop not found: "+err.Error(), 404)
			return
		}
		toStop, err := repo.GetStopByID(ctx, to)
		if err != nil {
			jsonError(w, "to stop not found: "+err.Error(), 404)
			return
		}

		// ponytail: direct routes first
		directs, err := repo.GetDirectRoutes(ctx, from, to)
		if err != nil {
			jsonError(w, err.Error(), 500)
			return
		}

		var results []RoutePlanRoute
		for _, rr := range directs {
			stops, _ := repo.GetRouteStops(ctx, rr.RouteID, fromStop.StopName, toStop.StopName)
			leg := RouteLeg{
				RouteID: rr.RouteID, RouteName: rr.RouteName, RouteColor: rr.RouteColor,
				DirectionID: rr.DirectionID, StopsBetween: rr.StopsBetween,
				DurationSec: rr.DurationSec, ShapeID: rr.ShapeID,
				FromStop: fromStop, ToStop: toStop, Stops: stops,
			}
			rr.Legs = []RouteLeg{leg}
			results = append(results, rr)
		}

		// Multi-transfer fallback: BFS with up to 2 transfers (3 legs).
		if len(results) == 0 {
			results = findMultiTransferRoutes(ctx, repo, fromStop, toStop)
		}

		if results == nil {
			results = []RoutePlanRoute{}
		}
		jsonResponse(w, RoutePlanResult{Routes: results, FromStop: fromStop, ToStop: toStop})
	}
}
