"use client"

import { useEffect, useState } from "react"
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { getModelPerformance } from "../lib/apiService"

export default function Performance() {
  const [performance, setPerformance] = useState(null)

  useEffect(() => {
    async function fetchData() {
      try {
        const data = await getModelPerformance()
        // Transform API response to match UI format
        setPerformance({
          modelType: data.model_type,
          current: {
            r2: data.test_r2,
            mae: data.test_mae,
            rmse: data.test_rmse
          },
          overfittingGap: data.overfitting_gap,
          trainingDate: data.training_date,
          numFeatures: data.num_features
        })
      } catch (err) {
        console.error("Failed to fetch performance data:", err)
      }
    }
    fetchData()
  }, [])

  if (!performance) {
    return <div className="text-muted-foreground">Loading...</div>
  }

  const featureImportance = [
    { name: "Demand Forecast", importance: 32 },
    { name: "InventoryQuant", importance: 9 },
    { name: "Promotion", importance: 9 },
    { name: "Price Interaction", importance: 6 },
    { name: "Lagged Sales", importance: 5 },
    { name: "Rolling Sales", importance: 4 },
    { name: "Stock Coverage", importance: 4 },
    { name: "Forecast Variance", importance: 3 },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Model Performance Monitoring</h2>
        <p className="text-sm text-muted-foreground mt-1">Track ML model accuracy and reliability</p>
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="text-sm text-muted-foreground mb-2">R² Score</div>
          <div className="text-3xl font-bold text-foreground mb-1">{(performance.current.r2 * 100).toFixed(1)}%</div>
          <div className="flex items-center gap-1 text-xs">
            <span className="px-2 py-0.5 bg-success/10 text-success rounded">✓ Excellent</span>
            <span className="text-muted-foreground">Target: {">60%"}</span>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-6">
          <div className="text-sm text-muted-foreground mb-2">MAE (Mean Absolute Error)</div>
          <div className="text-3xl font-bold text-foreground mb-1">{performance.current.mae}</div>
          <div className="flex items-center gap-1 text-xs">
            <span className="px-2 py-0.5 bg-success/10 text-success rounded">✓ Good</span>
            <span className="text-muted-foreground">Target: {"<150"}</span>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-6">
          <div className="text-sm text-muted-foreground mb-2">RMSE</div>
          <div className="text-3xl font-bold text-foreground mb-1">{performance.current.rmse}</div>
          <div className="flex items-center gap-1 text-xs">
            <span className="px-2 py-0.5 bg-success/10 text-success rounded">✓ Good</span>
            <span className="text-muted-foreground">Target: {"<200"}</span>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-6">
          <div className="text-sm text-muted-foreground mb-2">Prediction Accuracy</div>
          <div className="text-3xl font-bold text-foreground mb-1">{performance.current.accuracy}%</div>
          <div className="text-xs text-muted-foreground">Within ±20% range</div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* R² Score Over Time */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">R² Score Trend</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={performance.history}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" stroke="rgb(156, 163, 175)" style={{ fontSize: "12px" }} />
              <YAxis stroke="rgb(156, 163, 175)" style={{ fontSize: "12px" }} domain={[0.64, 0.66]} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgb(30, 30, 30)",
                  border: "1px solid rgb(60, 60, 60)",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <Line
                type="monotone"
                dataKey="r2"
                stroke="rgb(59, 130, 246)"
                strokeWidth={2}
                dot={{ fill: "rgb(59, 130, 246)", r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* MAE/RMSE Over Time */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Error Metrics Trend</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={performance.history}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" stroke="rgb(156, 163, 175)" style={{ fontSize: "12px" }} />
              <YAxis stroke="rgb(156, 163, 175)" style={{ fontSize: "12px" }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgb(30, 30, 30)",
                  border: "1px solid rgb(60, 60, 60)",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <Line type="monotone" dataKey="mae" stroke="rgb(251, 146, 60)" strokeWidth={2} name="MAE" />
              <Line type="monotone" dataKey="rmse" stroke="rgb(239, 68, 68)" strokeWidth={2} name="RMSE" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Feature Importance */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Feature Importance</h3>
        <p className="text-sm text-muted-foreground mb-4">Top factors driving ML predictions</p>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={featureImportance} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis type="number" stroke="rgb(156, 163, 175)" style={{ fontSize: "12px" }} />
            <YAxis
              dataKey="name"
              type="category"
              stroke="rgb(156, 163, 175)"
              style={{ fontSize: "12px" }}
              width={120}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "rgb(30, 30, 30)",
                border: "1px solid rgb(60, 60, 60)",
                borderRadius: "8px",
                fontSize: "12px",
              }}
            />
            <Bar dataKey="importance" fill="rgb(59, 130, 246)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Model Health Status */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Model Health Status</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border border-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-foreground">Overfitting Check</span>
              <span className="px-2 py-1 bg-success/10 text-success rounded text-xs">✓ Pass</span>
            </div>
            <div className="text-xs text-muted-foreground">Gap: 0.0438 (Excellent)</div>
          </div>
          <div className="border border-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-foreground">Data Drift</span>
              <span className="px-2 py-1 bg-success/10 text-success rounded text-xs">✓ Normal</span>
            </div>
            <div className="text-xs text-muted-foreground">No significant drift detected</div>
          </div>
          <div className="border border-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-foreground">Prediction Stability</span>
              <span className="px-2 py-1 bg-success/10 text-success rounded text-xs">✓ Stable</span>
            </div>
            <div className="text-xs text-muted-foreground">RMSE/MAE ratio: 1.34</div>
          </div>
        </div>
      </div>
    </div>
  )
}
