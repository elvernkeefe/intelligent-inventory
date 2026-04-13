'use client';

import { useEffect, useState } from 'react';
import { getTransactions } from '../lib/apiService';

export default function InventoryHistory() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    store: '',
    category: ''
  });

  useEffect(() => {
    loadTransactions();
  }, [filters]);

  const loadTransactions = async () => {
    try {
      setLoading(true);
      const data = await getTransactions(filters.store || null, filters.category || null);
      setTransactions(data.transactions || []);
      setError(null);
    } catch (err) {
      console.error('Failed to load transactions:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getTransactionColor = (type) => {
    switch (type) {
      case 'order_received':
        return 'bg-green-100 text-green-800';
      case 'shipment_sent':
        return 'bg-blue-100 text-blue-800';
      case 'adjustment':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getTransactionIcon = (type) => {
    switch (type) {
      case 'order_received':
        return '📦';
      case 'shipment_sent':
        return '🚚';
      case 'adjustment':
        return '⚙️';
      default:
        return '📝';
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (error) {
    return (
      <div className="space-y-4">
        <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start gap-3">
            <span className="text-2xl">❌</span>
            <div className="flex-1">
              <h3 className="font-semibold text-red-900">Failed to Load Transactions</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
              <button
                onClick={loadTransactions}
                className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition-colors"
              >
                🔄 Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Inventory History</h2>
        </div>
        <button 
          onClick={loadTransactions}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {loading ? '⏳ Loading...' : '🔄 Refresh'}
        </button>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium mb-2">Filter by Store</label>
            <select
              value={filters.store}
              onChange={(e) => setFilters({...filters, store: e.target.value})}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background"
            >
              <option value="">All Stores</option>
              <option>Store A</option>
              <option>Store B</option>
              <option>Store C</option>
              <option>Store D</option>
              <option>Store E</option>
            </select>
          </div>
          
          <div className="flex-1">
            <label className="block text-sm font-medium mb-2">Filter by Category</label>
            <select
              value={filters.category}
              onChange={(e) => setFilters({...filters, category: e.target.value})}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background"
            >
              <option value="">All Categories</option>
              <option>Electronics</option>
              <option>Groceries</option>
              <option>Furniture</option>
              <option>Clothing</option>
              <option>Toys</option>
            </select>
          </div>
        </div>
      </div>

      {/* Loading Skeleton */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-muted rounded-lg"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-1/3"></div>
                  <div className="h-3 bg-muted rounded w-1/2"></div>
                </div>
                <div className="h-6 w-20 bg-muted rounded"></div>
              </div>
            </div>
          ))}
        </div>
      ) : transactions.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <span className="text-4xl mb-3 block">📭</span>
          <p className="text-muted-foreground">No transactions found</p>
          <p className="text-sm text-muted-foreground mt-1">
            {filters.store || filters.category ? 'Try adjusting your filters' : 'Transactions will appear here as inventory changes'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {transactions.map(transaction => (
            <div 
              key={transaction.id} 
              className="bg-card border border-border rounded-xl p-4 hover:shadow-md transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center text-2xl">
                  {getTransactionIcon(transaction.transaction_type)}
                </div>
                
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-foreground">
                      {transaction.store} - {transaction.category}
                    </h3>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${getTransactionColor(transaction.transaction_type)}`}>
                      {transaction.transaction_type.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>
                      <span className={`font-semibold ${transaction.quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {transaction.quantity > 0 ? '+' : ''}{transaction.quantity}
                      </span> units
                    </span>
                    <span>•</span>
                    <span>{formatDate(transaction.transaction_date)}</span>
                    {transaction.confirmed_by && (
                      <>
                        <span>•</span>
                        <span>By {transaction.confirmed_by}</span>
                      </>
                    )}
                  </div>
                  
                  {transaction.notes && (
                    <p className="text-sm text-muted-foreground mt-2 italic">
                      "{transaction.notes}"
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
