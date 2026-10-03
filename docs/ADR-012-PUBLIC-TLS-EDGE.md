# ADR-012 — Public TLS edge

**Status:** Intent satisfied by the current deployment; the specific
project-managed reverse-proxy mechanism below was not implemented.

> **Historical note:** The original ADR below is retained as
> historical decision context. See "Current implementation /
> reconciliation" for the deployed approach.

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

## Current implementation / reconciliation

The current production deployment does **not** use a project-managed Nginx, Caddy, reverse proxy, or TLS-edge component as part of the StockSync stack.

- The frontend is hosted on Vercel.
- The public API Gateway is hosted on Render.
- The internet-facing HTTPS endpoint is provided by the Render platform edge as part of managed hosting.
- TLS for the public Render endpoint is therefore terminated by the Render platform edge.

This deployment satisfies the HTTPS/TLS intent of this ADR at the platform layer (Browser → Vercel frontend → Render platform edge → HTTPS → Render API Gateway → backend services) rather than through a reverse-proxy component deployed and operated as part of the StockSync stack.

The current deployment differs from the VM-oriented/project-managed mechanism originally proposed by this ADR. The original Decision and Target shape diagram above remain as historical decision context for how this intent was initially scoped.

This ADR remains useful as historical decision context even though the specific mechanism described in it was not implemented.
