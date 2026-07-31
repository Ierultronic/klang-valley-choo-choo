package main

import (
	"context"
	"net/http"
	"sort"
)

// ---------------------------------------------------------------------------
// ponytail: SOLID-S-001 — route planner handler + transfer engine.
// Depends on TransitRepo (interface).
// ---------------------------------------------------------------------------

// xferInfo holds intermediate transfer data between two routes.
type xferInfo struct {
	stopID, stopName    string
	stopLat, stopLon    float64
	stop2ID, stop2Name  string
	stop2Lat, stop2Lon  float64
	leg1RouteID, leg1Name, leg1Color string
	leg2RouteID, leg2Name, leg2Color string
}

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

		// ponytail: 1-transfer routes when no direct route exists
		if len(results) == 0 {
			results = findTransferRoutes(ctx, repo, fromStop, toStop)
		}

		if results == nil {
			results = []RoutePlanRoute{}
		}
		jsonResponse(w, RoutePlanResult{Routes: results, FromStop: fromStop, ToStop: toStop})
	}
}

// ponytail: single-transfer routes between any two stations.
func findTransferRoutes(ctx context.Context, repo TransitRepo, fromStop, toStop Stop) []RoutePlanRoute {
	// Step 1: name-based transfers (same station name on different lines)
	namedXfers, _ := repo.GetNamedTransfers(ctx, fromStop.StopID, toStop.StopID)

	// Step 2: proximity-based fallback (connected stations with different names)
	nearbyXfers, _ := repo.GetNearbyTransfers(ctx, fromStop.StopID, toStop.StopID)

	xfers := append(namedXfers, nearbyXfers...)
	if len(xfers) == 0 {
		return nil
	}

	// Deduplicate by (leg1_route_id, leg2_route_id, transfer_stop_name)
	seen := make(map[string]bool)
	var deduped []xferInfo
	for _, x := range xfers {
		key := x.leg1RouteID + "|" + x.leg2RouteID + "|" + x.stopName
		if seen[key] {
			continue
		}
		seen[key] = true
		deduped = append(deduped, x)
	}

	var results []RoutePlanRoute
	for _, x := range deduped {
		xferStop := Stop{StopID: x.stopID, StopName: x.stopName, StopLat: x.stopLat, StopLon: x.stopLon}
		xferStop2 := Stop{StopID: x.stop2ID, StopName: x.stop2Name, StopLat: x.stop2Lat, StopLon: x.stop2Lon}

		var legs []RouteLeg
		// ponytail: skip zero-stop leg when transfer is at origin station
		if fromStop.StopName != x.stopName {
			stops1, _ := repo.GetRouteStops(ctx, x.leg1RouteID, fromStop.StopName, x.stopName)
			leg1 := RouteLeg{
				RouteID: x.leg1RouteID, RouteName: x.leg1Name, RouteColor: x.leg1Color,
				DirectionID: 0, FromStop: fromStop, ToStop: xferStop, Stops: stops1,
			}
			if leg1.Stops != nil {
				leg1.StopsBetween = len(leg1.Stops) - 1
			}
			legs = append(legs, leg1)
		}

		stops2, _ := repo.GetRouteStops(ctx, x.leg2RouteID, x.stop2Name, toStop.StopName)
		leg2 := RouteLeg{
			RouteID: x.leg2RouteID, RouteName: x.leg2Name, RouteColor: x.leg2Color,
			DirectionID: 0, FromStop: xferStop2, ToStop: toStop, Stops: stops2,
		}
		if leg2.Stops != nil {
			leg2.StopsBetween = len(leg2.Stops) - 1
		}
		legs = append(legs, leg2)

		results = append(results, RoutePlanRoute{
			Legs:       legs,
			TransferAt: &xferStop,
		})
	}

	// ponytail: shortest route first by total stop count
	sort.Slice(results, func(i, j int) bool {
		totalI, totalJ := 0, 0
		for _, l := range results[i].Legs {
			totalI += l.StopsBetween
		}
		for _, l := range results[j].Legs {
			totalJ += l.StopsBetween
		}
		return totalI < totalJ
	})
	return results
}
