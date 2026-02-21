// src/pages/Dashboards/DatavantDashboard.jsx
// Admin dashboard: Process Type × Resource matrix for Datavant client
import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_BACKEND_URL;

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

const fmt = (n) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (n) => (n || 0).toLocaleString('en-US');

export default function DatavantDashboard() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const getAuthHeaders = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
  });

  const fetchDashboard = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(`${API_URL}/datavant-daily-allocations/admin/dashboard`, {
        ...getAuthHeaders(),
        params: { month, year }
      });
      setData(res.data.data || []);
      setSummary(res.data.summary || null);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDashboard(); }, [month, year]);

  // Get unique process types and resources
  const processTypes = useMemo(() => {
    return [...new Set(data.map(r => r.process_type))].sort();
  }, [data]);

  const resources = useMemo(() => {
    const map = new Map();
    data.forEach(r => {
      if (!map.has(r.resource_email)) {
        map.set(r.resource_email, r.resource_name);
      }
    });
    return [...map.entries()]
      .map(([email, name]) => ({ email, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  // Build matrix: resource_email → process_type → { cases, payout, billing_amount, flatrate }
  const matrix = useMemo(() => {
    const m = {};
    data.forEach(r => {
      if (!m[r.resource_email]) m[r.resource_email] = {};
      m[r.resource_email][r.process_type] = {
        cases: r.cases,
        payout: r.payout,
        billing_amount: r.billing_amount,
        flatrate: r.flatrate
      };
    });
    return m;
  }, [data]);

  // Totals per process type
  const processTotals = useMemo(() => {
    const totals = {};
    processTypes.forEach(pt => {
      totals[pt] = { cases: 0, payout: 0, billing_amount: 0 };
      data.filter(r => r.process_type === pt).forEach(r => {
        totals[pt].cases += r.cases;
        totals[pt].payout += r.payout;
        totals[pt].billing_amount += r.billing_amount;
      });
    });
    return totals;
  }, [data, processTypes]);

  // Row totals per resource
  const resourceTotals = useMemo(() => {
    const totals = {};
    resources.forEach(res => {
      const rows = data.filter(r => r.resource_email === res.email);
      totals[res.email] = {
        cases: rows.reduce((s, r) => s + r.cases, 0),
        payout: rows.reduce((s, r) => s + r.payout, 0),
        billing_amount: rows.reduce((s, r) => s + r.billing_amount, 0)
      };
    });
    return totals;
  }, [data, resources]);

  const exportCSV = () => {
    if (!data.length) return;
    const rows = [
      ['Resource', 'Process Type', 'Cases', 'Flat Rate', 'Payout (Resource)', 'Billing Amount (Client)']
    ];
    data.forEach(r => {
      rows.push([r.resource_name, r.process_type, r.cases, r.flatrate, r.payout.toFixed(2), r.billing_amount.toFixed(2)]);
    });
    rows.push([]);
    rows.push(['TOTAL', '', summary?.total_cases || 0, '', (summary?.total_payout || 0).toFixed(2), (summary?.total_billing || 0).toFixed(2)]);
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `datavant-dashboard-${MONTHS[month - 1]}-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Datavant Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Process type breakdown by resource</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
          >
            {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
          >
            {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button
            onClick={exportCSV}
            disabled={!data.length}
            className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg border p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total Cases</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{fmtInt(summary.total_cases)}</p>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Resource Payout</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">${fmt(summary.total_payout)}</p>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Client Billing</p>
            <p className="text-2xl font-bold text-green-600 mt-1">${fmt(summary.total_billing)}</p>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Active Resources</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{summary.resource_count}</p>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center items-center h-32 text-gray-500">Loading...</div>
      ) : data.length === 0 ? (
        <div className="bg-white rounded-lg border p-8 text-center text-gray-500">
          <p className="font-medium">No Datavant allocations for {MONTHS[month - 1]} {year}</p>
          <p className="text-sm mt-1">Allocations will appear here once resources log their work.</p>
        </div>
      ) : (
        <>
          {/* Main Matrix Table */}
          <div className="bg-white rounded-lg border overflow-hidden">
            <div className="px-4 py-3 bg-purple-700 text-white">
              <h2 className="text-sm font-semibold">
                Process Type × Resource Matrix — {MONTHS[month - 1]} {year}
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs" style={{ minWidth: 'max-content' }}>
                <thead>
                  <tr className="bg-gray-100 border-b">
                    <th className="px-3 py-2 text-left font-semibold text-gray-700 border-r sticky left-0 bg-gray-100 z-10 min-w-[150px]">
                      Resource
                    </th>
                    {processTypes.map(pt => (
                      <th key={pt} colSpan={3} className="px-3 py-2 text-center font-semibold text-purple-700 border-r">
                        {pt}
                      </th>
                    ))}
                    <th colSpan={3} className="px-3 py-2 text-center font-semibold text-gray-700">
                      Total
                    </th>
                  </tr>
                  <tr className="bg-gray-50 border-b text-[11px]">
                    <th className="px-3 py-1.5 text-left border-r sticky left-0 bg-gray-50 z-10"></th>
                    {processTypes.map(pt => (
                      <React.Fragment key={pt}>
                        <th className="px-2 py-1.5 text-center text-gray-600 border-r w-[70px]">Cases</th>
                        <th className="px-2 py-1.5 text-center text-blue-600 border-r w-[80px]">Payout</th>
                        <th className="px-2 py-1.5 text-center text-green-600 border-r w-[80px]">Billing</th>
                      </React.Fragment>
                    ))}
                    <th className="px-2 py-1.5 text-center text-gray-600 border-r w-[70px]">Cases</th>
                    <th className="px-2 py-1.5 text-center text-blue-600 border-r w-[80px]">Payout</th>
                    <th className="px-2 py-1.5 text-center text-green-600 w-[80px]">Billing</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {resources.map((res, idx) => {
                    const rowTotal = resourceTotals[res.email] || {};
                    return (
                      <tr key={res.email} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className={`px-3 py-2 font-medium text-gray-800 border-r sticky left-0 z-10 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                          {res.name}
                        </td>
                        {processTypes.map(pt => {
                          const cell = matrix[res.email]?.[pt];
                          return (
                            <React.Fragment key={pt}>
                              <td className="px-2 py-2 text-center border-r text-gray-700">
                                {cell ? fmtInt(cell.cases) : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="px-2 py-2 text-center border-r text-blue-700">
                                {cell ? `$${fmt(cell.payout)}` : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="px-2 py-2 text-center border-r text-green-700">
                                {cell ? `$${fmt(cell.billing_amount)}` : <span className="text-gray-300">—</span>}
                              </td>
                            </React.Fragment>
                          );
                        })}
                        <td className="px-2 py-2 text-center border-r font-semibold text-gray-800">
                          {fmtInt(rowTotal.cases)}
                        </td>
                        <td className="px-2 py-2 text-center border-r font-semibold text-blue-700">
                          ${fmt(rowTotal.payout)}
                        </td>
                        <td className="px-2 py-2 text-center font-semibold text-green-700">
                          ${fmt(rowTotal.billing_amount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-200 font-semibold border-t-2 border-gray-400">
                    <td className="px-3 py-2 text-gray-800 border-r sticky left-0 bg-gray-200 z-10">
                      TOTAL
                    </td>
                    {processTypes.map(pt => {
                      const t = processTotals[pt] || {};
                      return (
                        <React.Fragment key={pt}>
                          <td className="px-2 py-2 text-center border-r text-gray-800">{fmtInt(t.cases)}</td>
                          <td className="px-2 py-2 text-center border-r text-blue-700">${fmt(t.payout)}</td>
                          <td className="px-2 py-2 text-center border-r text-green-700">${fmt(t.billing_amount)}</td>
                        </React.Fragment>
                      );
                    })}
                    <td className="px-2 py-2 text-center border-r text-gray-800">{fmtInt(summary?.total_cases)}</td>
                    <td className="px-2 py-2 text-center border-r text-blue-700">${fmt(summary?.total_payout)}</td>
                    <td className="px-2 py-2 text-center text-green-700">${fmt(summary?.total_billing)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Rate Reference */}
          {processTypes.length > 0 && (
            <div className="bg-white rounded-lg border overflow-hidden">
              <div className="px-4 py-3 bg-gray-700 text-white">
                <h2 className="text-sm font-semibold">Rate Reference</h2>
              </div>
              <div className="p-4">
                <table className="text-xs w-auto">
                  <thead>
                    <tr className="text-gray-600 border-b">
                      <th className="pr-8 pb-2 text-left">Process Type</th>
                      <th className="pr-8 pb-2 text-right">Flat Rate (Resource $/case)</th>
                      <th className="pr-8 pb-2 text-right">Total Cases</th>
                      <th className="pr-8 pb-2 text-right">Total Payout</th>
                      <th className="pb-2 text-right">Total Billing</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {processTypes.map(pt => {
                      const ptData = data.find(r => r.process_type === pt);
                      const t = processTotals[pt] || {};
                      return (
                        <tr key={pt}>
                          <td className="pr-8 py-1.5 font-medium text-gray-800">{pt}</td>
                          <td className="pr-8 py-1.5 text-right text-blue-700">${fmt(ptData?.flatrate || 0)}</td>
                          <td className="pr-8 py-1.5 text-right">{fmtInt(t.cases)}</td>
                          <td className="pr-8 py-1.5 text-right text-blue-700">${fmt(t.payout)}</td>
                          <td className="py-1.5 text-right text-green-700">${fmt(t.billing_amount)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
