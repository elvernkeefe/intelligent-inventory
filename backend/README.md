# Inventory Intelligence Backend (FastAPI)

This backend exposes REST APIs used by the Next.js dashboard and the AnyLogic digital twin.

## Core responsibilities

- Load the trained ML artifacts and serve reorder predictions.
- Persist operational state to PostgreSQL (inventory history, transactions, orders, shipments, simulation jobs).
- Provide “workflow” endpoints so the UI can approve predictions and confirm real-world events.
- Provide a simulation job queue and parameter endpoints for AnyLogic.

## API reference (by feature)

All routes below are defined in `backend/main.py`.

### Health & model metadata

- `GET /` — basic service info.
- `GET /health` — backend + model loaded status.
- `GET /performance` — model metrics from stored metadata.
- `GET /features/importance?top_n=20` — top-N feature importance for the trained model.

### Predictions

- `POST /predict` — predicts reorder quantity for a single store/category request.
- `POST /predict/batch` — generates predictions for all store/category combinations.

### Inventory and master data

- `GET /inventory/current` — latest inventory snapshot (per store/category).
- `GET /api/inventory/transactions` — transaction ledger (filters supported via query params).
- `GET /stores` — list of stores.
- `GET /products` — list of categories/products.

### Orders workflow (prediction → order)

- `POST /api/orders/approve` — creates an order from an approved prediction.
- `GET /api/orders` — lists orders (supports optional filtering).
- `POST /api/orders/{order_id}/confirm-delivery` — marks an order delivered and updates inventory via transactions/history.

### Shipments workflow (store request → outbound shipment)

- `POST /api/shipments/request` — creates a shipment request.
- `GET /api/shipments` — lists shipments.
- `POST /api/shipments/{shipment_id}/ship` — marks a shipment as shipped and updates inventory via transactions/history.

### AnyLogic: parameters + simulation job queue

Parameter endpoints (used to initialize or update simulation state):

- `GET /simulation/parameters` — bulk parameters.
- `GET /simulation/parameters/single?store=...&category=...` — one store/category lane.
- `POST /simulation/reorder-recommendation` — returns an ML reorder recommendation for a given store/category/inventory.

Job queue endpoints (used for “offline” simulation execution):

- `POST /simulation/jobs` — create a simulation job (e.g., INBOUND/OUTBOUND) from dashboard decisions.
- `GET /simulation/jobs?status=...&limit=...` — list jobs (dashboard uses this for Simulation List).
- `POST /simulation/jobs/pull?limit=...` — AnyLogic pulls a batch of queued jobs to execute.
- `POST /simulation/jobs/{job_id}/processed` — AnyLogic reports completion (and can attach summary fields if your model supports it).
- `POST /simulation/jobs/release` — moves selected draft jobs into the executable queue.
