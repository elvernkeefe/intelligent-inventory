"""
Feature engineering pipeline
Replicates the exact feature engineering process from the Jupyter notebook
"""
import pandas as pd
import numpy as np
from typing import Dict, List


def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Apply feature engineering to raw inventory data.
    This replicates the exact process from inventory_model.ipynb
    
    Args:
        df: DataFrame with columns: Date, Store, product_category, Sold, InventoryQuant,
            Demand Forecast, Price, Discount, Promotion, Competitor Pricing, Weather,
            Month, Quarter, Week_of_Year
    
    Returns:
        DataFrame with engineered features ready for model prediction
    """
    df_features = df.copy()
    
    # 1. LAGGED SALES FEATURES (previous weeks' sales)
    for lag in [1, 2, 4]:
        df_features[f'Lagged_Sold_{lag}w'] = (
            df_features.groupby(['Store', 'product_category'])['Sold']
            .shift(lag).fillna(0)
        )
    
    # 2. ROLLING STATISTICS (moving averages and std dev)
    df_features['Rolling_Sold_4w'] = (
        df_features.groupby(['Store', 'product_category'])['Sold']
        .transform(lambda x: x.rolling(window=4, min_periods=1).mean().shift(1))
        .fillna(0)
    )
    
    df_features['Rolling_Sold_std_4w'] = (
        df_features.groupby(['Store', 'product_category'])['Sold']
        .transform(lambda x: x.rolling(window=4, min_periods=1).std().shift(1))
        .fillna(0)
    )
    
    # 3. INVENTORY COVERAGE (how many weeks of stock)
    df_features['Stock_Coverage_Weeks'] = (
        df_features['InventoryQuant'] / df_features['Lagged_Sold_1w'].replace(0, 1)
    ).clip(0, 10)
    
    # 4. SALES VELOCITY (trend indicator)
    df_features['Sales_Velocity'] = (
        (df_features['Lagged_Sold_1w'] - df_features['Lagged_Sold_2w']) /
        df_features['Lagged_Sold_2w'].replace(0, 1)
    ).clip(-2, 2)
    
    # 5. FORECAST ACCURACY (how reliable is forecast)
    df_features['Forecast_vs_Actual'] = (
        df_features['Demand Forecast'] / df_features['Lagged_Sold_1w'].replace(0, 1)
    ).clip(0, 5)
    
    # 6. PRICING EFFECTS
    df_features['Price_vs_Competitor'] = df_features['Price'] - df_features['Competitor Pricing']
    df_features['Price_Promo_Interaction'] = df_features['Price'] * df_features['Promotion']
    df_features['Discount_Promo_Interaction'] = df_features['Discount'] * df_features['Promotion']
    
    # 7. TIME CYCLICAL FEATURES (sin/cos encoding)
    df_features['Month_Sin'] = np.sin(2 * np.pi * df_features['Month'] / 12)
    df_features['Month_Cos'] = np.cos(2 * np.pi * df_features['Month'] / 12)
    df_features['Week_Sin'] = np.sin(2 * np.pi * df_features['Week_of_Year'] / 52)
    df_features['Week_Cos'] = np.cos(2 * np.pi * df_features['Week_of_Year'] / 52)
    
    # 8. DELIVERY CYCLE (category-specific lead times)
    delivery_cycle = {
        'Groceries': 1,
        'Toys': 3,
        'Clothing': 3,
        'Furniture': 7,
        'Electronics': 7
    }
    df_features['Delivery_Cycle'] = df_features['product_category'].map(delivery_cycle)
    
    # 9. ONE-HOT ENCODING for categorical variables
    df_features = pd.get_dummies(
        df_features,
        columns=['product_category', 'Store', 'Weather'],
        drop_first=False,
        dtype='uint8'
    )
    
    # ENSURE ALL EXPECTED ONE-HOT COLUMNS EXIST (even if not in current data)
    # This is crucial for model compatibility - the model was trained with all categories
    expected_stores = ['Store_S001', 'Store_S002', 'Store_S003', 'Store_S004', 'Store_S005']
    expected_categories = ['product_category_Electronics', 'product_category_Groceries', 
                          'product_category_Furniture', 'product_category_Toys', 'product_category_Clothing']
    expected_weather = ['Weather_Sunny', 'Weather_Cloudy', 'Weather_Rainy', 'Weather_Snowy']
    
    all_expected_columns = expected_stores + expected_categories + expected_weather
    
    for col in all_expected_columns:
        if col not in df_features.columns:
            df_features[col] = 0
    
    # 10. DROP 'Sold' COLUMN (used for feature engineering but not needed for prediction)
    if 'Sold' in df_features.columns:
        df_features = df_features.drop(columns=['Sold'])
    
    # 11. HANDLE MISSING VALUES
    num_cols = df_features.select_dtypes(include=[float, int]).columns
    df_features[num_cols] = df_features[num_cols].fillna(df_features[num_cols].median())
    
    # 12. DROP DATE COLUMN (not used in model)
    if 'Date' in df_features.columns:
        df_features = df_features.drop(columns=['Date'])
    
    return df_features


def prepare_single_prediction(
    store: str,
    category: str,
    current_inventory: float,
    demand_forecast: float,
    price: float,
    discount: float,
    promotion: int,
    competitor_pricing: float,
    weather: str,
    historical_data: pd.DataFrame
) -> pd.DataFrame:
    """
    Prepare features for a single prediction.
    Requires historical data to compute lagged and rolling features.
    
    Args:
        store: Store name (e.g., "Store A")
        category: Product category (e.g., "Electronics")
        current_inventory: Current inventory quantity
        demand_forecast: Forecasted demand
        price: Current price
        discount: Current discount percentage
        promotion: Promotion flag (0 or 1)
        competitor_pricing: Competitor's price
        weather: Weather condition
        historical_data: Historical sales data for computing lagged features
    
    Returns:
        DataFrame with engineered features ready for prediction
    """
    # Get current date info
    from datetime import datetime
    now = datetime.now()
    month = now.month
    quarter = (now.month - 1) // 3 + 1
    week_of_year = now.isocalendar()[1]
    
    # Create current record
    current_record = pd.DataFrame([{
        'Date': now,
        'Store': store,
        'product_category': category,
        'InventoryQuant': current_inventory,
        'Demand Forecast': demand_forecast,
        'Price': price,
        'Discount': discount,
        'Promotion': promotion,
        'Competitor Pricing': competitor_pricing,
        'Weather': weather,
        'Month': month,
        'Quarter': quarter,
        'Week_of_Year': week_of_year,
        'Sold': 0  # Placeholder, will be used for feature engineering
    }])
    
    # Combine with historical data
    combined = pd.concat([historical_data, current_record], ignore_index=True)
    
    # Engineer features
    features_df = engineer_features(combined)
    
    # Return only the last row (current prediction)
    return features_df.tail(1)


def validate_input_data(data: Dict) -> List[str]:
    """
    Validate input data for prediction.
    Returns list of validation errors (empty if valid).
    """
    errors = []
    
    required_fields = [
        'store', 'category', 'current_inventory', 'demand_forecast',
        'price', 'discount', 'promotion', 'competitor_pricing', 'weather'
    ]
    
    for field in required_fields:
        if field not in data:
            errors.append(f"Missing required field: {field}")
    
    # Validate ranges
    if 'current_inventory' in data and data['current_inventory'] < 0:
        errors.append("current_inventory must be >= 0")
    
    if 'price' in data and data['price'] <= 0:
        errors.append("price must be > 0")
    
    if 'discount' in data and not (0 <= data['discount'] <= 100):
        errors.append("discount must be between 0 and 100")
    
    if 'promotion' in data and data['promotion'] not in [0, 1]:
        errors.append("promotion must be 0 or 1")
    
    # Validate categorical values
    valid_stores = ['Store A', 'Store B', 'Store C', 'Store D', 'Store E']
    if 'store' in data and data['store'] not in valid_stores:
        errors.append(f"store must be one of: {valid_stores}")
    
    valid_categories = ['Electronics', 'Groceries', 'Furniture', 'Toys', 'Clothing']
    if 'category' in data and data['category'] not in valid_categories:
        errors.append(f"category must be one of: {valid_categories}")
    
    valid_weather = ['Sunny', 'Rainy', 'Snowy', 'Cloudy']
    if 'weather' in data and data['weather'] not in valid_weather:
        errors.append(f"weather must be one of: {valid_weather}")
    
    return errors
