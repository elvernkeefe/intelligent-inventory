/**
 * API Service Layer
 * Connects Next.js frontend to FastAPI backend
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

class ApiError extends Error {
  constructor(message, status, detail) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

/**
 * Generic fetch wrapper with error handling
 */
async function apiFetch(endpoint, options = {}) {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new ApiError(error.detail || `HTTP ${response.status}`, response.status, error.detail);
    }

    return await response.json();
  } catch (error) {
    // Keep dev console clean for expected business-flow errors (e.g., 409 duplicate draft).
    if (!(error instanceof ApiError)) {
      console.error(`API Error [${endpoint}]:`, error);
    }
    throw error;
  }
}

/**
 * Health Check
 */
export async function checkHealth() {
  return apiFetch('/health');
}

/**
 * Get batch predictions from ML model for all store-category combinations
 */
export async function getBatchPredictions() {
  return apiFetch('/predict/batch', { method: 'POST' });
}

/**
 * Get Model Performance Metrics
 */
export async function getModelPerformance() {
  return apiFetch('/performance');
}

/**
 * Get All Stores
 */
export async function getStores() {
  return apiFetch('/stores');
}

/**
 * Get All Product Categories
 */
export async function getProducts() {
  return apiFetch('/products');
}

/**
 * Get Current Inventory Snapshot
 */
export async function getCurrentInventory() {
  return apiFetch('/inventory/current');
}

/**
 * Make Single Prediction
 */
export async function predictSingle(predictionRequest) {
  return apiFetch('/predict', {
    method: 'POST',
    body: JSON.stringify(predictionRequest),
  });
}

/**
 * Get Feature Importance
 */
export async function getFeatureImportance(topN = 20) {
  return apiFetch(`/features/importance?top_n=${topN}`);
}

/**
 * ORDER MANAGEMENT APIs
 */

/**
 * Approve an order (create order from prediction)
 */
export async function approveOrder(store, category, quantity) {
  return apiFetch('/api/orders/approve', {
    method: 'POST',
    body: JSON.stringify({ store, category, quantity }),
  });
}

/**
 * Get all orders (optionally filter by status)
 */
export async function getOrders(status = null) {
  const endpoint = status ? `/api/orders?status=${status}` : '/api/orders';
  return apiFetch(endpoint);
}

/**
 * Get specific order by ID
 */
export async function getOrder(orderId) {
  return apiFetch(`/api/orders/${orderId}`);
}

/**
 * Confirm delivery of an order
 */
export async function confirmDelivery(orderId, confirmedBy, notes = '') {
  return apiFetch(`/api/orders/${orderId}/confirm-delivery`, {
    method: 'POST',
    body: JSON.stringify({ confirmed_by: confirmedBy, notes }),
  });
}

/**
 * Get inventory transaction history
 */
export async function getTransactions(store = null, category = null) {
  let endpoint = '/api/inventory/transactions';
  const params = [];
  if (store) params.push(`store=${encodeURIComponent(store)}`);
  if (category) params.push(`category=${encodeURIComponent(category)}`);
  if (params.length) endpoint += `?${params.join('&')}`;
  
  return apiFetch(endpoint);
}

/**
 * SHIPMENT MANAGEMENT APIs (Warehouse → Store)
 */

/**
 * Request a shipment from warehouse (store manager requests products)
 */
export async function requestShipment(store, category, quantity, requestedBy, neededByDate = null, reason = null) {
  return apiFetch('/api/shipments/request', {
    method: 'POST',
    body: JSON.stringify({
      store,
      category,
      quantity,
      requested_by: requestedBy,
      needed_by_date: neededByDate,
      reason
    }),
  });
}

/**
 * Get all shipments (optionally filter by status)
 */
export async function getShipments(status = null) {
  const endpoint = status ? `/api/shipments?status=${status}` : '/api/shipments';
  return apiFetch(endpoint);
}

/**
 * Confirm shipment has been shipped (warehouse confirms)
 */
export async function confirmShipment(shipmentId, shippedBy, notes = '') {
  return apiFetch(`/api/shipments/${shipmentId}/ship`, {
    method: 'POST',
    body: JSON.stringify({ shipped_by: shippedBy, notes }),
  });
}

/**
 * SIMULATION QUEUE APIs
 */

/**
 * Add one simulation job (INBOUND/OUTBOUND) from dashboard decisions
 */
export async function addSimulationJob(job) {
  return apiFetch('/simulation/jobs', {
    method: 'POST',
    body: JSON.stringify(job),
  });
}

/**
 * Get simulation jobs queue
 */
export async function getSimulationJobs(status = null) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  params.set('limit', '500');
  const endpoint = `/simulation/jobs?${params.toString()}`;
  return apiFetch(endpoint);
}

