// pages/payout/PayoutDailyCasesPage.jsx
// Daily Cases view — navigated from Resource Payout Calculator

import { useLocation, useNavigate } from 'react-router-dom';

const PayoutDailyCasesPage = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const {
    resourceData = [],
    allDatesInMonth = [],
    dailyData = [],
    month,
    year,
    summaryData
  } = location.state || {};

  const formatNumber = (num) => new Intl.NumberFormat('en-US').format(num || 0);

  const monthLabel = month && year
    ? new Date(parseInt(year), parseInt(month) - 1).toLocaleString('default', { month: 'long', year: 'numeric' })
    : '';

  const getCellColor = (value) => {
    if (!value) return 'bg-white text-gray-400';
    if (value >= 21) return 'bg-green-500 text-white font-bold';
    if (value >= 16) return 'bg-green-300 text-green-900';
    if (value >= 13) return 'bg-yellow-300 text-yellow-900';
    return 'bg-red-200 text-red-900';
  };

  const cellStyle = "border border-gray-300 px-1.5 py-1 text-[11px]";
  const headerStyle = "border border-gray-400 px-1.5 py-1.5 font-bold text-[11px]";

  if (!resourceData.length) {
    return (
      <div className="bg-gray-100 min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-gray-500">No data available. Go back and load data first.</p>
        <button
          onClick={() => navigate('/payout/calculator')}
          className="px-4 py-2 bg-indigo-600 text-white rounded font-medium hover:bg-indigo-700"
        >
          ← Back to Calculator
        </button>
      </div>
    );
  }

  return (
    <div className="bg-gray-100 min-h-screen">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-700 to-purple-700 text-white px-4 py-2.5 flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold">Daily Cases View</h1>
          <p className="text-xs text-indigo-200">{monthLabel} — {resourceData.length} resources</p>
        </div>
        <div className="flex items-center gap-3">
          {summaryData && (
            <div className="flex items-center gap-4 text-xs">
              <div className="text-right">
                <div className="text-indigo-200">Total Cases</div>
                <div className="text-base font-bold">{formatNumber(summaryData.totalCases)}</div>
              </div>
              <div className="text-right">
                <div className="text-indigo-200">Resources</div>
                <div className="text-base font-bold">{summaryData.totalResources}</div>
              </div>
            </div>
          )}
          <button
            onClick={() => navigate(-1)}
            className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded text-xs font-medium transition"
          >
            ← Back to Calculator
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="bg-white border-b px-4 py-1.5 flex items-center gap-6 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded bg-green-500"></span> ≥21 cases/hr</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded bg-green-300"></span> 16–20</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded bg-yellow-300"></span> 13–15</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded bg-red-200"></span> &lt;13</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded bg-amber-100 border border-amber-300"></span> Weekend</span>
      </div>

      {/* Table */}
      <div className="p-2">
        <div className="bg-white rounded shadow-sm w-full overflow-hidden">
          <div className="overflow-auto w-full" style={{ maxHeight: 'calc(100vh - 130px)' }}>
            <table className="text-[11px] border-collapse bg-white w-full" style={{ minWidth: 'max-content' }}>
              <thead className="sticky top-0 z-20">
                {/* Group row */}
                <tr>
                  <th colSpan={3} className={`${headerStyle} bg-slate-700 text-white text-left sticky left-0 z-30`}>DATE</th>
                  <th colSpan={resourceData.length} className={`${headerStyle} bg-indigo-600 text-white text-center`}>
                    RESOURCES — Daily Cases ({resourceData.length})
                  </th>
                </tr>
                {/* Column headers */}
                <tr className="bg-gray-100">
                  <th className={`${headerStyle} sticky top-0 left-0 z-30 bg-gray-200 w-[70px] text-center`}>Date</th>
                  <th className={`${headerStyle} sticky top-0 left-[70px] z-30 bg-gray-200 w-[40px] text-center`}>Day</th>
                  <th className={`${headerStyle} sticky top-0 left-[110px] z-30 bg-slate-100 w-[60px] text-center`}>Total</th>
                  {resourceData.map((r, i) => (
                    <th
                      key={i}
                      className={`${headerStyle} sticky top-0 z-20 bg-gray-100 min-w-[110px] text-center whitespace-nowrap`}
                      title={r.email}
                    >
                      {r.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allDatesInMonth.map((d, rowIdx) => {
                  const dayTotal = dailyData.find(dd => dd.date === d.date)?.total || 0;
                  return (
                    <tr
                      key={rowIdx}
                      className={d.isWeekend ? 'bg-amber-50/40' : 'hover:bg-slate-50/50'}
                    >
                      <td className={`${cellStyle} sticky left-0 z-10 bg-white font-medium text-slate-700 text-center`}>
                        {String(d.date).padStart(2, '0')}/{String(month).padStart(2, '0')}
                      </td>
                      <td className={`${cellStyle} sticky left-[70px] z-10 bg-white text-center text-slate-500`}>
                        {d.dayName}
                      </td>
                      <td className={`${cellStyle} sticky left-[110px] z-10 text-center font-bold ${
                        d.isWeekend
                          ? 'bg-amber-100 text-amber-700'
                          : dayTotal > 0
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-rose-50 text-rose-400'
                      }`}>
                        {formatNumber(dayTotal)}
                      </td>
                      {resourceData.map((r, colIdx) => {
                        const cases = r.dailyCases?.[d.date] || 0;
                        return (
                          <td
                            key={colIdx}
                            className={`${cellStyle} text-center ${
                              d.isWeekend ? 'bg-amber-50 text-amber-600' : getCellColor(cases)
                            }`}
                          >
                            {cases || 0}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}

                {/* Total Row */}
                <tr className="sticky bottom-0 z-10 bg-slate-800 text-white font-bold">
                  <td className={`${cellStyle} sticky left-0 z-20 bg-slate-800 border-slate-600`}>Total</td>
                  <td className={`${cellStyle} sticky left-[70px] z-20 bg-slate-800 border-slate-600`}></td>
                  <td className={`${cellStyle} sticky left-[110px] z-20 bg-emerald-600 border-emerald-500 text-center`}>
                    {formatNumber(summaryData?.totalCases || 0)}
                  </td>
                  {resourceData.map((r, i) => (
                    <td key={i} className={`${cellStyle} text-center border-slate-600 ${r.totalCases > 0 ? 'bg-slate-700' : 'bg-slate-800 text-slate-400'}`}>
                      {formatNumber(r.totalCases)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PayoutDailyCasesPage;
