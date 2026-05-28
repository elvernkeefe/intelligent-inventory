# AnyLogic Digital Twin (Simulation)

This project includes an AnyLogic-based digital twin that can be run via AnyLogic Cloud or locally via AnyLogic Desktop.

## Quick links

- AnyLogic Cloud model: https://cloud.anylogic.com/model/f0307b74-89c7-440d-b756-c5f7555dbab9
- Deployed backend (default): https://intelligent-inventory-97sd.onrender.com

## Model behavior (high level)

The AnyLogic model simulates warehouse inventory dynamics per store/category “lane” and interacts with the backend for:

- Initial parameters (e.g., current inventory, lead time, reorder point)
- Optional ML reorder recommendation calls
- Pulling a queue of jobs created from dashboard decisions
- Posting job completion back to the backend

The backend base URL is typically stored in a model variable (commonly `apiBaseUrl`) so you can switch between a deployed backend and a local backend.

## Integration API (high level)

The AnyLogic model interacts with the backend using these endpoints:

- Parameters
  - `GET /simulation/parameters/single?store=Store%20A&category=Electronics`
  - `POST /simulation/reorder-recommendation`

- Job queue
  - `POST /simulation/jobs/pull?limit=500` (AnyLogic pulls jobs)
  - `POST /simulation/jobs/{job_id}/processed` (AnyLogic posts completion)
  - `GET /simulation/jobs?status=draft&limit=500` (dashboard list)

## Notes
- Simulation results are reviewed in AnyLogic.
