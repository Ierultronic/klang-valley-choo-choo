package main

import (
	"context"
	"sort"
	"strings"
	"sync"
)

// ---------------------------------------------------------------------------
// ponytail: KISS-007 — multi-transfer route planner.
// BFS over the stop–route graph, max 2 transfers (3 legs).
//   - ride:      move from the current stop to any other stop on the same route
//   - transfer:  jump via the `transfers` table to a stop on a DIFFERENT route
// Level-ordered so journeys with fewer transfers always win; visited states
// (stop, route) are pruned to keep the search bounded.
// ---------------------------------------------------------------------------

const (
	maxTransfers   = 2
	maxPlanResults = 6
	maxStates      = 100_000
)

// planGraph is the stop-route graph used by the BFS planner.
type planGraph struct {
	stopLoc      map[string]planStop   // stop_id → stop (name + coords)
	routesByStop map[string][]string   // stop_id → route_ids serving it
	stopsByRoute map[string][]planStop // route_id → stops in trip order
	transfers    map[string][]transferEdge
}

// graphCache holds the plan graph in memory across requests.
// ponytail: KISS — the graph is a few hundred k rows; loading it per request
// costs ~10s. Build once, invalidate when the transfers table is repopulated.
type graphCache struct {
	mu    sync.RWMutex
	g     *planGraph
	built bool
}

var planGraphCache = &graphCache{}

// cachedPlanGraph returns the cached plan graph, building it on first use
// (double-checked locking; concurrent first requests build it once).
func cachedPlanGraph(ctx context.Context, repo TransitRepo) *planGraph {
	planGraphCache.mu.RLock()
	if planGraphCache.built {
		g := planGraphCache.g
		planGraphCache.mu.RUnlock()
		return g
	}
	planGraphCache.mu.RUnlock()

	planGraphCache.mu.Lock()
	defer planGraphCache.mu.Unlock()
	if planGraphCache.built {
		return planGraphCache.g
	}
	g, err := repo.GetPlanGraph(ctx)
	if err != nil {
		return nil
	}
	planGraphCache.g = g
	planGraphCache.built = true
	return g
}

// invalidatePlanGraph drops the cached graph so the next request rebuilds it.
// Called after PopulateTransfers so imports are reflected immediately.
func invalidatePlanGraph() {
	planGraphCache.mu.Lock()
	planGraphCache.built = false
	planGraphCache.g = nil
	planGraphCache.mu.Unlock()
}

type planStop struct {
	ID   string
	Name string
	Lat  float64
	Lon  float64
}

func (s planStop) toStop() Stop {
	return Stop{StopID: s.ID, StopName: s.Name, StopLat: s.Lat, StopLon: s.Lon}
}

type transferEdge struct {
	From  string
	To    string
	DistM int
}

// bfsNode is a BFS state: "board routeID at stopID".
type bfsNode struct {
	stopID   string
	routeID  string
	prev     *bfsNode
	prevLeg  *bfsLeg       // completed ride (nil when boarding at origin)
	prevEdge *transferEdge // transfer used to arrive here (nil when boarding at origin)
}

type bfsLeg struct {
	routeID string
	fromID  string
	toID    string
}

// journey is a planned path: rides + the transfers connecting them.
type journey struct {
	legs  []bfsLeg
	edges []journeyEdge // edges[i] connects legs[i] and legs[i+1]
}

type journeyEdge struct {
	fromID string
	toID   string
	distM  int
}

// findMultiTransferRoutes plans journeys with up to 2 transfers via BFS.
func findMultiTransferRoutes(ctx context.Context, repo TransitRepo, fromStop, toStop Stop) []RoutePlanRoute {
	if fromStop.StopID == toStop.StopID {
		return nil
	}
	g := cachedPlanGraph(ctx, repo)
	if g == nil {
		return nil
	}

	journeys := planBFS(g, fromStop.StopID, toStop.StopID)
	// ponytail: perf — BFS can emit hundreds of journeys that only differ by
	// board/alight stop. Dedupe by route sequence before materialising stops,
	// so buildPlanResults only builds a handful of RoutePlanRoutes.
	journeys = dedupeJourneys(g, journeys)
	if len(journeys) == 0 {
		return nil
	}
	return buildPlanResults(ctx, repo, g, journeys)
}

