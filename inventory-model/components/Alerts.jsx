"use client"

import { useEffect, useState } from "react"
import { generateAlerts, getCurrentInventory } from "../lib/apiService"

export default function Alerts() {
  const [alerts, setAlerts] = useState(null)

  useEffect(() => {
    async function fetchData() {
      try {
        const data = await getCurrentInventory()
        const generatedAlerts = generateAlerts(data.inventory)
        
        // Group alerts by type
        const criticalAlerts = generatedAlerts.filter(a => a.type === 'critical')
        const warningAlerts = generatedAlerts.filter(a => a.type === 'warning')
        const infoAlerts = generatedAlerts.filter(a => a.type === 'info')
        
        setAlerts({
          critical: criticalAlerts,
          warnings: warningAlerts,
          info: infoAlerts
        })
      } catch (err) {
        console.error("Failed to fetch alerts:", err)
      }
    }
    fetchData()
  }, [])

  if (!alerts) {
    return <div className="text-muted-foreground">Loading...</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Risk Alerts & Early Warnings</h2>
        <p className="text-sm text-muted-foreground mt-1">Proactive notifications for inventory issues</p>
      </div>

      {/* Critical Alerts */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 bg-critical/20 rounded-lg flex items-center justify-center">🔴</div>
          <h3 className="text-lg font-semibold text-foreground">Critical Alerts ({alerts.critical.length})</h3>
        </div>
        <div className="space-y-3">
          {alerts.critical.map((alert) => (
            <div key={alert.id} className="bg-critical/5 border border-critical/20 rounded-lg p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-semibold text-foreground">
                      {alert.store} - {alert.category}
                    </span>
                    <span className="text-xs px-2 py-1 bg-critical/20 text-critical rounded-full font-medium">
                      {alert.type}
                    </span>
                  </div>
                  <p className="text-sm text-foreground mb-3">{alert.message}</p>
                  {alert.details && (
                    <div className="bg-background/50 rounded-lg p-3 space-y-1">
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">Current Inventory:</span>{" "}
                        {alert.details.currentInventory} units
                      </div>
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">Daily Sales:</span> {alert.details.dailySales}{" "}
                        units
                      </div>
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">Recommended Order:</span>{" "}
                        {alert.details.recommendedOrder} units
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
                  Take Action
                </button>
                <button className="px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-muted transition-colors">
                  View Details
                </button>
                <button className="px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-muted transition-colors">
                  Acknowledge
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Warnings */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 bg-warning/20 rounded-lg flex items-center justify-center">🟡</div>
          <h3 className="text-lg font-semibold text-foreground">Warnings ({alerts.warnings.length})</h3>
        </div>
        <div className="space-y-3">
          {alerts.warnings.map((alert) => (
            <div key={alert.id} className="bg-warning/5 border border-warning/20 rounded-lg p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-semibold text-foreground">
                      {alert.store} - {alert.category}
                    </span>
                    <span className="text-xs px-2 py-1 bg-warning/20 text-warning rounded-full font-medium">
                      {alert.type}
                    </span>
                  </div>
                  <p className="text-sm text-foreground">{alert.message}</p>
                </div>
                <button className="px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-muted transition-colors whitespace-nowrap">
                  Review
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Alert Categories Info */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Alert Categories</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="border border-border rounded-lg p-4">
            <div className="text-sm font-medium text-foreground mb-1">📦 Stockout Risk</div>
            <div className="text-xs text-muted-foreground">Inventory will run out before next delivery</div>
          </div>
          <div className="border border-border rounded-lg p-4">
            <div className="text-sm font-medium text-foreground mb-1">📊 Overstock Risk</div>
            <div className="text-xs text-muted-foreground">Excessive inventory tying up capital</div>
          </div>
          <div className="border border-border rounded-lg p-4">
            <div className="text-sm font-medium text-foreground mb-1">🎯 Forecast Accuracy Drop</div>
            <div className="text-xs text-muted-foreground">Model predictions becoming unreliable</div>
          </div>
          <div className="border border-border rounded-lg p-4">
            <div className="text-sm font-medium text-foreground mb-1">📈 Demand Volatility</div>
            <div className="text-xs text-muted-foreground">Unusual sales pattern changes</div>
          </div>
          <div className="border border-border rounded-lg p-4">
            <div className="text-sm font-medium text-foreground mb-1">🔧 Model Drift</div>
            <div className="text-xs text-muted-foreground">Performance degradation over time</div>
          </div>
          <div className="border border-border rounded-lg p-4">
            <div className="text-sm font-medium text-foreground mb-1">🎉 Promotions</div>
            <div className="text-xs text-muted-foreground">Upcoming events affecting demand</div>
          </div>
        </div>
      </div>
    </div>
  )
}
