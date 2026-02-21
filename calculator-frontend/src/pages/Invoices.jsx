import React, { useState, useMemo, useEffect } from 'react';

const apiBaseUrl = import.meta.env.VITE_BACKEND_URL  ;

const Invoices = () => {
  const [invoices, setInvoices] = useState([]);
  const [projectsList, setProjectsList] = useState([]); 
  const [subprojectsList, setSubprojectsList] = useState([]); 
  const [isLoading, setIsLoading] = useState(true);
  
  // State for filtering
  const [filters, setFilters] = useState({
    search: '',
    billingMonth: 'all',
    projectName: '', 
    subprojectName: '' 
  });

  // State for Modal & Details
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isPdfLibReady, setIsPdfLibReady] = useState(false);

  // --- LOAD PDF LIBRARIES ---
  useEffect(() => {
    const loadPdfScripts = async () => {
      const loadScript = (src) => new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) return resolve();
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.body.appendChild(script);
      });

      try {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
        setIsPdfLibReady(true);
      } catch (err) {
        console.error('Failed to load PDF libraries:', err);
      }
    };

    loadPdfScripts();
  }, []);

  // --- FETCH PROJECTS AND SUBPROJECTS FOR FILTERS ---
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const res = await fetch(`${apiBaseUrl}/project/project-subproject`);
        if (!res.ok) throw new Error('Failed to fetch project structure');
        const projectStructure = await res.json();

        // Extract unique lists for filters
        const projects = projectStructure.map(p => ({ _id: p._id, name: p.name }));
        const subprojects = projectStructure.flatMap(p =>
          (p.subprojects || []).map(sp => ({
            _id: sp._id,
            name: sp.name,
            projectId: p._id
          }))
        );

        setProjectsList(projects);
        setSubprojectsList(subprojects);

      } catch (err) {
        console.error('Error fetching project data for filters:', err);
      }
    };

    fetchProjects();
  }, []);

  // --- FETCH INVOICE LIST (Lightweight) ---
  useEffect(() => {
    const fetchInvoices = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`${apiBaseUrl}/invoices`);
        if (!res.ok) throw new Error('Failed to fetch invoices');
        const data = await res.json();
        setInvoices(data);
      } catch (err) {
        console.error('Error fetching invoices:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchInvoices();
  }, []);

  // --- FETCH SINGLE INVOICE DETAILS ---
  const fetchInvoiceDetails = async (id) => {
    try {
      const res = await fetch(`${apiBaseUrl}/invoices/${id}`);
      if (!res.ok) throw new Error('Failed to fetch invoice details');
      return await res.json();
    } catch (err) {
      console.error(err);
      alert("Error loading invoice details");
      return null;
    }
  };

  const handleRowClick = async (id) => {
    setIsDetailLoading(true);
    const fullInvoice = await fetchInvoiceDetails(id);
    if (fullInvoice) {
      setSelectedInvoice(fullInvoice);
    }
    setIsDetailLoading(false);
  };

  // --- MAPPER: Handle new API structure ---
  // The API now returns flattened names in billing_records (project_name, etc.)
  const getLookups = (invoice) => {
    if (!invoice || !invoice.billing_records) return [];
    
    return invoice.billing_records.map(record => ({
      ...record,
      projectName: record.project_name || 'N/A',
      subprojectName: record.subproject_name || 'N/A',
      resourceName: record.resource_name || 'N/A'
    }));
  };

  // --- GENERATE UNIQUE MONTH/YEAR FOR DROPDOWN ---
  // Note: Since the list view might not have billing_records, we rely on the invoice metadata if available, 
  // or fall back to parsing records if the API includes them. 
  // *Assumption*: The list API includes 'billing_records' or separate month/year fields. 
  // Based on your backend, 'billing_records' are excluded in list view. 
  // If your invoice model has 'month' and 'year' at the root level (it should for efficiency), use that.
  // For this implementation, we will try to find date info.
  const uniqueBillingPeriods = useMemo(() => {
    const periods = new Set();
    invoices.forEach(invoice => {
      // Logic: If invoice has metadata month/year (ideal), otherwise check billing records (if present)
      let month = invoice.month; 
      let year = invoice.year;

      // Fallback if root properties don't exist but records do (unlikely with optimization, but safe)
      if (!month && invoice.billing_records?.[0]) {
         month = invoice.billing_records[0].month;
         year = invoice.billing_records[0].year;
      }

      // Fallback 2: Use created date if strictly necessary
      if (!month) {
         const date = new Date(invoice.createdAt);
         month = date.getMonth() + 1;
         year = date.getFullYear();
      }

      if (month && year) {
        const monthName = new Date(0, month - 1).toLocaleString('default', { month: 'long' });
        periods.add(`${monthName} ${year}`);
      }
    });

    return ['all', ...Array.from(periods).sort((a, b) => {
      const dateA = new Date(Date.parse(`1 ${a}`));
      const dateB = new Date(Date.parse(`1 ${b}`));
      return dateB - dateA; 
    })];
  }, [invoices]);


  // --- FILTERED INVOICES ---
  const filteredInvoices = useMemo(() => {
    const searchLower = filters.search.toLowerCase();
    const monthFilter = filters.billingMonth;
    
    // Note: Project/Subproject filtering on the LIST view is harder without populate.
    // We will filter based on what data is available in the invoice object.
    
    return invoices.filter(inv => {
      // 1. Invoice Number Search
      if (!inv.invoice_number.toLowerCase().includes(searchLower)) {
        return false;
      }

      // 2. Billing Month Filter
      if (monthFilter !== 'all') {
        let month = inv.month;
        let year = inv.year;
        
        // Fallback logic similar to above
        if (!month && inv.billing_records?.[0]) {
            month = inv.billing_records[0].month;
            year = inv.billing_records[0].year;
        }
        if (!month) {
            const date = new Date(inv.createdAt);
            month = date.getMonth() + 1;
            year = date.getFullYear();
        }

        const monthName = new Date(0, month - 1).toLocaleString('default', { month: 'long' });
        const invoicePeriod = `${monthName} ${year}`;
        
        if (invoicePeriod !== monthFilter) {
          return false;
        }
      }

      // 3. Project Filter (Optimistic: Checks if inv has project data directly or in records)
      // Since the list view is optimized, deep filtering usually happens on Backend.
      // For Client-side filtering here, we skip project filtering if data isn't loaded.
      
      return true;
    });
  }, [invoices, filters]);

  // --- HELPERS ---
  const formatCurrency = (n) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);

  const formatDate = (d) =>
    new Date(d).toLocaleString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    });

  const getBillingMonthText = (invoice) => {
    // Try root level first, then records, then createdAt
    let month = invoice.month;
    let year = invoice.year;

    if (!month && invoice.billing_records?.[0]) {
        month = invoice.billing_records[0].month;
        year = invoice.billing_records[0].year;
    }
    
    if (month && year) {
      const monthName = new Date(0, month - 1).toLocaleString('default', { month: 'long' });
      return `${monthName} ${year}`;
    }
    
    return formatDate(invoice.createdAt);
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    let newFilters = { ...filters, [name]: value };
    if (name === 'projectName') newFilters.subprojectName = '';
    setFilters(newFilters);
  };

  // --- PDF DOWNLOAD ---
  const handleDownloadPdf = () => {
    if (!isPdfLibReady || !selectedInvoice) 
      return console.error("PDF not ready or no invoice selected.");

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(20);
    doc.text(`Invoice: ${selectedInvoice.invoice_number}`, 14, 22);

    doc.setFontSize(12);
    doc.text(`For Period: ${getBillingMonthText(selectedInvoice)}`, 14, 30);
    doc.text(`Date Generated: ${formatDate(selectedInvoice.createdAt)}`, 14, 36);

    const rows = getLookups(selectedInvoice);
    const head = [['Project', 'Sub-Project', 'Resource', 'Hours', 'Flat Rate', 'Rate', 'Costing', 'Total', 'Status']];

    const body = rows.map(r => {
      const isNonBillable = r.billable_status?.toLowerCase() === 'non-billable';
      const totalValue = isNonBillable ? 0 : r.total_amount;

      return [
        r.projectName,
        r.subprojectName,
        r.resourceName,
        r.hours,
        formatCurrency(r.flatrate),
        formatCurrency(r.rate),
        formatCurrency(r.costing),
        formatCurrency(totalValue),
        r.billable_status
      ];
    });

    doc.autoTable({ startY: 45, head, body });
    const finalY = doc.autoTable.previous.finalY;

    // Totals
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    let currentY = finalY + 15;
    doc.setFont('helvetica', 'normal');
    doc.text(`Total Costing Amount: ${formatCurrency(selectedInvoice.total_costing_amount)}`, 14, currentY);
    currentY += 8;
    doc.text(`Total Billing Amount: ${formatCurrency(selectedInvoice.total_billable_amount)}`, 14, currentY);

    doc.save(`Invoice-${selectedInvoice.invoice_number}.pdf`);
  };

  // --- CSV DOWNLOAD ---
  const handleDownloadCsv = async (invoiceOrId) => {
    let invoiceToDownload = invoiceOrId;

    // If we only have the lightweight invoice (no billing records), fetch full details
    if (!invoiceToDownload.billing_records || invoiceToDownload.billing_records.length === 0) {
        // Show a temporary loading state or toast if you have one
        const fullDetails = await fetchInvoiceDetails(invoiceToDownload._id);
        if(!fullDetails) return;
        invoiceToDownload = fullDetails;
    }

    const records = getLookups(invoiceToDownload);
    const period = getBillingMonthText(invoiceToDownload);

    const headers = [
      "Invoice_Number",
      "Billing_Period",
      "Project",
      "Sub_Project",
      "Resource",
      "Hours",
      "Flat_Rate",
      "Rate",
      "Costing",
      "Total",
      "Status"
    ];

    const csvRows = records.map(r => {
      const isNonBillable = r.billable_status?.toLowerCase() === 'non-billable';
      const totalValue = isNonBillable ? 0 : r.total_amount;

      return [
        invoiceToDownload.invoice_number,
        period,
        `"${r.projectName?.replace(/"/g, '""') || ''}"`,
        `"${r.subprojectName?.replace(/"/g, '""') || ''}"`,
        `"${r.resourceName?.replace(/"/g, '""') || ''}"`,
        r.hours || 0,
        r.flatrate || 0,
        r.rate || 0,
        r.costing || 0,
        totalValue || 0,
        r.billable_status || ''
      ].join(',');
    });

    const summaryRows = [
      "",
      "SUMMARY TOTALS",
      "",
      `Total Costing Amount:,${invoiceToDownload.total_costing_amount || 0}`,
      `Total Billable Amount:,${invoiceToDownload.total_billable_amount || 0}`
    ];

    const csvContent = [headers.join(','), ...csvRows, '', ...summaryRows].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Invoice-${invoiceToDownload.invoice_number}.csv`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  // --- RENDER ---
  return (
    <div className="bg-gray-50 min-h-screen p-4 sm:p-6 lg:p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Invoice Dashboard</h1>
          <p className="text-gray-600 mt-1">A summary of all generated invoices.</p>
        </header>

        {/* Filters */}
        <div className="bg-white p-4 rounded-xl shadow-sm mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="search" className="block text-sm font-medium text-gray-700">Search by Invoice #</label>
              <input
                type="text"
                name="search"
                id="search"
                value={filters.search}
                onChange={handleFilterChange}
                placeholder="e.g., INV-2025-10-001"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
            </div>

            <div>
              <label htmlFor="billingMonth" className="block text-sm font-medium text-gray-700">Billing Month</label>
              <select
                id="billingMonth"
                name="billingMonth"
                value={filters.billingMonth}
                onChange={handleFilterChange}
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              >
                {uniqueBillingPeriods.map(period => (
                  <option key={period} value={period}>
                    {period === 'all' ? 'All Months' : period}
                  </option>
                ))}
              </select>
            </div>
            
            {/* Project Filters removed here as Server-Side filtering on the list view requires 
                additional backend endpoint parameters. Kept Search/Month as they are robust. */}
          </div>
        </div>

        {/* Invoice Table */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {['Invoice #', 'Billing Period', 'Billing Total', 'Costing Total', 'Billable Amount', 'Items', 'Created', 'Download'].map(header => (
                    <th key={header} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {isLoading ? (
                  <tr><td colSpan="8" className="text-center py-10">Loading invoices...</td></tr>
                ) : filteredInvoices.map(invoice => (
                  <tr key={invoice._id} onClick={() => handleRowClick(invoice._id)} className="hover:bg-gray-50 cursor-pointer">
                    <td className="px-6 py-4 text-sm font-medium text-blue-600">{invoice.invoice_number}</td>
                    <td className="px-6 py-4 text-sm text-gray-800 font-medium">{getBillingMonthText(invoice)}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-gray-900">{formatCurrency(invoice.total_billing_amount)}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{formatCurrency(invoice.total_costing_amount)}</td>
                    <td className="px-6 py-4 text-sm text-green-700">{formatCurrency(invoice.total_billable_amount)}</td>
                    {/* Access record length if available, or assume detail load needed */}
                    <td className="px-6 py-4 text-sm text-gray-500">
                        {invoice.billing_records ? invoice.billing_records.length : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{formatDate(invoice.createdAt)}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadCsv(invoice);
                        }}
                        className="text-xs font-semibold text-green-600 hover:text-green-800 transition duration-150 p-2 rounded-lg bg-green-50 hover:bg-green-100 shadow-sm"
                      >
                        Download CSV
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-gray-200 flex justify-between items-start">
              <div>
                <h2 className="text-2xl font-bold text-gray-800">Invoice {selectedInvoice.invoice_number}</h2>
              </div>
              <button onClick={() => setSelectedInvoice(null)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>

            <div className="p-6 overflow-y-auto">
              {isDetailLoading ? (
                  <div className="flex justify-center py-10">Loading Details...</div>
              ) : (
                <>
                  <h3 className="text-lg font-semibold text-gray-700 mb-4">Billing Records ({selectedInvoice.billing_records.length})</h3>
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          {['Project', 'Sub-Project', 'Resource', 'Hours', 'Flat Rate', 'Costing Rate', 'Costing', 'Total', 'Status'].map(h => (
                            <th key={h} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {getLookups(selectedInvoice).map(record => (
                          <tr key={record._id}>
                            <td className="px-4 py-3 text-sm text-gray-700">{record.projectName}</td>
                            <td className="px-4 py-3 text-sm text-gray-700">{record.subprojectName}</td>
                            <td className="px-4 py-3 text-sm text-gray-800">{record.resourceName}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{record.hours}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{formatCurrency(record.flatrate)}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{formatCurrency(record.rate)}</td>
                            <td className="px-4 py-3 text-sm text-red-600">{formatCurrency(record.costing)}</td>
                            <td className="px-4 py-3 text-sm font-semibold text-gray-800">
                              {formatCurrency(record.billable_status?.toLowerCase() === 'non-billable' ? 0 : record.total_amount)}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">{record.billable_status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-end space-x-3">
              <button
                onClick={handleDownloadPdf}
                disabled={!isPdfLibReady || isDetailLoading}
                className={`px-4 py-2 rounded-lg text-white flex items-center space-x-2 ${isPdfLibReady && !isDetailLoading ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-400 cursor-not-allowed'}`}
              >
                <span>{isPdfLibReady ? 'Download PDF' : 'Loading Libs...'}</span>
              </button>
              <button
                onClick={() => handleDownloadCsv(selectedInvoice)}
                className="px-4 py-2 rounded-lg text-white flex items-center space-x-2 bg-green-600 hover:bg-green-700"
              >
                <span>Download CSV</span>
              </button>
              <button onClick={() => setSelectedInvoice(null)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Invoices;