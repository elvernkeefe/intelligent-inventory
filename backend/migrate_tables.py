"""Create orders and inventory_transactions tables"""
import sys
import os

# Add parent directory to path so we can import backend modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.database import engine, Base
from backend.models import Order, InventoryTransaction

def create_tables():
    """Create new tables in the database"""
    print("Creating orders and inventory_transactions tables...")
    Base.metadata.create_all(bind=engine, tables=[Order.__table__, InventoryTransaction.__table__])
    print("✅ Tables created successfully!")

if __name__ == "__main__":
    create_tables()
