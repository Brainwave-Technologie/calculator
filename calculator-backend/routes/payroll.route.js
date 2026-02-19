// routes/payroll.routes.js
// Payroll routes that pull data from VerismaDailyAllocation and MRODailyAllocation
// Displays day-wise case matrix for each client

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');

// Import actual allocation models
const VerismaDailyAllocation = require('../models/Allocations/Verismadailyallocation');
const MRODailyAllocation = require('../models/Allocations/MROdailyallocation');
// const DatavantDailyAllocation = require('../models/Allocations/DatavantDailyAllocation');

const Resource = require('../models/Resource');

// ================= HELPER FUNCTIONS =================

// Get all dates in a month
const getDatesInMonth = (month, year) => {
  const dates = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    dates.push({
      date,
      day,
      dateStr: `${day}-${date.toLocaleString('en-US', { month: 'short' })}-${year.toString().slice(-2)}`,
      dayName: date.toLocaleString('en-US', { weekday: 'short' }),
      isWeekend: date.getDay() === 0 || date.getDay() === 6,
      isoDate: date.toISOString().split('T')[0]
    });
  }
  return dates;
};

// Format date for display
const formatDateKey = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ================= VERISMA PAYROLL (DAY-WISE) =================
router.get('/verisma', async (req, res) => {
  try {
    const { month, year } = req.query;
    const monthNum = parseInt(month) || new Date().getMonth() + 1;
    const yearNum = parseInt(year) || new Date().getFullYear();

    // Date range for the month
    const startDate = new Date(yearNum, monthNum - 1, 1);
    const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59, 999);

    // Get all Verisma allocations for this month
    const allocations = await VerismaDailyAllocation.find({
      allocation_date: { $gte: startDate, $lte: endDate },
      is_deleted: { $ne: true }
    }).lean();

    // Get all dates in month
    const dates = getDatesInMonth(monthNum, yearNum);

    // Build resource map: { resource_email: { name, daily_cases: { dateKey: count } } }
    const resourceMap = {};

    allocations.forEach(alloc => {
      const email = alloc.resource_email?.toLowerCase();
      if (!email) return;

      const dateKey = formatDateKey(alloc.allocation_date);
      const caseCount = alloc.count || 1; // Verisma uses 'count' field

      if (!resourceMap[email]) {
        resourceMap[email] = {
          resource_id: alloc.resource_id,
          resource_name: alloc.resource_name || email,
          resource_email: email,
          daily_cases: {},
          total_cases: 0
        };
      }

      // Add cases for this date
      if (!resourceMap[email].daily_cases[dateKey]) {
        resourceMap[email].daily_cases[dateKey] = 0;
      }
      resourceMap[email].daily_cases[dateKey] += caseCount;
      resourceMap[email].total_cases += caseCount;
    });

    // Convert to array and sort by name
    const resources = Object.values(resourceMap).sort((a, b) => 
      a.resource_name.localeCompare(b.resource_name)
    );

    // Calculate daily totals (Overall column)
    const dailyTotals = {};
    dates.forEach(d => {
      dailyTotals[d.isoDate] = 0;
    });

    resources.forEach(r => {
      Object.entries(r.daily_cases).forEach(([dateKey, count]) => {
        dailyTotals[dateKey] = (dailyTotals[dateKey] || 0) + count;
      });
    });

    // Calculate grand total
    const grandTotal = resources.reduce((sum, r) => sum + r.total_cases, 0);

    res.json({
      success: true,
      client: 'Verisma',
      month: monthNum,
      year: yearNum,
      dates,
      resources,
      dailyTotals,
      grandTotal,
      resourceCount: resources.length
    });

  } catch (err) {
    console.error('Verisma payroll error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ================= MRO PAYROLL (DAY-WISE) =================
router.get('/mro', async (req, res) => {
  try {
    const { month, year } = req.query;
    const monthNum = parseInt(month) || new Date().getMonth() + 1;
    const yearNum = parseInt(year) || new Date().getFullYear();

    // Date range
    const startDate = new Date(yearNum, monthNum - 1, 1);
    const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59, 999);

    // Get all MRO allocations for this month
    const allocations = await MRODailyAllocation.find({
      allocation_date: { $gte: startDate, $lte: endDate },
      is_deleted: { $ne: true }
    }).lean();

    // Get all dates in month
    const dates = getDatesInMonth(monthNum, yearNum);

    // Build resource map
    const resourceMap = {};

    allocations.forEach(alloc => {
      const email = alloc.resource_email?.toLowerCase();
      if (!email) return;

      const dateKey = formatDateKey(alloc.allocation_date);
      const caseCount = 1; // MRO counts each entry as 1 case

      if (!resourceMap[email]) {
        resourceMap[email] = {
          resource_id: alloc.resource_id,
          resource_name: alloc.resource_name || email,
          resource_email: email,
          daily_cases: {},
          total_cases: 0
        };
      }

      if (!resourceMap[email].daily_cases[dateKey]) {
        resourceMap[email].daily_cases[dateKey] = 0;
      }
      resourceMap[email].daily_cases[dateKey] += caseCount;
      resourceMap[email].total_cases += caseCount;
    });

    // Convert to array
    const resources = Object.values(resourceMap).sort((a, b) => 
      a.resource_name.localeCompare(b.resource_name)
    );

    // Calculate daily totals
    const dailyTotals = {};
    dates.forEach(d => {
      dailyTotals[d.isoDate] = 0;
    });

    resources.forEach(r => {
      Object.entries(r.daily_cases).forEach(([dateKey, count]) => {
        dailyTotals[dateKey] = (dailyTotals[dateKey] || 0) + count;
      });
    });

    const grandTotal = resources.reduce((sum, r) => sum + r.total_cases, 0);

    res.json({
      success: true,
      client: 'MRO',
      month: monthNum,
      year: yearNum,
      dates,
      resources,
      dailyTotals,
      grandTotal,
      resourceCount: resources.length
    });

  } catch (err) {
    console.error('MRO payroll error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ================= DATAVANT PAYROLL (DAY-WISE) =================
router.get('/datavant', async (req, res) => {
  try {
    const { month, year } = req.query;
    const monthNum = parseInt(month) || new Date().getMonth() + 1;
    const yearNum = parseInt(year) || new Date().getFullYear();

    // TODO: Implement when DatavantDailyAllocation model is available
    // For now, return empty structure
    const dates = getDatesInMonth(monthNum, yearNum);

    res.json({
      success: true,
      client: 'Datavant',
      month: monthNum,
      year: yearNum,
      dates,
      resources: [],
      dailyTotals: {},
      grandTotal: 0,
      resourceCount: 0,
      message: 'Datavant allocation model not yet configured'
    });

  } catch (err) {
    console.error('Datavant payroll error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ================= VERISMA PAYROLL EXCEL EXPORT =================
router.get('/verisma/export', async (req, res) => {
  try {
    const { month, year } = req.query;
    const monthNum = parseInt(month) || new Date().getMonth() + 1;
    const yearNum = parseInt(year) || new Date().getFullYear();

    // Date range
    const startDate = new Date(yearNum, monthNum - 1, 1);
    const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59, 999);

    // Get allocations
    const allocations = await VerismaDailyAllocation.find({
      allocation_date: { $gte: startDate, $lte: endDate },
      is_deleted: { $ne: true }
    }).lean();

    const dates = getDatesInMonth(monthNum, yearNum);

    // Build resource data
    const resourceMap = {};
    allocations.forEach(alloc => {
      const email = alloc.resource_email?.toLowerCase();
      if (!email) return;

      const dateKey = formatDateKey(alloc.allocation_date);
      const caseCount = alloc.count || 1;

      if (!resourceMap[email]) {
        resourceMap[email] = {
          resource_name: alloc.resource_name || email,
          daily_cases: {},
          total_cases: 0
        };
      }

      if (!resourceMap[email].daily_cases[dateKey]) {
        resourceMap[email].daily_cases[dateKey] = 0;
      }
      resourceMap[email].daily_cases[dateKey] += caseCount;
      resourceMap[email].total_cases += caseCount;
    });

    const resources = Object.values(resourceMap).sort((a, b) => 
      a.resource_name.localeCompare(b.resource_name)
    );

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Billing System';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Verisma Payroll', {
      views: [{ state: 'frozen', xSplit: 3, ySplit: 2 }]
    });

    // Build header row
    const headers = ['Date', 'Day', 'Overall'];
    resources.forEach(r => headers.push(r.resource_name));
    
    // Add header row
    const headerRow = sheet.addRow(headers);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFF2CC' } // Light yellow
    };

    // Set column widths
    sheet.getColumn(1).width = 12;
    sheet.getColumn(2).width = 6;
    sheet.getColumn(3).width = 10;
    for (let i = 4; i <= headers.length; i++) {
      sheet.getColumn(i).width = 12;
    }

    // Calculate daily totals
    const dailyTotals = {};
    dates.forEach(d => dailyTotals[d.isoDate] = 0);
    resources.forEach(r => {
      Object.entries(r.daily_cases).forEach(([dateKey, count]) => {
        dailyTotals[dateKey] = (dailyTotals[dateKey] || 0) + count;
      });
    });

    // Add data rows for each date
    dates.forEach(dateInfo => {
      const rowData = [
        dateInfo.dateStr,
        dateInfo.dayName,
        dailyTotals[dateInfo.isoDate] || 0
      ];

      resources.forEach(r => {
        rowData.push(r.daily_cases[dateInfo.isoDate] || 0);
      });

      const row = sheet.addRow(rowData);

      // Color coding
      const isWeekend = dateInfo.isWeekend;
      
      row.eachCell((cell, colNumber) => {
        if (colNumber > 2) { // Data cells
          const value = cell.value || 0;
          if (isWeekend) {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFFFC000' } // Orange for weekends
            };
          } else if (value > 0) {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FF92D050' } // Green for cases > 0
            };
          } else {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFFF6B6B' } // Red for zero
            };
          }
        }
      });
    });

    // Add Grand Total row
    const grandTotalRow = ['Grand Total', '', Object.values(dailyTotals).reduce((s, v) => s + v, 0)];
    resources.forEach(r => grandTotalRow.push(r.total_cases));
    
    const totalRow = sheet.addRow(grandTotalRow);
    totalRow.font = { bold: true };
    totalRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF92D050' } // Green
    };

    // Set response headers
    const monthName = new Date(yearNum, monthNum - 1).toLocaleString('default', { month: 'long' });
    const filename = `Verisma_Payroll_${monthName}_${yearNum}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error('Verisma export error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ================= MRO PAYROLL EXCEL EXPORT =================
router.get('/mro/export', async (req, res) => {
  try {
    const { month, year } = req.query;
    const monthNum = parseInt(month) || new Date().getMonth() + 1;
    const yearNum = parseInt(year) || new Date().getFullYear();

    const startDate = new Date(yearNum, monthNum - 1, 1);
    const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59, 999);

    const allocations = await MRODailyAllocation.find({
      allocation_date: { $gte: startDate, $lte: endDate },
      is_deleted: { $ne: true }
    }).lean();

    const dates = getDatesInMonth(monthNum, yearNum);

    // Build resource data
    const resourceMap = {};
    allocations.forEach(alloc => {
      const email = alloc.resource_email?.toLowerCase();
      if (!email) return;

      const dateKey = formatDateKey(alloc.allocation_date);

      if (!resourceMap[email]) {
        resourceMap[email] = {
          resource_name: alloc.resource_name || email,
          daily_cases: {},
          total_cases: 0
        };
      }

      if (!resourceMap[email].daily_cases[dateKey]) {
        resourceMap[email].daily_cases[dateKey] = 0;
      }
      resourceMap[email].daily_cases[dateKey] += 1;
      resourceMap[email].total_cases += 1;
    });

    const resources = Object.values(resourceMap).sort((a, b) => 
      a.resource_name.localeCompare(b.resource_name)
    );

    // Create Excel
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('MRO Payroll', {
      views: [{ state: 'frozen', xSplit: 3, ySplit: 2 }]
    });

    // Headers
    const headers = ['Date', 'Day', 'Overall'];
    resources.forEach(r => headers.push(r.resource_name));
    
    const headerRow = sheet.addRow(headers);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFF2CC' }
    };

    // Column widths
    sheet.getColumn(1).width = 12;
    sheet.getColumn(2).width = 6;
    sheet.getColumn(3).width = 10;
    for (let i = 4; i <= headers.length; i++) {
      sheet.getColumn(i).width = 12;
    }

    // Daily totals
    const dailyTotals = {};
    dates.forEach(d => dailyTotals[d.isoDate] = 0);
    resources.forEach(r => {
      Object.entries(r.daily_cases).forEach(([dateKey, count]) => {
        dailyTotals[dateKey] = (dailyTotals[dateKey] || 0) + count;
      });
    });

    // Data rows
    dates.forEach(dateInfo => {
      const rowData = [
        dateInfo.dateStr,
        dateInfo.dayName,
        dailyTotals[dateInfo.isoDate] || 0
      ];

      resources.forEach(r => {
        rowData.push(r.daily_cases[dateInfo.isoDate] || 0);
      });

      const row = sheet.addRow(rowData);

      const isWeekend = dateInfo.isWeekend;
      
      row.eachCell((cell, colNumber) => {
        if (colNumber > 2) {
          const value = cell.value || 0;
          if (isWeekend) {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFFFC000' }
            };
          } else if (value > 0) {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FF92D050' }
            };
          } else {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFFF6B6B' }
            };
          }
        }
      });
    });

    // Grand Total
    const grandTotalRow = ['Grand Total', '', Object.values(dailyTotals).reduce((s, v) => s + v, 0)];
    resources.forEach(r => grandTotalRow.push(r.total_cases));
    
    const totalRow = sheet.addRow(grandTotalRow);
    totalRow.font = { bold: true };
    totalRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF92D050' }
    };

    const monthName = new Date(yearNum, monthNum - 1).toLocaleString('default', { month: 'long' });
    const filename = `MRO_Payroll_${monthName}_${yearNum}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error('MRO export error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ================= DATAVANT PAYROLL EXCEL EXPORT =================
router.get('/datavant/export', async (req, res) => {
  try {
    const { month, year } = req.query;
    const monthNum = parseInt(month) || new Date().getMonth() + 1;
    const yearNum = parseInt(year) || new Date().getFullYear();

    // TODO: Implement when DatavantDailyAllocation is available
    const dates = getDatesInMonth(monthNum, yearNum);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Datavant Payroll', {
      views: [{ state: 'frozen', xSplit: 3, ySplit: 2 }]
    });

    const headers = ['Date', 'Day', 'Overall'];
    const headerRow = sheet.addRow(headers);
    headerRow.font = { bold: true };

    dates.forEach(dateInfo => {
      sheet.addRow([dateInfo.dateStr, dateInfo.dayName, 0]);
    });

    const monthName = new Date(yearNum, monthNum - 1).toLocaleString('default', { month: 'long' });
    const filename = `Datavant_Payroll_${monthName}_${yearNum}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error('Datavant export error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ================= DETAILED ALLOCATION ENTRIES =================
// For the detailed view like Image 1
router.get('/verisma/detailed', async (req, res) => {
  try {
    const { month, year, resource_email, subproject_id, request_type, page = 1, limit = 50 } = req.query;
    const monthNum = parseInt(month) || new Date().getMonth() + 1;
    const yearNum = parseInt(year) || new Date().getFullYear();

    const startDate = new Date(yearNum, monthNum - 1, 1);
    const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59, 999);

    const query = {
      allocation_date: { $gte: startDate, $lte: endDate },
      is_deleted: { $ne: true }
    };

    if (resource_email) query.resource_email = resource_email.toLowerCase();
    if (subproject_id) query.subproject_id = new mongoose.Types.ObjectId(subproject_id);
    if (request_type) query.request_type = request_type;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [allocations, total] = await Promise.all([
      VerismaDailyAllocation.find(query)
        .sort({ allocation_date: -1, logged_date: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      VerismaDailyAllocation.countDocuments(query)
    ]);

    res.json({
      success: true,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      allocations
    });

  } catch (err) {
    console.error('Detailed allocations error:', err);
    res.status(500).json({ message: err.message });
  }
});

router.get('/mro/detailed', async (req, res) => {
  try {
    const { month, year, resource_email, subproject_id, process_type, page = 1, limit = 50 } = req.query;
    const monthNum = parseInt(month) || new Date().getMonth() + 1;
    const yearNum = parseInt(year) || new Date().getFullYear();

    const startDate = new Date(yearNum, monthNum - 1, 1);
    const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59, 999);

    const query = {
      allocation_date: { $gte: startDate, $lte: endDate },
      is_deleted: { $ne: true }
    };

    if (resource_email) query.resource_email = resource_email.toLowerCase();
    if (subproject_id) query.subproject_id = new mongoose.Types.ObjectId(subproject_id);
    if (process_type) query.process_type = process_type;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [allocations, total] = await Promise.all([
      MRODailyAllocation.find(query)
        .sort({ allocation_date: -1, logged_date: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      MRODailyAllocation.countDocuments(query)
    ]);

    res.json({
      success: true,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      allocations
    });

  } catch (err) {
    console.error('Detailed allocations error:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;