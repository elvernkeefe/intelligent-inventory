"""
SQLAlchemy ORM models for inventory database
"""
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from backend.database import Base


class Store(Base):
    """Store master data"""
    __tablename__ = "stores"
    
    id = Column(Integer, primary_key=True, index=True)
    store_name = Column(String(50), unique=True, nullable=False, index=True)
    region = Column(String(50), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    inventory_records = relationship("InventoryHistory", back_populates="store")
    predictions = relationship("Prediction", back_populates="store")


class Product(Base):
    """Product category master data"""
    __tablename__ = "products"
    
    id = Column(Integer, primary_key=True, index=True)
    category_name = Column(String(50), unique=True, nullable=False, index=True)
    delivery_cycle_days = Column(Integer, default=3)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    inventory_records = relationship("InventoryHistory", back_populates="product")
    predictions = relationship("Prediction", back_populates="product")


class InventoryHistory(Base):
    """Historical inventory data (imported from inventory.csv)"""
    __tablename__ = "inventory_history"
    
    id = Column(Integer, primary_key=True, index=True)
    date = Column(DateTime, nullable=False, index=True)
    store_id = Column(Integer, ForeignKey("stores.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    
    # Inventory metrics
    inventory_quantity = Column(Float, nullable=False)
    units_ordered = Column(Float, default=0)
    units_sold = Column(Float, default=0)
    
    # Demand and pricing
    demand_forecast = Column(Float, default=0)
    price = Column(Float, default=0)
    discount = Column(Float, default=0)
    promotion = Column(Integer, default=0)
    competitor_pricing = Column(Float, default=0)
    
    # External factors
    weather = Column(String(20))
    month = Column(Integer)
    quarter = Column(Integer)
    week_of_year = Column(Integer)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    store = relationship("Store", back_populates="inventory_records")
    product = relationship("Product", back_populates="inventory_records")


class Prediction(Base):
    """ML model predictions with metadata"""
    __tablename__ = "predictions"
    
    id = Column(Integer, primary_key=True, index=True)
    store_id = Column(Integer, ForeignKey("stores.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    
    # Prediction results
    predicted_order_quantity = Column(Float, nullable=False)
    confidence_score = Column(Float)  # Based on model R²
    prediction_interval_lower = Column(Float)  # predicted - RMSE
    prediction_interval_upper = Column(Float)  # predicted + RMSE
    
    # Input snapshot (for reproducibility)
    current_inventory = Column(Float)
    input_features = Column(Text)  # JSON string of all input features
    
    # Metadata
    model_version = Column(String(50))
    prediction_date = Column(DateTime, default=datetime.utcnow, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    store = relationship("Store", back_populates="predictions")
    product = relationship("Product", back_populates="predictions")


class Order(Base):
    """Orders created from approved predictions"""
    __tablename__ = "orders"
    
    id = Column(Integer, primary_key=True, index=True)
    store_id = Column(Integer, ForeignKey("stores.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    quantity = Column(Integer, nullable=False)
    status = Column(String(20), default="pending")  # pending, delivered, cancelled
    order_date = Column(DateTime, default=datetime.utcnow, index=True)
    expected_delivery_date = Column(DateTime)
    actual_delivery_date = Column(DateTime, nullable=True)
    confirmed_by = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    store = relationship("Store")
    product = relationship("Product")


class InventoryTransaction(Base):
    """Track all inventory changes"""
    __tablename__ = "inventory_transactions"
    
    id = Column(Integer, primary_key=True, index=True)
    store_id = Column(Integer, ForeignKey("stores.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    transaction_type = Column(String(50))  # "order_received", "shipment_sent", "adjustment"
    quantity = Column(Integer)
    transaction_date = Column(DateTime, default=datetime.utcnow, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=True)
    confirmed_by = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    store = relationship("Store")
    product = relationship("Product")
    order = relationship("Order")


class Shipment(Base):
    """Outbound shipments from warehouse to stores"""
    __tablename__ = "shipments"
    
    id = Column(Integer, primary_key=True, index=True)
    store_id = Column(Integer, ForeignKey("stores.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    quantity = Column(Integer, nullable=False)
    status = Column(String(20), default="requested")  # requested, shipped, delivered
    
    # Request details
    request_date = Column(DateTime, default=datetime.utcnow, index=True)
    requested_by = Column(String(100), nullable=False)  # Store manager name
    needed_by_date = Column(DateTime, nullable=True)
    reason = Column(Text, nullable=True)
    
    # Shipment details
    ship_date = Column(DateTime, nullable=True)
    shipped_by = Column(String(100), nullable=True)  # Warehouse staff
    expected_delivery_date = Column(DateTime, nullable=True)
    
    # Delivery details
    delivery_date = Column(DateTime, nullable=True)
    received_by = Column(String(100), nullable=True)  # Store staff
    
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    store = relationship("Store")
    product = relationship("Product")


class SimulationJob(Base):
    """Simulation job queue for AnyLogic integration"""
    __tablename__ = "simulation_jobs"

    id = Column(Integer, primary_key=True, index=True)
    simulation_day = Column(Integer, nullable=False, index=True)
    job_type = Column(String(20), nullable=False)  # INBOUND, OUTBOUND
    store_name = Column(String(50), nullable=False, index=True)
    category_name = Column(String(50), nullable=False, index=True)
    lane_key = Column(String(120), nullable=False, index=True)
    quantity = Column(Integer, nullable=False)
    source = Column(String(30), nullable=False, default="manual")  # prediction, shipment, manual
    source_ref = Column(String(100), nullable=True, index=True)
    status = Column(String(20), nullable=False, default="draft", index=True)  # draft, queued, pulled, processed, cancelled
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    pulled_at = Column(DateTime, nullable=True)
    processed_at = Column(DateTime, nullable=True)
