'use client';

import { useEffect, useState } from 'react';
import { confirmDelivery, getOrders } from '../lib/apiService';

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const data = await getOrders();
      setOrders(data.orders || []);
      setError(null);
    } catch (err) {
      console.error('Failed to load orders:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDelivery = async (orderId) => {
    const confirmedBy = prompt("Enter your name to confirm delivery:");
    if (!confirmedBy) return;

    const notes = prompt("Add any notes (optional):");

    try {
      setConfirmingId(orderId);
      await confirmDelivery(orderId, confirmedBy, notes);
      alert('✅ Delivery confirmed successfully! Inventory has been updated.');
      await loadOrders(); // Reload orders
    } catch (err) {
      alert('❌ Failed to confirm delivery: ' + err.message);
    } finally {
      setConfirmingId(null);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'delivered':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getDaysRemaining = (expectedDate) => {
    const now = new Date();
    const expected = new Date(expectedDate);
    const diffTime = expected - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading orders...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-destructive/10 text-destructive rounded-lg">
        Error loading orders: {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Order Management</h2>
        </div>
        <button 
          onClick={loadOrders}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
        >
          🔄 Refresh
        </button>
      </div>

      {orders.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <p className="text-muted-foreground">No orders yet. Approve predictions to create orders.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map(order => (
            <div 
              key={order.id} 
              className="bg-card border border-border rounded-xl p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <h3 className="text-lg font-bold text-foreground">
                      {order.store} - {order.category}
                    </h3>
                    <span className={`text-xs px-3 py-1 rounded-full font-medium ${getStatusColor(order.status)}`}>
                      {order.status.toUpperCase()}
                    </span>
                  </div>
                  
                  {/* Visual Timeline */}
                  <div className="mt-4 relative">
                    <div className="flex items-center justify-between mb-2">
                      {/* Ordered */}
                      <div className="flex flex-col items-center flex-1">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          order.order_date ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-500'
                        }`}>
                          ✓
                        </div>
                        <span className="text-xs mt-1 font-medium">Ordered</span>
                      </div>
                      
                      {/* In Transit */}
                      <div className="flex-1 h-1 bg-gray-300 relative -mx-2">
                        <div className={`absolute top-0 left-0 h-full transition-all ${
                          order.status === 'delivered' ? 'bg-green-500 w-full' :
                          order.status === 'pending' ? 'bg-blue-500 w-1/2 animate-pulse' : 'w-0'
                        }`}></div>
                      </div>
                      
                      {/* In Transit Icon */}
                      <div className="flex flex-col items-center flex-1">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          order.status === 'pending' ? 'bg-blue-500 text-white animate-bounce' : 
                          order.status === 'delivered' ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-500'
                        }`}>
                          🚚
                        </div>
                        <span className="text-xs mt-1 font-medium">In Transit</span>
                      </div>
                      
                      <div className="flex-1 h-1 bg-gray-300 relative -mx-2">
                        <div className={`absolute top-0 left-0 h-full transition-all ${
                          order.status === 'delivered' ? 'bg-green-500 w-full' : 'w-0'
                        }`}></div>
                      </div>
                      
                      {/* Delivered */}
                      <div className="flex flex-col items-center flex-1">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          order.status === 'delivered' ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-500'
                        }`}>
                          📦
                        </div>
                        <span className="text-xs mt-1 font-medium">Delivered</span>
                      </div>
                    </div>
                    
                    {/* Days Remaining */}
                    {order.status === 'pending' && (() => {
                      const daysLeft = getDaysRemaining(order.expected_delivery_date);
                      return (
                        <div className="text-center mt-2">
                          <span className={`text-sm font-semibold px-3 py-1 rounded-full ${
                            daysLeft <= 1 ? 'bg-red-100 text-red-700' :
                            daysLeft <= 3 ? 'bg-yellow-100 text-yellow-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                            {daysLeft > 0 ? `${daysLeft} day${daysLeft > 1 ? 's' : ''} remaining` : 
                             daysLeft === 0 ? 'Arriving today' : 'Overdue'}
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                  
                  <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Quantity</p>
                      <p className="font-semibold text-foreground">{order.quantity} units</p>
                    </div>
                    
                    <div>
                      <p className="text-muted-foreground">Order Date</p>
                      <p className="font-semibold text-foreground">{formatDate(order.order_date)}</p>
                    </div>
                    
                    <div>
                      <p className="text-muted-foreground">Expected Delivery</p>
                      <p className="font-semibold text-foreground">{formatDate(order.expected_delivery_date)}</p>
                    </div>
                    
                    {order.actual_delivery_date && (
                      <div>
                        <p className="text-muted-foreground">Actual Delivery</p>
                        <p className="font-semibold text-foreground">{formatDate(order.actual_delivery_date)}</p>
                      </div>
                    )}
                  </div>
                  
                  {order.status === 'delivered' && order.confirmed_by && (
                    <div className="mt-3 text-sm text-green-600 bg-green-50 px-3 py-2 rounded">
                      ✅ Confirmed by {order.confirmed_by}
                    </div>
                  )}
                </div>
                
                {order.status === 'pending' && (
                  <button
                    onClick={() => handleConfirmDelivery(order.id)}
                    disabled={confirmingId === order.id}
                    className="ml-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {confirmingId === order.id ? 'Confirming...' : 'Confirm Delivery'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
