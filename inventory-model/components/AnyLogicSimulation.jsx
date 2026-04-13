"use client"

import { useMemo, useState } from "react"

export default function AnyLogicSimulation() {
  const [reloadKey, setReloadKey] = useState(0)

  const simulationUrl = useMemo(() => {
    const raw = process.env.NEXT_PUBLIC_ANYLOGIC_SIMULATION_URL || ""
    return raw.trim()
  }, [])

  if (!simulationUrl) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-foreground">Simulation</h2>
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="text-sm text-muted-foreground">
            AnyLogic Cloud URL is not configured.
          </div>
          <div className="mt-3 text-sm text-foreground">
            Set NEXT_PUBLIC_ANYLOGIC_SIMULATION_URL in inventory-model/.env.local and restart the frontend.
          </div>
          <pre className="mt-4 p-3 text-xs bg-muted rounded border border-border overflow-x-auto">NEXT_PUBLIC_ANYLOGIC_SIMULATION_URL=https://cloud.anylogic.com/model/f0307b74-89c7-440d-b756-c5f7555dbab9</pre>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Simulation</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setReloadKey((v) => v + 1)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
          >
            Reload
          </button>
          <a
            href={simulationUrl}
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-muted transition-colors"
          >
            Open in New Tab
          </a>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-3">
        <iframe
          key={reloadKey}
          src={simulationUrl}
          title="AnyLogic Simulation"
          className="w-full h-[75vh] rounded-lg"
          allowFullScreen
        />
      </div>
    </div>
  )
}
