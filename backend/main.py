"""
FastAPI Backend for Inventory Intelligence Dashboard
Serves ML predictions and inventory data to Next.js frontend
"""
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
import os

from backend.database import get_db, init_db
from backend.ml_model import predictor
from backend.feature_engineering import validate_input_data
from backend.data_helpers import prepare_prediction_features, get_latest_inventory_snapshot
from backend.models import InventoryHistory, Store, Product, Prediction, Order, InventoryTransaction, Shipment, SimulationJob

# Initialize FastAPI app
app = FastAPI(
    title="Inventory Intelligence API",
    description="ML-powered inventory ordering predictions for North Region",
    version="1.0.0"
)

# CORS middleware for frontend
# Configure with env var CORS_ORIGINS as comma-separated URLs in deployment.
cors_origins_env = os.getenv("CORS_ORIGINS", "")
if cors_origins_env.strip():
    cors_origins = [origin.strip() for origin in cors_origins_env.split(",") if origin.strip()]
else:
    cors_origins = ["http://localhost:3000", "http://localhost:3001"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Pydantic models for request/response validation
class PredictionRequest(BaseModel):
    """Single prediction request"""
    store: str = Field(..., example="Store A")
    category: str = Field(..., example="Electronics")
    current_inventory: float = Field(..., ge=0, example=450)
    demand_forecast: float = Field(..., ge=0, example=500)
    price: float = Field(..., gt=0, example=299.99)
    discount: float = Field(..., ge=0, le=100, example=10)
    promotion: int = Field(..., ge=0, le=1, example=1)
    competitor_pricing: float = Field(..., gt=0, example=289.99)
    weather: str = Field(..., example="Sunny")


class PredictionResponse(BaseModel):
    """Prediction result"""
    store: str
    category: str
    predicted_order_quantity: int
    confidence_score: float
    prediction_interval_lower: int
    prediction_interval_upper: int
    current_inventory: float
    model_version: str
    prediction_date: datetime


class OrderCreate(BaseModel):
    """Request to create an order from approved prediction"""
    store: str = Field(..., example="Store A")
    category: str = Field(..., example="Electronics")
    quantity: int = Field(..., gt=0, example=500)


class OrderConfirm(BaseModel):
    """Request to confirm order delivery"""
    confirmed_by: str = Field(..., example="John Doe")
    notes: Optional[str] = Field(None, example="Delivery received in good condition")


class OrderResponse(BaseModel):
    """Order information response"""
    id: int
    store: str
    category: str
    quantity: int
    status: str
    order_date: datetime
    expected_delivery_date: datetime
    actual_delivery_date: Optional[datetime]
    confirmed_by: Optional[str]
    notes: Optional[str]


class ShipmentRequest(BaseModel):
    """Request to create a shipment from store to warehouse"""
    store: str = Field(..., example="Store A")
    category: str = Field(..., example="Electronics")
    quantity: int = Field(..., gt=0, example=100)
    requested_by: str = Field(..., example="Jane Smith")
    needed_by_date: Optional[str] = Field(None, example="2026-03-15")
    reason: Optional[str] = Field(None, example="Running low on stock due to promotion")


class ShipmentConfirm(BaseModel):
    """Request to confirm shipment has been shipped"""
    shipped_by: str = Field(..., example="John Warehouse")
    notes: Optional[str] = Field(None, example="Shipped via truck #123")


class SimulationRecommendationRequest(BaseModel):
    """Request ML reorder recommendation for a specific store-category"""
    store: str = Field(..., example="Store A")
    category: str = Field(..., example="Electronics")
    current_inventory: Optional[float] = Field(None, ge=0, example=180)


class SimulationJobCreate(BaseModel):
    """Create one simulation job that AnyLogic can consume"""
    store: str = Field(..., example="Store A")
    category: str = Field(..., example="Electronics")
    job_type: str = Field(..., example="INBOUND")
    quantity: int = Field(..., gt=0, example=180)
    simulation_day: int = Field(1, ge=0, example=1)
    source: str = Field("manual", example="prediction")
    source_ref: Optional[str] = Field(None, example="shipment:12")
    notes: Optional[str] = Field(None, example="Added from dashboard")
    initial_status: str = Field("draft", example="draft")


class SimulationJobStatusUpdate(BaseModel):
    """Update simulation job status"""
    status: str = Field(..., example="processed")


class SimulationJobsReleaseRequest(BaseModel):
    """Release selected draft jobs into the AnyLogic queue"""
    job_ids: Optional[List[int]] = Field(None, example=[12, 13, 14])


class HealthResponse(BaseModel):
    """API health check response"""
    status: str
    model_loaded: bool
    model_version: Optional[str]
    model_performance: Optional[Dict[str, float]]
    timestamp: datetime


def _lane_key(store: str, category: str) -> str:
    code = store.replace("Store", "").strip()
    return f"{code}_{category.replace(' ', '_')}"


def _serialize_sim_job(job: SimulationJob) -> Dict[str, Any]:
    return {
        "id": job.id,
        "simulation_day": job.simulation_day,
        "job_type": job.job_type,
        "store": job.store_name,
        "category": job.category_name,
        "lane_key": job.lane_key,
        "quantity": job.quantity,
        "source": job.source,
        "source_ref": job.source_ref,
        "status": job.status,
        "notes": job.notes,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "pulled_at": job.pulled_at.isoformat() if job.pulled_at else None,
        "processed_at": job.processed_at.isoformat() if job.processed_at else None,
    }


class PerformanceResponse(BaseModel):
    """Model performance metrics"""
    model_type: str
    test_r2: float
    test_mae: float
    test_rmse: float
    overfitting_gap: float
    num_features: int
    training_date: str


# Startup event: Load ML model and initialize database
@app.on_event("startup")
async def startup_event():
    """Load model and initialize database on startup"""
    print("\n" + "="*70)
    print("🚀 STARTING INVENTORY INTELLIGENCE API")
    print("="*70)
    
    # Initialize database
    init_db()
    
    # Load ML model
    success = predictor.load_model()
    if not success:
        print("⚠️  Warning: Model failed to load. Predictions will not work.")
    
    print("="*70)
    print("✅ API is ready at http://localhost:8000")
    print("📖 Docs available at http://localhost:8000/docs")
    print("="*70 + "\n")


# ============================================================================
# API ENDPOINTS
# ============================================================================

@app.get("/", tags=["Health"])
async def root():
    """Root endpoint"""
    return {
        "message": "Inventory Intelligence API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health"
    }


@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check():
    """
    Check API and model health status
    """
    return HealthResponse(
        status="healthy" if predictor.is_loaded else "model_not_loaded",
        model_loaded=predictor.is_loaded,
        model_version=predictor.metadata.get('model_type') if predictor.is_loaded else None,
        model_performance={
            "r2": predictor.metadata.get('test_r2'),
            "mae": predictor.metadata.get('test_mae'),
            "rmse": predictor.metadata.get('test_rmse')
        } if predictor.is_loaded else None,
        timestamp=datetime.now()
    )


@app.get("/performance", response_model=PerformanceResponse, tags=["Model"])
async def get_model_performance():
    """
    Get detailed model performance metrics
    """
    if not predictor.is_loaded:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    return PerformanceResponse(
        model_type=predictor.metadata['model_type'],
        test_r2=predictor.metadata['test_r2'],
        test_mae=predictor.metadata['test_mae'],
        test_rmse=predictor.metadata['test_rmse'],
        overfitting_gap=predictor.metadata['overfitting_gap'],
        num_features=predictor.metadata['num_features'],
        training_date=predictor.metadata['training_date']
    )


@app.get("/features/importance", tags=["Model"])
async def get_feature_importance(top_n: int = 20):
    """
    Get top N most important features from the model
    """
    if not predictor.is_loaded:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    return {
        "feature_importance": predictor.get_feature_importance(top_n=top_n),
        "total_features": len(predictor.feature_names)
    }


@app.post("/predict", response_model=PredictionResponse, tags=["Predictions"])
async def predict_single(
    request: PredictionRequest,
    db: Session = Depends(get_db)
):
    """
    Make a single inventory order prediction
    
    This endpoint:
    1. Validates input data
    2. Fetches historical data for feature engineering
    3. Engineers features (lagged sales, rolling stats, etc.)
    4. Makes prediction using trained model
    5. Returns prediction with confidence intervals
    """
    if not predictor.is_loaded:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    # Validate input
    errors = validate_input_data(request.dict())
    if errors:
        raise HTTPException(status_code=400, detail={"errors": errors})
    
    try:
        # Fetch historical data and prepare features
        features_df = prepare_prediction_features(
            db=db,
            store_name=request.store,
            category_name=request.category,
            current_inventory=request.current_inventory,
            demand_forecast=request.demand_forecast,
            price=request.price,
            discount=request.discount,
            promotion=request.promotion,
            competitor_pricing=request.competitor_pricing,
            weather=request.weather
        )
        
        # Make prediction
        result = predictor.predict(features_df)
        
        return PredictionResponse(
            store=request.store,
            category=request.category,
            predicted_order_quantity=result['predicted_order_quantity'],
            confidence_score=result['confidence_score'],
            prediction_interval_lower=result['prediction_interval_lower'],
            prediction_interval_upper=result['prediction_interval_upper'],
            current_inventory=request.current_inventory,
            model_version=result['model_version'],
            prediction_date=datetime.now()
        )
        
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/predict/batch", tags=["Predictions"])
async def predict_batch(db: Session = Depends(get_db)):
    """
    Make predictions for all store-category combinations
    
    This generates predictions for:
    - 5 stores × 5 categories = 25 predictions
    
    Returns predictions sorted by risk level and confidence
    """
    if not predictor.is_loaded:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    try:
        from sqlalchemy import func

        # Get all stores and products
        stores = db.query(Store).all()
        products = db.query(Product).all()
        
        if not stores or not products:
            raise HTTPException(status_code=404, detail="No stores or products found")
        
        predictions = []
        
        # For each store-product combination, get the latest inventory record
        for store in stores:
            for product in products:
                # Get the latest inventory record for this specific combination
                latest_record = (
                    db.query(InventoryHistory)
                    .filter(
                        InventoryHistory.store_id == store.id,
                        InventoryHistory.product_id == product.id
                    )
                    .order_by(InventoryHistory.date.desc())
                    .first()
                )
                
                if not latest_record:
                    print(f"No inventory data for {store.store_name} - {product.category_name}")
                    continue
                
                try:
                    # Prepare features using historical data
                    features_df = prepare_prediction_features(
                        db=db,
                        store_name=store.store_name,
                        category_name=product.category_name,
                        current_inventory=latest_record.inventory_quantity,
                        demand_forecast=latest_record.demand_forecast,
                        price=latest_record.price,
                        discount=latest_record.discount,
                        promotion=latest_record.promotion,
                        competitor_pricing=latest_record.competitor_pricing,
                        weather=latest_record.weather
                    )
                    
                    # Make prediction
                    result = predictor.predict(features_df)

                    # Compute reorder point baseline for risk classification
                    avg_daily_sales = db.query(func.avg(InventoryHistory.units_sold)).filter(
                        InventoryHistory.store_id == store.id,
                        InventoryHistory.product_id == product.id
                    ).scalar()

                    reorder_point = float(avg_daily_sales or 0) * (product.delivery_cycle_days + 2)
                    current_inventory = float(latest_record.inventory_quantity)

                    if reorder_point > 0:
                        inventory_ratio = current_inventory / reorder_point
                        risk_level = "high" if inventory_ratio < 0.5 else "medium" if inventory_ratio < 0.8 else "low"
                    else:
                        # Fallback when reorder point cannot be estimated
                        risk_level = "high" if current_inventory < 100 else "medium" if current_inventory < 300 else "low"
                    
                    predictions.append({
                        "store": store.store_name,
                        "category": product.category_name,
                        "current_inventory": current_inventory,
                        "predicted_order": int(result['predicted_order_quantity']),
                        "confidence": float(result['confidence_score']),
                        "prediction_interval_lower": int(result['prediction_interval_lower']),
                        "prediction_interval_upper": int(result['prediction_interval_upper']),
                        "risk_level": risk_level,
                        "model_version": result['model_version']
                    })
                    
                except Exception as e:
                    print(f"Error predicting for {store.store_name} - {product.category_name}: {e}")
                    continue
        
        # Sort by risk level (high -> medium -> low)
        risk_priority = {"high": 1, "medium": 2, "low": 3}
        predictions.sort(key=lambda x: risk_priority.get(x['risk_level'], 4))
        
        return {
            "total": len(predictions),
            "prediction_date": datetime.utcnow().isoformat(),
            "predictions": predictions
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/inventory/current", tags=["Inventory"])
async def get_current_inventory(db: Session = Depends(get_db)):
    """
    Get current inventory snapshot for all stores and categories.
    Returns the most recent inventory levels from the database.
    """
    try:
        snapshot = get_latest_inventory_snapshot(db)
        
        # Get the latest date from database
        from sqlalchemy import func
        latest_date = db.query(func.max(InventoryHistory.date)).scalar()
        
        return {
            "snapshot_date": latest_date.isoformat() if latest_date else None,
            "total_combinations": len(snapshot),
            "inventory": snapshot.to_dict(orient='records')
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/stores", tags=["Master Data"])
async def get_stores(db: Session = Depends(get_db)):
    """Get list of all stores"""
    stores = db.query(Store).all()
    return {"stores": [{"id": s.id, "name": s.store_name, "region": s.region} for s in stores]}


@app.get("/products", tags=["Master Data"])
async def get_products(db: Session = Depends(get_db)):
    """Get list of all product categories"""
    products = db.query(Product).all()
    return {
        "products": [
            {"id": p.id, "category": p.category_name, "delivery_cycle": p.delivery_cycle_days}
            for p in products
        ]
    }


@app.get("/simulation/parameters", tags=["AnyLogic Integration"])
async def get_simulation_parameters(
    store: Optional[str] = None,
    category: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Get simulation parameters for AnyLogic integration.
    
    Returns historical averages and patterns needed for warehouse simulation:
    - Average daily sales
    - Sales variability (std deviation)
    - Delivery lead times
    - Current inventory levels
    - Demand forecast patterns
    
    Query params:
    - store: Filter by specific store (e.g., "Store A")
    - category: Filter by product category (e.g., "Electronics")
    """
    from sqlalchemy import func, and_
    import numpy as np
    
    # Build base query
    query = db.query(
        Store.store_name,
        Product.category_name,
        Product.delivery_cycle_days,
        func.avg(InventoryHistory.units_sold).label('avg_daily_sales'),
        func.stddev(InventoryHistory.units_sold).label('sales_std'),
        func.avg(InventoryHistory.inventory_quantity).label('avg_inventory'),
        func.avg(InventoryHistory.demand_forecast).label('avg_demand'),
        func.avg(InventoryHistory.price).label('avg_price'),
        func.max(InventoryHistory.date).label('latest_date')
    ).join(
        InventoryHistory, Store.id == InventoryHistory.store_id
    ).join(
        Product, Product.id == InventoryHistory.product_id
    )
    
    # Apply filters
    if store:
        query = query.filter(Store.store_name == store)
    if category:
        query = query.filter(Product.category_name == category)
    
    # Group by store and category
    results = query.group_by(
        Store.store_name, 
        Product.category_name,
        Product.delivery_cycle_days
    ).all()
    
    # Get latest inventory per store-category combination (not global latest date)
    latest_inventory = {}
    for row in results:
        latest_record = db.query(InventoryHistory).join(
            Store, InventoryHistory.store_id == Store.id
        ).join(
            Product, InventoryHistory.product_id == Product.id
        ).filter(
            Store.store_name == row.store_name,
            Product.category_name == row.category_name
        ).order_by(InventoryHistory.date.desc()).first()

        if latest_record:
            key = f"{row.store_name}_{row.category_name}"
            latest_inventory[key] = {
                'current_inventory': float(latest_record.inventory_quantity),
                'current_demand_forecast': float(latest_record.demand_forecast)
            }
    
    # Format results for AnyLogic
    parameters = []
    for row in results:
        key = f"{row.store_name}_{row.category_name}"
        current_inv = latest_inventory.get(key, {})
        
        parameters.append({
            'store': row.store_name,
            'category': row.category_name,
            'delivery_lead_time_days': row.delivery_cycle_days,
            'avg_daily_sales': round(float(row.avg_daily_sales or 0), 2),
            'sales_std_deviation': round(float(row.sales_std or 0), 2),
            'avg_inventory_level': round(float(row.avg_inventory or 0), 2),
            'avg_demand_forecast': round(float(row.avg_demand or 0), 2),
            'avg_price': round(float(row.avg_price or 0), 2),
            'current_inventory': current_inv.get('current_inventory', 0),
            'current_demand_forecast': current_inv.get('current_demand_forecast', 0),
            'latest_data_date': row.latest_date.isoformat() if row.latest_date else None,
            # Calculate reorder point (safety stock concept)
            'reorder_point': round(float(row.avg_daily_sales or 0) * (row.delivery_cycle_days + 2), 2)
        })
    
    return {
        'total_combinations': len(parameters),
        'parameters': parameters,
        'note': 'Use these parameters to initialize AnyLogic warehouse simulation'
    }


@app.get("/simulation/parameters/single", tags=["AnyLogic Integration"])
async def get_simulation_parameter_single(
    store: str,
    category: str,
    db: Session = Depends(get_db)
):
    """
    Get simulation parameters for one specific store-category pair.
    Useful for initializing one AnyLogic experiment quickly.
    """
    print(f"[ANYLOGIC] parameter request -> store={store}, category={category}")
    response = await get_simulation_parameters(store=store, category=category, db=db)
    params = response.get("parameters", [])

    if not params:
        raise HTTPException(
            status_code=404,
            detail=f"No simulation parameters found for store='{store}', category='{category}'"
        )

    print(f"[ANYLOGIC] parameter response -> current_inventory={params[0].get('current_inventory')}, reorder_point={params[0].get('reorder_point')}")

    return {
        "parameter": params[0],
        "note": "Single parameter payload for AnyLogic initialization"
    }


@app.post("/simulation/reorder-recommendation", tags=["AnyLogic Integration"])
async def get_simulation_reorder_recommendation(
    request: SimulationRecommendationRequest,
    db: Session = Depends(get_db)
):
    """
    Get ML reorder recommendation for one store-category pair.
    Intended for AnyLogic daily inventory check / reorder decision logic.
    """
    if not predictor.is_loaded:
        raise HTTPException(status_code=503, detail="Model not loaded")

    print(
        f"[ANYLOGIC] reorder request -> store={request.store}, "
        f"category={request.category}, current_inventory={request.current_inventory}"
    )

    # Validate entities
    store_obj = db.query(Store).filter(Store.store_name == request.store).first()
    if not store_obj:
        raise HTTPException(status_code=404, detail=f"Store '{request.store}' not found")

    product_obj = db.query(Product).filter(Product.category_name == request.category).first()
    if not product_obj:
        raise HTTPException(status_code=404, detail=f"Category '{request.category}' not found")

    # Get latest historical record for feature context
    latest_record = db.query(InventoryHistory).filter(
        InventoryHistory.store_id == store_obj.id,
        InventoryHistory.product_id == product_obj.id
    ).order_by(InventoryHistory.date.desc()).first()

    if not latest_record:
        raise HTTPException(
            status_code=404,
            detail=f"No historical inventory data for store='{request.store}', category='{request.category}'"
        )

    current_inventory = request.current_inventory if request.current_inventory is not None else float(latest_record.inventory_quantity)

    try:
        features_df = prepare_prediction_features(
            db=db,
            store_name=request.store,
            category_name=request.category,
            current_inventory=current_inventory,
            demand_forecast=float(latest_record.demand_forecast),
            price=float(latest_record.price),
            discount=float(latest_record.discount),
            promotion=int(latest_record.promotion),
            competitor_pricing=float(latest_record.competitor_pricing),
            weather=str(latest_record.weather or "Unknown")
        )

        prediction = predictor.predict(features_df)

        print(
            f"[ANYLOGIC] reorder response -> predicted_order={int(prediction['predicted_order_quantity'])}, "
            f"confidence={round(float(prediction['confidence_score']), 4)}, "
            f"model_version={prediction['model_version']}"
        )

        return {
            "store": request.store,
            "category": request.category,
            "current_inventory": round(float(current_inventory), 2),
            "predicted_order": int(prediction["predicted_order_quantity"]),
            "confidence": round(float(prediction["confidence_score"]), 4),
            "prediction_interval_lower": int(prediction["prediction_interval_lower"]),
            "prediction_interval_upper": int(prediction["prediction_interval_upper"]),
            "model_version": prediction["model_version"],
            "generated_at": datetime.utcnow().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate reorder recommendation: {str(e)}")


@app.post("/simulation/jobs", tags=["AnyLogic Integration"])
async def add_simulation_job(
    request: SimulationJobCreate,
    db: Session = Depends(get_db)
):
    """
    Add one simulation job from dashboard decisions.
    Predictions should typically add INBOUND jobs.
    Shipment requests should typically add OUTBOUND jobs.
    """
    try:
        job_type = request.job_type.upper().strip()
        if job_type not in {"INBOUND", "OUTBOUND"}:
            raise HTTPException(status_code=400, detail="job_type must be INBOUND or OUTBOUND")

        initial_status = request.initial_status.strip().lower()
        if initial_status not in {"draft", "queued"}:
            raise HTTPException(status_code=400, detail="initial_status must be draft or queued")

        store = db.query(Store).filter(Store.store_name == request.store).first()
        if not store:
            raise HTTPException(status_code=404, detail=f"Store '{request.store}' not found")

        product = db.query(Product).filter(Product.category_name == request.category).first()
        if not product:
            raise HTTPException(status_code=404, detail=f"Category '{request.category}' not found")

        if request.source_ref:
            existing = db.query(SimulationJob).filter(
                SimulationJob.source == request.source,
                SimulationJob.source_ref == request.source_ref,
                SimulationJob.job_type == job_type,
                # Block duplicates in the active manager list (draft/queued).
                SimulationJob.status.in_(["draft", "queued"])
            ).first()
            if existing:
                raise HTTPException(
                    status_code=409,
                    detail=f"Simulation job already exists for source_ref='{request.source_ref}'"
                )

        job = SimulationJob(
            simulation_day=request.simulation_day,
            job_type=job_type,
            store_name=request.store,
            category_name=request.category,
            lane_key=_lane_key(request.store, request.category),
            quantity=request.quantity,
            source=request.source,
            source_ref=request.source_ref,
            status=initial_status,
            notes=request.notes
        )

        db.add(job)
        db.commit()
        db.refresh(job)

        return {
            "success": True,
            "message": "Simulation job added",
            "job": _serialize_sim_job(job)
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to add simulation job: {str(e)}")


@app.get("/simulation/jobs", tags=["AnyLogic Integration"])
async def list_simulation_jobs(
    status: Optional[str] = None,
    limit: int = 500,
    db: Session = Depends(get_db)
):
    """List simulation jobs for UI and AnyLogic polling."""
    query = db.query(SimulationJob)

    if status:
        query = query.filter(SimulationJob.status == status)

    jobs = query.order_by(SimulationJob.simulation_day.asc(), SimulationJob.id.asc()).limit(max(1, min(limit, 5000))).all()

    return {
        "total": len(jobs),
        "jobs": [_serialize_sim_job(job) for job in jobs]
    }


@app.post("/simulation/jobs/pull", tags=["AnyLogic Integration"])
async def pull_simulation_jobs(
    limit: int = 200,
    db: Session = Depends(get_db)
):
    """
    Pull queued jobs for AnyLogic and mark them as pulled.
    This prevents duplicate consumption on repeated polling.
    """
    try:
        jobs = db.query(SimulationJob).filter(
            SimulationJob.status == "queued"
        ).order_by(
            SimulationJob.simulation_day.asc(), SimulationJob.id.asc()
        ).limit(max(1, min(limit, 1000))).all()

        now = datetime.utcnow()
        for job in jobs:
            job.status = "pulled"
            job.pulled_at = now

        db.commit()

        return {
            "total": len(jobs),
            "jobs": [_serialize_sim_job(job) for job in jobs]
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to pull simulation jobs: {str(e)}")


@app.post("/simulation/jobs/release", tags=["AnyLogic Integration"])
async def release_simulation_jobs(
    request: SimulationJobsReleaseRequest,
    db: Session = Depends(get_db)
):
    """
    Release draft jobs to queued so AnyLogic can pull them.
    If job_ids is omitted, all draft jobs are released.
    """
    try:
        query = db.query(SimulationJob).filter(SimulationJob.status == "draft")
        if request.job_ids:
            query = query.filter(SimulationJob.id.in_(request.job_ids))

        jobs = query.order_by(SimulationJob.simulation_day.asc(), SimulationJob.id.asc()).all()

        updated_ids: List[int] = []
        for job in jobs:
            job.status = "queued"
            updated_ids.append(job.id)

        db.commit()

        return {
            "success": True,
            "released": len(updated_ids),
            "released_job_ids": updated_ids,
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to release simulation jobs: {str(e)}")


@app.patch("/simulation/jobs/{job_id}/status", tags=["AnyLogic Integration"])
async def update_simulation_job_status(
    job_id: int,
    request: SimulationJobStatusUpdate,
    db: Session = Depends(get_db)
):
    """Update one simulation job status, e.g. processed/cancelled."""
    valid_status = {"draft", "queued", "pulled", "processed", "cancelled"}
    status = request.status.strip().lower()

    if status not in valid_status:
        raise HTTPException(status_code=400, detail=f"status must be one of {sorted(valid_status)}")

    job = db.query(SimulationJob).filter(SimulationJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail=f"Simulation job {job_id} not found")

    job.status = status
    if status == "queued":
        job.pulled_at = None
        job.processed_at = None
    if status == "processed" and not job.processed_at:
        job.processed_at = datetime.utcnow()

    db.commit()
    db.refresh(job)

    return {
        "success": True,
        "message": "Simulation job updated",
        "job": _serialize_sim_job(job)
    }


@app.post("/simulation/jobs/{job_id}/processed", tags=["AnyLogic Integration"])
async def mark_simulation_job_processed(
    job_id: int,
    db: Session = Depends(get_db)
):
    """Mark one simulation job as processed (AnyLogic-friendly endpoint)."""
    job = db.query(SimulationJob).filter(SimulationJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail=f"Simulation job {job_id} not found")

    job.status = "processed"
    if not job.processed_at:
        job.processed_at = datetime.utcnow()

    db.commit()
    db.refresh(job)

    return {
        "success": True,
        "message": "Simulation job marked processed",
        "job": _serialize_sim_job(job)
    }


# ============================================================================
# ORDER MANAGEMENT ENDPOINTS
# ============================================================================

@app.post("/api/orders/approve", tags=["Orders"])
async def approve_order(order_data: OrderCreate, db: Session = Depends(get_db)):
    """
    Create an order from an approved ML prediction
    """
    try:
        # Get store and product IDs
        store = db.query(Store).filter(Store.store_name == order_data.store).first()
        if not store:
            raise HTTPException(status_code=404, detail=f"Store '{order_data.store}' not found")
        
        product = db.query(Product).filter(Product.category_name == order_data.category).first()
        if not product:
            raise HTTPException(status_code=404, detail=f"Category '{order_data.category}' not found")
        
        # Create order
        new_order = Order(
            store_id=store.id,
            product_id=product.id,
            quantity=order_data.quantity,
            status="pending",
            order_date=datetime.utcnow(),
            expected_delivery_date=datetime.utcnow() + timedelta(days=product.delivery_cycle_days)
        )
        
        db.add(new_order)
        db.commit()
        db.refresh(new_order)
        
        return {
            "message": "Order approved and created successfully",
            "order_id": new_order.id,
            "store": order_data.store,
            "category": order_data.category,
            "quantity": order_data.quantity,
            "status": "pending",
            "expected_delivery": new_order.expected_delivery_date.isoformat()
        }
    
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create order: {str(e)}")


@app.get("/api/orders", tags=["Orders"])
async def get_orders(status: Optional[str] = None, db: Session = Depends(get_db)):
    """
    Get all orders, optionally filtered by status
    """
    try:
        query = db.query(
            Order,
            Store.store_name,
            Product.category_name
        ).join(Store, Order.store_id == Store.id).join(Product, Order.product_id == Product.id)
        
        if status:
            query = query.filter(Order.status == status)
        
        orders = query.order_by(Order.order_date.desc()).all()
        
        order_list = []
        for order, store_name, category_name in orders:
            order_list.append({
                "id": order.id,
                "store": store_name,
                "category": category_name,
                "quantity": order.quantity,
                "status": order.status,
                "order_date": order.order_date.isoformat(),
                "expected_delivery_date": order.expected_delivery_date.isoformat(),
                "actual_delivery_date": order.actual_delivery_date.isoformat() if order.actual_delivery_date else None,
                "confirmed_by": order.confirmed_by,
                "notes": order.notes
            })
        
        return {
            "total": len(order_list),
            "orders": order_list
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch orders: {str(e)}")


@app.post("/api/orders/{order_id}/confirm-delivery", tags=["Orders"])
async def confirm_delivery(
    order_id: int, 
    confirm_data: OrderConfirm, 
    db: Session = Depends(get_db)
):
    """
    Confirm order delivery and update inventory
    """
    try:
        # Get order
        order = db.query(Order).filter(Order.id == order_id).first()
        if not order:
            raise HTTPException(status_code=404, detail=f"Order {order_id} not found")
        
        if order.status != "pending":
            raise HTTPException(status_code=400, detail=f"Order {order_id} is already {order.status}")
        
        # Get store and product info
        store = db.query(Store).filter(Store.id == order.store_id).first()
        product = db.query(Product).filter(Product.id == order.product_id).first()
        
        # Update order status
        order.status = "delivered"
        order.actual_delivery_date = datetime.utcnow()
        order.confirmed_by = confirm_data.confirmed_by
        order.notes = confirm_data.notes
        
        # Create inventory transaction
        transaction = InventoryTransaction(
            store_id=order.store_id,
            product_id=order.product_id,
            transaction_type="order_received",
            quantity=order.quantity,
            transaction_date=datetime.utcnow(),
            order_id=order.id,
            confirmed_by=confirm_data.confirmed_by,
            notes=confirm_data.notes
        )
        db.add(transaction)
        
        # Get latest inventory
        latest_inventory = db.query(InventoryHistory).filter(
            InventoryHistory.store_id == order.store_id,
            InventoryHistory.product_id == order.product_id
        ).order_by(InventoryHistory.date.desc()).first()
        
        # Update inventory (create new record)
        if latest_inventory:
            new_inventory_quantity = latest_inventory.inventory_quantity + order.quantity
            
            # Calculate week of year
            current_date = datetime.utcnow()
            week_of_year = current_date.isocalendar()[1]
            
            new_inventory_record = InventoryHistory(
                store_id=order.store_id,
                product_id=order.product_id,
                date=current_date.date(),
                inventory_quantity=new_inventory_quantity,
                units_ordered=0,  # No units ordered today (yet)
                units_sold=latest_inventory.units_sold,  # Keep same daily sales rate
                demand_forecast=latest_inventory.demand_forecast,
                price=latest_inventory.price,
                discount=latest_inventory.discount,
                promotion=latest_inventory.promotion,
                competitor_pricing=latest_inventory.competitor_pricing,
                weather=latest_inventory.weather,
                month=current_date.month,
                quarter=(current_date.month - 1) // 3 + 1,
                week_of_year=week_of_year
            )
            db.add(new_inventory_record)
        
        db.commit()
        
        return {
            "message": "Delivery confirmed successfully",
            "order_id": order.id,
            "store": store.store_name,
            "category": product.category_name,
            "quantity": order.quantity,
            "status": "delivered",
            "actual_delivery_date": order.actual_delivery_date.isoformat(),
            "new_inventory": new_inventory_quantity if latest_inventory else order.quantity,
            "confirmed_by": confirm_data.confirmed_by
        }
    
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to confirm delivery: {str(e)}")


@app.get("/api/inventory/transactions", tags=["Inventory"])
async def get_transactions(
    store: Optional[str] = None,
    category: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Get inventory transaction history
    """
    try:
        query = db.query(
            InventoryTransaction,
            Store.store_name,
            Product.category_name
        ).join(Store, InventoryTransaction.store_id == Store.id).join(
            Product, InventoryTransaction.product_id == Product.id
        )
        
        if store:
            query = query.filter(Store.store_name == store)
        if category:
            query = query.filter(Product.category_name == category)
        
        transactions = query.order_by(InventoryTransaction.transaction_date.desc()).limit(100).all()
        
        transaction_list = []
        for trans, store_name, category_name in transactions:
            transaction_list.append({
                "id": trans.id,
                "store": store_name,
                "category": category_name,
                "transaction_type": trans.transaction_type,
                "quantity": trans.quantity,
                "transaction_date": trans.transaction_date.isoformat(),
                "order_id": trans.order_id,
                "confirmed_by": trans.confirmed_by,
                "notes": trans.notes
            })
        
        return {
            "total": len(transaction_list),
            "transactions": transaction_list
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch transactions: {str(e)}")


# ============================================================================
# SHIPMENT MANAGEMENT ENDPOINTS (Warehouse → Store)
# ============================================================================

@app.post("/api/shipments/request", tags=["Shipments"])
async def request_shipment(shipment_data: ShipmentRequest, db: Session = Depends(get_db)):
    """
    Create a shipment request from store (store requests products from warehouse)
    """
    try:
        # Get store and product IDs
        store = db.query(Store).filter(Store.store_name == shipment_data.store).first()
        if not store:
            raise HTTPException(status_code=404, detail=f"Store '{shipment_data.store}' not found")
        
        product = db.query(Product).filter(Product.category_name == shipment_data.category).first()
        if not product:
            raise HTTPException(status_code=404, detail=f"Category '{shipment_data.category}' not found")
        
        # Check warehouse inventory
        latest_inventory = db.query(InventoryHistory).filter(
            InventoryHistory.store_id == store.id,
            InventoryHistory.product_id == product.id
        ).order_by(InventoryHistory.date.desc()).first()
        
        current_warehouse_stock = latest_inventory.inventory_quantity if latest_inventory else 0
        
        if current_warehouse_stock < shipment_data.quantity:
            return {
                "success": False,
                "message": f"Insufficient warehouse stock. Available: {current_warehouse_stock} units, Requested: {shipment_data.quantity} units",
                "available_stock": current_warehouse_stock
            }
        
        # Parse needed_by_date if provided
        needed_by = None
        if shipment_data.needed_by_date:
            from dateutil import parser
            needed_by = parser.parse(shipment_data.needed_by_date)
        
        # Create shipment request
        new_shipment = Shipment(
            store_id=store.id,
            product_id=product.id,
            quantity=shipment_data.quantity,
            status="requested",
            request_date=datetime.utcnow(),
            requested_by=shipment_data.requested_by,
            needed_by_date=needed_by,
            reason=shipment_data.reason
        )
        
        db.add(new_shipment)
        db.commit()
        db.refresh(new_shipment)
        
        return {
            "success": True,
            "message": "Shipment request created successfully",
            "shipment_id": new_shipment.id,
            "store": shipment_data.store,
            "category": shipment_data.category,
            "quantity": shipment_data.quantity,
            "status": "requested",
            "available_warehouse_stock": current_warehouse_stock
        }
    
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create shipment request: {str(e)}")


@app.get("/api/shipments", tags=["Shipments"])
async def get_shipments(status: Optional[str] = None, db: Session = Depends(get_db)):
    """
    Get all shipments, optionally filtered by status
    """
    try:
        query = db.query(
            Shipment,
            Store.store_name,
            Product.category_name
        ).join(Store, Shipment.store_id == Store.id).join(Product, Shipment.product_id == Product.id)
        
        if status:
            query = query.filter(Shipment.status == status)
        
        shipments = query.order_by(Shipment.request_date.desc()).all()
        
        shipment_list = []
        for shipment, store_name, category_name in shipments:
            shipment_list.append({
                "id": shipment.id,
                "store": store_name,
                "category": category_name,
                "quantity": shipment.quantity,
                "status": shipment.status,
                "request_date": shipment.request_date.isoformat(),
                "requested_by": shipment.requested_by,
                "needed_by_date": shipment.needed_by_date.isoformat() if shipment.needed_by_date else None,
                "reason": shipment.reason,
                "ship_date": shipment.ship_date.isoformat() if shipment.ship_date else None,
                "shipped_by": shipment.shipped_by,
                "expected_delivery_date": shipment.expected_delivery_date.isoformat() if shipment.expected_delivery_date else None,
                "delivery_date": shipment.delivery_date.isoformat() if shipment.delivery_date else None,
                "received_by": shipment.received_by,
                "notes": shipment.notes
            })
        
        return {
            "total": len(shipment_list),
            "shipments": shipment_list
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch shipments: {str(e)}")


@app.post("/api/shipments/{shipment_id}/ship", tags=["Shipments"])
async def confirm_shipment(
    shipment_id: int,
    confirm_data: ShipmentConfirm,
    db: Session = Depends(get_db)
):
    """
    Confirm shipment has been shipped from warehouse (deducts inventory)
    """
    try:
        # Get shipment
        shipment = db.query(Shipment).filter(Shipment.id == shipment_id).first()
        if not shipment:
            raise HTTPException(status_code=404, detail=f"Shipment {shipment_id} not found")
        
        if shipment.status != "requested":
            raise HTTPException(status_code=400, detail=f"Shipment {shipment_id} is already {shipment.status}")
        
        # Get store and product info
        store = db.query(Store).filter(Store.id == shipment.store_id).first()
        product = db.query(Product).filter(Product.id == shipment.product_id).first()
        
        # Get latest warehouse inventory
        latest_inventory = db.query(InventoryHistory).filter(
            InventoryHistory.store_id == shipment.store_id,
            InventoryHistory.product_id == shipment.product_id
        ).order_by(InventoryHistory.date.desc()).first()
        
        if not latest_inventory:
            raise HTTPException(status_code=404, detail="No inventory record found")
        
        # Check if sufficient stock
        if latest_inventory.inventory_quantity < shipment.quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient warehouse stock. Available: {latest_inventory.inventory_quantity}, Requested: {shipment.quantity}"
            )
        
        # Update shipment status
        shipment.status = "shipped"
        shipment.ship_date = datetime.utcnow()
        shipment.shipped_by = confirm_data.shipped_by
        shipment.expected_delivery_date = datetime.utcnow() + timedelta(days=product.delivery_cycle_days)
        shipment.notes = confirm_data.notes
        
        # Create inventory transaction
        transaction = InventoryTransaction(
            store_id=shipment.store_id,
            product_id=shipment.product_id,
            transaction_type="shipment_sent",
            quantity=-shipment.quantity,  # Negative for outbound
            transaction_date=datetime.utcnow(),
            confirmed_by=confirm_data.shipped_by,
            notes=f"Shipment #{shipment.id} to {store.store_name}"
        )
        db.add(transaction)
        
        # Deduct from warehouse inventory
        new_inventory_quantity = latest_inventory.inventory_quantity - shipment.quantity
        
        # Calculate week of year
        current_date = datetime.utcnow()
        week_of_year = current_date.isocalendar()[1]
        
        new_inventory_record = InventoryHistory(
            store_id=shipment.store_id,
            product_id=shipment.product_id,
            date=current_date.date(),
            inventory_quantity=new_inventory_quantity,
            units_ordered=latest_inventory.units_ordered,
            units_sold=latest_inventory.units_sold,
            demand_forecast=latest_inventory.demand_forecast,
            price=latest_inventory.price,
            discount=latest_inventory.discount,
            promotion=latest_inventory.promotion,
            competitor_pricing=latest_inventory.competitor_pricing,
            weather=latest_inventory.weather,
            month=current_date.month,
            quarter=(current_date.month - 1) // 3 + 1,
            week_of_year=week_of_year
        )
        db.add(new_inventory_record)
        
        db.commit()
        
        return {
            "message": "Shipment confirmed successfully",
            "shipment_id": shipment.id,
            "store": store.store_name,
            "category": product.category_name,
            "quantity": shipment.quantity,
            "status": "shipped",
            "ship_date": shipment.ship_date.isoformat(),
            "expected_delivery": shipment.expected_delivery_date.isoformat(),
            "new_warehouse_inventory": new_inventory_quantity,
            "shipped_by": confirm_data.shipped_by
        }
    
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to confirm shipment: {str(e)}")


# ============================================================================
# RUN SERVER
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,  # Auto-reload on code changes
        log_level="info"
    )
