"""
Database Migration Script
Loads historical_inventory_south.csv into PostgreSQL
"""
import pandas as pd
from sqlalchemy.orm import Session
from backend.database import engine, init_db
from backend.models import Store, Product, InventoryHistory
from datetime import datetime

def migrate_data():
    """Load historical data from CSV into PostgreSQL"""
    
    print("="*70)
    print("DATABASE MIGRATION: Loading Historical Data")
    print("="*70)
    
    # Initialize database (create tables)
    print("\n1. Creating database tables...")
    init_db()
    
    # Load CSV
    print("\n2. Loading CSV file...")
    csv_path = "historical_inventory_south.csv"
    try:
        df = pd.read_csv(csv_path)
        print(f"   ✅ Loaded {len(df):,} rows from {csv_path}")
        print(f"   📊 Columns in CSV: {list(df.columns)}")
        print(f"   📅 Date range: {df['Date'].min()} to {df['Date'].max()}")
    except FileNotFoundError:
        print(f"   ❌ ERROR: {csv_path} not found!")
        print(f"   Please ensure the file is in the project root directory.")
        return False
    
    # Create session
    session = Session(bind=engine)
    
    try:
        # 3. Populate Store master data
        print("\n3. Creating Store master data...")
        stores = df['Store'].unique()
        store_map = {}
        for store_name in stores:
            store = session.query(Store).filter_by(store_name=store_name).first()
            if not store:
                store = Store(store_name=store_name, region='South')
                session.add(store)
                session.flush()  # Get ID
            store_map[store_name] = store.id
        session.commit()
        print(f"   ✅ Created {len(stores)} stores: {', '.join(stores)}")
        
        # 4. Populate Product master data
        print("\n4. Creating Product master data...")
        categories = df['product_category'].unique()
        product_map = {}
        delivery_cycles = {
            'Groceries': 1,
            'Toys': 3,
            'Clothing': 3,
            'Furniture': 7,
            'Electronics': 7
        }
        for category in categories:
            product = session.query(Product).filter_by(category_name=category).first()
            if not product:
                product = Product(
                    category_name=category,
                    delivery_cycle_days=delivery_cycles.get(category, 3)
                )
                session.add(product)
                session.flush()
            product_map[category] = product.id
        session.commit()
        print(f"   ✅ Created {len(categories)} categories: {', '.join(categories)}")
        
        # 5. Load historical inventory data
        print("\n5. Loading historical inventory records...")
        print(f"   This may take a moment for {len(df):,} records...")
        
        batch_size = 1000
        records_added = 0
        
        for idx, row in df.iterrows():
            # Check if record already exists (avoid duplicates)
            existing = session.query(InventoryHistory).filter_by(
                date=pd.to_datetime(row['Date']),
                store_id=store_map[row['Store']],
                product_id=product_map[row['product_category']]
            ).first()
            
            if existing:
                continue  # Skip duplicates
            
            record = InventoryHistory(
                date=pd.to_datetime(row['Date']),
                store_id=store_map[row['Store']],
                product_id=product_map[row['product_category']],
                inventory_quantity=float(row['InventoryQuant']),
                units_ordered=float(row['units_ordered']),
                units_sold=0,  # We don't have Sold in feature-engineered CSV
                demand_forecast=float(row['Demand Forecast']),
                price=float(row['Price']),
                discount=float(row['Discount']),
                promotion=int(row['Promotion']),
                competitor_pricing=float(row['Competitor Pricing']),
                weather=row['Weather'],
                month=int(row['Month']),
                quarter=int(row['Quarter']),
                week_of_year=int(row['Week_of_Year'])
            )
            session.add(record)
            records_added += 1
            
            # Commit in batches for performance
            if records_added % batch_size == 0:
                session.commit()
                print(f"   Progress: {records_added:,} / {len(df):,} records")
        
        # Commit remaining records
        session.commit()
        print(f"   ✅ Loaded {records_added:,} historical records")
        
        # 6. Verify data
        print("\n6. Verifying data...")
        total_records = session.query(InventoryHistory).count()
        total_stores = session.query(Store).count()
        total_products = session.query(Product).count()
        
        print(f"   ✅ Database Summary:")
        print(f"      • Stores: {total_stores}")
        print(f"      • Product Categories: {total_products}")
        print(f"      • Historical Records: {total_records:,}")
        
        # Show date range
        from sqlalchemy import func
        min_date = session.query(func.min(InventoryHistory.date)).scalar()
        max_date = session.query(func.max(InventoryHistory.date)).scalar()
        print(f"      • Date Range: {min_date.date()} to {max_date.date()}")
        
        # Show records per store-category
        print(f"\n   Records per Store-Category:")
        for store_name in stores:
            for category in categories:
                count = session.query(InventoryHistory).join(Store).join(Product).filter(
                    Store.store_name == store_name,
                    Product.category_name == category
                ).count()
                print(f"      • {store_name} - {category}: {count} weeks")
        
        print("\n" + "="*70)
        print("✅ MIGRATION COMPLETE!")
        print("="*70)
        print("\n🚀 Your database is ready for predictions!")
        return True
        
    except Exception as e:
        session.rollback()
        print(f"\n❌ ERROR during migration: {str(e)}")
        import traceback
        traceback.print_exc()
        return False
        
    finally:
        session.close()


if __name__ == "__main__":
    success = migrate_data()
    if success:
        print("\n✅ Next steps:")
        print("   1. Test API: python -m backend.main")
        print("   2. Visit: http://localhost:8000/docs")
        print("   3. Try /api/stores and /api/products endpoints")
    else:
        print("\n❌ Migration failed. Please fix errors and try again.")
