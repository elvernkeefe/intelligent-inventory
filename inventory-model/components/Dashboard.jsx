"use client"

import { useEffect, useState } from "react"
import { Line, LineChart, ResponsiveContainer } from "recharts"
import { getBatchPredictions, getCurrentInventory } from "../lib/apiService"

export default function Dashboard({ onViewPredictions }) {
  const [kpis, setKpis] = useState(null)
  const [alerts, setAlerts] = useState(null)
  const [predictions, setPredictions] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)
        const [predData, inventoryData] = await Promise.all([getBatchPredictions(), getCurrentInventory()])
        const predictionRows = predData.predictions || []
        const inventoryRows = inventoryData.inventory || []

        const invByKey = new Map(
          inventoryRows.map((row) => [`${row.Store}::${row.Category}`, row])
        )

        const withValues = predictionRows.map((row) => ({
          ...row,
          current_inventory: Number(row.current_inventory || 0),
          predicted_order: Number(row.predicted_order || 0),
          confidence: Number(row.confidence || 0),
          risk_level: row.risk_level || "low",
          price: Number(invByKey.get(`${row.store}::${row.category}`)?.Price || 0),
          demand_forecast: Number(invByKey.get(`${row.store}::${row.category}`)?.Demand_Forecast || 0),
        }))

        const totalPredictedOrders = withValues.reduce((sum, row) => sum + row.predicted_order, 0)
        const predictedSalesValue = withValues.reduce(
          (sum, row) => sum + row.predicted_order * Number(row.price || 0),
          0
        )
        const hasSalesValueData = withValues.some((row) => Number(row.price || 0) > 0)
        const atRiskRows = withValues.filter((row) => row.risk_level === "high")
        
        // Critical items align with red/high risk in Predictions & Inventory Health.
        const criticalAlerts = atRiskRows.map((row, idx) => ({
          id: `high-risk-${row.store}-${row.category}-${idx}`,
          type: "high",
          store: row.store,
          category: row.category,
          message: `High risk for ${row.store} - ${row.category}: order ${Math.round(row.predicted_order)} units`,
          details: {
            currentInventory: Math.round(row.current_inventory),
            demandForecast: Math.round(row.demand_forecast || 0),
            recommendedOrder: Math.round(row.predicted_order),
          },
        }))
        
        // Format for UI
        setKpis({
          totalOrders: {
            value: totalPredictedOrders,
            trend: "up"
          },
          predictedSales: {
            value: predictedSalesValue,
            trend: "up",
            available: hasSalesValueData,
          },
          inventoryAtRisk: {
            value: atRiskRows.reduce((sum, row) => sum + row.current_inventory, 0),
            criticalStores: atRiskRows.length,
            trend: "down"
          }
        })
        
        setAlerts({
          critical: criticalAlerts,
          warning: [],
          info: []
        })
        
        // Generate predictions from inventory
        const predictionsList = withValues.map((item, idx) => ({
          id: idx + 1,
          store: item.store,
          category: item.category,
          currentInventory: Math.round(item.current_inventory),
          predictedOrder: Math.round(item.predicted_order),
          confidence: item.confidence,
          riskLevel: item.risk_level,
        }))
        
        setPredictions({
          predictions: predictionsList
        })
        
        setError(null)
      } catch (err) {
        console.error("Failed to fetch dashboard data:", err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  if (loading) {
    return <div className="text-muted-foreground">Loading dashboard data...</div>
  }

  if (error) {
    return (
      <div className="bg-critical/10 border border-critical text-critical p-4 rounded-lg">
        <strong>Error:</strong> {error}
      </div>
    )
  }

  if (!kpis || !alerts || !predictions) {
    return <div className="text-muted-foreground">No data available</div>
  }

  const sparklineData = [
    { value: 10800 },
    { value: 11200 },
    { value: 11500 },
    { value: 11800 },
    { value: 12100 },
    { value: 12543 },
  ]

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex justify-between items-start mb-4">
            <div className="text-sm text-muted-foreground">Total Orders</div>
          </div>
          <div className="text-3xl font-bold text-foreground mb-2">{kpis.totalOrders.value.toLocaleString()}</div>
          <ResponsiveContainer width="100%" height={40}>
            <LineChart data={sparklineData}>
              <Line type="monotone" dataKey="value" stroke="rgb(59, 130, 246)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex justify-between items-start mb-4">
            <div className="text-sm text-muted-foreground">Predicted Sales</div>
          </div>
          <div className="text-3xl font-bold text-foreground mb-2">
            {kpis.predictedSales.available ? `$${(kpis.predictedSales.value / 1000).toFixed(1)}K` : "N/A"}
          </div>
          <ResponsiveContainer width="100%" height={40}>
            <LineChart data={sparklineData}>
              <Line type="monotone" dataKey="value" stroke="rgb(34, 197, 94)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex justify-between items-start mb-4">
            <div className="text-sm text-muted-foreground">At Risk Inventory</div>
            <div className="text-xs px-2 py-1 rounded bg-warning/10 text-warning">
              ⚠️ {kpis.inventoryAtRisk.criticalStores} stores
            </div>
          </div>
          <div className="text-3xl font-bold text-foreground mb-2">
            ${(kpis.inventoryAtRisk.value / 1000).toFixed(1)}K
          </div>
          <ResponsiveContainer width="100%" height={40}>
            <LineChart data={sparklineData}>
              <Line type="monotone" dataKey="value" stroke="rgb(251, 146, 60)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Critical Alerts */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">🔴 High Risk Items ({alerts.critical.length})</h2>
        <div className="space-y-3">
          {alerts.critical.length === 0 && (
            <div className="text-sm text-muted-foreground">No high-risk items right now.</div>
          )}
          {alerts.critical.map((alert) => (
            <div key={alert.id} className="bg-critical/5 border border-critical/20 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-foreground">
                      {alert.store} - {alert.category}
                    </span>
                    <span className="text-xs px-2 py-0.5 bg-critical/20 text-critical rounded">high</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{alert.message}</p>
                  {alert.details && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      Current: {alert.details.currentInventory} units | Demand Forecast: {alert.details.demandForecast} units |
                      Action: Order {alert.details.recommendedOrder} units
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Predictions Preview */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">📊 Ordering Predictions</h2>
          <button onClick={onViewPredictions} className="text-sm text-primary hover:underline">View All →</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Store</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Category</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Current</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Predicted</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Risk</th>
              </tr>
            </thead>
            <tbody>
              {predictions.predictions.slice(0, 5).map((pred) => (
                <tr key={pred.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                  <td className="py-3 px-4 text-sm text-foreground">{pred.store}</td>
                  <td className="py-3 px-4 text-sm text-foreground">{pred.category}</td>
                  <td className="py-3 px-4 text-sm text-muted-foreground">{pred.currentInventory}</td>
                  <td className="py-3 px-4">
                    <span
                      className={`text-sm font-medium ${
                        pred.riskLevel === "high"
                          ? "text-critical"
                          : pred.riskLevel === "medium"
                            ? "text-warning"
                            : "text-success"
                      }`}
                    >
                      {pred.predictedOrder}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`text-xs px-3 py-1 rounded-full ${
                        pred.riskLevel === "high"
                          ? "bg-critical/10 text-critical"
                          : pred.riskLevel === "medium"
                            ? "bg-warning/10 text-warning"
                            : "bg-success/10 text-success"
                      }`}
                    >
                      {pred.riskLevel}
                    </span>
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
