Source spec: specs/SHOP-42/spec.md

# Implementation Plan: Saved carts

Tasks tracked in `specs/SHOP-42/tasks.json`. The Task List below is an ordered index of its IDs.

## Overview

The API gets a `carts` table and three endpoints first; the storefront switches to them once the
contract is fixed. The merge rules live in one Go function so both the endpoint and its tests use
them.

## Task List

- t1, t2 (api), then c1
- t3, t4 (web), after c1
- c2

## Task 1: Carts table and store

**Repo:** `api/`

- Migration `0042_carts.sql`: `carts(user_id pk, items jsonb, version int, updated_at timestamptz)`.
- `cart.Store` with `Get`, `Put(version)` returning `ErrStale`, and `DeleteOlderThan(days)`.
- Nightly job calls `DeleteOlderThan(90)`.

**Verify:** `go test ./cart/...`

## Task 2: Cart endpoints and merge

**Repo:** `api/`

- `GET /v1/cart`, `PUT /v1/cart` (`409` with the current cart on `ErrStale`), `POST /v1/cart/merge`.
- `cart.Merge(saved, guest, limits)`: same SKU adds up, capped at `max_per_order`; unknown SKUs dropped.

**Verify:** table tests for `Merge`; integration test for the `409` path.

## Checkpoint: API contract

`go test ./...` passes and `api/openapi.yaml` lists the three endpoints.

## Task 3: Cart client and sign-in merge

**Repo:** `web/`

- `useCart()` reads `localStorage` when signed out and the API when signed in.
- On sign-in, call `/v1/cart/merge` with the guest cart, then clear it; on a `409`, re-apply the change.

**Verify:** `npm test -- cart`

## Task 4: Cart badge

**Repo:** `web/`

- The badge shows the API's count, and rolls back when a write is rejected.

**Verify:** component test for the rollback.

## Checkpoint: Saved carts end to end

The Playwright sign-in merge test passes against a local API.
