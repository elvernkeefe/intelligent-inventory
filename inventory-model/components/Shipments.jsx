'use client';

import { useEffect, useState } from 'react';
import { addSimulationJob, confirmShipment, getShipments, requestShipment } from '../lib/apiService';

export default function Shipments() {
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);
  const [simulatingId, setSimulatingId] = useState(null);
  const [simulatingDraft, setSimulatingDraft] = useState(false);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [simulatedDraftMeta, setSimulatedDraftMeta] = useState(null);
  
  // Form state
  const [formData, setFormData] = useState({
    store: 'Store A',
    category: 'Electronics',
    quantity: '',
    requestedBy: '',
    neededByDate: '',
    reason: ''
  });

  const getDraftSignature = (data) => {
    return [
      data.store,
      data.category,
      String(data.quantity || '').trim(),
      String(data.requestedBy || '').trim(),
      String(data.neededByDate || '').trim(),
      String(data.reason || '').trim(),
    ].join('|');
  };

  const isDraftValid = () => {
    return Boolean(formData.quantity) && Boolean(String(formData.requestedBy || '').trim());
  };

  const isSimulatedForCurrentDraft = () => {
    if (!simulatedDraftMeta) return false;
    return simulatedDraftMeta.signature === getDraftSignature(formData);
  };

  useEffect(() => {
    loadShipments();
  }, []);

  const loadShipments = async () => {
    try {
      setLoading(true);
      const data = await getShipments();
      setShipments(data.shipments || []);
      setError(null);
    } catch (err) {
      console.error('Failed to load shipments:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitRequest = async (e) => {
    e.preventDefault();
    
    if (!formData.quantity || !formData.requestedBy) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      const result = await requestShipment(
        formData.store,
        formData.category,
        parseInt(formData.quantity),
        formData.requestedBy,
        formData.neededByDate || null,
        formData.reason || null
      );

      if (result.success) {
        alert(`✅ Shipment request created successfully!\n\nShipment #${result.shipment_id}\nAvailable warehouse stock: ${result.available_warehouse_stock} units`);
        setShowRequestForm(false);
        setFormData({
          store: 'Store A',
          category: 'Electronics',
          quantity: '',
          requestedBy: '',
          neededByDate: '',
          reason: ''
        });
        setSimulatedDraftMeta(null);
        await loadShipments();
      } else {
        alert(`⚠️ ${result.message}`);
      }
    } catch (err) {
      alert('❌ Failed to create shipment request: ' + err.message);
    }
  };

  const handleSimulateDraft = async () => {
    if (!isDraftValid()) {
      alert('Please fill quantity and requested by before simulation.');
      return;
    }

    const dayRaw = prompt(
      `Simulate OUTBOUND for ${formData.store} - ${formData.category}.\n\nSimulation day:`,
      '1'
    );

    if (dayRaw === null) return;

    const simulationDay = Number.parseInt(dayRaw, 10);
    if (!Number.isInteger(simulationDay) || simulationDay < 0) {
      alert('Simulation day must be a non-negative integer');
      return;
    }

    const signature = getDraftSignature(formData);

    try {
      setSimulatingDraft(true);

      const result = await addSimulationJob({
        store: formData.store,
        category: formData.category,
        job_type: 'OUTBOUND',
        quantity: Number.parseInt(formData.quantity, 10),
        simulation_day: simulationDay,
        initial_status: 'draft',
        source: 'shipment_precheck',
        source_ref: `shipment-precheck:${signature}:${simulationDay}`,
        notes: `Pre-request simulation for ${formData.requestedBy}`,
      });

      setSimulatedDraftMeta({
        signature,
        simulationDay,
        simulationJobId: result.job.id,
      });

      alert(
        `✅ Simulation draft created\n\nJob #${result.job.id}: OUTBOUND ${result.job.quantity} units\n${result.job.store} - ${result.job.category} on day ${result.job.simulation_day}\n\nReview and send it from Simulation List when ready.`
      );
    } catch (err) {
      if (err?.status === 409 || String(err?.message || '').includes('already exists')) {
        alert('ℹ️ This shipment simulation draft already exists in Simulation List.');
      } else {
        alert('❌ Failed to create simulation job: ' + err.message);
      }
    } finally {
      setSimulatingDraft(false);
    }
  };

  const handleConfirmShipment = async (shipmentId) => {
    const shippedBy = prompt("Enter your name to confirm shipment:");
    if (!shippedBy) return;

    const notes = prompt("Add any notes (optional):");

    try {
      setConfirmingId(shipmentId);
      await confirmShipment(shipmentId, shippedBy, notes);
      alert('✅ Shipment confirmed! Warehouse inventory has been updated.');
      await loadShipments();
    } catch (err) {
      alert('❌ Failed to confirm shipment: ' + err.message);
    } finally {
      setConfirmingId(null);
    }
  };

  const handleAddShipmentToSimulation = async (shipment) => {
    const dayRaw = prompt(
      `Add OUTBOUND simulation job for shipment #${shipment.id}?\n\nSimulation day:`,
      "1"
    );

    if (dayRaw === null) return;

    const simulationDay = Number.parseInt(dayRaw, 10);
    if (!Number.isInteger(simulationDay) || simulationDay < 0) {
      alert('Simulation day must be a non-negative integer');
      return;
    }

    try {
      setSimulatingId(shipment.id);

      const result = await addSimulationJob({
        store: shipment.store,
        category: shipment.category,
        job_type: 'OUTBOUND',
        quantity: shipment.quantity,
        simulation_day: simulationDay,
        initial_status: 'draft',
        source: 'shipment',
        source_ref: `shipment:${shipment.id}`,
        notes: 'Added from Shipments page before execution',
      });

      alert(
        `✅ Shipment added to simulation draft list\n\nJob #${result.job.id}: OUTBOUND ${result.job.quantity} units\n${result.job.store} - ${result.job.category} on day ${result.job.simulation_day}\n\nReview and send it from Simulation List when ready.`
      );
    } catch (err) {
      if (err?.status === 409 || String(err?.message || '').includes('already exists')) {
        alert('ℹ️ This shipment is already in Simulation List as an active draft/queued job.');
      } else {
        alert('❌ Failed to add shipment to simulation: ' + err.message);
      }
    } finally {
      setSimulatingId(null);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'shipped':
        return 'bg-blue-100 text-blue-800';
      case 'requested':
        return 'bg-yellow-100 text-yellow-800';
      case 'delivered':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading shipments...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-destructive/10 text-destructive rounded-lg">
        Error loading shipments: {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Shipment Management</h2>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={loadShipments}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
          >
            🔄 Refresh
          </button>
          <button 
            onClick={() => setShowRequestForm(!showRequestForm)}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition-colors"
          >
            {showRequestForm ? '❌ Cancel' : '📦 Request Shipment'}
          </button>
        </div>
      </div>

      {/* Request Form */}
      {showRequestForm && (
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-lg font-bold mb-4">New Shipment Request</h3>
          <form onSubmit={handleSubmitRequest} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Store</label>
                <select
                  value={formData.store}
                  onChange={(e) => setFormData({...formData, store: e.target.value})}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                >
                  <option>Store A</option>
                  <option>Store B</option>
                  <option>Store C</option>
                  <option>Store D</option>
                  <option>Store E</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({...formData, category: e.target.value})}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                >
                  <option>Electronics</option>
                  <option>Groceries</option>
                  <option>Furniture</option>
                  <option>Clothing</option>
                  <option>Toys</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Quantity *</label>
                <input
                  type="number"
                  value={formData.quantity}
                  onChange={(e) => setFormData({...formData, quantity: e.target.value})}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                  placeholder="100"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Requested By *</label>
                <input
                  type="text"
                  value={formData.requestedBy}
                  onChange={(e) => setFormData({...formData, requestedBy: e.target.value})}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                  placeholder="Store Manager Name"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Needed By Date</label>
                <input
                  type="date"
                  value={formData.neededByDate}
                  onChange={(e) => setFormData({...formData, neededByDate: e.target.value})}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Reason</label>
                <input
                  type="text"
                  value={formData.reason}
                  onChange={(e) => setFormData({...formData, reason: e.target.value})}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                  placeholder="e.g., Running low due to promotion"
                />
              </div>
            </div>
            
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowRequestForm(false)}
                className="px-4 py-2 border border-border rounded-lg hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSimulateDraft}
                disabled={simulatingDraft}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {simulatingDraft ? 'Simulating...' : '🧪 Simulate Outbound'}
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Submit Real Request
              </button>
            </div>
            <div className="text-xs text-muted-foreground">
              {isSimulatedForCurrentDraft()
                ? `✅ Simulated for day ${simulatedDraftMeta.simulationDay}. You can submit now or continue adjusting.`
                : 'Simulation is optional. You can submit directly or run simulation first for pre-check.'}
            </div>
          </form>
        </div>
      )}

      {/* Shipments List */}
      {shipments.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <p className="text-muted-foreground">No shipments yet. Create a shipment request to get started.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {shipments.map(shipment => (
            <div 
              key={shipment.id} 
              className="bg-card border border-border rounded-xl p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <h3 className="text-lg font-bold text-foreground">
                      #{shipment.id} - {shipment.store} - {shipment.category}
                    </h3>
                    <span className={`text-xs px-3 py-1 rounded-full font-medium ${getStatusColor(shipment.status)}`}>
                      {shipment.status.toUpperCase()}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Quantity</p>
                      <p className="font-semibold text-foreground">{shipment.quantity} units</p>
                    </div>
                    
                    <div>
                      <p className="text-muted-foreground">Request Date</p>
                      <p className="font-semibold text-foreground">{formatDate(shipment.request_date)}</p>
                    </div>
                    
                    <div>
                      <p className="text-muted-foreground">Requested By</p>
                      <p className="font-semibold text-foreground">{shipment.requested_by}</p>
                    </div>
                    
                    {shipment.needed_by_date && (
                      <div>
                        <p className="text-muted-foreground">Needed By</p>
                        <p className="font-semibold text-foreground">{formatDate(shipment.needed_by_date)}</p>
                      </div>
                    )}
                    
                    {shipment.ship_date && (
                      <div>
                        <p className="text-muted-foreground">Ship Date</p>
                        <p className="font-semibold text-foreground">{formatDate(shipment.ship_date)}</p>
                      </div>
                    )}
                    
                    {shipment.expected_delivery_date && (
                      <div>
                        <p className="text-muted-foreground">Expected Delivery</p>
                        <p className="font-semibold text-foreground">{formatDate(shipment.expected_delivery_date)}</p>
                      </div>
                    )}
                  </div>
                  
                  {shipment.reason && (
                    <div className="mt-3 text-sm bg-muted/30 px-3 py-2 rounded">
                      <span className="font-medium">Reason:</span> {shipment.reason}
                    </div>
                  )}
                  
                  {shipment.status === 'requested' && (
                    <div className="mt-3 text-sm text-yellow-600 bg-yellow-50 px-3 py-2 rounded">
                      ⏳ Awaiting warehouse confirmation
                    </div>
                  )}
                  
                  {shipment.status === 'shipped' && shipment.shipped_by && (
                    <div className="mt-3 text-sm text-blue-600 bg-blue-50 px-3 py-2 rounded">
                      🚚 Shipped by {shipment.shipped_by}
                    </div>
                  )}
                </div>
                
                {shipment.status === 'requested' && (
                  <div className="ml-4 flex flex-col gap-2">
                    <button
                      onClick={() => handleAddShipmentToSimulation(shipment)}
                      disabled={simulatingId === shipment.id}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {simulatingId === shipment.id ? 'Adding...' : '🧪 Add to Simulation'}
                    </button>
                    <button
                      onClick={() => handleConfirmShipment(shipment.id)}
                      disabled={confirmingId === shipment.id}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {confirmingId === shipment.id ? 'Confirming...' : '🚚 Confirm Shipment'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
