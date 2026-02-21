// pages/payout/ResourcePayoutCalculator.jsx
// Resource Payout Calculator
// Slab = total logging cases / (workingDays × 8 hours)
// Complete Logging bonus = (0.65 - slab rate) × complete logging cases

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';

const apiBaseUrl = import.meta.env.VITE_BACKEND_URL;

// Payout slab configuration (rate per case based on avg cases/hour)
const DEFAULT_SLABS = [
  { id: 1, min: 0, max: 12.99, rate: 0.50, label: '0 to 12.99' },
  { id: 2, min: 13, max: 15.99, rate: 0.55, label: '13 to 15.99' },
  { id: 3, min: 16, max: 20.99, rate: 0.60, label: '16 to 20.99' },
  { id: 4, min: 21, max: Infinity, rate: 0.65, label: '21 and above' }
];

const SLAB_TARGETS = [13, 16, 21];
const COMPLETE_LOGGING_RATE = 0.65;

const ResourcePayoutCalculator = () => {
  const navigate = useNavigate();

  const [activeClient, setActiveClient] = useState('all');
  const [month, setMonth] = useState((new Date().getMonth() + 1).toString());
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [workingDays, setWorkingDays] = useState(21);
  const [selectedResource, setSelectedResource] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [allocations, setAllocations] = useState([]);
  const [slabs, setSlabs] = useState(DEFAULT_SLABS);

  const [summaryData, setSummaryData] = useState(null);
  const [resourceData, setResourceData] = useState([]);
  const [dailyData, setDailyData] = useState([]);

  const getAuthToken = () => localStorage.getItem('token') || sessionStorage.getItem('token');
  const formatCurrency = (amt) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(amt || 0);
  const formatNumber = (num) => new Intl.NumberFormat('en-US').format(num || 0);

  const allDatesInMonth = useMemo(() => {
    const y = parseInt(year);
    const m = parseInt(month);
    const daysInMonth = new Date(y, m, 0).getDate();
    const dates = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(y, m - 1, d);
      dates.push({
        date: d,
        fullDate: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
        isWeekend: date.getDay() === 0 || date.getDay() === 6
      });
    }
    return dates;
  }, [month, year]);

  const getWorkingDaysLeft = useCallback(() => {
    const today = new Date();
    const y = parseInt(year);
    const m = parseInt(month);
    if (today.getFullYear() !== y || today.getMonth() + 1 !== m) return workingDays;
    let count = 0;
    const daysInMonth = new Date(y, m, 0).getDate();
    for (let d = today.getDate(); d <= daysInMonth; d++) {
      const date = new Date(y, m - 1, d);
      if (date.getDay() !== 0 && date.getDay() !== 6) count++;
    }
    return count;
  }, [month, year, workingDays]);

  // Determine if an allocation is a "complete logging" case based on project name
  const isCompleteLoggingAlloc = (alloc) => {
    const pName = (alloc.project_name || '').toLowerCase();
    return pName.includes('complete') && pName.includes('log');
  };

  // Determine if an allocation is a processing case
  const isProcessingAlloc = (alloc) => {
    if (alloc.source === 'mro') {
      return alloc.process_type === 'Processing';
    }
    return false;
  };

  const processData = useCallback((allocs) => {
    if (!allocs || allocs.length === 0) {
      setSummaryData(null);
      setResourceData([]);
      setDailyData([]);
      return;
    }

    // Non-working days = weekends only
    const nonWorkingDayNumbers = new Set(
      allDatesInMonth.filter(d => d.isWeekend).map(d => d.date)
    );

    const resourceMap = new Map();
    allocs.forEach(alloc => {
      const email = alloc.resource_email?.toLowerCase();
      const name = alloc.resource_name || email;
      if (!email) return;

      if (!resourceMap.has(email)) {
        resourceMap.set(email, {
          email,
          name,
          dailyCases: {},
          totalCases: 0,
          loggingCases: 0,
          processingCases: 0,
          completeLoggingCases: 0,
          weekdayDaysLogged: new Set()  // only Mon–Fri days with cases
        });
      }

      const resource = resourceMap.get(email);
      const dateStr = alloc.allocation_date?.split('T')[0];
      const day = dateStr ? parseInt(dateStr.split('-')[2]) : null;
      const count = parseInt(alloc.count) || 1;

      if (day) {
        resource.dailyCases[day] = (resource.dailyCases[day] || 0) + count;
        // Only count weekdays toward working days; weekend cases still count for cases totals
        if (!nonWorkingDayNumbers.has(day)) {
          resource.weekdayDaysLogged.add(day);
        }
      }
      resource.totalCases += count;

      if (isProcessingAlloc(alloc)) {
        resource.processingCases += count;
      } else {
        resource.loggingCases += count;
        if (isCompleteLoggingAlloc(alloc)) {
          resource.completeLoggingCases += count;
        }
      }
    });

    let processedResources = Array.from(resourceMap.values()).map(r => {
      // Working days = weekdays (Mon–Fri) where the resource logged at least 1 case
      // (weekend cases are included in case totals but not in working days / hours)
      const workingDaysCount = r.weekdayDaysLogged.size;
      const totalHours = workingDaysCount * 8;

      const avgCasesPerHour = totalHours > 0 ? r.loggingCases / totalHours : 0;

      let applicableSlab = slabs[0];
      for (const slab of slabs) {
        if (avgCasesPerHour >= slab.min && avgCasesPerHour <= slab.max) {
          applicableSlab = slab;
          break;
        }
      }

      const loggingPayout = r.loggingCases * applicableSlab.rate;
      const bonusRate = Math.max(0, COMPLETE_LOGGING_RATE - applicableSlab.rate);
      const completeLoggingBonus = r.completeLoggingCases * bonusRate;
      const totalPayout = loggingPayout + completeLoggingBonus;

      const toAchieve = {};
      SLAB_TARGETS.forEach(target => {
        toAchieve[target] = Math.max(0, Math.ceil(target * workingDays * 8) - r.loggingCases);
      });

      return {
        ...r,
        workingDays: workingDaysCount,
        totalHours,
        avgCasesPerHour: avgCasesPerHour.toFixed(2),
        slabRate: applicableSlab.rate,
        slabLabel: applicableSlab.label,
        loggingPayout,
        bonusRate,
        completeLoggingBonus,
        totalPayout,
        toAchieve
      };
    }).sort((a, b) => b.totalCases - a.totalCases);

    if (selectedResource) {
      processedResources = processedResources.filter(r => r.email === selectedResource);
    }

    const totalLoggingCases = processedResources.reduce((s, r) => s + r.loggingCases, 0);
    const totalProcessingCases = processedResources.reduce((s, r) => s + r.processingCases, 0);
    const totalCompleteLoggingCases = processedResources.reduce((s, r) => s + r.completeLoggingCases, 0);
    const totalLoggingPayout = processedResources.reduce((s, r) => s + r.loggingPayout, 0);
    const totalBonus = processedResources.reduce((s, r) => s + r.completeLoggingBonus, 0);

    setSummaryData({
      totalProcessingCases,
      totalLoggingCases,
      totalCompleteLoggingCases,
      totalCases: processedResources.reduce((sum, r) => sum + r.totalCases, 0),
      totalResources: processedResources.length,
      totalLoggingPayout,
      totalBonus,
      totalPayout: totalLoggingPayout + totalBonus,
      workingDaysLeft: getWorkingDaysLeft()
    });

    setResourceData(processedResources);
    setDailyData(allDatesInMonth.map(dateInfo => ({
      ...dateInfo,
      total: processedResources.reduce((sum, r) => sum + (r.dailyCases[dateInfo.date] || 0), 0)
    })));
  }, [slabs, workingDays, allDatesInMonth, getWorkingDaysLeft, selectedResource]);

  const fetchAllocations = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = getAuthToken();
      const y = parseInt(year);
      const m = parseInt(month);
      const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
      const endDate = `${y}-${String(m).padStart(2, '0')}-${new Date(y, m, 0).getDate()}`;

      let allAllocations = [];

      if (activeClient === 'all' || activeClient === 'verisma') {
        try {
          const vRes = await fetch(
            `${apiBaseUrl}/verisma-daily-allocations/admin/all?start_date=${startDate}&end_date=${endDate}&limit=5000`,
            { headers: { 'Authorization': `Bearer ${token}` } }
          );
          if (vRes.ok) {
            const vData = await vRes.json();
            allAllocations = [
              ...allAllocations,
              ...(vData.allocations || []).map(a => ({ ...a, source: 'verisma' }))
            ];
          }
        } catch (e) { console.error('Verisma fetch error', e); }
      }

      if (activeClient === 'all' || activeClient === 'mro') {
        try {
          const mroRes = await fetch(
            `${apiBaseUrl}/mro-daily-allocations/admin/all?month=${m}&year=${y}&limit=5000&process_type=Processing`,
            { headers: { 'Authorization': `Bearer ${token}` } }
          );
          if (mroRes.ok) {
            const mroData = await mroRes.json();
            allAllocations = [
              ...allAllocations,
              ...(mroData.allocations || []).map(a => ({ ...a, source: 'mro', process_type: 'Processing' }))
            ];
          }
        } catch (e) { console.error('MRO Processing fetch error', e); }

        try {
          const mroLogRes = await fetch(
            `${apiBaseUrl}/mro-daily-allocations/admin/all?month=${m}&year=${y}&limit=5000&process_type=Logging`,
            { headers: { 'Authorization': `Bearer ${token}` } }
          );
          if (mroLogRes.ok) {
            const mroLogData = await mroLogRes.json();
            allAllocations = [
              ...allAllocations,
              ...(mroLogData.allocations || []).map(a => ({ ...a, source: 'mro', process_type: 'Logging' }))
            ];
          }
        } catch (e) { console.error('MRO Logging fetch error', e); }
      }

      setAllocations(allAllocations);
      processData(allAllocations);
    } catch (e) {
      console.error('Fetch error:', e);
      toast.error('Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, [activeClient, month, year]);

  useEffect(() => { fetchAllocations(); }, [fetchAllocations]);

  useEffect(() => {
    if (allocations.length > 0) processData(allocations);
  }, [slabs, workingDays, selectedResource]);

  const handleSlabRateChange = (slabId, newRate) => {
    setSlabs(prev => prev.map(s => s.id === slabId ? { ...s, rate: parseFloat(newRate) || 0 } : s));
  };

  const getToAchieveColor = (value) => value <= 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';

  const navigateToBonus = () => {
    navigate('/payout/complete-logging-bonus', {
      state: { resourceData, month, year, summaryData }
    });
  };

  const navigateToDailyCases = () => {
    navigate('/payout/daily-cases', {
      state: { resourceData, allDatesInMonth, month, year, summaryData, dailyData }
    });
  };

  const exportCSV = () => {
    if (resourceData.length === 0) { toast.error('No data'); return; }
    const headers = [
      'Resource', 'Total', 'Total Logged Cases', 'Total Processing Cases', 'Total Complete Logging Cases',
      'Days', 'Hours', 'Avg/Hr', 'Rate', 'Logging Payout', 'Bonus', 'Total Payout'
    ];
    const rows = resourceData.map(r => [
      r.name, r.totalCases, r.loggingCases, r.processingCases, r.completeLoggingCases,
      r.workingDays, r.totalHours, r.avgCasesPerHour, `$${r.slabRate}`,
      r.loggingPayout.toFixed(2), r.completeLoggingBonus.toFixed(2), r.totalPayout.toFixed(2)
    ]);
    rows.push([
      'TOTAL',
      summaryData?.totalCases || 0,
      summaryData?.totalLoggingCases || 0,
      summaryData?.totalProcessingCases || 0,
      summaryData?.totalCompleteLoggingCases || 0,
      '', '', '', '',
      summaryData?.totalLoggingPayout?.toFixed(2) || 0,
      summaryData?.totalBonus?.toFixed(2) || 0,
      summaryData?.totalPayout?.toFixed(2) || 0
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `payout-${month}-${year}.csv`;
    a.click();
    toast.success('Exported!');
  };

  const resourceOptions = useMemo(() => {
    const map = new Map();
    allocations.forEach(a => {
      if (a.resource_email && !map.has(a.resource_email.toLowerCase())) {
        map.set(a.resource_email.toLowerCase(), a.resource_name || a.resource_email);
      }
    });
    return Array.from(map.entries()).map(([email, name]) => ({ email, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [allocations]);

  const cellStyle = "border border-gray-400 px-1.5 py-1";
  const headerStyle = "border border-gray-500 px-1.5 py-1.5 font-bold text-[11px]";

  return (
    <div className="bg-gray-100 min-h-screen">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-700 to-purple-700 text-white px-4 py-2.5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold">Resource Payout Calculator</h1>
            <p className="text-xs text-indigo-200">
              {new Date(parseInt(year), parseInt(month) - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}
              {' '}— Slab based on Logging Cases / (Weekdays Worked × 8 hrs)
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="text-right">
              <div className="text-indigo-200">Logging Payout</div>
              <div className="text-lg font-bold">{formatCurrency(summaryData?.totalLoggingPayout || 0)}</div>
            </div>
            <div className="text-right">
              <div className="text-indigo-200">+ Bonus</div>
              <div className="text-lg font-bold text-yellow-300">{formatCurrency(summaryData?.totalBonus || 0)}</div>
            </div>
            <div className="text-right">
              <div className="text-indigo-200">Total Payout</div>
              <div className="text-lg font-bold text-green-300">{formatCurrency(summaryData?.totalPayout || 0)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white border-b px-3 py-2 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          {['all', 'mro', 'verisma'].map(c => (
            <button key={c} onClick={() => setActiveClient(c)}
              className={`px-2.5 py-1 rounded text-xs font-medium ${activeClient === c
                ? (c === 'mro' ? 'bg-green-600 text-white' : c === 'verisma' ? 'bg-blue-600 text-white' : 'bg-indigo-600 text-white')
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {c === 'all' ? 'All' : c.toUpperCase()}
            </button>
          ))}
        </div>

        <span className="text-gray-300">|</span>

        <select value={selectedResource} onChange={(e) => setSelectedResource(e.target.value)} className="px-2 py-1 text-xs border rounded min-w-[140px]">
          <option value="">All Resources ({resourceOptions.length})</option>
          {resourceOptions.map(r => <option key={r.email} value={r.email}>{r.name}</option>)}
        </select>

        <select value={month} onChange={(e) => setMonth(e.target.value)} className="px-2 py-1 text-xs border rounded">
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i + 1} value={i + 1}>{new Date(0, i).toLocaleString('default', { month: 'short' })}</option>
          ))}
        </select>
        <select value={year} onChange={(e) => setYear(e.target.value)} className="px-2 py-1 text-xs border rounded">
          {[2027, 2026, 2025, 2024].map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        <div className="flex items-center gap-1 text-xs">
          <span className="text-gray-500">Working Days:</span>
          <input
            type="number"
            min={1}
            max={31}
            value={workingDays}
            onChange={(e) => setWorkingDays(parseInt(e.target.value) || 1)}
            className="w-14 px-2 py-0.5 text-xs border rounded text-center font-semibold text-indigo-700 border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={navigateToDailyCases}
            disabled={resourceData.length === 0}
            className="px-2.5 py-1 text-xs bg-indigo-500 text-white hover:bg-indigo-600 rounded font-medium disabled:opacity-50"
          >
            📅 Daily Cases
          </button>
          <button
            onClick={navigateToBonus}
            className="px-2.5 py-1 text-xs bg-amber-500 text-white hover:bg-amber-600 rounded font-medium"
          >
            Complete Logging Bonus
          </button>
          <button onClick={fetchAllocations} disabled={isLoading} className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded border">↻</button>
          <button onClick={exportCSV} className="px-2.5 py-1 text-xs bg-green-600 text-white hover:bg-green-700 rounded">Export</button>
        </div>
      </div>

      <div className="p-2 space-y-2">
        {/* Summary Cards */}
        <div className="grid grid-cols-8 gap-2">
          {[
            { label: 'Processing', value: summaryData?.totalProcessingCases, color: 'blue' },
            { label: 'Logging', value: summaryData?.totalLoggingCases, color: 'emerald' },
            { label: 'Complete Log', value: summaryData?.totalCompleteLoggingCases, color: 'amber' },
            { label: 'Total Cases', value: summaryData?.totalCases, color: 'purple' },
            { label: 'Days Left', value: summaryData?.workingDaysLeft, color: 'red' },
            { label: 'Resources', value: summaryData?.totalResources, color: 'teal' },
            { label: 'Logging Payout', value: formatCurrency(summaryData?.totalLoggingPayout || 0), color: 'green', isCurrency: true },
            { label: 'Bonus Payout', value: formatCurrency(summaryData?.totalBonus || 0), color: 'orange', isCurrency: true }
          ].map((card, i) => (
            <div key={i} className={`bg-white rounded shadow-sm p-2 border-l-4 border-${card.color}-500`}>
              <div className="text-[9px] text-gray-500 uppercase">{card.label}</div>
              <div className={`text-sm font-bold text-${card.color}-700`}>{card.isCurrency ? card.value : formatNumber(card.value || 0)}</div>
            </div>
          ))}
        </div>

        {/* Slabs */}
        <div className="bg-white rounded shadow-sm p-2">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold text-gray-700">Payout Slabs — Rate per Logging Case (Slab = All Logged Cases / (Weekdays Worked × 8 hrs))</div>
            <div className="text-xs text-gray-500">Complete Logging Bonus = $0.65 − Slab Rate</div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {slabs.map((slab, idx) => (
              <div key={slab.id} className={`p-2 rounded border-2 ${['bg-red-50 border-red-300', 'bg-yellow-50 border-yellow-300', 'bg-green-50 border-green-300', 'bg-emerald-50 border-emerald-400'][idx]}`}>
                <div className="text-[10px] font-semibold text-gray-700">{slab.label} cases/hr</div>
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-sm font-bold">$</span>
                  <input type="number" step="0.01" value={slab.rate}
                    onChange={(e) => handleSlabRateChange(slab.id, e.target.value)}
                    className="w-16 px-1 py-0.5 text-sm font-bold border-2 rounded text-center" />
                  <span className="text-[10px] text-gray-500 ml-1">bonus: ${Math.max(0, 0.65 - slab.rate).toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Main Table — full width, no daily cases columns */}
        <div className="bg-white rounded shadow-sm overflow-hidden">
          <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: '60vh' }}>
            <table className="w-full text-[11px] border-collapse bg-white">
              <thead className="sticky top-0 z-20">
                {/* Group Headers */}
                <tr>
                  <th colSpan={3} className={`${headerStyle} bg-slate-700 text-white text-left`}>RESOURCE</th>
                  <th colSpan={4} className={`${headerStyle} bg-slate-600 text-white text-center`}>CASES</th>
                  <th colSpan={3} className={`${headerStyle} bg-blue-600 text-white text-center`}>METRICS</th>
                  <th colSpan={3} className={`${headerStyle} bg-yellow-500 text-yellow-900 text-center`}>TO ACHIEVE (cases)</th>
                  <th colSpan={3} className={`${headerStyle} bg-green-600 text-white text-center`}>PAYOUT</th>
                </tr>
                {/* Column Headers */}
                <tr className="bg-gray-100">
                  <th className={`${headerStyle} sticky left-0 z-30 bg-gray-200 w-[30px] text-center`}>Sr</th>
                  <th className={`${headerStyle} sticky left-[30px] z-30 bg-gray-200 min-w-[120px] text-left`}>Resource</th>
                  <th className={`${headerStyle} sticky left-[150px] z-30 bg-yellow-100 w-[120px] text-right`}>Total logged Cases</th>
                  <th className={`${headerStyle} bg-emerald-50 w-[80px] text-right leading-tight`}>MRO+VERISMA Logged Cases</th>
                  <th className={`${headerStyle} bg-blue-50 w-[120px] text-right leading-tight`}>MRO+VERISMA Processing Cases</th>
                  <th className={`${headerStyle} bg-amber-50 w-[100px] text-right leading-tight`}>Total Complete Logging Cases</th>
                  <th className={`${headerStyle} bg-gray-50 w-[44px] text-right`}>Days</th>
                  <th className={`${headerStyle} bg-blue-50 w-[54px] text-right`}>Hours</th>
                  <th className={`${headerStyle} bg-blue-100 w-[54px] text-right`}>Avg/Hr</th>
                  <th className={`${headerStyle} bg-gray-50 w-[100px] text-right`}>Slab Rate</th>
                  <th className={`${headerStyle} bg-yellow-100 w-[50px] text-right`}>@13</th>
                  <th className={`${headerStyle} bg-yellow-100 w-[50px] text-right`}>@16</th>
                  <th className={`${headerStyle} bg-yellow-100 w-[50px] text-right`}>@21</th>
                  <th className={`${headerStyle} bg-green-100 w-[90px] text-right leading-tight`}>Basic Payout</th>
                  <th className={`${headerStyle} bg-amber-100 w-[120px] text-right`}>Complete logging Bonus</th>
                  <th className={`${headerStyle} bg-green-200 w-[90px] text-right`}>Total</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={16} className="py-10 text-center text-gray-500 border">Loading...</td></tr>
                ) : resourceData.length === 0 ? (
                  <tr><td colSpan={16} className="py-10 text-center text-gray-500 border">No data found</td></tr>
                ) : (
                  <>
                    {resourceData.map((r, idx) => (
                      <tr key={r.email} className="hover:bg-blue-50">
                        <td className={`${cellStyle} sticky left-0 z-10 bg-white text-center text-gray-600`}>{idx + 1}</td>
                        <td className={`${cellStyle} sticky left-[30px] z-10 bg-white font-medium truncate max-w-[120px]`} title={r.name}>{r.name}</td>
                        <td className={`${cellStyle} sticky left-[150px] z-10 bg-yellow-50 text-right font-bold`}>{formatNumber(r.totalCases)}</td>
                        <td className={`${cellStyle} text-right text-emerald-700`}>{formatNumber(r.loggingCases)}</td>
                        <td className={`${cellStyle} text-right text-blue-700`}>{formatNumber(r.processingCases)}</td>
                        <td className={`${cellStyle} text-right text-amber-700`}>{formatNumber(r.completeLoggingCases)}</td>
                        <td className={`${cellStyle} text-right`}>{r.workingDays}</td>
                        <td className={`${cellStyle} text-right text-blue-700 font-medium`}>
                          {r.totalHours}
                        </td>
                        <td className={`${cellStyle} text-right font-semibold ${parseFloat(r.avgCasesPerHour) >= 13 ? 'bg-green-100 text-green-800' : r.totalHours > 0 ? 'bg-red-100 text-red-700' : 'text-gray-400'}`}>
                          {r.totalHours > 0 ? r.avgCasesPerHour : '0'}
                        </td>
                        <td className={`${cellStyle} text-right`}>${r.slabRate.toFixed(2)}</td>
                        <td className={`${cellStyle} text-right font-medium ${getToAchieveColor(r.toAchieve[13])}`}>{r.toAchieve[13]}</td>
                        <td className={`${cellStyle} text-right font-medium ${getToAchieveColor(r.toAchieve[16])}`}>{r.toAchieve[16]}</td>
                        <td className={`${cellStyle} text-right font-medium ${getToAchieveColor(r.toAchieve[21])}`}>{r.toAchieve[21]}</td>
                        <td className={`${cellStyle} text-right text-green-700 bg-green-50`}>{formatCurrency(r.loggingPayout)}</td>
                        <td className={`${cellStyle} text-right text-amber-700 bg-amber-50`}>
                          {r.completeLoggingBonus > 0 ? formatCurrency(r.completeLoggingBonus) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className={`${cellStyle} text-right font-bold text-green-800 bg-green-100`}>{formatCurrency(r.totalPayout)}</td>
                      </tr>
                    ))}

                    {/* Total Row */}
                    <tr className="bg-slate-800 text-white font-bold sticky bottom-0 z-10">
                      <td className={`${cellStyle} sticky left-0 z-20 bg-slate-800 border-slate-600`}></td>
                      <td className={`${cellStyle} sticky left-[30px] z-20 bg-slate-800 border-slate-600`}>TOTAL</td>
                      <td className={`${cellStyle} sticky left-[150px] z-20 bg-slate-700 border-slate-600 text-right`}>{formatNumber(summaryData?.totalCases || 0)}</td>
                      <td className={`${cellStyle} border-slate-600 text-right text-emerald-300`}>{formatNumber(summaryData?.totalLoggingCases || 0)}</td>
                      <td className={`${cellStyle} border-slate-600 text-right text-blue-300`}>{formatNumber(summaryData?.totalProcessingCases || 0)}</td>
                      <td className={`${cellStyle} border-slate-600 text-right text-amber-300`}>{formatNumber(summaryData?.totalCompleteLoggingCases || 0)}</td>
                      <td className={`${cellStyle} border-slate-600`}></td>
                      <td className={`${cellStyle} border-slate-600`}></td>
                      <td className={`${cellStyle} border-slate-600`}></td>
                      <td className={`${cellStyle} border-slate-600`}></td>
                      <td className={`${cellStyle} border-slate-600`}></td>
                      <td className={`${cellStyle} border-slate-600`}></td>
                      <td className={`${cellStyle} border-slate-600`}></td>
                      <td className={`${cellStyle} text-right bg-green-700 border-green-600`}>{formatCurrency(summaryData?.totalLoggingPayout || 0)}</td>
                      <td className={`${cellStyle} text-right bg-amber-700 border-amber-600`}>{formatCurrency(summaryData?.totalBonus || 0)}</td>
                      <td className={`${cellStyle} text-right bg-green-600 border-green-500`}>{formatCurrency(summaryData?.totalPayout || 0)}</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResourcePayoutCalculator;
