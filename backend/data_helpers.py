"""
Helper functions to query database and prepare data for predictions
"""
import pandas as pd
from sqlalchemy.orm import Session
from sqlalchemy import and_
from backend.models import Store, Product, InventoryHistory
from backend.feature_engineering import engineer_features
from datetime import datetime, timedelta


def get_historical_data(
    db: Session,
    store_name: str,
    category_name: str,
    weeks_back: int = 8
) -> pd.DataFrame:
    """
    Fetch historical data for a store-category combination.
    Returns last N weeks of data needed for feature engineering.
    
    Args:
        db: Database session
        store_name: Store name (e.g., "Store A")
        category_name: Product category (e.g., "Electronics")
        weeks_back: Number of weeks to fetch (default 8 for 4-week rolling stats)
    
    Returns:
        DataFrame with historical data
    """
    # Get store and product IDs
    store = db.query(Store).filter_by(store_name=store_name).first()
    product = db.query(Product).filter_by(category_name=category_name).first()
    
    if not store or not product:
        raise ValueError(f"Store '{store_name}' or Category '{category_name}' not found in database")
    
    # Get the latest date in the database for this store-category combination
    from sqlalchemy import func
    latest_date = db.query(func.max(InventoryHistory.date)).filter(
        and_(
            InventoryHistory.store_id == store.id,
            InventoryHistory.product_id == product.id
        )
    ).scalar()
    
    if not latest_date:
        raise ValueError(f"No data found for {store_name} - {category_name}")
    
    # Calculate cutoff date (N weeks before the latest date)
    cutoff_date = latest_date - timedelta(weeks=weeks_back)
    
    # Query historical records
    records = (
        db.query(InventoryHistory)
        .filter(
            and_(
                InventoryHistory.store_id == store.id,
                InventoryHistory.product_id == product.id,
                InventoryHistory.date >= cutoff_date
            )
        )
        .order_by(InventoryHistory.date.asc())
        .all()
    )
    
    if not records:
        raise ValueError(f"No historical data found for {store_name} - {category_name}")
    
    # Convert to DataFrame
    data = []
    for record in records:
        data.append({
            'Date': record.date,
            'Store': store_name,
            'product_category': category_name,
            'Sold': record.units_sold,
            'InventoryQuant': record.inventory_quantity,
            'Demand Forecast': record.demand_forecast,
            'Price': record.price,
            'Discount': record.discount,
            'Promotion': record.promotion,
            'Competitor Pricing': record.competitor_pricing,
            'Weather': record.weather,
            'Month': record.month,
            'Quarter': record.quarter,
            'Week_of_Year': record.week_of_year
        })
    
    df = pd.DataFrame(data)
    
    # Ensure Date is datetime type
    df['Date'] = pd.to_datetime(df['Date'])
    
    # WEEKLY AGGREGATION (matching notebook preprocessing)
    # Group by week, store, and category
    df_weekly = (
        df
        .groupby([pd.Grouper(key='Date', freq='W'), 'Store', 'product_category'])
        .agg({
            'Sold': 'sum',  # Sum of units sold in the week
            'InventoryQuant': 'mean',  # Average inventory level
            'Demand Forecast': 'sum',  # Total demand forecast
            'Price': 'mean',  # Average price
            'Discount': 'mean',  # Average discount
            'Promotion': 'max',  # 1 if any promotion during week
            'Competitor Pricing': 'mean',  # Average competitor price
            'Weather': lambda x: x.mode()[0] if len(x.mode()) > 0 else x.iloc[0],  # Most common weather
            'Month': 'first',  # Take first month in the week
            'Quarter': 'first',  # Take first quarter in the week
            'Week_of_Year': 'first'  # Take first week number
        })
        .reset_index()
    )
    
    # Update time features based on aggregated date (in case week spans months)
    df_weekly['Month'] = df_weekly['Date'].dt.month
    df_weekly['Quarter'] = df_weekly['Date'].dt.quarter
    df_weekly['Week_of_Year'] = df_weekly['Date'].dt.isocalendar().week
    
    return df_weekly


def get_latest_inventory_snapshot(db: Session) -> pd.DataFrame:
    """
    Get the most recent inventory snapshot for all store-category combinations.
    This represents "today's" inventory levels.
    
    Returns:
        DataFrame with current inventory for all combinations
    """
    from sqlalchemy import func
    
    # Get the most recent date in the database
    latest_date = db.query(func.max(InventoryHistory.date)).scalar()
    
    if not latest_date:
        raise ValueError("No inventory data found in database")
    
    # Get all records from that date
    records = (
        db.query(InventoryHistory, Store, Product)
        .join(Store, InventoryHistory.store_id == Store.id)
        .join(Product, InventoryHistory.product_id == Product.id)
        .filter(InventoryHistory.date == latest_date)
        .all()
    )
    
    data = []
    for record, store, product in records:
        data.append({
            'Store': store.store_name,
            'Category': product.category_name,
            'Current_Stock': record.inventory_quantity,
            'Price': record.price,
            'Discount': record.discount,
            'Promotion': record.promotion,
            'Competitor_Pricing': record.competitor_pricing,
            'Weather': record.weather,
            'Demand_Forecast': record.demand_forecast
        })
    
    return pd.DataFrame(data)


def prepare_prediction_features(
    db: Session,
    store_name: str,
    category_name: str,
    current_inventory: float,
    demand_forecast: float,
    price: float,
    discount: float,
    promotion: int,
    competitor_pricing: float,
    weather: str
) -> pd.DataFrame:
    """
    Prepare features for prediction by:
    1. Fetching historical data
    2. Adding current record
    3. Engineering features
    4. Returning only the last row (current prediction)
    
    Returns:
        DataFrame with engineered features ready for model prediction
    """
    # Get historical data (last 8 weeks for rolling stats)
    historical_df = get_historical_data(db, store_name, category_name, weeks_back=8)
    
    # Create current record based on the latest date in historical data + 1 week
    latest_historical_date = historical_df['Date'].max()
    prediction_date = latest_historical_date + timedelta(weeks=1)
    
    # Map store names back to codes for model compatibility
    # The model was trained with S001-S005, but database has Store A-E
    store_name_to_code = {
        'Store A': 'S001',
        'Store B': 'S002',
        'Store C': 'S003',
        'Store D': 'S004',
        'Store E': 'S005'
    }
    store_code = store_name_to_code.get(store_name, store_name)
    
    # Also map historical data store names to codes
    historical_df['Store'] = historical_df['Store'].map(store_name_to_code)
    
    current_record = pd.DataFrame([{
        'Date': prediction_date,
        'Store': store_code,  # Use original code for model
        'product_category': category_name,
        'Sold': 0,  # Placeholder for feature engineering (will use historical lagged values)
        'InventoryQuant': current_inventory,
        'Demand Forecast': demand_forecast,
        'Price': price,
        'Discount': discount,
        'Promotion': promotion,
        'Competitor Pricing': competitor_pricing,
        'Weather': weather,
        'Month': prediction_date.month,
        'Quarter': (prediction_date.month - 1) // 3 + 1,
        'Week_of_Year': prediction_date.isocalendar()[1]
    }])
    
    # Combine historical + current
    combined_df = pd.concat([historical_df, current_record], ignore_index=True)
    
    # Ensure Date is datetime and sorted chronologically
    combined_df['Date'] = pd.to_datetime(combined_df['Date'])
    combined_df = combined_df.sort_values('Date').reset_index(drop=True)
    
    # Engineer features (this applies all the lagged, rolling, etc. features)
    features_df = engineer_features(combined_df)
    
    # Return only the last row (current prediction)
    return features_df.tail(1)
