// src/pages/payout/QCPayoutDashboard.jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_BACKEND_URL;

const QC_RATE = 0.50;
const EMPTY_ROWS_FILL = 25; // max empty rows to fill the grid

const months = [
  { value: 1, label: 'January' }, { value: 2, label: 'February' },
  { value: 3, label: 'March' }, { value: 4, label: 'April' },
  { value: 5, label: 'May' }, { value: 6, label: 'June' },
  { value: 7, label: 'July' }, { value: 8, label: 'August' },
  { value: 9, label: 'September' }, { value: 10, label: 'October' },
  { value: 11, label: 'November' }, { value: 12, label: 'December' }
];

const formatCurrency = (val) => {
  if (val === 0 || val === undefined || val === null) return '-';
  return `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Fixed column widths so header, body rows, and grand total all align
const COL_WIDTHS = {
  hash: '4%',
  name: '18%',
  mro_cases: '11%',
  mro_payout: '11%',
  verisma_cases: '11%',
  verisma_payout: '11%',
  datavant_cases: '11%',
  datavant_payout: '11%',
  total_cases: '11%',
  total_payout: '12%',
};

const COL_WIDTHS_NO_DATAVANT = {
  hash: '4%',
  name: '20%',
  mro_cases: '13%',
  mro_payout: '13%',
  verisma_cases: '13%',
  verisma_payout: '13%',
  total_cases: '12%',
  total_payout: '12%',
};

const QCPayoutDashboard = () => {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const resourcesPerPage = 15;

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return [currentYear - 1, currentYear, currentYear + 1];
  }, []);

  const getAuthHeaders = useCallback(() => ({
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
  }), []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/qc-payout`, {
        ...getAuthHeaders(),
        params: { month, year }
      });
      setData(res.data);
      setPage(1);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load QC payout data');
    } finally {
      setLoading(false);
    }
  }, [month, year, getAuthHeaders]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredResources = useMemo(() => {
    if (!data?.resources) return [];
    if (!searchQuery.trim()) return data.resources;
    const q = searchQuery.toLowerCase().trim();
    return data.resources.filter(r =>
      r.resource_name?.toLowerCase().includes(q)
    );
  }, [data, searchQuery]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery]);

  const paginatedResources = useMemo(() => {
    const start = (page - 1) * resourcesPerPage;
    return filteredResources.slice(start, start + resourcesPerPage);
  }, [filteredResources, page]);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredResources.length / resourcesPerPage));
  }, [filteredResources]);

  const hasDatavant = data?.totals?.datavant_qc_cases > 0;
  const colWidths = hasDatavant ? COL_WIDTHS : COL_WIDTHS_NO_DATAVANT;

  // Number of empty rows to fill remaining space
  const emptyRowCount = Math.max(0, EMPTY_ROWS_FILL - paginatedResources.length);

  const renderColGroup = () => (
    <colgroup>
      <col style={{ width: colWidths.hash }} />
      <col style={{ width: colWidths.name }} />
      <col style={{ width: colWidths.mro_cases }} />
      <col style={{ width: colWidths.mro_payout }} />
      <col style={{ width: colWidths.verisma_cases }} />
      <col style={{ width: colWidths.verisma_payout }} />
      {hasDatavant && (
        <>
          <col style={{ width: colWidths.datavant_cases }} />
          <col style={{ width: colWidths.datavant_payout }} />
        </>
      )}
      <col style={{ width: colWidths.total_cases }} />
      <col style={{ width: colWidths.total_payout }} />
    </colgroup>
  );

  const baseCols = hasDatavant ? 10 : 8;

  return (
    <div className="p-4 space-y-4 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">QC Payout Dashboard</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Each completed QC case pays ${QC_RATE.toFixed(2)} per case
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={month}
            onChange={(e) => setMonth(parseInt(e.target.value))}
            className="px-3 py-1.5 text-xs border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500"
          >
            {months.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value))}
            className="px-3 py-1.5 text-xs border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500"
          >
            {years.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button
            onClick={fetchData}
            disabled={loading}
            className="px-4 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-white rounded-lg border p-3 shadow-sm">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Total QC Resources</p>
            <p className="text-xl font-bold text-gray-800">{data.resource_count}</p>
          </div>
          <div className="bg-white rounded-lg border p-3 shadow-sm">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Total QC Cases</p>
            <p className="text-xl font-bold text-blue-700">{data.totals?.total_qc_cases || 0}</p>
          </div>
          <div className="bg-white rounded-lg border p-3 shadow-sm">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">MRO QC Cases</p>
            <p className="text-xl font-bold text-blue-600">{data.totals?.mro_qc_cases || 0}</p>
          </div>
          <div className="bg-white rounded-lg border p-3 shadow-sm">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Verisma QC Cases</p>
            <p className="text-xl font-bold text-orange-600">{data.totals?.verisma_qc_cases || 0}</p>
          </div>
          <div className="bg-green-50 rounded-lg border border-green-200 p-3 shadow-sm">
            <p className="text-[10px] text-green-600 uppercase tracking-wide font-medium">Total Payout</p>
            <p className="text-xl font-bold text-green-700">{formatCurrency(data.totals?.total_payout)}</p>
          </div>
        </div>
      )}

      {/* Resource-wise QC Payout Table */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 220px)' }}>
        {/* Table Header with Search */}
        <div className="px-4 py-2.5 bg-gray-700 text-white flex justify-between items-center flex-shrink-0">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold">Resource-wise QC Payout Breakdown</h3>
            <span className="text-xs bg-gray-600 px-2 py-0.5 rounded">
              {filteredResources.length}{filteredResources.length !== (data?.resources?.length || 0) ? ` / ${data?.resources?.length}` : ''} resources
            </span>
          </div>
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by resource name..."
              className="pl-8 pr-3 py-1.5 text-xs rounded-md bg-gray-600 text-white placeholder-gray-400 border border-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400 w-56"
            />
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-500 flex-1 flex flex-col items-center justify-center">
            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-3"></div>
            Loading QC payout data...
          </div>
        ) : (
          <div className="overflow-auto flex-1 min-h-0">
            <table className="w-full text-xs table-fixed border-collapse">
              {renderColGroup()}
              {/* Sticky header */}
              <thead className="bg-gray-100 text-gray-700 sticky top-0 z-20">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold border border-gray-300">#</th>
                  <th className="px-3 py-2 text-left font-semibold border border-gray-300">Resource Name</th>
                  <th className="px-3 py-2 text-center font-semibold border border-gray-300 bg-blue-50">MRO QC Cases</th>
                  <th className="px-3 py-2 text-center font-semibold border border-gray-300 bg-blue-50">MRO Payout</th>
                  <th className="px-3 py-2 text-center font-semibold border border-gray-300 bg-orange-50">Verisma QC Cases</th>
                  <th className="px-3 py-2 text-center font-semibold border border-gray-300 bg-orange-50">Verisma Payout</th>
                  {hasDatavant && (
                    <>
                      <th className="px-3 py-2 text-center font-semibold border border-gray-300 bg-cyan-50">Datavant QC Cases</th>
                      <th className="px-3 py-2 text-center font-semibold border border-gray-300 bg-cyan-50">Datavant Payout</th>
                    </>
                  )}
                  <th className="px-3 py-2 text-center font-semibold border border-gray-300 bg-gray-200">Total Cases</th>
                  <th className="px-3 py-2 text-center font-semibold border border-gray-300 bg-green-100 text-green-800">Total Payout</th>
                </tr>
              </thead>

              {/* Sticky grand total at bottom */}
              <tfoot className="sticky bottom-0 z-20">
                <tr className="bg-green-600 text-white font-bold">
                  <td className="px-3 py-2.5 border border-green-700" colSpan={2}>GRAND TOTAL</td>
                  <td className="px-3 py-2.5 text-center border border-green-700">{data?.totals?.mro_qc_cases || 0}</td>
                  <td className="px-3 py-2.5 text-center border border-green-700">{formatCurrency((data?.totals?.mro_qc_cases || 0) * QC_RATE)}</td>
                  <td className="px-3 py-2.5 text-center border border-green-700">{data?.totals?.verisma_qc_cases || 0}</td>
                  <td className="px-3 py-2.5 text-center border border-green-700">{formatCurrency((data?.totals?.verisma_qc_cases || 0) * QC_RATE)}</td>
                  {hasDatavant && (
                    <>
                      <td className="px-3 py-2.5 text-center border border-green-700">{data?.totals?.datavant_qc_cases || 0}</td>
                      <td className="px-3 py-2.5 text-center border border-green-700">{formatCurrency((data?.totals?.datavant_qc_cases || 0) * QC_RATE)}</td>
                    </>
                  )}
                  <td className="px-3 py-2.5 text-center border border-green-700">{data?.totals?.total_qc_cases || 0}</td>
                  <td className="px-3 py-2.5 text-center border border-green-700">{formatCurrency(data?.totals?.total_payout)}</td>
                </tr>
              </tfoot>

              <tbody>
                {/* Data rows */}
                {paginatedResources.map((r, idx) => (
                  <tr key={r.resource_email} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-3 py-2 font-medium text-gray-500 border border-gray-200">
                      {(page - 1) * resourcesPerPage + idx + 1}
                    </td>
                    <td className="px-3 py-2 font-medium text-gray-800 border border-gray-200 truncate">
                      {r.resource_name}
                    </td>
                    <td className="px-3 py-2 text-center border border-gray-200">{r.mro_qc_cases || '-'}</td>
                    <td className="px-3 py-2 text-center border border-gray-200 font-medium text-blue-700">
                      {r.mro_qc_cases ? formatCurrency(r.mro_qc_cases * QC_RATE) : '-'}
                    </td>
                    <td className="px-3 py-2 text-center border border-gray-200">{r.verisma_qc_cases || '-'}</td>
                    <td className="px-3 py-2 text-center border border-gray-200 font-medium text-orange-700">
                      {r.verisma_qc_cases ? formatCurrency(r.verisma_qc_cases * QC_RATE) : '-'}
                    </td>
                    {hasDatavant && (
                      <>
                        <td className="px-3 py-2 text-center border border-gray-200">{r.datavant_qc_cases || '-'}</td>
                        <td className="px-3 py-2 text-center border border-gray-200 font-medium text-cyan-700">
                          {r.datavant_qc_cases ? formatCurrency(r.datavant_qc_cases * QC_RATE) : '-'}
                        </td>
                      </>
                    )}
                    <td className="px-3 py-2 text-center border border-gray-200 font-bold text-gray-800">{r.total_qc_cases}</td>
                    <td className="px-3 py-2 text-center border border-gray-200 font-bold text-green-700">{formatCurrency(r.total_payout)}</td>
                  </tr>
                ))}

                {/* Empty rows to fill grid like Excel */}
                {Array.from({ length: emptyRowCount }).map((_, idx) => (
                  <tr key={`empty-${idx}`} className={((paginatedResources.length + idx) % 2 === 0) ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-3 py-2 border border-gray-200">&nbsp;</td>
                    <td className="px-3 py-2 border border-gray-200">&nbsp;</td>
                    <td className="px-3 py-2 border border-gray-200">&nbsp;</td>
                    <td className="px-3 py-2 border border-gray-200">&nbsp;</td>
                    <td className="px-3 py-2 border border-gray-200">&nbsp;</td>
                    <td className="px-3 py-2 border border-gray-200">&nbsp;</td>
                    {hasDatavant && (
                      <>
                        <td className="px-3 py-2 border border-gray-200">&nbsp;</td>
                        <td className="px-3 py-2 border border-gray-200">&nbsp;</td>
                      </>
                    )}
                    <td className="px-3 py-2 border border-gray-200">&nbsp;</td>
                    <td className="px-3 py-2 border border-gray-200">&nbsp;</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {filteredResources.length > resourcesPerPage && (
          <div className="px-4 py-3 border-t bg-gray-50 flex items-center justify-between flex-shrink-0">
            <p className="text-xs text-gray-500">
              Showing {(page - 1) * resourcesPerPage + 1}-{Math.min(page * resourcesPerPage, filteredResources.length)} of {filteredResources.length} resources
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(1)}
                disabled={page === 1}
                className="px-2 py-1 text-xs border rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                First
              </button>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-2 py-1 text-xs border rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Prev
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`px-2.5 py-1 text-xs border rounded ${
                    p === page ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-gray-100'
                  }`}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-2 py-1 text-xs border rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={page === totalPages}
                className="px-2 py-1 text-xs border rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Last
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default QCPayoutDashboard;
