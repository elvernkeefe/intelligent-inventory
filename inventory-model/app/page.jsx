"use client"

import { useState } from "react"
import AnyLogicSimulation from "../components/AnyLogicSimulation"
import Dashboard from "../components/Dashboard"
import InventoryHealth from "../components/InventoryHealth"
import InventoryHistory from "../components/InventoryHistory"
import Orders from "../components/Orders"
import Predictions from "../components/Predictions"
import Shipments from "../components/Shipments"
import SimulationList from "../components/SimulationList"

export default function Home() {
  const [activeTab, setActiveTab] = useState("dashboard")

  const tabs = [
    { id: "dashboard", label: "Overview", icon: "📊" },
    { id: "predictions", label: "Predictions", icon: "📦" },
    { id: "orders", label: "Orders", icon: "🚚" },
    { id: "shipments", label: "Shipments", icon: "📤" },
    { id: "simulation-list", label: "Simulation List", icon: "🧪" },
    { id: "simulation", label: "Simulation", icon: "🖥️" },
    { id: "history", label: "History", icon: "📜" },
    { id: "inventory", label: "Inventory", icon: "💹" },
  ]

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                <span className="text-xl">📦</span>
              </div>
              <div>
                <h1 className="text-xl font-semibold text-foreground">Inventory Intelligence</h1>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button className="relative p-2 hover:bg-muted rounded-lg transition-colors">
                <span className="text-xl">🔔</span>
                <span className="absolute top-1 right-1 w-2 h-2 bg-critical rounded-full"></span>
              </button>
              <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-sm font-medium">
                A
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="border-b border-border bg-card">
        <div className="container mx-auto px-6">
          <div className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium transition-colors relative ${
                  activeTab === tab.id ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
                {activeTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"></div>}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        {activeTab === "dashboard" && <Dashboard onViewPredictions={() => setActiveTab("predictions")} />}
        {activeTab === "predictions" && <Predictions />}
        {activeTab === "orders" && <Orders />}
        {activeTab === "shipments" && <Shipments />}
        {activeTab === "simulation-list" && <SimulationList />}
        {activeTab === "simulation" && <AnyLogicSimulation />}
        {activeTab === "history" && <InventoryHistory />}
        {activeTab === "inventory" && <InventoryHealth />}
      </main>
    </div>
  )
}
