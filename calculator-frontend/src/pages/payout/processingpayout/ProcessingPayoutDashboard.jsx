// components/ProcessingPayoutDashboard.jsx
// Clean compact UI - minimal colors, more data visible

import { useState, useEffect, useCallback, useRef } from 'react';

const apiBaseUrl = import.meta.env.VITE_BACKEND_URL  ;

const PayoutTable = ({ data, isLoading }) => {
  const scrollRef = useRef(null);

  const formatCurrency = (amount) => {
    if (!amount || amount === 0) return '$-';
    return `$${parseFloat(amount).toFixed(2)}`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-2"></div>
        <span className="text-sm text-gray-500">Loading...</span>
      </div>
    );
  }

  if (!data?.locations?.length) {
    return <div className="text-center py-6 text-gray-500 text-sm">No data found</div>;
  }

  const { resources, locations, resourceTotals, grandTotalCases, grandTotalPayout } = data;

  return (
    <div ref={scrollRef} className="overflow-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
      <table className="w-full text-xs border-collapse">
        <thead className="sticky top-0 z-10">
          <tr className="bg-amber-100">
            <th className="sticky left-0 z-20 bg-amber-100 border border-gray-300 px-2 py-1.5 text-left font-semibold min-w-[160px]">Location</th>
            <th className="sticky left-[160px] z-20 bg-yellow-200 border border-gray-300 px-2 py-1.5 text-center font-semibold w-14">Payout Rate</th>
            {resources.map((name, idx) => (
              <th key={idx} className="bg-gray-100 border border-gray-300 px-1 py-1.5 text-center font-medium min-w-[60px]" title={name}>
                {name.length > 8 ? name.substring(0, 8) + '..' : name}
              </th>
            ))}
            <th className="bg-green-200 border border-gray-300 px-2 py-1.5 text-center font-semibold w-14">Total</th>
          </tr>
        </thead>
        <tbody>
          {locations.map((loc, idx) => (
            <tr key={idx} className="hover:bg-gray-50">
              <td className="sticky left-0 z-10 bg-orange-100 border border-gray-300 px-2 py-1 font-medium">{loc.location_name}</td>
              <td className="sticky left-[160px] z-10 bg-yellow-100 border border-gray-300 px-2 py-1 text-center font-medium">
                {formatCurrency(loc.flatrate)}
              </td>
              {resources.map((resourceName, rIdx) => {
                const cases = loc.resource_cases[resourceName] || 0;
                return (
                  <td key={rIdx} className={`border border-gray-300 px-1 py-1 text-center ${cases > 0 ? 'bg-green-100 font-medium' : 'text-gray-400'}`}>
                    {cases}
                  </td>
                );
              })}
              <td className="bg-green-100 border border-gray-300 px-2 py-1 text-center font-bold">{loc.total_cases}</td>
            </tr>
          ))}
          {/* Total Row */}
          <tr className="bg-orange-200 font-bold">
            <td className="sticky left-0 z-10 bg-orange-200 border border-gray-300 px-2 py-1.5">Total processing</td>
            <td className="sticky left-[160px] z-10 bg-orange-200 border border-gray-300"></td>
            {resources.map((name, idx) => (
              <td key={idx} className="border border-gray-300 px-1 py-1.5 text-center">{resourceTotals[name]?.cases || 0}</td>
            ))}
            <td className="bg-orange-300 border border-gray-300 px-2 py-1.5 text-center">{grandTotalCases}</td>
          </tr>
          {/* Payout Row */}
          <tr className="bg-green-300 font-bold">
            <td className="sticky left-0 z-10 bg-green-300 border border-gray-300 px-2 py-1.5">Total Payout</td>
            <td className="sticky left-[160px] z-10 bg-green-300 border border-gray-300"></td>
            {resources.map((name, idx) => {
              const payout = resourceTotals[name]?.payout || 0;
              return (
                <td key={idx} className={`border border-gray-300 px-1 py-1.5 text-center ${payout > 0 ? 'bg-green-200' : ''}`}>
                  {formatCurrency(payout)}
                </td>
              );
            })}
            <td className="bg-green-400 border border-gray-300 px-2 py-1.5 text-center">{formatCurrency(grandTotalPayout)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

const ProcessingPayoutDashboard = () => {
  const [activeTab, setActiveTab] = useState('mro');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [isLoading, setIsLoading] = useState(false);
  const [verismaData, setVerismaData] = useState(null);
  const [mroData, setMroData] = useState(null);
  const [combinedTotals, setCombinedTotals] = useState({ cases: 0, payout: 0 });

  const formatCurrency = (amount) => `$${(amount || 0).toFixed(2)}`;

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${apiBaseUrl}/processing-payout/combined?month=${month}&year=${year}`);
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setVerismaData(data.verisma);
      setMroData(data.mro);
      setCombinedTotals(data.combinedGrandTotal);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }, [month, year]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleExport = (client) => {
    window.open(`${apiBaseUrl}/processing-payout/export/${client}?month=${month}&year=${year}`, '_blank');
  };

  const currentData = activeTab === 'verisma' ? verismaData : mroData;

  return (
    <div className="bg-gray-50 min-h-screen text-sm">
      {/* Compact Header */}
      <div className="bg-indigo-600 text-white px-3 py-2 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold">Processing Payout</h1>
          <p className="text-xs opacity-80">Payout = Cases × Payout Rate</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))}
            className="px-2 py-1 text-xs border rounded text-gray-800">
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>{new Date(0, i).toLocaleString('default', { month: 'short' })}</option>
            ))}
          </select>
          <select value={year} onChange={(e) => setYear(parseInt(e.target.value))}
            className="px-2 py-1 text-xs border rounded text-gray-800">
            {[2027, 2026, 2025, 2024].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={fetchData} className="px-2 py-1 bg-white/20 hover:bg-white/30 rounded text-xs">🔄 Refresh</button>
        </div>
      </div>

      {/* Summary Bar */}
      <div className="bg-white border-b px-3 py-2 flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1">
          <span className="text-gray-500">Verisma:</span>
          <span className="font-bold text-blue-600">{verismaData?.grandTotalCases || 0}</span>
          <span className="text-gray-400">({formatCurrency(verismaData?.grandTotalPayout || 0)})</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-gray-500">MRO:</span>
          <span className="font-bold text-green-600">{mroData?.grandTotalCases || 0}</span>
          <span className="text-gray-400">({formatCurrency(mroData?.grandTotalPayout || 0)})</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-gray-500">Total:</span>
          <span className="font-bold">{combinedTotals.cases}</span>
          <span className="text-orange-600 font-bold">({formatCurrency(combinedTotals.payout)})</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-gray-500">Locations:</span>
          <span className="font-medium">{(verismaData?.locations?.length || 0) + (mroData?.locations?.length || 0)}</span>
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={() => handleExport(activeTab)} disabled={isLoading}
            className="px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded text-xs disabled:opacity-50">
            📥 Export {activeTab === 'verisma' ? 'Verisma' : 'MRO'}
          </button>
          <button onClick={() => window.open(`${apiBaseUrl}/processing-payout/export-combined?month=${month}&year=${year}`, '_blank')}
            className="px-2 py-1 bg-purple-500 hover:bg-purple-600 text-white rounded text-xs">
            📥 Export Combined
          </button>
        </div>
      </div>

      {/* Tabs + Table */}
      <div className="bg-white m-2 rounded shadow-sm overflow-hidden">
        <div className="flex border-b">
          <button onClick={() => setActiveTab('verisma')}
            className={`flex-1 px-3 py-2 text-xs font-medium ${activeTab === 'verisma' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            VERISMA ({verismaData?.grandTotalCases || 0} cases)
          </button>
          <button onClick={() => setActiveTab('mro')}
            className={`flex-1 px-3 py-2 text-xs font-medium ${activeTab === 'mro' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            MRO ({mroData?.grandTotalCases || 0} cases)
          </button>
        </div>
        <PayoutTable data={currentData} isLoading={isLoading} />
      </div>

      {/* Footer */}
      <div className="bg-green-600 text-white m-2 rounded px-3 py-2 flex items-center justify-between text-xs">
        <span className="font-medium">Verisma + MRO Grand Total ({new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })})</span>
        <div className="text-right">
          <span className="text-lg font-bold">{formatCurrency(combinedTotals.payout)}</span>
          <span className="ml-2 opacity-80">({combinedTotals.cases} cases)</span>
        </div>
      </div>
    </div>
  );
};

export default ProcessingPayoutDashboard;