/**
 * Release draft simulation jobs into AnyLogic queue (queued)
 */
export async function releaseSimulationJobs(jobIds = null) {
  return apiFetch('/simulation/jobs/release', {
    method: 'POST',
    body: JSON.stringify({ job_ids: jobIds }),
  });
}

/**
 * Update one simulation job status
 */
export async function updateSimulationJobStatus(jobId, status) {
  return apiFetch(`/simulation/jobs/${jobId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

/**
 * Get predictions for all store-category combinations
 * Since /predict/batch is not implemented, we'll get current inventory
 * and let the frontend decide which combinations need predictions
 */
export async function getAllPredictions() {
  // For now, return current inventory as the basis for predictions
  // In a full implementation, this would call /predict/batch
  const inventorySnapshot = await getCurrentInventory();
  return {
    predictions: inventorySnapshot.inventory || [],
    snapshot_date: inventorySnapshot.snapshot_date,
    total_combinations: inventorySnapshot.total_combinations,
  };
}

/**
 * Calculate KPIs from inventory data
 */
export function calculateKPIs(inventoryData) {
  if (!inventoryData || inventoryData.length === 0) {
    return {
      totalInventoryValue: 0,
      stockoutRisk: 0,
      overstock: 0,
      avgStockCoverage: 0,
    };
  }

  const totalInventoryValue = inventoryData.reduce(
    (sum, item) => sum + (item.Current_Stock || 0) * (item.Price || 0),
    0
  );

  // Count items with low stock (less than 100 units)
  const stockoutRisk = inventoryData.filter(
    (item) => (item.Current_Stock || 0) < 100
  ).length;

  // Count items with high stock (more than 1000 units)
  const overstock = inventoryData.filter(
    (item) => (item.Current_Stock || 0) > 1000
  ).length;

  // Calculate average stock coverage (assuming 50 units per day demand)
  const avgStockCoverage =
    inventoryData.reduce((sum, item) => sum + (item.Current_Stock || 0) / 50, 0) /
    inventoryData.length;

  return {
    totalInventoryValue: Math.round(totalInventoryValue),
    stockoutRisk,
    overstock,
    avgStockCoverage: avgStockCoverage.toFixed(1),
  };
}

/**
 * Generate alerts from inventory data
 */
export function generateAlerts(inventoryData) {
  const alerts = [];

  if (!inventoryData || inventoryData.length === 0) {
    return alerts;
  }

  inventoryData.forEach((item) => {
    const stock = Number(item.Current_Stock ?? item.current_stock ?? item.currentInventory ?? 0);
    const store = item.Store || item.store || '-';
    const category = item.Category || item.category || '-';
    const demandForecast = Number(item.Demand_Forecast ?? item.demand_forecast ?? 0);
    const dailySales = demandForecast > 0 ? Math.max(1, Math.round(demandForecast / 7)) : null;
    const recommendedOrder = demandForecast > stock ? Math.round(demandForecast - stock) : 0;

    // Low stock alert
    if (stock < 100) {
      alerts.push({
        id: `low-${store}-${category}`,
        type: 'critical',
        store,
        category,
        title: 'Low Stock Alert',
        message: `${category} at ${store} has only ${stock.toFixed(0)} units remaining`,
        details: {
          currentInventory: Math.round(stock),
          dailySales,
          recommendedOrder,
        },
        timestamp: new Date().toISOString(),
      });
    }

    // High stock alert
    if (stock > 1000) {
      alerts.push({
        id: `high-${store}-${category}`,
        type: 'warning',
        store,
        category,
        title: 'Overstock Alert',
        message: `${category} at ${store} has excess inventory (${stock.toFixed(0)} units)`,
        timestamp: new Date().toISOString(),
      });
    }

    // Promotion opportunity
    if ((item.Discount || 0) === 0 && stock > 800) {
      alerts.push({
        id: `promo-${store}-${category}`,
        type: 'info',
        store,
        category,
        title: 'Promotion Opportunity',
        message: `Consider running promotion for ${category} at ${store}`,
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Sort by type priority
  const typePriority = { critical: 1, warning: 2, info: 3 };
  return alerts.sort((a, b) => typePriority[a.type] - typePriority[b.type]);
}

export default {
  addSimulationJob,
  getSimulationJobs,
  releaseSimulationJobs,
  updateSimulationJobStatus,
  checkHealth,
  getModelPerformance,
  getStores,
  getProducts,
  getCurrentInventory,
  predictSingle,
  getFeatureImportance,
  getAllPredictions,
  calculateKPIs,
  generateAlerts,
};
