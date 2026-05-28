# Inventory Intelligence Frontend (Next.js)

Next.js dashboard for the Intelligent Inventory system.

## What it does

- Shows an overview dashboard (KPIs, charts)
- Displays model predictions and supports approving predictions into orders
- Supports order delivery confirmation and shipment workflow
- Shows the simulation job queue in **Simulation List** (the simulation itself is not embedded)

## Backend APIs used by the UI

The frontend calls the backend via `inventory-model/lib/apiService.js`.

Key endpoints by screen/workflow:

- Overview / KPIs
	- `GET /health`
	- `GET /performance`
	- `GET /features/importance`

- Predictions
	- `POST /predict/batch`
	- `POST /api/orders/approve` (approve prediction into an order)
	- `POST /simulation/jobs` (optional: create a simulation job from a prediction)

- Orders
	- `GET /api/orders`
	- `POST /api/orders/{order_id}/confirm-delivery`

- Shipments
	- `GET /api/shipments`
	- `POST /api/shipments/request`
	- `POST /api/shipments/{shipment_id}/ship`

- Inventory / History
	- `GET /inventory/current`
	- `GET /api/inventory/transactions`

- Simulation List
	- `GET /simulation/jobs?status=...&limit=...`