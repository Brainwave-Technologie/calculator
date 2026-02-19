// utils/payrollExcelExport.js
const ExcelJS = require('exceljs');

// Color constants matching the images
const COLORS = {
  HEADER_YELLOW: 'FFFFCC00',
  HEADER_ORANGE: 'FFFF9900',
  LOCATION_ORANGE: 'FFFF6600',
  COST_GREEN: 'FF92D050',
  DATA_GREEN: 'FF00B050',
  DATA_RED: 'FFFF6B6B',
  TOTAL_GREEN: 'FF92D050',
  WEEKEND_YELLOW: 'FFFFF2CC',
  SLAB_RED: 'FFFF0000',
  SLAB_YELLOW: 'FFFFFF00',
  SLAB_GREEN: 'FF00FF00',
  SLAB_BLUE: 'FF00B0F0',
  BORDER: 'FFD9D9D9'
};

/**
 * Generate Verisma Payroll Excel (Day-wise format)
 * Matches Image 1: Date | Day | Overall | Resource1 | Resource2 | ...
 */
const generateVerismaPayrollExcel = async (data) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Billing System';
  workbook.created = new Date();
  
  const sheet = workbook.addWorksheet('Verisma Payroll', {
    views: [{ state: 'frozen', xSplit: 3, ySplit: 2 }]
  });

  // Build headers
  const headers = ['Date', 'Day', 'Overall'];
  const resourceNames = data.resources?.map(r => r.name) || [];
  headers.push(...resourceNames);

  // Add "Go To Index" link row (row 1)
  sheet.addRow(['Go To Index']);
  sheet.getRow(1).font = { color: { argb: 'FF0000FF' }, underline: true };

  // Add header row (row 2)
  const headerRow = sheet.addRow(headers);
  headerRow.eachCell((cell, colNumber) => {
    cell.font = { bold: true, size: 10 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' }
    };
    
    if (colNumber === 1 || colNumber === 2) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HEADER_YELLOW } };
    } else if (colNumber === 3) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HEADER_ORANGE } };
    } else {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
    }
  });

  // Set column widths
  sheet.getColumn(1).width = 12; // Date
  sheet.getColumn(2).width = 6;  // Day
  sheet.getColumn(3).width = 10; // Overall
  for (let i = 4; i <= headers.length; i++) {
    sheet.getColumn(i).width = 8;
  }

  // Add data rows
  data.dates?.forEach((dateInfo, dateIdx) => {
    const rowData = [
      dateInfo.dateStr,
      dateInfo.dayName,
      data.dailyTotals?.[dateInfo.dateStr] || 0
    ];

    // Add resource cases
    data.resources?.forEach(resource => {
      rowData.push(resource.daily_cases?.[dateInfo.dateStr] || 0);
    });

    const row = sheet.addRow(rowData);
    
    row.eachCell((cell, colNumber) => {
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin', color: { argb: COLORS.BORDER } },
        bottom: { style: 'thin', color: { argb: COLORS.BORDER } },
        left: { style: 'thin', color: { argb: COLORS.BORDER } },
        right: { style: 'thin', color: { argb: COLORS.BORDER } }
      };

      // Weekend highlighting
      if (dateInfo.dayName === 'Sun' || dateInfo.dayName === 'Sat') {
        if (colNumber === 2) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.WEEKEND_YELLOW } };
        }
      }

      // Color cells based on value (green for > 0, red for 0)
      if (colNumber > 3) {
        const value = cell.value || 0;
        if (value > 0) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.DATA_GREEN } };
          cell.font = { color: { argb: 'FFFFFFFF' } };
        } else {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.DATA_RED } };
        }
      }
    });
  });

  // Add Grand Total row
  const grandTotalData = ['Grand Total', '', data.grandTotal || 0];
  data.resources?.forEach(resource => {
    grandTotalData.push(resource.total_cases || 0);
  });

  const grandTotalRow = sheet.addRow(grandTotalData);
  grandTotalRow.eachCell((cell, colNumber) => {
    cell.font = { bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.TOTAL_GREEN } };
    cell.border = {
      top: { style: 'medium' },
      bottom: { style: 'medium' },
      left: { style: 'thin' },
      right: { style: 'thin' }
    };
  });

  return workbook;
};

/**
 * Generate MRO Payroll Excel (Location-wise format)
 * Matches Images 2-3: Location | Cost | Worker1 | Worker2 | ... | Total | Resource1 | Resource2 | ...
 */