// planBFS performs the level-ordered BFS; returns journeys at the minimal
// transfer count found (≤ maxTransfers).
func planBFS(g *planGraph, fromID, toID string) []journey {
	visited := make(map[string]bool)
	mark := func(n *bfsNode) bool {
		key := n.stopID + "|" + n.routeID
		if visited[key] {
			return false
		}
		visited[key] = true
		return true
	}

	// Level 0: board each route serving the origin.
	var cur []*bfsNode
	for _, r := range g.routesByStop[fromID] {
		n := &bfsNode{stopID: fromID, routeID: r}
		if mark(n) {
			cur = append(cur, n)
		}
	}
	// Transfer-at-origin: walk from origin to a nearby stop, board there.
	for _, e := range g.transfers[fromID] {
		for _, r := range g.routesByStop[e.To] {
			n := &bfsNode{stopID: e.To, routeID: r, prevEdge: &e}
			if mark(n) {
				cur = append(cur, n)
			}
		}
	}

	var sol []journey
	states := 0
	for level := 0; level <= maxTransfers && len(sol) == 0; level++ {
		var next []*bfsNode
		// ponytail: perf — ride expansion depends only on routeID (the board
		// stop only changes the journey's from-stop, not the reachable stops),
		// so expand each route once per level instead of once per frontier node.
		// The level-1 frontier holds hundreds of (stop, route) nodes; deduping
		// by routeID cuts the ride/transfer expansions by roughly an order of
		// magnitude.
		expanded := make(map[string]bool, len(cur))
		for _, n := range cur {
			if expanded[n.routeID] {
				continue
			}
			expanded[n.routeID] = true
			states++
			if states > maxStates {
				return sol
			}
			// Ride: move along n.routeID to any other stop t.
			for _, t := range g.stopsByRoute[n.routeID] {
				if t.ID == toID {
					// Board-stop variants of the final ride: every frontier
					// node on this route can ride to the destination (skipping
					// the no-op board==destination case).
					for _, m := range cur {
						if m.routeID == n.routeID && m.stopID != t.ID {
							sol = append(sol, buildJourney(m, &bfsLeg{routeID: n.routeID, fromID: m.stopID, toID: t.ID}))
						}
					}
					continue
				}
				if t.ID == n.stopID {
					continue
				}
				if level >= maxTransfers {
					continue
				}
				// ponytail: perf — a stop is only worth alighting at if it has
				// transfer edges (or is the destination, handled above). Skipping
				// plain through-stops keeps the ride expansion tiny on long bus routes.
				if len(g.transfers[t.ID]) == 0 {
					continue
				}
				// Transfer at t to a stop on a different route.
				for _, e := range g.transfers[t.ID] {
					if e.To == toID {
						// Walk straight to the destination.
						j := buildJourney(n, &bfsLeg{routeID: n.routeID, fromID: n.stopID, toID: t.ID})
						j.edges = append(j.edges, journeyEdge{fromID: t.ID, toID: toID, distM: e.DistM})
						sol = append(sol, j)
						continue
					}
					for _, r2 := range g.routesByStop[e.To] {
						if r2 == n.routeID || routeInChain(n, r2) {
							continue
						}
						nn := &bfsNode{
							stopID: e.To, routeID: r2,
							prev: n,
							prevLeg:  &bfsLeg{routeID: n.routeID, fromID: n.stopID, toID: t.ID},
							prevEdge: &e,
						}
						if mark(nn) {
							next = append(next, nn)
						}
					}
				}
			}
		}
		cur = next
	}
	return sol
}

func routeInChain(n *bfsNode, routeID string) bool {
	for c := n; c != nil; c = c.prev {
		if c.routeID == routeID {
			return true
		}
	}
	return false
}

// buildJourney reconstructs legs/edges from a BFS chain plus the final ride.
func buildJourney(n *bfsNode, final *bfsLeg) journey {
	var j journey
	var chain []*bfsNode
	for c := n; c != nil; c = c.prev {
		chain = append(chain, c)
	}
	for i := len(chain) - 1; i >= 0; i-- {
		c := chain[i]
		if c.prevLeg != nil {
			j.legs = append(j.legs, *c.prevLeg)
		}
		if c.prevEdge != nil {
			j.edges = append(j.edges, journeyEdge{fromID: c.prevEdge.From, toID: c.prevEdge.To, distM: c.prevEdge.DistM})
		}
	}
	if final != nil {
		j.legs = append(j.legs, *final)
	}
	return j
}

