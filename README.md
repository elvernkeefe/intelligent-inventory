# Intelligent Inventory (ML + Dashboard + AnyLogic Digital Twin)

This project is an end-to-end “intelligent inventory” prototype that connects demand forecasting, operational workflows, and a digital twin:

- **FastAPI backend** provides ML-powered reorder predictions and operational APIs (orders/shipments/inventory).
- **Next.js dashboard** visualizes KPIs and supports workflow actions (approve predictions into orders, confirm deliveries, confirm shipments).
- **AnyLogic simulation** (digital twin) is a separate simulation artifact (AnyLogic Cloud/Desktop) that consumes “simulation jobs” from the backend to model inbound/outbound events and inventory dynamics. Simulation results are reviewed in AnyLogic (not embedded in the website).

In a typical flow:

1) The dashboard requests batch predictions.
2) A user approves a prediction to create an order (or requests a shipment).
3) The backend persists the operational event and optionally enqueues a simulation job.
4) AnyLogic pulls simulation jobs from the backend and runs the digital-twin scenario.

## Live Demo

- Deployed web app (Vercel): https://intelligent-inventory-psi.vercel.app
- AnyLogic model (AnyLogic Cloud): https://cloud.anylogic.com/model/f0307b74-89c7-440d-b756-c5f7555dbab9

## Repository Structure

- `inventory-model/` — Next.js frontend dashboard
- `backend/` — FastAPI backend + ML inference + database models

## Documentation

- Frontend guide: `inventory-model/README.md`
- Backend guide: `backend/README.md`
- AnyLogic guide: `anylogic/README.md`

## Run Locally

### 1) Backend (FastAPI)

**Prereqs:** Python 3.10+ and a PostgreSQL database.

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Configure the database connection via an env var (recommended: create a **root** `.env` file; it is ignored by git):

```bash
# from repo root
cat > .env <<'EOF'
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/inventory_db
# Optional (comma-separated):
# CORS_ORIGINS=http://localhost:3000
EOF
```

Run the API:

```bash
# from repo root
uvicorn backend.main:app --reload --port 8000
```

- API docs: http://localhost:8000/docs
- Health check: http://localhost:8000/health

### 2) Frontend (Next.js)

**Prereqs:** Node.js 18+.

```bash
cd inventory-model
npm install
```

Create `inventory-model/.env.local`:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
```

If you want the dashboard to use the deployed backend instead of a local backend, set:

```bash
NEXT_PUBLIC_API_URL=https://intelligent-inventory-97sd.onrender.com
```

Run the dashboard:

```bash
npm run dev
```

Open: http://localhost:3000

## AnyLogic Simulation Setup

### Run the model in AnyLogic Desktop (to use your local backend)

1. Install **AnyLogic Desktop** (PLE/University/Professional).
2. Open the AnyLogic model in AnyLogic Desktop.
3. Make sure the backend has started locally (default: `http://localhost:8000`).
4. In the AnyLogic model, set the API base URL variable (commonly `apiBaseUrl`) to your backend URL:
    - Set `apiBaseUrl` to `http://localhost:8000` for local development, or
    - Set `apiBaseUrl` to `https://intelligent-inventory-97sd.onrender.com` to use the deployed backend.
5. Run the simulation and review results directly in AnyLogic (3D animation + console output).

## Requirements / Dependencies

- Backend Python dependencies: `backend/requirements.txt`
- Frontend dependencies: `inventory-model/package.json` (lockfile: `inventory-model/package-lock.json`)