const generateMROPayrollExcel = async (data) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Billing System';
  workbook.created = new Date();
  
  const sheet = workbook.addWorksheet('MRO Payroll', {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }]
  });

  // Build headers
  const workers = ['Sudesh', 'Moolchand', 'Aanya', 'Vyom']; // Fixed worker columns
  const headers = ['Location', 'Cost', ...workers, 'Total'];
  const resourceNames = data.resources?.map(r => r.name) || [];
  headers.push(...resourceNames);

  // Add header row
  const headerRow = sheet.addRow(headers);
  headerRow.eachCell((cell, colNumber) => {
    cell.font = { bold: true, size: 10 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' }
    };

    if (colNumber === 1) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.LOCATION_ORANGE } };
    } else if (colNumber === 2) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.COST_GREEN } };
    } else if (colNumber <= workers.length + 2) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HEADER_YELLOW } };
    } else if (colNumber === workers.length + 3) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HEADER_ORANGE } };
    }
  });

  // Set column widths
  sheet.getColumn(1).width = 30; // Location
  sheet.getColumn(2).width = 8;  // Cost
  for (let i = 3; i <= workers.length + 2; i++) {
    sheet.getColumn(i).width = 10;
  }
  sheet.getColumn(workers.length + 3).width = 10; // Total
  for (let i = workers.length + 4; i <= headers.length; i++) {
    sheet.getColumn(i).width = 8;
  }

  // Add location rows
  data.locations?.forEach((loc, locIdx) => {
    const rowData = [
      loc.location_name,
      loc.cost_per_case || 0,
      0, 0, 0, 0, // Worker columns (to be filled based on actual data)
      loc.total_cases || 0
    ];

    // Add resource cases
    data.resources?.forEach(resource => {
      const cases = loc.resource_cases?.[resource.id]?.cases || 0;
      rowData.push(cases);
    });

    const row = sheet.addRow(rowData);

    row.eachCell((cell, colNumber) => {
      cell.alignment = { horizontal: colNumber === 1 ? 'left' : 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin', color: { argb: COLORS.BORDER } },
        bottom: { style: 'thin', color: { argb: COLORS.BORDER } },
        left: { style: 'thin', color: { argb: COLORS.BORDER } },
        right: { style: 'thin', color: { argb: COLORS.BORDER } }
      };

      // Location column styling
      if (colNumber === 1) {
        const isLogging = loc.location_name?.toLowerCase().includes('logging');
        cell.fill = { 
          type: 'pattern', 
          pattern: 'solid', 
          fgColor: { argb: isLogging ? 'FF87CEEB' : COLORS.LOCATION_ORANGE } 
        };
      }
      
      // Cost column
      if (colNumber === 2) {
        cell.numFmt = '$#,##0.00';
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.COST_GREEN } };
      }

      // Resource case columns - color based on value
      if (colNumber > workers.length + 3) {
        const value = cell.value || 0;
        if (value > 0) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.DATA_GREEN } };
          cell.font = { color: { argb: 'FFFFFFFF' } };
        }
      }
    });
  });

  // Add Total Processing row
  const totalProcessingRow = sheet.addRow(['Total processing', '', '', '', '', '', data.totalProcessing || 0]);
  totalProcessingRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HEADER_ORANGE } };
  });

  // Add Total Payout row
  const totalPayoutRow = sheet.addRow(['Total Payout', `$${(data.totalPayout || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`]);
  totalPayoutRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.TOTAL_GREEN } };
  });

  return workbook;
};

/**
 * Generate Logging Slab Analysis Excel
 * Matches Images 4-5: Shows avg cases per hour and slab calculations
 */
const generateLoggingSlabExcel = async (data) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Billing System';
  workbook.created = new Date();
  
  const sheet = workbook.addWorksheet('Logging Slab Analysis', {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 2 }]
  });

  // Headers
  const headers = ['Metric', 'Value'];
  const resourceNames = data.resources?.map(r => r.name) || [];
  headers.push(...resourceNames);

  // Header row
  const headerRow = sheet.addRow(headers);
  headerRow.eachCell((cell, colNumber) => {
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HEADER_YELLOW } };
    cell.alignment = { horizontal: 'center' };
    cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });

  // Add metrics rows
  const metrics = [
    { name: 'Total Logged Cases', key: 'total_logging_cases', color: COLORS.HEADER_ORANGE },
    { name: 'Working Days', key: 'total_working_days', color: 'FFE0E0E0' },
    { name: 'Total Hours', key: 'total_logging_hours', color: COLORS.HEADER_YELLOW },
    { name: 'Avg case logged', key: 'avg_cases_per_hour', color: COLORS.COST_GREEN }
  ];

  metrics.forEach(metric => {
    const rowData = [metric.name, data.summary?.[metric.key] || 0];
    data.resources?.forEach(r => {
      rowData.push(r[metric.key] || 0);
    });
    
    const row = sheet.addRow(rowData);
    row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: metric.color } };
    row.getCell(1).font = { bold: true };
  });

  // Add blank row
  sheet.addRow([]);

  // Add slab reference
  const slabs = [
    { range: '0 to 12.99', rate: '$0.50', color: COLORS.SLAB_RED },
    { range: '13 to 15.99', rate: '$0.55', color: COLORS.SLAB_YELLOW },
    { range: '16 to 20.99', rate: '$0.60', color: COLORS.SLAB_GREEN },
    { range: '21 and above', rate: '$0.65', color: COLORS.SLAB_BLUE }
  ];

  slabs.forEach(slab => {
    const row = sheet.addRow([slab.range, slab.rate]);
    row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: slab.color } };
    row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: slab.color } };
  });

  // Set column widths
  sheet.getColumn(1).width = 20;
  sheet.getColumn(2).width = 12;

  return workbook;
};