// buildPlanResults converts journeys into API RoutePlanRoute objects.
func buildPlanResults(ctx context.Context, repo TransitRepo, g *planGraph, journeys []journey) []RoutePlanRoute {
	routes, err := repo.GetRoutes(ctx)
	if err != nil {
		return nil
	}
	routeMeta := make(map[string]Route)
	for _, r := range routes {
		routeMeta[r.RouteID] = r
	}

	type scored struct {
		j     journey
		route RoutePlanRoute
		total int // total stops across legs
		walk  int // total transfer distance
	}
	var scoredRoutes []scored

	for _, j := range journeys {
		rpr := RoutePlanRoute{}
		valid := true
		total, walk := 0, 0
		for _, leg := range j.legs {
			fromName, toName := g.stopLoc[leg.fromID].Name, g.stopLoc[leg.toID].Name
			stops := graphRouteStops(g, leg.routeID, leg.fromID, leg.toID)
			if stops == nil {
				// Stops not both on the representative trip (direction variant)
				// — rare; fall back to the DB for the correct ordering.
				stops = orderedRouteStops(ctx, repo, leg.routeID, fromName, toName)
			}
			if stops == nil {
				valid = false
				break
			}
			meta, ok := routeMeta[leg.routeID]
			if !ok {
				valid = false
				break
			}
			l := RouteLeg{
				RouteID:    leg.routeID,
				RouteName:  meta.RouteLongName,
				RouteColor: meta.RouteColor,
				FromStop:   g.stopLoc[leg.fromID].toStop(),
				ToStop:     g.stopLoc[leg.toID].toStop(),
				Stops:      stops,
			}
			if len(stops) > 0 {
				l.StopsBetween = len(stops) - 1
				total += l.StopsBetween
			}
			rpr.Legs = append(rpr.Legs, l)
		}
		if !valid || len(rpr.Legs) == 0 {
			continue
		}
		for _, e := range j.edges {
			walk += e.distM
			rpr.Transfers = append(rpr.Transfers, TransferPoint{
				FromStop:  g.stopLoc[e.fromID].toStop(),
				ToStop:    g.stopLoc[e.toID].toStop(),
				DistanceM: e.distM,
			})
		}
		if len(rpr.Transfers) > 0 {
			t := rpr.Transfers[0].FromStop
			rpr.TransferAt = &t
		}
		scoredRoutes = append(scoredRoutes, scored{j: j, route: rpr, total: total, walk: walk})
	}

	sort.Slice(scoredRoutes, func(i, k int) bool {
		if scoredRoutes[i].total != scoredRoutes[k].total {
			return scoredRoutes[i].total < scoredRoutes[k].total
		}
		if scoredRoutes[i].walk != scoredRoutes[k].walk {
			return scoredRoutes[i].walk < scoredRoutes[k].walk
		}
		return len(scoredRoutes[i].j.legs) < len(scoredRoutes[k].j.legs)
	})

	var results []RoutePlanRoute
	for _, s := range scoredRoutes {
		results = append(results, s.route)
		if len(results) >= maxPlanResults {
			break
		}
	}
	return results
}

// routeKey dedupes journeys with the same route sequence + transfer stops.
func routeKey(j journey) string {
	var b strings.Builder
	for _, l := range j.legs {
		b.WriteString(l.routeID)
		b.WriteString("|")
	}
	for _, e := range j.edges {
		b.WriteString(e.toID)
		b.WriteString(";")
	}
	return b.String()
}

// dedupeJourneys keeps the lowest-stop variant per routeKey, so
// buildPlanResults only materialises unique journeys instead of every BFS
// duplicate (same routes + transfer stops, different board/alight stops).
func dedupeJourneys(g *planGraph, journeys []journey) []journey {
	best := make(map[string]journey, len(journeys))
	bestStops := make(map[string]int, len(journeys))
	for _, j := range journeys {
		key := routeKey(j)
		n := journeyStopCount(g, j)
		if prev, ok := bestStops[key]; !ok || n < prev {
			best[key] = j
			bestStops[key] = n
		}
	}
	out := make([]journey, 0, len(best))
	for _, j := range best {
		out = append(out, j)
	}
	return out
}

// journeyStopCount totals the stops across all legs using the cached graph
// (no DB round-trip). Legs whose stops aren't on the representative trip get
// a large penalty so the materialisable variant of a routeKey wins.
func journeyStopCount(g *planGraph, j journey) int {
	total := 0
	for _, leg := range j.legs {
		fromIdx, toIdx := routeStopIdx(g, leg.routeID, leg.fromID, leg.toID)
		if fromIdx < 0 {
			total += 1_000_000
			continue
		}
		total += toIdx - fromIdx + 1
	}
	return total
}

// routeStopIdx returns the ordered indices of fromID/toID on a route's
// representative trip, swapping when the ride runs in reverse. Returns -1, -1
// when either stop is missing from the trip.
func routeStopIdx(g *planGraph, routeID, fromID, toID string) (int, int) {
	stops := g.stopsByRoute[routeID]
	fromIdx, toIdx := -1, -1
	for i, s := range stops {
		if s.ID == fromID && fromIdx == -1 {
			fromIdx = i
		}
		if s.ID == toID {
			toIdx = i
		}
	}
	if fromIdx == -1 || toIdx == -1 || fromIdx == toIdx {
		return -1, -1
	}
	if fromIdx > toIdx {
		fromIdx, toIdx = toIdx, fromIdx
	}
	return fromIdx, toIdx
}

// graphRouteStops returns the stop names between fromID and toID on a route
// using the cached graph's ordered stop list (no DB round-trip).
// Returns nil when both stops aren't on the representative trip, so the
// caller can fall back to a DB query for direction variants.
func graphRouteStops(g *planGraph, routeID, fromID, toID string) []string {
	stops := g.stopsByRoute[routeID]
	fromIdx, toIdx := routeStopIdx(g, routeID, fromID, toID)
	if fromIdx < 0 {
		return nil
	}
	names := make([]string, 0, toIdx-fromIdx+1)
	for i := fromIdx; i <= toIdx; i++ {
		names = append(names, stops[i].Name)
	}
	return names
}

// orderedRouteStops returns the stop names between fromName and toName on a
// route, trying both travel directions.
func orderedRouteStops(ctx context.Context, repo TransitRepo, routeID, fromName, toName string) []string {
	stops, _ := repo.GetRouteStops(ctx, routeID, fromName, toName)
	if stops == nil {
		stops, _ = repo.GetRouteStops(ctx, routeID, toName, fromName)
	}
	return stops
}
