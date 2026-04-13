'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSimulationJobs, releaseSimulationJobs, updateSimulationJobStatus } from '../lib/apiService';

export default function SimulationList() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDraftIds, setSelectedDraftIds] = useState(new Set());
  const [processing, setProcessing] = useState(false);

  const draftJobs = useMemo(() => jobs.filter((job) => job.status === 'draft'), [jobs]);
  const sortedJobs = useMemo(() => {
    // Keep queue readable by showing jobs in natural serial order.
    return [...jobs].sort((a, b) => Number(a.id || 0) - Number(b.id || 0));
  }, [jobs]);

  const loadJobs = async () => {
    try {
      setLoading(true);
      const data = await getSimulationJobs();
      setJobs(data.jobs || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
  }, []);

  const toggleSelect = (jobId) => {
    setSelectedDraftIds((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      return next;
    });
  };

  const toggleSelectAllDrafts = () => {
    if (draftJobs.length === 0) return;
    const allSelected = draftJobs.every((job) => selectedDraftIds.has(job.id));
    if (allSelected) {
      setSelectedDraftIds(new Set());
      return;
    }
    setSelectedDraftIds(new Set(draftJobs.map((job) => job.id)));
  };

  const handleReleaseSelected = async () => {
    if (selectedDraftIds.size === 0) {
      alert('Select at least one draft job to send.');
      return;
    }

    try {
      setProcessing(true);
      const jobIds = Array.from(selectedDraftIds);
      const result = await releaseSimulationJobs(jobIds);
      alert(`✅ Sent ${result.released} job(s) to AnyLogic queue.`);
      setSelectedDraftIds(new Set());
      await loadJobs();
    } catch (err) {
      alert(`❌ Failed to send jobs: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleCancelSelected = async () => {
    if (selectedDraftIds.size === 0) {
      alert('Select at least one draft job to cancel.');
      return;
    }

    if (!confirm(`Cancel ${selectedDraftIds.size} selected draft job(s)?`)) {
      return;
    }

    try {
      setProcessing(true);
      const jobIds = Array.from(selectedDraftIds);
      await Promise.all(jobIds.map((jobId) => updateSimulationJobStatus(jobId, 'cancelled')));
      alert('✅ Selected draft jobs were cancelled.');
      setSelectedDraftIds(new Set());
      await loadJobs();
    } catch (err) {
      alert(`❌ Failed to cancel selected jobs: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const badgeClass = (status) => {
    if (status === 'draft') return 'bg-slate-100 text-slate-700';
    if (status === 'queued') return 'bg-blue-100 text-blue-700';
    if (status === 'pulled') return 'bg-purple-100 text-purple-700';
    if (status === 'processed') return 'bg-green-100 text-green-700';
    if (status === 'cancelled') return 'bg-gray-200 text-gray-700';
    return 'bg-gray-100 text-gray-700';
  };

  if (loading) {
    return <div className="text-muted-foreground">Loading simulation jobs...</div>;
  }

  if (error) {
    return (
      <div className="p-4 bg-destructive/10 text-destructive rounded-lg">
        Error loading simulation jobs: {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Simulation List</h2>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadJobs}
            disabled={processing}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            Refresh
          </button>
          <button
            onClick={toggleSelectAllDrafts}
            disabled={processing || draftJobs.length === 0}
            className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-muted transition-colors disabled:opacity-50"
          >
            Select All Drafts
          </button>
          <button
            onClick={handleCancelSelected}
            disabled={processing || selectedDraftIds.size === 0}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg text-sm hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            Cancel Selected
          </button>
          <button
            onClick={handleReleaseSelected}
            disabled={processing || selectedDraftIds.size === 0}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            Send Selected to AnyLogic
          </button>
        </div>
      </div>

      <div className="text-sm text-muted-foreground">
        Drafts: {draftJobs.length} | Selected: {selectedDraftIds.size} | Total jobs: {jobs.length}
      </div>

      {jobs.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
          No simulation jobs yet. Use Add to Sim from Predictions or Shipments.
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Select</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">ID</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Day</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Type</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Store</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Category</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Qty</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Source</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {sortedJobs.map((job) => {
                  const isDraft = job.status === 'draft';
                  return (
                    <tr key={job.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-4 text-sm">
                        {isDraft ? (
                          <input
                            type="checkbox"
                            checked={selectedDraftIds.has(job.id)}
                            onChange={() => toggleSelect(job.id)}
                          />
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-sm text-foreground">#{job.id}</td>
                      <td className="py-3 px-4 text-sm text-foreground">{job.simulation_day}</td>
                      <td className="py-3 px-4 text-sm text-foreground">{job.job_type}</td>
                      <td className="py-3 px-4 text-sm text-foreground">{job.store}</td>
                      <td className="py-3 px-4 text-sm text-foreground">{job.category}</td>
                      <td className="py-3 px-4 text-sm text-foreground">{job.quantity}</td>
                      <td className="py-3 px-4 text-sm text-foreground">{job.source}</td>
                      <td className="py-3 px-4 text-sm">
                        <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${badgeClass(job.status)}`}>
                          {job.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
