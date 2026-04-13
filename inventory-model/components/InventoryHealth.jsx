"use client"

import React, { useEffect, useState } from "react"
import { getBatchPredictions } from "../lib/apiService"

export default function InventoryHealth() {
  const [inventory, setInventory] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)
        const predData = await getBatchPredictions()

        const transformedData = (predData.predictions || []).map((item) => {
          const currentStock = Number(item.current_inventory || 0)
          const demandForecast = Number(item.demand_forecast || 0)
          return {
            store: item.store,
            category: item.category,
            currentStock: Math.round(currentStock),
            demandForecast: Math.round(demandForecast),
            stockCoverage: demandForecast > 0 ? (currentStock / (demandForecast / 7)).toFixed(1) : "-",
            status: item.risk_level || "low",
          }
        })

        setInventory({ heatmap: transformedData })
      } catch (err) {
        console.error("Failed to fetch inventory data:", err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-8 w-64 bg-muted animate-pulse rounded"></div>
            <div className="h-4 w-96 bg-muted animate-pulse rounded"></div>
          </div>
        </div>
        <div className="grid grid-cols-5 gap-3">
          {[...Array(25)].map((_, i) => (
            <div key={i} className="h-32 bg-card border border-border rounded-xl animate-pulse"></div>
          ))}
        </div>
      </div>
    )
  }

  if (!inventory) {
    return <div className="text-muted-foreground">No inventory data available</div>
  }

  const stores = ["Store A", "Store B", "Store C", "Store D", "Store E"]
  const categories = ["Groceries", "Electronics", "Furniture", "Clothing", "Toys"]

  const getStatusColor = (status) => {
    switch (status) {
      case "good":
      case "low":
        return "bg-success/20 border-success/40 hover:bg-success/30"
      case "warning":
      case "medium":
        return "bg-warning/20 border-warning/40 hover:bg-warning/30"
      case "critical":
      case "high":
        return "bg-critical/20 border-critical/40 hover:bg-critical/30"
      default:
        return "bg-muted border-border"
    }
  }

  const getStatusLabel = (status) => {
    switch (status) {
      case "good":
      case "low":
        return "🟢 Good"
      case "warning":
      case "medium":
        return "🟡 Warning"
      case "critical":
      case "high":
        return "🔴 Critical"
      default:
        return "Unknown"
    }
  }

  const getCell = (store, category) => {
    return inventory.heatmap.find((item) => item.store === store && item.category === category)
  }

  const healthyCount = inventory.heatmap.filter((item) => item.status === "low" || item.status === "good").length
  const warningCount = inventory.heatmap.filter((item) => item.status === "medium" || item.status === "warning").length
  const criticalCount = inventory.heatmap.filter((item) => item.status === "high" || item.status === "critical").length

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Inventory Health</h2>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-success/20 rounded-lg flex items-center justify-center text-xl">🟢</div>
            <div>
              <div className="text-2xl font-bold text-foreground">{healthyCount}</div>
              <div className="text-sm text-muted-foreground">Healthy</div>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-warning/20 rounded-lg flex items-center justify-center text-xl">🟡</div>
            <div>
              <div className="text-2xl font-bold text-foreground">{warningCount}</div>
              <div className="text-sm text-muted-foreground">Warning</div>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-critical/20 rounded-lg flex items-center justify-center text-xl">🔴</div>
            <div>
              <div className="text-2xl font-bold text-foreground">{criticalCount}</div>
              <div className="text-sm text-muted-foreground">Critical</div>
            </div>
          </div>
        </div>
      </div>

      {/* Heatmap */}
      <div className="bg-card border border-border rounded-xl p-6 overflow-x-auto">
        <h3 className="text-lg font-semibold text-foreground mb-4">Status Heatmap</h3>
        <div className="inline-block min-w-full">
          <div className="grid gap-2" style={{ gridTemplateColumns: `150px repeat(${categories.length}, 1fr)` }}>
            {/* Header */}
            <div></div>
            {categories.map((category) => (
              <div key={category} className="text-center py-3 px-2 text-sm font-medium text-muted-foreground">
                {category}
              </div>
            ))}

            {/* Rows */}
            {stores.map((store) => (
              <React.Fragment key={store}>
                <div className="flex items-center py-3 px-2 text-sm font-medium text-foreground">
                  {store}
                </div>
                {categories.map((category) => {
                  const cell = getCell(store, category)
                  return (
                    <div
                      key={`${store}-${category}`}
                      className={`border rounded-lg p-4 flex items-center justify-center transition-all cursor-pointer ${
                        cell ? getStatusColor(cell.status) : "bg-muted border-border"
                      }`}
                      title={cell ? getStatusLabel(cell.status) : "No data"}
                    >
                      <span className="text-xs font-medium">{cell ? getStatusLabel(cell.status) : "—"}</span>
                    </div>
                  )
                })}
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="mt-6 flex items-center gap-6 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-success/20 border border-success/40 rounded"></div>
            <span>Healthy (3-8 weeks)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-warning/20 border border-warning/40 rounded"></div>
            <span>Warning ({"<3 or >10 weeks"})</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-critical/20 border border-critical/40 rounded"></div>
            <span>Critical ({"<1 or >15 weeks"})</span>
          </div>
        </div>
      </div>
    </div>
  )
}
