// pages/payout/ResourcePayoutCalculator.jsx
// Comprehensive payout calculator with slabs, editable rates, and daily breakdown

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'react-hot-toast';

const apiBaseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000/api';

// Default slab configuration
const DEFAULT_SLABS = [
  { id: 1, min: 0, max: 12.99, rate: 0.50, label: '0 to 12.99' },
  { id: 2, min: 13, max: 15.99, rate: 0.55, label: '13 to 15.99' },
  { id: 3, min: 16, max: 20.99, rate: 0.60, label: '16 to 20.99' },
  { id: 4, min: 21, max: Infinity, rate: 0.65, label: '21 and above' }
];

// Slab targets for display
const SLAB_TARGETS = [13, 16, 21];

const ResourcePayoutCalculator = () => {
  // State
  const [activeClient, setActiveClient] = useState('all'); // 'all', 'verisma', 'mro'
  const [processType, setProcessType] = useState('all'); // 'all', 'Processing', 'Logging'
  const [month, setMonth] = useState((new Date().getMonth() + 1).toString());
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [workingDays, setWorkingDays] = useState(21);
  
  const [isLoading, setIsLoading] = useState(false);
  const [allocations, setAllocations] = useState([]);
  const [resources, setResources] = useState([]);
  const [slabs, setSlabs] = useState(DEFAULT_SLABS);
  const [editingSlab, setEditingSlab] = useState(null);
  
  // Calculated data
  const [summaryData, setSummaryData] = useState(null);
  const [resourceData, setResourceData] = useState([]);
  const [dailyData, setDailyData] = useState([]);

  const getAuthToken = () => localStorage.getItem('token') || sessionStorage.getItem('token');
  
  const formatCurrency = (amt) => new Intl.NumberFormat('en-US', { 
    style: 'currency', currency: 'USD', minimumFractionDigits: 2 
  }).format(amt || 0);
  
  const formatNumber = (num) => new Intl.NumberFormat('en-US').format(num || 0);

  // Get days in month
  const getDaysInMonth = useCallback(() => {
    const y = parseInt(year);
    const m = parseInt(month);
    return new Date(y, m, 0).getDate();
  }, [month, year]);

  // Generate all dates in month
  const allDatesInMonth = useMemo(() => {
    const y = parseInt(year);
    const m = parseInt(month);
    const daysInMonth = new Date(y, m, 0).getDate();
    const dates = [];
    
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(y, m - 1, d);
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
      dates.push({
        date: d,
        fullDate: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        dayName,
        isWeekend
      });
    }
    return dates;
  }, [month, year]);

  // Calculate working days left from today
  const getWorkingDaysLeft = useCallback(() => {
    const today = new Date();
    const y = parseInt(year);
    const m = parseInt(month);
    
    // If not current month, return full working days
    if (today.getFullYear() !== y || today.getMonth() + 1 !== m) {
      return workingDays;
    }
    
    let count = 0;
    const daysInMonth = new Date(y, m, 0).getDate();
    
    for (let d = today.getDate(); d <= daysInMonth; d++) {
      const date = new Date(y, m - 1, d);
      if (date.getDay() !== 0 && date.getDay() !== 6) {
        count++;
      }
    }
    return count;
  }, [month, year, workingDays]);

  // Fetch all resources
  useEffect(() => {
    const fetchResources = async () => {
      try {
        const token = getAuthToken();
        let allResourcesList = [];
        let page = 1;
        let hasMore = true;
        
        while (hasMore && page <= 20) {
          const res = await fetch(`${apiBaseUrl}/resource?page=${page}&limit=100`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const data = await res.json();
          const pageResources = data.resources || data.data || data || [];
          allResourcesList = [...allResourcesList, ...pageResources];
          
          if (data.pagination) {
            hasMore = data.pagination.hasMore || page < data.pagination.totalPages;
          } else {
            hasMore = false;
          }
          page++;
        }
        
        setResources(allResourcesList);
      } catch (e) {
        console.error('Resource fetch error:', e);
      }
    };
    fetchResources();
  }, []);

  // Fetch allocations data
  const fetchAllocations = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = getAuthToken();
      const y = parseInt(year);
      const m = parseInt(month);
      const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
      const endDate = `${y}-${String(m).padStart(2, '0')}-${new Date(y, m, 0).getDate()}`;
      
      let allAllocations = [];
      
      // Fetch Verisma allocations
      if (activeClient === 'all' || activeClient === 'verisma') {
        try {
          const vRes = await fetch(`${apiBaseUrl}/verisma-daily-allocations/admin/all?start_date=${startDate}&end_date=${endDate}&limit=5000`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (vRes.ok) {
            const vData = await vRes.json();
            const verismaAllocs = (vData.allocations || []).map(a => ({ ...a, source: 'verisma' }));
            allAllocations = [...allAllocations, ...verismaAllocs];
          }
        } catch (e) { console.log('Verisma fetch error:', e); }
      }
      
      // Fetch MRO allocations
      if (activeClient === 'all' || activeClient === 'mro') {
        try {
          // Fetch Processing
          if (processType === 'all' || processType === 'Processing') {
            const mroProcessRes = await fetch(`${apiBaseUrl}/mro-daily-allocations/admin/all?month=${m}&year=${y}&limit=5000&process_type=Processing`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (mroProcessRes.ok) {
              const mroData = await mroProcessRes.json();
              const mroAllocs = (mroData.allocations || []).map(a => ({ ...a, source: 'mro' }));
              allAllocations = [...allAllocations, ...mroAllocs];
            }
          }
          
          // Fetch Logging
          if (processType === 'all' || processType === 'Logging') {
            const mroLogRes = await fetch(`${apiBaseUrl}/mro-daily-allocations/admin/all?month=${m}&year=${y}&limit=5000&process_type=Logging`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (mroLogRes.ok) {
              const mroLogData = await mroLogRes.json();
              const mroLogAllocs = (mroLogData.allocations || []).map(a => ({ ...a, source: 'mro' }));
              allAllocations = [...allAllocations, ...mroLogAllocs];
            }
          }
        } catch (e) { console.log('MRO fetch error:', e); }
      }
      
      setAllocations(allAllocations);
      processData(allAllocations);
      
    } catch (e) {
      console.error('Fetch error:', e);
      toast.error('Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, [activeClient, processType, month, year]);

  // Process allocations into summary and daily data
  const processData = useCallback((allocs) => {
    if (!allocs || allocs.length === 0) {
      setSummaryData(null);
      setResourceData([]);
      setDailyData([]);
      return;
    }

    // Group by resource
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
          workingDaysLogged: new Set(),
          totalHours: 0
        });
      }
      
      const resource = resourceMap.get(email);
      const dateStr = alloc.allocation_date?.split('T')[0];
      const day = dateStr ? parseInt(dateStr.split('-')[2]) : null;
      
      if (day) {
        resource.dailyCases[day] = (resource.dailyCases[day] || 0) + (parseInt(alloc.count) || 1);
        resource.workingDaysLogged.add(day);
      }
      
      resource.totalCases += parseInt(alloc.count) || 1;
      resource.totalHours += parseFloat(alloc.hours) || 8;
    });

    // Calculate metrics for each resource
    const processedResources = Array.from(resourceMap.values()).map(r => {
      const workingDaysCount = r.workingDaysLogged.size;
      const avgCasePerDay = workingDaysCount > 0 ? r.totalCases / workingDaysCount : 0;
      
      // Determine slab based on average
      let applicableSlab = slabs[0];
      for (const slab of slabs) {
        if (avgCasePerDay >= slab.min && avgCasePerDay <= slab.max) {
          applicableSlab = slab;
          break;
        }
      }
      
      // Calculate payout
      const basicPayout = r.totalCases * applicableSlab.rate;
      
      // Calculate "to achieve" for each slab target
      const toAchieve = {};
      SLAB_TARGETS.forEach(target => {
        const required = target * workingDays;
        toAchieve[target] = required - r.totalCases;
      });
      
      return {
        ...r,
        workingDays: workingDaysCount,
        totalHours: r.totalHours,
        avgCasePerDay: avgCasePerDay.toFixed(2),
        slabRate: applicableSlab.rate,
        slabLabel: applicableSlab.label,
        basicPayout,
        toAchieve
      };
    }).sort((a, b) => b.totalCases - a.totalCases);

    // Calculate overall summary
    const totalProcessingCases = allocs.filter(a => a.source === 'mro' && a.process_type === 'Processing').length;
    const totalLoggingCases = allocs.filter(a => a.source === 'mro' && a.process_type === 'Logging').length;
    const totalVerismaCases = allocs.filter(a => a.source === 'verisma').length;
    
    const summary = {
      totalProcessingCases,
      totalLoggingCases,
      totalCases: totalProcessingCases + totalLoggingCases + totalVerismaCases,
      totalResources: processedResources.length,
      totalPayout: processedResources.reduce((sum, r) => sum + r.basicPayout, 0),
      workingDaysLeft: getWorkingDaysLeft()
    };

    setSummaryData(summary);
    setResourceData(processedResources);

    // Generate daily totals
    const dailyTotals = allDatesInMonth.map(dateInfo => {
      let dayTotal = 0;
      processedResources.forEach(r => {
        dayTotal += r.dailyCases[dateInfo.date] || 0;
      });
      return {
        ...dateInfo,
        total: dayTotal
      };
    });
    
    setDailyData(dailyTotals);
    
  }, [slabs, workingDays, allDatesInMonth, getWorkingDaysLeft]);

  // Fetch data when filters change
  useEffect(() => {
    fetchAllocations();
  }, [fetchAllocations]);

  // Re-process when slabs change
  useEffect(() => {
    if (allocations.length > 0) {
      processData(allocations);
    }
  }, [slabs, workingDays]);

  // Handle slab rate change
  const handleSlabRateChange = (slabId, newRate) => {
    setSlabs(prev => prev.map(s => 
      s.id === slabId ? { ...s, rate: parseFloat(newRate) || 0 } : s
    ));
  };

  // Get cell color based on value
  const getCellColor = (value, avg) => {
    if (value === 0) return 'bg-white text-gray-300';
    if (value >= 21) return 'bg-green-500 text-white';
    if (value >= 16) return 'bg-green-300 text-green-900';
    if (value >= 13) return 'bg-yellow-300 text-yellow-900';
    return 'bg-red-200 text-red-800';
  };

  // Get "to achieve" cell color
  const getToAchieveColor = (value) => {
    if (value <= 0) return 'bg-green-100 text-green-700';
    return 'bg-red-100 text-red-700';
  };

  // Export to CSV
  const exportCSV = () => {
    if (resourceData.length === 0) {
      toast.error('No data to export');
      return;
    }

    const headers = ['Resource', 'Total Cases', 'Working Days', 'Avg/Day', 'Slab', 'Rate', 'Basic Payout'];
    allDatesInMonth.forEach(d => headers.push(`${d.date}-${d.dayName}`));

    const rows = resourceData.map(r => {
      const row = [r.name, r.totalCases, r.workingDays, r.avgCasePerDay, r.slabLabel, `$${r.slabRate}`, r.basicPayout.toFixed(2)];
      allDatesInMonth.forEach(d => row.push(r.dailyCases[d.date] || 0));
      return row;
    });

    // Add totals row
    const totalRow = ['TOTAL', summaryData?.totalCases || 0, '', '', '', '', summaryData?.totalPayout?.toFixed(2) || 0];
    dailyData.forEach(d => totalRow.push(d.total));
    rows.push(totalRow);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `resource-payout-${month}-${year}.csv`;
    a.click();
    toast.success('Exported!');
  };

  return (
    <div className="bg-gray-100 min-h-screen">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-700 to-purple-700 text-white px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Resource Payout Calculator</h1>
            <p className="text-xs text-indigo-200">MRO + Verisma Combined • {new Date(parseInt(year), parseInt(month) - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}</p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="text-right">
              <div className="text-indigo-200">Total Cases</div>
              <div className="text-xl font-bold">{formatNumber(summaryData?.totalCases || 0)}</div>
            </div>
            <div className="text-right">
              <div className="text-indigo-200">Total Payout</div>
              <div className="text-xl font-bold text-green-300">{formatCurrency(summaryData?.totalPayout || 0)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white border-b px-4 py-2 flex flex-wrap items-center gap-3">
        {/* Client Filter */}
        <div className="flex items-center gap-1">
          <button onClick={() => setActiveClient('all')}
            className={`px-3 py-1.5 rounded text-xs font-medium ${activeClient === 'all' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            All Clients
          </button>
          <button onClick={() => setActiveClient('mro')}
            className={`px-3 py-1.5 rounded text-xs font-medium ${activeClient === 'mro' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            MRO
          </button>
          <button onClick={() => setActiveClient('verisma')}
            className={`px-3 py-1.5 rounded text-xs font-medium ${activeClient === 'verisma' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            Verisma
          </button>
        </div>

        <span className="text-gray-300">|</span>

        {/* Process Type (for MRO) */}
        {(activeClient === 'all' || activeClient === 'mro') && (
          <select value={processType} onChange={(e) => setProcessType(e.target.value)}
            className="px-2 py-1.5 text-xs border rounded">
            <option value="all">All Process</option>
            <option value="Processing">Processing</option>
            <option value="Logging">Logging</option>
          </select>
        )}

        {/* Month/Year */}
        <select value={month} onChange={(e) => setMonth(e.target.value)}
          className="px-2 py-1.5 text-xs border rounded">
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i + 1} value={i + 1}>{new Date(0, i).toLocaleString('default', { month: 'long' })}</option>
          ))}
        </select>
        <select value={year} onChange={(e) => setYear(e.target.value)}
          className="px-2 py-1.5 text-xs border rounded">
          {[2027, 2026, 2025, 2024].map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        {/* Working Days */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500">Working Days:</span>
          <input type="number" value={workingDays} onChange={(e) => setWorkingDays(parseInt(e.target.value) || 21)}
            className="w-12 px-2 py-1.5 text-xs border rounded text-center" min="1" max="31" />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button onClick={fetchAllocations} disabled={isLoading}
            className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded">↻ Refresh</button>
          <button onClick={exportCSV}
            className="px-3 py-1.5 text-xs bg-green-600 text-white hover:bg-green-700 rounded">↓ Export</button>
        </div>
      </div>

      <div className="p-3 space-y-3">
        {/* Summary Cards Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          <div className="bg-white rounded-lg shadow-sm p-3 border-l-4 border-blue-500">
            <div className="text-[10px] text-gray-500 uppercase">Processing Cases</div>
            <div className="text-lg font-bold text-blue-700">{formatNumber(summaryData?.totalProcessingCases || 0)}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-3 border-l-4 border-emerald-500">
            <div className="text-[10px] text-gray-500 uppercase">Logged Cases</div>
            <div className="text-lg font-bold text-emerald-700">{formatNumber(summaryData?.totalLoggingCases || 0)}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-3 border-l-4 border-purple-500">
            <div className="text-[10px] text-gray-500 uppercase">Total Cases</div>
            <div className="text-lg font-bold text-purple-700">{formatNumber(summaryData?.totalCases || 0)}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-3 border-l-4 border-orange-500">
            <div className="text-[10px] text-gray-500 uppercase">Working Days</div>
            <div className="text-lg font-bold text-orange-700">{workingDays}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-3 border-l-4 border-red-500">
            <div className="text-[10px] text-gray-500 uppercase">Days Left</div>
            <div className="text-lg font-bold text-red-700">{summaryData?.workingDaysLeft || 0}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-3 border-l-4 border-teal-500">
            <div className="text-[10px] text-gray-500 uppercase">Resources</div>
            <div className="text-lg font-bold text-teal-700">{summaryData?.totalResources || 0}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-3 border-l-4 border-green-600">
            <div className="text-[10px] text-gray-500 uppercase">Total Payout</div>
            <div className="text-lg font-bold text-green-700">{formatCurrency(summaryData?.totalPayout || 0)}</div>
          </div>
        </div>

        {/* Slabs Configuration */}
        <div className="bg-white rounded-lg shadow-sm p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-700">📊 Payout Slabs (Editable)</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {slabs.map((slab, idx) => (
              <div key={slab.id} className={`p-2 rounded border ${
                idx === 0 ? 'bg-red-50 border-red-200' :
                idx === 1 ? 'bg-yellow-50 border-yellow-200' :
                idx === 2 ? 'bg-green-50 border-green-200' :
                'bg-emerald-50 border-emerald-200'
              }`}>
                <div className="text-[10px] font-medium text-gray-600">{slab.label}</div>
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-xs text-gray-500">$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={slab.rate}
                    onChange={(e) => handleSlabRateChange(slab.id, e.target.value)}
                    className="w-16 px-1.5 py-1 text-sm font-bold border rounded text-center"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Main Data Table */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto" style={{ maxHeight: '65vh' }}>
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 z-20">
                {/* Row 1: Column Groups */}
                <tr className="bg-slate-800 text-white">
                  <th colSpan={3} className="py-2 px-2 text-left border-r border-slate-600">Summary</th>
                  <th colSpan={4} className="py-2 px-2 text-center border-r border-slate-600">Metrics</th>
                  <th colSpan={3} className="py-2 px-2 text-center bg-yellow-600 border-r border-slate-600">Slab Targets</th>
                  <th colSpan={3} className="py-2 px-2 text-center bg-red-600 border-r border-slate-600">To Achieve</th>
                  <th className="py-2 px-2 text-center bg-green-600 border-r border-slate-600">Payout</th>
                  <th colSpan={allDatesInMonth.length} className="py-2 px-2 text-center bg-indigo-600">Daily Cases</th>
                </tr>
                {/* Row 2: Column Headers */}
                <tr className="bg-slate-100">
                  <th className="py-2 px-2 text-left font-semibold sticky left-0 bg-slate-100 z-30 border-r min-w-[40px]">Sr</th>
                  <th className="py-2 px-2 text-left font-semibold sticky left-[40px] bg-slate-100 z-30 border-r min-w-[140px]">Resource</th>
                  <th className="py-2 px-2 text-right font-semibold sticky left-[180px] bg-slate-100 z-30 border-r min-w-[70px]">Total</th>
                  <th className="py-2 px-2 text-right font-semibold border-r min-w-[50px]">Days</th>
                  <th className="py-2 px-2 text-right font-semibold border-r min-w-[50px]">Hours</th>
                  <th className="py-2 px-2 text-right font-semibold border-r min-w-[50px]">Avg</th>
                  <th className="py-2 px-2 text-right font-semibold border-r min-w-[50px]">Rate</th>
                  {/* Slab Target columns */}
                  <th className="py-2 px-2 text-right font-semibold bg-yellow-100 border-r min-w-[50px]">@13</th>
                  <th className="py-2 px-2 text-right font-semibold bg-yellow-100 border-r min-w-[50px]">@16</th>
                  <th className="py-2 px-2 text-right font-semibold bg-yellow-100 border-r min-w-[50px]">@21</th>
                  {/* To Achieve columns */}
                  <th className="py-2 px-2 text-right font-semibold bg-red-100 border-r min-w-[55px]">To 13</th>
                  <th className="py-2 px-2 text-right font-semibold bg-red-100 border-r min-w-[55px]">To 16</th>
                  <th className="py-2 px-2 text-right font-semibold bg-red-100 border-r min-w-[55px]">To 21</th>
                  {/* Payout */}
                  <th className="py-2 px-2 text-right font-semibold bg-green-100 border-r min-w-[80px]">Basic</th>
                  {/* Daily columns */}
                  {allDatesInMonth.map(d => (
                    <th key={d.date} className={`py-2 px-1 text-center font-semibold min-w-[40px] ${d.isWeekend ? 'bg-amber-100' : 'bg-slate-50'}`}>
                      <div className="text-[10px]">{d.date}</div>
                      <div className="text-[9px] text-gray-500">{d.dayName}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={14 + allDatesInMonth.length} className="py-10 text-center text-gray-500">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                        Loading...
                      </div>
                    </td>
                  </tr>
                ) : resourceData.length === 0 ? (
                  <tr>
                    <td colSpan={14 + allDatesInMonth.length} className="py-10 text-center text-gray-500">
                      No data found for selected filters
                    </td>
                  </tr>
                ) : (
                  <>
                    {resourceData.map((r, idx) => (
                      <tr key={r.email} className="border-b border-slate-100 hover:bg-slate-50">
                        {/* Fixed columns */}
                        <td className="py-1.5 px-2 text-slate-500 sticky left-0 bg-white z-10 border-r">{idx + 1}</td>
                        <td className="py-1.5 px-2 font-medium text-slate-800 sticky left-[40px] bg-white z-10 border-r truncate max-w-[140px]" title={r.name}>{r.name}</td>
                        <td className="py-1.5 px-2 text-right font-bold text-slate-900 sticky left-[180px] bg-white z-10 border-r">{formatNumber(r.totalCases)}</td>
                        {/* Metrics */}
                        <td className="py-1.5 px-2 text-right text-slate-600 border-r">{r.workingDays}</td>
                        <td className="py-1.5 px-2 text-right text-slate-600 border-r">{r.totalHours.toFixed(0)}</td>
                        <td className={`py-1.5 px-2 text-right font-medium border-r ${parseFloat(r.avgCasePerDay) >= 13 ? 'text-green-700' : 'text-red-600'}`}>{r.avgCasePerDay}</td>
                        <td className="py-1.5 px-2 text-right text-slate-600 border-r">${r.slabRate.toFixed(2)}</td>
                        {/* Slab targets */}
                        <td className="py-1.5 px-2 text-right text-yellow-700 bg-yellow-50/50 border-r">{13 * workingDays}</td>
                        <td className="py-1.5 px-2 text-right text-yellow-700 bg-yellow-50/50 border-r">{16 * workingDays}</td>
                        <td className="py-1.5 px-2 text-right text-yellow-700 bg-yellow-50/50 border-r">{21 * workingDays}</td>
                        {/* To Achieve */}
                        <td className={`py-1.5 px-2 text-right font-medium border-r ${getToAchieveColor(r.toAchieve[13])}`}>{r.toAchieve[13]}</td>
                        <td className={`py-1.5 px-2 text-right font-medium border-r ${getToAchieveColor(r.toAchieve[16])}`}>{r.toAchieve[16]}</td>
                        <td className={`py-1.5 px-2 text-right font-medium border-r ${getToAchieveColor(r.toAchieve[21])}`}>{r.toAchieve[21]}</td>
                        {/* Payout */}
                        <td className="py-1.5 px-2 text-right font-bold text-green-700 bg-green-50/50 border-r">{formatCurrency(r.basicPayout)}</td>
                        {/* Daily cases */}
                        {allDatesInMonth.map(d => {
                          const cases = r.dailyCases[d.date] || 0;
                          return (
                            <td key={d.date} className={`py-1.5 px-1 text-center ${d.isWeekend ? 'bg-amber-50' : ''} ${getCellColor(cases, r.avgCasePerDay)}`}>
                              {cases || ''}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {/* Totals Row */}
                    <tr className="bg-slate-800 text-white font-semibold sticky bottom-0 z-10">
                      <td className="py-2 px-2 sticky left-0 bg-slate-800 z-20 border-r"></td>
                      <td className="py-2 px-2 sticky left-[40px] bg-slate-800 z-20 border-r">TOTAL</td>
                      <td className="py-2 px-2 text-right sticky left-[180px] bg-slate-800 z-20 border-r">{formatNumber(summaryData?.totalCases || 0)}</td>
                      <td className="py-2 px-2 border-r"></td>
                      <td className="py-2 px-2 border-r"></td>
                      <td className="py-2 px-2 border-r"></td>
                      <td className="py-2 px-2 border-r"></td>
                      <td className="py-2 px-2 border-r"></td>
                      <td className="py-2 px-2 border-r"></td>
                      <td className="py-2 px-2 border-r"></td>
                      <td className="py-2 px-2 border-r"></td>
                      <td className="py-2 px-2 border-r"></td>
                      <td className="py-2 px-2 border-r"></td>
                      <td className="py-2 px-2 text-right bg-green-600 border-r">{formatCurrency(summaryData?.totalPayout || 0)}</td>
                      {dailyData.map(d => (
                        <td key={d.date} className={`py-2 px-1 text-center ${d.isWeekend ? 'bg-amber-600' : ''}`}>{d.total || ''}</td>
                      ))}
                    </tr>
                    {/* Working Days Left Row */}
                    <tr className="bg-orange-100 font-medium">
                      <td className="py-1.5 px-2 sticky left-0 bg-orange-100 z-10 border-r"></td>
                      <td className="py-1.5 px-2 sticky left-[40px] bg-orange-100 z-10 border-r text-orange-800">Working Days Left</td>
                      <td className="py-1.5 px-2 sticky left-[180px] bg-orange-100 z-10 border-r"></td>
                      <td colSpan={11} className="py-1.5 px-2 border-r"></td>
                      {allDatesInMonth.map(d => {
                        const today = new Date();
                        const cellDate = new Date(parseInt(year), parseInt(month) - 1, d.date);
                        const isToday = today.toDateString() === cellDate.toDateString();
                        const isPast = cellDate < today && !isToday;
                        const isFuture = cellDate > today;
                        const isWorkingDay = !d.isWeekend;
                        
                        return (
                          <td key={d.date} className={`py-1.5 px-1 text-center text-[10px] ${
                            isToday ? 'bg-blue-500 text-white font-bold' :
                            isPast ? 'bg-gray-200 text-gray-400' :
                            isFuture && isWorkingDay ? 'bg-orange-200 text-orange-800' :
                            'bg-amber-100'
                          }`}>
                            {isFuture && isWorkingDay ? '•' : ''}
                          </td>
                        );
                      })}
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