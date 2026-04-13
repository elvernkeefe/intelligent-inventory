"""Create shipments table"""
import sys
import os

# Add parent directory to path so we can import backend modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.database import engine, Base
from backend.models import Shipment

def create_tables():
    """Create shipments table in the database"""
    print("Creating shipments table...")
    Base.metadata.create_all(bind=engine, tables=[Shipment.__table__])
    print("✅ Shipments table created successfully!")

if __name__ == "__main__":
    create_tables()
