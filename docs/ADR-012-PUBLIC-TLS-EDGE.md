# ADR-012 — Public TLS edge

**Status:** Approved for deployment planning; implement during deployment phase.

## Context

The frontend will be served from a public HTTPS origin. Browsers will block requests from an HTTPS page to a plain `http://...` API endpoint as mixed content. The deployed StockSync stack also needs all internal application services and data stores to remain private.

## Decision

Place a lightweight TLS-terminating reverse proxy/public edge in front of the API Gateway. Only the edge is publicly reachable. The edge forwards HTTPS requests to the private API Gateway over the deployment network.

Target shape:

```text
Internet / Browser
        | HTTPS
        v
Public TLS Edge
        | private network
        v
API Gateway
        |
        +--> Order / Saga / Inventory / Payment
        +--> Mongo / Postgres / Redis / Kafka
```

## Constraints

- No internal service/data-store port is publicly exposed.
- The gateway remains the application authentication boundary.
- TLS certificates and provider credentials are deployment secrets or managed by the selected free host.
- The exact proxy/host is selected during the deployment feasibility spike and verified against the current free-tier constraints.