/**
 * Generate Complete Resource Payout Excel
 */
const generateResourcePayoutExcel = async (payouts, month, year) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Billing System';
  workbook.created = new Date();
  
  const sheet = workbook.addWorksheet('Resource Payouts', {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }]
  });

  // Headers
  const headers = [
    'Resource Name',
    'Email',
    'Working Days',
    'Total Hours',
    'Logging Cases',
    'Avg Cases/Hour',
    'Slab Rate',
    'Processing Cases',
    'Processing Amount',
    'Logging Amount',
    'Complete Logging Cases',
    'Bonus Amount',
    'Grand Total'
  ];

  // Add header row
  const headerRow = sheet.addRow(headers);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HEADER_YELLOW } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = { top: { style: 'thin' }, bottom: { style: 'medium' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });

  // Set column widths
  sheet.getColumn(1).width = 25;
  sheet.getColumn(2).width = 30;
  for (let i = 3; i <= headers.length; i++) {
    sheet.getColumn(i).width = 14;
  }

  // Add data rows
  payouts.forEach((payout, idx) => {
    const row = sheet.addRow([
      payout.resource_name,
      payout.resource_email,
      payout.total_working_days,
      payout.total_logging_hours,
      payout.total_logging_cases,
      payout.avg_cases_per_hour?.toFixed(2),
      `$${payout.logging_rate_per_case?.toFixed(2)}`,
      payout.verisma_processing_cases + payout.mro_processing_cases,
      payout.total_processing_amount,
      payout.total_logging_amount,
      payout.complete_logging_cases,
      payout.total_bonus_amount,
      payout.grand_total_payout
    ]);

    row.eachCell((cell, colNumber) => {
      cell.alignment = { horizontal: colNumber <= 2 ? 'left' : 'center', vertical: 'middle' };
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };

      // Format currency columns
      if ([9, 10, 12, 13].includes(colNumber)) {
        cell.numFmt = '$#,##0.00';
      }

      // Highlight grand total column
      if (colNumber === 13) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.COST_GREEN } };
        cell.font = { bold: true };
      }

      // Color slab rate based on value
      if (colNumber === 7) {
        const rate = payout.logging_rate_per_case;
        let color = COLORS.SLAB_RED;
        if (rate >= 0.65) color = COLORS.SLAB_BLUE;
        else if (rate >= 0.60) color = COLORS.SLAB_GREEN;
        else if (rate >= 0.55) color = COLORS.SLAB_YELLOW;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
      }
    });
  });

  // Add totals row
  const totals = payouts.reduce((acc, p) => ({
    processing_cases: acc.processing_cases + (p.verisma_processing_cases || 0) + (p.mro_processing_cases || 0),
    processing_amount: acc.processing_amount + (p.total_processing_amount || 0),
    logging_amount: acc.logging_amount + (p.total_logging_amount || 0),
    bonus_amount: acc.bonus_amount + (p.total_bonus_amount || 0),
    grand_total: acc.grand_total + (p.grand_total_payout || 0)
  }), { processing_cases: 0, processing_amount: 0, logging_amount: 0, bonus_amount: 0, grand_total: 0 });

  const totalRow = sheet.addRow([
    'TOTAL', '', '', '', '', '', '',
    totals.processing_cases,
    totals.processing_amount,
    totals.logging_amount,
    '',
    totals.bonus_amount,
    totals.grand_total
  ]);

  totalRow.eachCell((cell, colNumber) => {
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.TOTAL_GREEN } };
    cell.border = { top: { style: 'medium' }, bottom: { style: 'medium' }, left: { style: 'thin' }, right: { style: 'thin' } };
    if ([9, 10, 12, 13].includes(colNumber)) {
      cell.numFmt = '$#,##0.00';
    }
  });

  return workbook;
};

module.exports = {
  generateVerismaPayrollExcel,
  generateMROPayrollExcel,
  generateLoggingSlabExcel,
  generateResourcePayoutExcel,
  COLORS
};