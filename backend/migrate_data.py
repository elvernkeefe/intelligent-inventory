"""
Migration script to load RAW DAILY historical inventory data into PostgreSQL
Weekly aggregation is performed on-the-fly during predictions.
"""
import sys
import pandas as pd
from sqlalchemy.orm import Session
from backend.database import engine, SessionLocal, init_db
from backend.models import Store, Product, InventoryHistory
from datetime import datetime


# Store code mapping (S001-S005 -> Store A-E)
STORE_MAPPING = {
    'S001': 'Store A',
    'S002': 'Store B', 
    'S003': 'Store C',
    'S004': 'Store D',
    'S005': 'Store E'
}

# Product category mapping with delivery cycles
PRODUCT_CATEGORIES = {
    'Electronics': 7,
    'Groceries': 1,
    'Furniture': 7,
    'Toys': 3,
    'Clothing': 3
}


def migrate_data(csv_path: str = "historical_inventory_south.csv"):
    """
    Load raw daily inventory data from CSV into PostgreSQL.
    
    CSV Structure:
    - Date, Store, ProductID, InventoryQuant, Sold, units_ordered, 
      Demand Forecast, Price, Discount, Weather, Promotion, 
      Competitor Pricing, Seasonality, Regional, product_category
    
    Database stores RAW daily data. Weekly aggregation happens during prediction.
    """
    print("\n" + "="*70)
    print("📦 MIGRATING HISTORICAL INVENTORY DATA (Raw Daily)")
    print("="*70)
    
    # Initialize database (create tables)
    init_db()
    
    # Load CSV
    print(f"\n📂 Loading CSV: {csv_path}")
    try:
        df = pd.read_csv(csv_path)
        print(f"✅ Loaded {len(df):,} rows with {len(df.columns)} columns")
        print(f"📅 Date range: {df['Date'].min()} to {df['Date'].max()}")
    except FileNotFoundError:
        print(f"❌ Error: File '{csv_path}' not found")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error loading CSV: {e}")
        sys.exit(1)
    
    # Convert date and add time features
    df['Date'] = pd.to_datetime(df['Date'], format='%d/%m/%Y')
    df['Month'] = df['Date'].dt.month
    df['Quarter'] = df['Date'].dt.quarter
    df['Week_of_Year'] = df['Date'].dt.isocalendar().week
    
    # Map store codes to names
    df['Store_Name'] = df['Store'].map(STORE_MAPPING)
    missing_stores = df[df['Store_Name'].isna()]['Store'].unique()
    if len(missing_stores) > 0:
        print(f"⚠️  Warning: Unknown store codes: {missing_stores}")
        df = df.dropna(subset=['Store_Name'])
    
    # Drop unnecessary columns
    df = df.drop(columns=['ProductID', 'Seasonality', 'Regional', 'Store'], errors='ignore')
    
    print(f"✅ Preprocessed to {len(df):,} rows")
    print(f"   Stores: {df['Store_Name'].nunique()}")
    print(f"   Categories: {df['product_category'].nunique()}")
    print(f"   Date range: {df['Date'].min()} to {df['Date'].max()}")
    
    # Create database session
    db = SessionLocal()
    
    try:
        # ============================================================
        # STEP 1: Create Store Master Data
        # ============================================================
        print("\n" + "="*70)
        print("STEP 1: Creating Store Master Data")
        print("="*70)
        
        stores_created = 0
        for store_code, store_name in STORE_MAPPING.items():
            existing_store = db.query(Store).filter_by(store_name=store_name).first()
            if not existing_store:
                store = Store(store_name=store_name, region="South")
                db.add(store)
                stores_created += 1
        
        db.commit()
        print(f"✅ Stores: {stores_created} created, {len(STORE_MAPPING) - stores_created} already exist")
        
        # ============================================================
        # STEP 2: Create Product Master Data
        # ============================================================
        print("\n" + "="*70)
        print("STEP 2: Creating Product Master Data")
        print("="*70)
        
        products_created = 0
        for category, delivery_days in PRODUCT_CATEGORIES.items():
            existing_product = db.query(Product).filter_by(category_name=category).first()
            if not existing_product:
                product = Product(category_name=category, delivery_cycle_days=delivery_days)
                db.add(product)
                products_created += 1
        
        db.commit()
        print(f"✅ Products: {products_created} created, {len(PRODUCT_CATEGORIES) - products_created} already exist")
        
        # ============================================================
        # STEP 3: Load Historical Inventory Records (RAW DAILY DATA)
        # ============================================================
        print("\n" + "="*70)
        print("STEP 3: Loading Historical Inventory Records")
        print("="*70)
        
        # Get store and product ID mappings
        stores = {s.store_name: s.id for s in db.query(Store).all()}
        products = {p.category_name: p.id for p in db.query(Product).all()}
        
        records_added = 0
        records_skipped = 0
        batch_size = 1000
        
        for idx, row in df.iterrows():
            store_id = stores.get(row['Store_Name'])
            product_id = products.get(row['product_category'])
            
            if not store_id or not product_id:
                records_skipped += 1
                continue
            
            # Check for duplicate
            existing = db.query(InventoryHistory).filter_by(
                date=row['Date'],
                store_id=store_id,
                product_id=product_id
            ).first()
            
            if existing:
                records_skipped += 1
                continue
            
            # Create record
            record = InventoryHistory(
                date=row['Date'],
                store_id=store_id,
                product_id=product_id,
                inventory_quantity=row['InventoryQuant'],
                units_ordered=row['units_ordered'],
                units_sold=row['Sold'],
                demand_forecast=row['Demand Forecast'],
                price=row['Price'],
                discount=row['Discount'],
                promotion=int(row['Promotion']),
                competitor_pricing=row['Competitor Pricing'],
                weather=row['Weather'],
                month=row['Month'],
                quarter=row['Quarter'],
                week_of_year=row['Week_of_Year']
            )
            
            db.add(record)
            records_added += 1
            
            # Commit in batches
            if records_added % batch_size == 0:
                db.commit()
                print(f"   📝 Processed {records_added:,} records...")
        
        # Final commit
        db.commit()
        print(f"✅ Inventory Records: {records_added:,} added, {records_skipped:,} skipped (duplicates)")
        
        # ============================================================
        # STEP 4: Verify Data
        # ============================================================
        print("\n" + "="*70)
        print("STEP 4: Verifying Data Integrity")
        print("="*70)
        
        total_stores = db.query(Store).count()
        total_products = db.query(Product).count()
        total_records = db.query(InventoryHistory).count()
        
        print(f"📊 Database Summary:")
        print(f"   Stores: {total_stores}")
        print(f"   Product Categories: {total_products}")
        print(f"   Inventory Records (Daily): {total_records:,}")
        
        # Get date range
        from sqlalchemy import func
        min_date = db.query(func.min(InventoryHistory.date)).scalar()
        max_date = db.query(func.max(InventoryHistory.date)).scalar()
        print(f"   Date Range: {min_date} to {max_date}")
        
        print("\n" + "="*70)
        print("✅ MIGRATION COMPLETE!")
        print("="*70)
        print("\n💡 Note: Data is stored as RAW DAILY records.")
        print("   Weekly aggregation happens automatically during predictions.")
        print("\n🚀 Next: Start backend with: python -m uvicorn backend.main:app --reload\n")
        
    except Exception as e:
        db.rollback()
        print(f"\n❌ Error during migration: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    migrate_data()
