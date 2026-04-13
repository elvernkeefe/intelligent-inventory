"use client"

import { useEffect, useState } from "react"
import { addSimulationJob, approveOrder, getBatchPredictions, getOrders } from "../lib/apiService"

export default function Predictions() {
  const [predictions, setPredictions] = useState(null)
  const [sortField, setSortField] = useState(null)
  const [sortDirection, setSortDirection] = useState("asc")
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [approvingId, setApprovingId] = useState(null)
  const [simAddingId, setSimAddingId] = useState(null)
  const [pendingOrders, setPendingOrders] = useState(new Set())

  const loadPredictions = async () => {
    try {
      // Fetch both predictions and pending orders
      const [predData, ordersData] = await Promise.all([
        getBatchPredictions(),
        getOrders('pending')
      ])
      
      // Create set of pending orders (store-category combinations)
      const pending = new Set(
        (ordersData.orders || []).map(order => `${order.store}-${order.category}`)
      )
      setPendingOrders(pending)
      
      // Transform ML predictions to UI format
      const transformedData = predData.predictions.map((pred, idx) => ({
        id: idx + 1,
        store: pred.store,
        category: pred.category,
        currentStock: pred.current_inventory,
        predictedOrder: pred.predicted_order,
        confidence: pred.confidence,
        priority: pred.risk_level,
        expectedDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        predictionInterval: {
          lower: pred.prediction_interval_lower,
          upper: pred.prediction_interval_upper
        }
      }))
      
      setPredictions(transformedData)
      setError(null)
    } catch (err) {
      console.error("Failed to fetch predictions:", err)
      setError(err.message)
      setPendingOrders(new Set()) // Reset on error
    }
  }

  const isAlreadyOrdered = (store, category) => {
    return pendingOrders.has(`${store}-${category}`)
  }

  const handleRefresh = async () => {
    setLoading(true)
    await loadPredictions()
    setLoading(false)
  }

  const handleApprove = async (prediction) => {
    if (!confirm(`Approve order of ${prediction.predictedOrder} units for ${prediction.store} - ${prediction.category}?`)) {
      return;
    }
    
    try {
      setApprovingId(prediction.id);
      await approveOrder(
        prediction.store,
        prediction.category,
        prediction.predictedOrder
      );
      
      alert(`✅ Order approved successfully!\n\n${prediction.predictedOrder} units for ${prediction.store} - ${prediction.category}\n\nCheck Orders page to track delivery.`);
      
      // Refresh predictions to reflect new status
      await loadPredictions();
    } catch (err) {
      alert('❌ Failed to approve order: ' + err.message);
    } finally {
      setApprovingId(null);
    }
  }

  const handleAddToSimulation = async (prediction) => {
    const dayRaw = prompt(
      `Add INBOUND simulation job for ${prediction.store} - ${prediction.category}.\n\nSimulation day:`,
      "1"
    )

    if (dayRaw === null) return

    const simulationDay = Number.parseInt(dayRaw, 10)
    if (!Number.isInteger(simulationDay) || simulationDay < 0) {
      alert("Simulation day must be a non-negative integer.")
      return
    }

    try {
      setSimAddingId(prediction.id)

      const response = await addSimulationJob({
        store: prediction.store,
        category: prediction.category,
        job_type: "INBOUND",
        quantity: prediction.predictedOrder,
        simulation_day: simulationDay,
        initial_status: "draft",
        source: "prediction",
        source_ref: `prediction:${prediction.store}:${prediction.category}:${prediction.id}`,
        notes: "Added from Predictions page",
      })

      alert(
        `✅ Added to simulation draft list\n\nJob #${response.job.id}: INBOUND ${response.job.quantity} units\n${response.job.store} - ${response.job.category} on day ${response.job.simulation_day}\n\nGo to Simulation List to review and send jobs to AnyLogic.`
      )
    } catch (err) {
      if (err?.status === 409 || String(err?.message || '').includes('already exists')) {
        alert('ℹ️ This prediction is already in the Simulation List as an active draft/queued job.')
      } else {
        alert(`❌ Failed to add simulation job: ${err.message}`)
      }
    } finally {
      setSimAddingId(null)
    }
  }

  useEffect(() => {
    loadPredictions()
  }, [])

  if (error) {
    return (
      <div className="space-y-4">
        <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start gap-3">
            <span className="text-2xl">❌</span>
            <div className="flex-1">
              <h3 className="font-semibold text-red-900">Failed to Load Predictions</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
              <button
                onClick={handleRefresh}
                className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition-colors"
              >
                🔄 Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!predictions) {
    return <div className="text-muted-foreground">Loading ML predictions...</div>
  }

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDirection("asc")
    }
  }

  const sortedPredictions = [...predictions].sort((a, b) => {
    if (!sortField) return 0
    const aVal = a[sortField]
    const bVal = b[sortField]
    return sortDirection === "asc" ? aVal - bVal : bVal - aVal
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Ordering Predictions</h2>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={handleRefresh}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading}
          >
            {loading ? 'Refreshing...' : '🔄 Refresh Predictions'}
          </button>
          <button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 transition-colors">
            Approve All High Confidence
          </button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Store</th>
                <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Category</th>
                <th
                  className="text-left py-4 px-6 text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                  onClick={() => handleSort("currentStock")}
                >
                  Current Inventory {sortField === "currentStock" && (sortDirection === "asc" ? "↑" : "↓")}
                </th>
                <th
                  className="text-left py-4 px-6 text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                  onClick={() => handleSort("predictedOrder")}
                >
                  Predicted Order {sortField === "predictedOrder" && (sortDirection === "asc" ? "↑" : "↓")}
                </th>
                <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Risk Level</th>
                <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody>
              {sortedPredictions.map((pred, idx) => (
                <tr
                  key={pred.id}
                  className={`border-t border-border hover:bg-muted/30 transition-colors ${
                    pred.priority === "high" ? "bg-critical/5" : ""
                  }`}
                >
                  <td className="py-4 px-6 text-sm font-medium text-foreground">{pred.store}</td>
                  <td className="py-4 px-6 text-sm text-foreground">{pred.category}</td>
                  <td className="py-4 px-6 text-sm text-muted-foreground">{pred.currentStock} units</td>
                  <td className="py-4 px-6">
                    <span
                      className={`text-sm font-semibold ${
                        pred.priority === "high"
                          ? "text-critical"
                          : pred.priority === "medium"
                            ? "text-warning"
                            : "text-success"
                      }`}
                    >
                      {pred.predictedOrder} units
                    </span>
                  </td>
                  <td className="py-4 px-6">
                    <span
                      className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded ${
                        pred.priority === "low"
                          ? "bg-success/10 text-success"
                          : pred.priority === "medium"
                            ? "bg-warning/10 text-warning"
                            : "bg-critical/10 text-critical"
                      }`}
                    >
                      {pred.priority === "low" && "🟢"}
                      {pred.priority === "medium" && "🟡"}
                      {pred.priority === "high" && "🔴"}
                      {pred.priority}
                    </span>
                  </td>
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-2">
                      {isAlreadyOrdered(pred.store, pred.category) ? (
                        <span className="text-sm px-3 py-1.5 bg-green-100 text-green-700 rounded-lg font-medium">
                          ✓ Already Ordered
                        </span>
                      ) : (
                        <button
                          onClick={() => handleApprove(pred)}
                          disabled={approvingId === pred.id}
                          className="text-sm px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {approvingId === pred.id ? 'Approving...' : 'Approve'}
                        </button>
                      )}
                      <button
                        onClick={() => handleAddToSimulation(pred)}
                        disabled={simAddingId === pred.id}
                        className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {simAddingId === pred.id ? 'Adding...' : 'Add to Sim'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
