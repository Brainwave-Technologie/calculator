// pages/payout/CompleteLoggingBonusPayout.jsx
// Complete Logging Bonus Payout Dashboard
// Bonus per case = 0.65 - slab rate (for complete logging cases only)

import React, { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const COMPLETE_LOGGING_RATE = 0.65;

const CompleteLoggingBonusPayout = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const { resourceData = [], month, year, summaryData } = location.state || {};

  const formatCurrency = (amt) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(amt || 0);
  const formatNumber = (num) => new Intl.NumberFormat('en-US').format(num || 0);

  const monthLabel = useMemo(() => {
    if (!month || !year) return '';
    return new Date(parseInt(year), parseInt(month) - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
  }, [month, year]);

  // Filter to resources who have complete logging cases or a bonus
  const bonusResources = useMemo(() => {
    return (resourceData || [])
      .filter(r => r.completeLoggingCases > 0 || r.completeLoggingBonus > 0)
      .sort((a, b) => b.completeLoggingBonus - a.completeLoggingBonus);
  }, [resourceData]);

  // Totals
  const totals = useMemo(() => {
    const allResources = resourceData || [];
    return {
      totalLoggingCases: allResources.reduce((s, r) => s + (r.loggingCases || 0), 0),
      totalCompleteLoggingCases: allResources.reduce((s, r) => s + (r.completeLoggingCases || 0), 0),
      totalBonus: allResources.reduce((s, r) => s + (r.completeLoggingBonus || 0), 0),
      totalLoggingPayout: allResources.reduce((s, r) => s + (r.loggingPayout || 0), 0),
      totalGrandPayout: allResources.reduce((s, r) => s + (r.totalPayout || 0), 0),
    };
  }, [resourceData]);

  const exportCSV = () => {
    const headers = [
      'Resource', 'Total Logging Cases', 'Complete Logging Cases', 'Total Hours',
      'Avg Cases/Hr', 'Slab Rate', 'Bonus Rate (0.65 - Slab)', 'Bonus Payout'
    ];
    const rows = bonusResources.map(r => [
      r.name,
      r.loggingCases,
      r.completeLoggingCases,
      r.totalHours > 0 ? r.totalHours.toFixed(1) : 0,
      r.avgCasesPerHour,
      `$${r.slabRate.toFixed(2)}`,
      `$${r.bonusRate.toFixed(2)}`,
      r.completeLoggingBonus.toFixed(2)
    ]);
    rows.push(['TOTAL', totals.totalLoggingCases, totals.totalCompleteLoggingCases, '', '', '', '', totals.totalBonus.toFixed(2)]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `complete-logging-bonus-${month}-${year}.csv`;
    a.click();
  };

  if (!location.state || resourceData.length === 0) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow p-8 max-w-md text-center">
          <div className="text-4xl mb-4">📋</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">No Data Available</h2>
          <p className="text-sm text-gray-500 mb-6">
            Please navigate here from the Payout Calculator after data is loaded.
          </p>
          <button
            onClick={() => navigate('/payout/calculator')}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
          >
            Go to Payout Calculator
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-100 min-h-screen">
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-600 to-orange-600 text-white px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded text-sm font-medium"
            >
              ← Back
            </button>
            <div>
              <h1 className="text-base font-bold">Complete Logging Bonus Payout</h1>
              <p className="text-xs text-amber-100">
                {monthLabel} — Bonus = $0.65 − Slab Rate per complete logging case
              </p>
            </div>
          </div>
          <div className="flex items-center gap-6 text-xs">
            <div className="text-right">
              <div className="text-amber-200">Complete Logging Cases</div>
              <div className="text-lg font-bold">{formatNumber(totals.totalCompleteLoggingCases)}</div>
            </div>
            <div className="text-right">
              <div className="text-amber-200">Total Bonus Payout</div>
              <div className="text-lg font-bold text-white">{formatCurrency(totals.totalBonus)}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-3 space-y-3">
        {/* Summary Cards */}
        <div className="grid grid-cols-5 gap-3">
          <div className="bg-white rounded-lg shadow p-3 border-l-4 border-emerald-500">
            <div className="text-xs text-gray-500 uppercase">Total Logging Cases</div>
            <div className="text-xl font-bold text-emerald-700">{formatNumber(totals.totalLoggingCases)}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-3 border-l-4 border-amber-500">
            <div className="text-xs text-gray-500 uppercase">Complete Logging Cases</div>
            <div className="text-xl font-bold text-amber-700">{formatNumber(totals.totalCompleteLoggingCases)}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-3 border-l-4 border-green-500">
            <div className="text-xs text-gray-500 uppercase">Logging Payout (slab)</div>
            <div className="text-xl font-bold text-green-700">{formatCurrency(totals.totalLoggingPayout)}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-3 border-l-4 border-orange-500">
            <div className="text-xs text-gray-500 uppercase">Bonus Payout</div>
            <div className="text-xl font-bold text-orange-700">{formatCurrency(totals.totalBonus)}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-3 border-l-4 border-indigo-500">
            <div className="text-xs text-gray-500 uppercase">Grand Total (log + bonus)</div>
            <div className="text-xl font-bold text-indigo-700">{formatCurrency(totals.totalGrandPayout)}</div>
          </div>
        </div>

        {/* Bonus Calculation Reference */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <div className="text-xs font-semibold text-amber-800 mb-2">Bonus Calculation Logic</div>
          <div className="grid grid-cols-4 gap-2 text-xs">
            {[
              { slab: '0–12.99 cases/hr', slabRate: '$0.50', bonusRate: '$0.15', note: '0.65 − 0.50' },
              { slab: '13–15.99 cases/hr', slabRate: '$0.55', bonusRate: '$0.10', note: '0.65 − 0.55' },
              { slab: '16–20.99 cases/hr', slabRate: '$0.60', bonusRate: '$0.05', note: '0.65 − 0.60' },
              { slab: '21+ cases/hr', slabRate: '$0.65', bonusRate: '$0.00', note: '0.65 − 0.65' },
            ].map((row, i) => (
              <div key={i} className="bg-white rounded border border-amber-200 p-2">
                <div className="font-semibold text-gray-700">{row.slab}</div>
                <div className="text-gray-500 mt-1">Slab Rate: <span className="font-bold text-gray-800">{row.slabRate}</span></div>
                <div className="text-amber-700 mt-0.5">Bonus: <span className="font-bold">{row.bonusRate}</span> <span className="text-gray-400">({row.note})</span></div>
              </div>
            ))}
          </div>
        </div>

        {/* Main Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50">
            <div className="text-sm font-semibold text-gray-700">
              Resources with Complete Logging Cases ({bonusResources.length})
            </div>
            <button
              onClick={exportCSV}
              className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
            >
              Export CSV
            </button>
          </div>

          {bonusResources.length === 0 ? (
            <div className="py-12 text-center text-gray-500">
              <div className="text-3xl mb-2">📭</div>
              <p className="text-sm">No complete logging cases found for this period.</p>
              <p className="text-xs text-gray-400 mt-1">Complete logging cases are detected from project names containing "complete".</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 sticky top-0">
                  <tr>
                    <th className="py-2.5 px-3 text-left text-xs font-semibold text-gray-600 border-b">Sr</th>
                    <th className="py-2.5 px-3 text-left text-xs font-semibold text-gray-600 border-b">Resource</th>
                    <th className="py-2.5 px-3 text-right text-xs font-semibold text-emerald-700 border-b">Total Logging</th>
                    <th className="py-2.5 px-3 text-right text-xs font-semibold text-amber-700 border-b">Complete Logging</th>
                    <th className="py-2.5 px-3 text-right text-xs font-semibold text-blue-700 border-b">Hours Worked</th>
                    <th className="py-2.5 px-3 text-right text-xs font-semibold text-blue-700 border-b">Avg Cases/Hr</th>
                    <th className="py-2.5 px-3 text-right text-xs font-semibold text-gray-600 border-b">Slab Rate</th>
                    <th className="py-2.5 px-3 text-right text-xs font-semibold text-orange-700 border-b">Bonus Rate<br/>(0.65 − Slab)</th>
                    <th className="py-2.5 px-3 text-right text-xs font-semibold text-green-700 border-b">Logging Payout</th>
                    <th className="py-2.5 px-3 text-right text-xs font-semibold text-orange-700 border-b">Bonus Payout</th>
                    <th className="py-2.5 px-3 text-right text-xs font-semibold text-indigo-700 border-b bg-indigo-50">Total Payout</th>
                  </tr>
                </thead>
                <tbody>
                  {bonusResources.map((r, idx) => (
                    <tr key={r.email} className="border-b hover:bg-gray-50">
                      <td className="py-2 px-3 text-xs text-gray-500">{idx + 1}</td>
                      <td className="py-2 px-3">
                        <div className="font-medium text-gray-800 text-sm">{r.name}</div>
                        <div className="text-xs text-gray-400">{r.email}</div>
                      </td>
                      <td className="py-2 px-3 text-right font-medium text-emerald-700">{formatNumber(r.loggingCases)}</td>
                      <td className="py-2 px-3 text-right">
                        <span className="inline-block bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded text-xs">
                          {formatNumber(r.completeLoggingCases)}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right text-blue-700">
                        {r.totalHours > 0 ? r.totalHours.toFixed(1) : <span className="text-red-400 text-xs">N/A</span>}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <span className={`font-semibold ${parseFloat(r.avgCasesPerHour) >= 13 ? 'text-green-700' : 'text-red-600'}`}>
                          {r.totalHours > 0 ? r.avgCasesPerHour : '—'}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right text-gray-700 font-medium">${r.slabRate.toFixed(2)}</td>
                      <td className="py-2 px-3 text-right">
                        <span className={`font-bold ${r.bonusRate > 0 ? 'text-orange-700' : 'text-gray-400'}`}>
                          ${r.bonusRate.toFixed(2)}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right text-green-700">{formatCurrency(r.loggingPayout)}</td>
                      <td className="py-2 px-3 text-right">
                        <span className={`font-bold ${r.completeLoggingBonus > 0 ? 'text-orange-700' : 'text-gray-400'}`}>
                          {formatCurrency(r.completeLoggingBonus)}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-indigo-700 bg-indigo-50">
                        {formatCurrency(r.totalPayout)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* Total row */}
                <tfoot>
                  <tr className="bg-gray-800 text-white font-bold text-sm">
                    <td colSpan={2} className="py-2.5 px-3">TOTAL ({bonusResources.length} resources)</td>
                    <td className="py-2.5 px-3 text-right text-emerald-300">{formatNumber(totals.totalLoggingCases)}</td>
                    <td className="py-2.5 px-3 text-right text-amber-300">{formatNumber(totals.totalCompleteLoggingCases)}</td>
                    <td className="py-2.5 px-3 text-right"></td>
                    <td className="py-2.5 px-3 text-right"></td>
                    <td className="py-2.5 px-3 text-right"></td>
                    <td className="py-2.5 px-3 text-right"></td>
                    <td className="py-2.5 px-3 text-right text-green-300">{formatCurrency(totals.totalLoggingPayout)}</td>
                    <td className="py-2.5 px-3 text-right text-amber-300">{formatCurrency(totals.totalBonus)}</td>
                    <td className="py-2.5 px-3 text-right text-indigo-200 bg-indigo-800">{formatCurrency(totals.totalGrandPayout)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* All resources payout summary (even those without complete logging bonus) */}
        {resourceData.length > bonusResources.length && (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-3 py-2 border-b bg-gray-50">
              <div className="text-sm font-semibold text-gray-700">All Resources — Full Payout Summary</div>
              <div className="text-xs text-gray-400">Includes resources with no complete logging cases</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="py-2 px-3 text-left text-xs font-semibold text-gray-600 border-b">Resource</th>
                    <th className="py-2 px-3 text-right text-xs font-semibold text-gray-600 border-b">Logging Cases</th>
                    <th className="py-2 px-3 text-right text-xs font-semibold text-gray-600 border-b">Slab Rate</th>
                    <th className="py-2 px-3 text-right text-xs font-semibold text-gray-600 border-b">Logging Payout</th>
                    <th className="py-2 px-3 text-right text-xs font-semibold text-gray-600 border-b">Bonus</th>
                    <th className="py-2 px-3 text-right text-xs font-semibold text-indigo-700 border-b bg-indigo-50">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(resourceData || []).sort((a, b) => b.totalPayout - a.totalPayout).map((r, idx) => (
                    <tr key={r.email} className="border-b hover:bg-gray-50">
                      <td className="py-1.5 px-3 font-medium text-gray-800">{r.name}</td>
                      <td className="py-1.5 px-3 text-right text-gray-700">{formatNumber(r.loggingCases)}</td>
                      <td className="py-1.5 px-3 text-right text-gray-700">${r.slabRate?.toFixed(2)}</td>
                      <td className="py-1.5 px-3 text-right text-green-700">{formatCurrency(r.loggingPayout)}</td>
                      <td className="py-1.5 px-3 text-right">
                        {r.completeLoggingBonus > 0
                          ? <span className="text-orange-700 font-medium">{formatCurrency(r.completeLoggingBonus)}</span>
                          : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="py-1.5 px-3 text-right font-bold text-indigo-700 bg-indigo-50">{formatCurrency(r.totalPayout)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-800 text-white font-bold">
                    <td className="py-2 px-3">TOTAL</td>
                    <td className="py-2 px-3 text-right">{formatNumber(totals.totalLoggingCases)}</td>
                    <td className="py-2 px-3 text-right"></td>
                    <td className="py-2 px-3 text-right text-green-300">{formatCurrency(totals.totalLoggingPayout)}</td>
                    <td className="py-2 px-3 text-right text-amber-300">{formatCurrency(totals.totalBonus)}</td>
                    <td className="py-2 px-3 text-right bg-indigo-800 text-indigo-200">{formatCurrency(totals.totalGrandPayout)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CompleteLoggingBonusPayout;
