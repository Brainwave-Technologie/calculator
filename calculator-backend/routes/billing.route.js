// routes/billing.routes.js
// Billing/Costing routes that integrate with VerismaDailyAllocation and MRODailyAllocation
// Provides real-time data from resource-logged entries for Costing dashboards

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');

// Models
const Billing = require('../models/Billing');
const VerismaDailyAllocation = require('../models/Allocations/Verismadailyallocation');
const MRODailyAllocation = require('../models/Allocations/MROdailyallocation');
const Resource = require('../models/Resource');
const Subproject = require('../models/Subproject');
const Client = require('../models/Client');
const Project = require('../models/Project');

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

const formatDateKey = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Get aggregated billing data directly from Verisma allocations
 */
async function getVerismaBillingData(month, year, filters = {}) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);
  
  const matchStage = {
    allocation_date: { $gte: startDate, $lte: endDate },
    is_deleted: { $ne: true }
  };
  
  if (filters.project_id) {
    matchStage.project_id = new mongoose.Types.ObjectId(filters.project_id);
  }
  if (filters.subproject_id) {
    matchStage.subproject_id = new mongoose.Types.ObjectId(filters.subproject_id);
  }
  if (filters.request_type) {
    matchStage.request_type = filters.request_type;
  }
  if (filters.resource_email) {
    matchStage.resource_email = filters.resource_email.toLowerCase();
  }
  
  const pipeline = [
    { $match: matchStage },
    {
      $group: {
        _id: {
          resource_id: '$resource_id',
          subproject_id: '$subproject_id',
          request_type: '$request_type'
        },
        resource_name: { $first: '$resource_name' },
        resource_email: { $first: '$resource_email' },
        geography_id: { $first: '$geography_id' },
        geography_name: { $first: '$geography_name' },
        client_id: { $first: '$client_id' },
        project_id: { $first: '$project_id' },
        project_name: { $first: '$project_name' },
        subproject_name: { $first: '$subproject_name' },
        total_cases: { $sum: '$count' },
        total_billing: { $sum: '$billing_amount' },
        avg_rate: { $avg: '$billing_rate' },
        entry_count: { $sum: 1 },
        working_days: { $addToSet: { $dateToString: { format: '%Y-%m-%d', date: '$allocation_date' } } }
      }
    },
    {
      $project: {
        _id: 0,
        resource_id: '$_id.resource_id',
        subproject_id: '$_id.subproject_id',
        request_type: '$_id.request_type',
        resource_name: 1,
        resource_email: 1,
        geography_id: 1,
        geography_name: 1,
        client_id: 1,
        client_name: { $literal: 'Verisma' },
        project_id: 1,
        project_name: 1,
        subproject_name: 1,
        cases: '$total_cases',
        total_amount: '$total_billing',
        flatrate: '$avg_rate',
        entry_count: 1,
        working_days: { $size: '$working_days' }
      }
    },
    { $sort: { resource_name: 1, subproject_name: 1 } }
  ];
  
  return VerismaDailyAllocation.aggregate(pipeline);
}

/**
 * Get aggregated billing data directly from MRO allocations
 */
async function getMROBillingData(month, year, filters = {}) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);
  
  const matchStage = {
    allocation_date: { $gte: startDate, $lte: endDate },
    is_deleted: { $ne: true }
  };
  
  if (filters.project_id) {
    matchStage.project_id = new mongoose.Types.ObjectId(filters.project_id);
  }
  if (filters.subproject_id) {
    matchStage.subproject_id = new mongoose.Types.ObjectId(filters.subproject_id);
  }
  if (filters.process_type) {
    matchStage.process_type = filters.process_type;
  }
  if (filters.requestor_type) {
    matchStage.requestor_type = filters.requestor_type;
  }
  if (filters.resource_email) {
    matchStage.resource_email = filters.resource_email.toLowerCase();
  }
  
  const pipeline = [
    { $match: matchStage },
    {
      $group: {
        _id: {
          resource_id: '$resource_id',
          subproject_id: '$subproject_id',
          process_type: '$process_type',
          requestor_type: '$requestor_type'
        },
        resource_name: { $first: '$resource_name' },
        resource_email: { $first: '$resource_email' },
        geography_id: { $first: '$geography_id' },
        geography_name: { $first: '$geography_name' },
        client_id: { $first: '$client_id' },
        project_id: { $first: '$project_id' },
        project_name: { $first: '$project_name' },
        subproject_name: { $first: '$subproject_name' },
        total_cases: { $sum: 1 },
        total_billing: { $sum: '$billing_amount' },
        avg_rate: { $avg: '$billing_rate' },
        entry_count: { $sum: 1 },
        working_days: { $addToSet: { $dateToString: { format: '%Y-%m-%d', date: '$allocation_date' } } }
      }
    },
    {
      $project: {
        _id: 0,
        resource_id: '$_id.resource_id',
        subproject_id: '$_id.subproject_id',
        process_type: '$_id.process_type',
        requestor_type: '$_id.requestor_type',
        resource_name: 1,
        resource_email: 1,
        geography_id: 1,
        geography_name: 1,
        client_id: 1,
        client_name: { $literal: 'MRO' },
        project_id: 1,
        project_name: 1,
        subproject_name: 1,
        cases: '$total_cases',
        total_amount: '$total_billing',
        flatrate: '$avg_rate',
        entry_count: 1,
        working_days: { $size: '$working_days' }
      }
    },
    { $sort: { resource_name: 1, subproject_name: 1 } }
  ];
  
  return MRODailyAllocation.aggregate(pipeline);
}

// ═══════════════════════════════════════════════════════════════
// GET BILLING DATA BY CLIENT (LIVE FROM ALLOCATIONS)
// ═══════════════════════════════════════════════════════════════

/**
 * GET /billing/live/:client
 * Get live billing data directly from allocation models (not from Billing collection)
 */
router.get('/live/:client', async (req, res) => {
  try {
    const { client } = req.params;
    const { month, year, project_id, subproject_id, request_type, process_type, search, page = 1, limit = 50 } = req.query;
    
    const monthNum = parseInt(month) || new Date().getMonth() + 1;
    const yearNum = parseInt(year) || new Date().getFullYear();
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    
    const filters = { project_id, subproject_id, request_type, process_type };
    
    let records = [];
    
    if (client.toLowerCase() === 'verisma') {
      records = await getVerismaBillingData(monthNum, yearNum, filters);
    } else if (client.toLowerCase() === 'mro') {
      records = await getMROBillingData(monthNum, yearNum, filters);
    } else {
      return res.status(400).json({ message: 'Invalid client. Use verisma, mro, or datavant' });
    }
    
    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      records = records.filter(r => 
        r.resource_name?.toLowerCase().includes(searchLower) ||
        r.subproject_name?.toLowerCase().includes(searchLower)
      );
    }
    
    // Enrich with resource rates
    for (const record of records) {
      const resource = await Resource.findById(record.resource_id).lean();
      record.resource_role = resource?.role || 'Associate';
      
      // Get cost rate from assignments
      let costRate = 0;
      if (resource?.assignments) {
        for (const assignment of resource.assignments) {
          if (assignment.client_name?.toLowerCase() === client.toLowerCase()) {
            costRate = assignment.default_rate || 0;
            break;
          }
        }
      }
      record.rate = costRate;
      
      // Estimate hours (can be overridden by admin)
      record.hours = record.cases * 0.5; // Default estimate
      record.costing = record.hours * record.rate;
      record.profit = record.total_amount - record.costing;
      record.billable_status = 'Billable';
      record.month = monthNum;
      record.year = yearNum;
      
      // Generate unique ID for frontend
      record.uniqueId = `${record.resource_id}-${record.subproject_id}-${record.request_type || record.requestor_type || 'default'}`;
    }
    
    // Calculate totals
    const totals = {
      totalCases: records.reduce((sum, r) => sum + (r.cases || 0), 0),
      totalHours: records.reduce((sum, r) => sum + (r.hours || 0), 0),
      totalCosting: records.reduce((sum, r) => sum + (r.costing || 0), 0),
      totalRevenue: records.reduce((sum, r) => sum + (r.total_amount || 0), 0),
      profit: 0,
      resourceCount: new Set(records.map(r => r.resource_id?.toString())).size
    };
    totals.profit = totals.totalRevenue - totals.totalCosting;
    
    // Pagination
    const total = records.length;
    const skip = (pageNum - 1) * limitNum;
    const paginatedRecords = records.slice(skip, skip + limitNum);
    
    res.json({
      success: true,
      client: client,
      month: monthNum,
      year: yearNum,
      records: paginatedRecords,
      total,
      totalPages: Math.ceil(total / limitNum),
      page: pageNum,
      hasMore: pageNum * limitNum < total,
      totals
    });
    
  } catch (err) {
    console.error('Live billing error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET CLIENT DASHBOARD DATA (FOR COSTING PAGE)
// ═══════════════════════════════════════════════════════════════

router.get('/client-dashboard', async (req, res) => {
  try {
    const {
      client_id,
      client_name,
      project_id,
      subproject_id,
      request_type,
      month,
      year,
      search,
      sort_by = 'resource_name',
      sort_order = 'ascending',
      show_non_billable = 'true',
      page = 1,
      limit = 50
    } = req.query;
    
    const monthNum = parseInt(month) || new Date().getMonth() + 1;
    const yearNum = parseInt(year) || new Date().getFullYear();
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    
    // Determine client
    let clientNameToUse = client_name;
    if (client_id && !clientNameToUse) {
      const client = await Client.findById(client_id).lean();
      clientNameToUse = client?.name;
    }
    
    if (!clientNameToUse) {
      return res.status(400).json({ message: 'client_id or client_name required' });
    }
    
    const filters = { project_id, subproject_id, request_type };
    
    // Get live data from allocations
    let records = [];
    if (clientNameToUse.toLowerCase() === 'verisma') {
      records = await getVerismaBillingData(monthNum, yearNum, filters);
    } else if (clientNameToUse.toLowerCase() === 'mro') {
      records = await getMROBillingData(monthNum, yearNum, filters);
    }
    
    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      records = records.filter(r => 
        r.resource_name?.toLowerCase().includes(searchLower) ||
        r.subproject_name?.toLowerCase().includes(searchLower)
      );
    }
    
    // Enrich records with additional data
    for (const record of records) {
      const resource = await Resource.findById(record.resource_id).lean();
      const subproject = await Subproject.findById(record.subproject_id).lean();
      
      record.resource_role = resource?.role || 'Associate';
      record.flatrate = record.flatrate || subproject?.flatrate || 0;
      
      // Get cost rate
      let costRate = 0;
      if (resource?.assignments) {
        for (const assignment of resource.assignments) {
          if (assignment.client_name?.toLowerCase() === clientNameToUse.toLowerCase()) {
            costRate = assignment.default_rate || 0;
            break;
          }
        }
      }
      record.rate = costRate;
      record.hours = record.hours || record.cases * 0.5;
      record.costing = record.hours * record.rate;
      record.profit = record.total_amount - record.costing;
      record.billable_status = 'Billable';
      record.uniqueId = `${record.resource_id}-${record.subproject_id}-${record.request_type || record.requestor_type || 'default'}`;
    }
    
    // Sorting
    const sortDirection = sort_order === 'descending' ? -1 : 1;
    records.sort((a, b) => {
      const aVal = a[sort_by] || '';
      const bVal = b[sort_by] || '';
      if (typeof aVal === 'string') {
        return aVal.localeCompare(bVal) * sortDirection;
      }
      return (aVal - bVal) * sortDirection;
    });
    
    // Calculate totals
    const totals = {
      totalHours: records.reduce((sum, r) => sum + (r.hours || 0), 0),
      totalCosting: records.reduce((sum, r) => sum + (r.costing || 0), 0),
      totalRevenue: records.reduce((sum, r) => sum + (r.total_amount || 0), 0),
      profit: 0,
      resourceCount: new Set(records.map(r => r.resource_id?.toString())).size
    };
    totals.profit = totals.totalRevenue - totals.totalCosting;
    
    // Pagination
    const total = records.length;
    const skip = (pageNum - 1) * limitNum;
    const paginatedRecords = records.slice(skip, skip + limitNum);
    
    res.json({
      success: true,
      records: paginatedRecords,
      total,
      totalPages: Math.ceil(total / limitNum),
      page: pageNum,
      hasMore: pageNum * limitNum < total,
      totals
    });
    
  } catch (err) {
    console.error('Client dashboard error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// UPDATE BILLING RECORD (HOURS, RATE, BILLABLE STATUS)
// ═══════════════════════════════════════════════════════════════

router.patch('/update', async (req, res) => {
  try {
    const {
      resource_id,
      subproject_id,
      request_type,
      requestor_type,
      month,
      year,
      hours,
      rate,
      billable_status,
      productivity_level
    } = req.body;
    
    if (!resource_id || !subproject_id) {
      return res.status(400).json({ message: 'resource_id and subproject_id required' });
    }
    
    const monthNum = parseInt(month) || new Date().getMonth() + 1;
    const yearNum = parseInt(year) || new Date().getFullYear();
    
    // Get subproject details
    const subproject = await Subproject.findById(subproject_id).populate('project_id').lean();
    const resource = await Resource.findById(resource_id).lean();
    
    if (!subproject || !resource) {
      return res.status(404).json({ message: 'Subproject or Resource not found' });
    }
    
    // Find or create billing record
    const filter = {
      resource_id: new mongoose.Types.ObjectId(resource_id),
      subproject_id: new mongoose.Types.ObjectId(subproject_id),
      request_type: request_type || requestor_type || null,
      month: monthNum,
      year: yearNum
    };
    
    const updateFields = {};
    
    if (hours !== undefined) updateFields.hours = Number(hours) || 0;
    if (rate !== undefined) updateFields.rate = Number(rate) || 0;
    if (billable_status !== undefined) updateFields.billable_status = billable_status;
    if (productivity_level !== undefined) updateFields.productivity_level = productivity_level;
    
    // Calculate costing if hours or rate changed
    if (hours !== undefined || rate !== undefined) {
      const newHours = hours !== undefined ? Number(hours) : 0;
      const newRate = rate !== undefined ? Number(rate) : 0;
      updateFields.costing = newHours * newRate;
    }
    
    // Set denormalized fields
    updateFields.geography_id = subproject.geography_id;
    updateFields.client_id = subproject.client_id;
    updateFields.project_id = subproject.project_id;
    updateFields.geography_name = subproject.geography_name;
    updateFields.client_name = subproject.client_name;
    updateFields.project_name = subproject.project_id?.name || subproject.project_name;
    updateFields.subproject_name = subproject.name;
    updateFields.resource_name = resource.name;
    updateFields.resource_email = resource.email;
    updateFields.resource_role = resource.role;
    updateFields.flatrate = subproject.flatrate || 0;
    
    const result = await Billing.findOneAndUpdate(
      filter,
      { $set: updateFields },
      { upsert: true, new: true }
    );
    
    res.json({ success: true, record: result });
    
  } catch (err) {
    console.error('Update billing error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET TOTALS
// ═══════════════════════════════════════════════════════════════

router.get('/totals', async (req, res) => {
  try {
    const { client_name, client_id, project_id, subproject_id, month, year } = req.query;
    
    const monthNum = parseInt(month) || new Date().getMonth() + 1;
    const yearNum = parseInt(year) || new Date().getFullYear();
    
    let clientNameToUse = client_name;
    if (client_id && !clientNameToUse) {
      const client = await Client.findById(client_id).lean();
      clientNameToUse = client?.name;
    }
    
    const filters = { project_id, subproject_id };
    
    let records = [];
    if (clientNameToUse?.toLowerCase() === 'verisma') {
      records = await getVerismaBillingData(monthNum, yearNum, filters);
    } else if (clientNameToUse?.toLowerCase() === 'mro') {
      records = await getMROBillingData(monthNum, yearNum, filters);
    }
    
    // Enrich with rates
    for (const record of records) {
      const resource = await Resource.findById(record.resource_id).lean();
      let costRate = 0;
      if (resource?.assignments) {
        for (const assignment of resource.assignments) {
          if (assignment.client_name?.toLowerCase() === clientNameToUse?.toLowerCase()) {
            costRate = assignment.default_rate || 0;
            break;
          }
        }
      }
      record.rate = costRate;
      record.hours = record.cases * 0.5;
      record.costing = record.hours * record.rate;
    }
    
    const revenue = records.reduce((sum, r) => sum + (r.total_amount || 0), 0);
    const cost = records.reduce((sum, r) => sum + (r.costing || 0), 0);
    
    res.json({
      revenue,
      cost,
      profit: revenue - cost
    });
    
  } catch (err) {
    console.error('Get totals error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// EXPORT TO EXCEL
// ═══════════════════════════════════════════════════════════════

router.get('/export/:client', async (req, res) => {
  try {
    const { client } = req.params;
    const { month, year, project_id, subproject_id } = req.query;
    
    const monthNum = parseInt(month) || new Date().getMonth() + 1;
    const yearNum = parseInt(year) || new Date().getFullYear();
    
    const filters = { project_id, subproject_id };
    
    let records = [];
    if (client.toLowerCase() === 'verisma') {
      records = await getVerismaBillingData(monthNum, yearNum, filters);
    } else if (client.toLowerCase() === 'mro') {
      records = await getMROBillingData(monthNum, yearNum, filters);
    }
    
    // Enrich
    for (const record of records) {
      const resource = await Resource.findById(record.resource_id).lean();
      const subproject = await Subproject.findById(record.subproject_id).lean();
      
      record.resource_role = resource?.role || 'Associate';
      record.flatrate = subproject?.flatrate || record.flatrate || 0;
      
      let costRate = 0;
      if (resource?.assignments) {
        for (const assignment of resource.assignments) {
          if (assignment.client_name?.toLowerCase() === client.toLowerCase()) {
            costRate = assignment.default_rate || 0;
            break;
          }
        }
      }
      record.rate = costRate;
      record.hours = record.cases * 0.5;
      record.costing = record.hours * record.rate;
      record.profit = record.total_amount - record.costing;
    }
    
    // Create Excel
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(`${client} Billing`);
    
    // Headers
    const headers = [
      'Process Type', 'Location', 'Resource', 'Role',
      client === 'verisma' ? 'Request Type' : 'Requestor Type',
      'Cases', 'Hours', 'Cost Rate ($)', 'Costing ($)',
      'Flat Rate ($)', 'Revenue ($)', 'Profit ($)'
    ];
    
    const headerRow = sheet.addRow(headers);
    headerRow.font = { bold: true };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
    
    // Column widths
    sheet.columns = [
      { width: 15 }, { width: 25 }, { width: 20 }, { width: 12 },
      { width: 15 }, { width: 10 }, { width: 10 }, { width: 12 },
      { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }
    ];
    
    // Data rows
    records.forEach(r => {
      sheet.addRow([
        r.project_name || '',
        r.subproject_name || '',
        r.resource_name || '',
        r.resource_role || '',
        r.request_type || r.requestor_type || '',
        r.cases || 0,
        (r.hours || 0).toFixed(2),
        (r.rate || 0).toFixed(2),
        (r.costing || 0).toFixed(2),
        (r.flatrate || 0).toFixed(2),
        (r.total_amount || 0).toFixed(2),
        (r.profit || 0).toFixed(2)
      ]);
    });
    
    // Totals row
    const totals = records.reduce((acc, r) => ({
      cases: acc.cases + (r.cases || 0),
      hours: acc.hours + (r.hours || 0),
      costing: acc.costing + (r.costing || 0),
      revenue: acc.revenue + (r.total_amount || 0),
      profit: acc.profit + (r.profit || 0)
    }), { cases: 0, hours: 0, costing: 0, revenue: 0, profit: 0 });
    
    const totalRow = sheet.addRow([
      'TOTAL', '', '', '', '',
      totals.cases,
      totals.hours.toFixed(2),
      '',
      totals.costing.toFixed(2),
      '',
      totals.revenue.toFixed(2),
      totals.profit.toFixed(2)
    ]);
    totalRow.font = { bold: true };
    totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
    
    // Response
    const monthName = new Date(yearNum, monthNum - 1).toLocaleString('default', { month: 'long' });
    const filename = `${client}_Billing_${monthName}_${yearNum}.xlsx`;
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    await workbook.xlsx.write(res);
    res.end();
    
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// SYNC ALLOCATIONS TO BILLING MODEL
// ═══════════════════════════════════════════════════════════════

router.post('/sync/:client', async (req, res) => {
  try {
    const { client } = req.params;
    const { month, year, dry_run = false } = req.body;
    
    const monthNum = parseInt(month) || new Date().getMonth() + 1;
    const yearNum = parseInt(year) || new Date().getFullYear();
    
    let records = [];
    if (client.toLowerCase() === 'verisma') {
      records = await getVerismaBillingData(monthNum, yearNum, {});
    } else if (client.toLowerCase() === 'mro') {
      records = await getMROBillingData(monthNum, yearNum, {});
    }
    
    if (dry_run) {
      return res.json({
        success: true,
        dry_run: true,
        would_sync: records.length,
        records: records.slice(0, 10) // Preview first 10
      });
    }
    
    let syncedCount = 0;
    let errorCount = 0;
    
    for (const record of records) {
      try {
        const resource = await Resource.findById(record.resource_id).lean();
        const subproject = await Subproject.findById(record.subproject_id).lean();
        
        let costRate = 0;
        if (resource?.assignments) {
          for (const assignment of resource.assignments) {
            if (assignment.client_name?.toLowerCase() === client.toLowerCase()) {
              costRate = assignment.default_rate || 0;
              break;
            }
          }
        }
        
        const filter = {
          resource_id: record.resource_id,
          subproject_id: record.subproject_id,
          request_type: record.request_type || record.requestor_type || null,
          month: monthNum,
          year: yearNum
        };
        
        const hours = record.cases * 0.5;
        const costing = hours * costRate;
        const flatrate = subproject?.flatrate || record.flatrate || 0;
        const totalAmount = record.cases * flatrate;
        
        const updateData = {
          $set: {
            geography_id: record.geography_id,
            client_id: record.client_id,
            project_id: record.project_id,
            geography_name: record.geography_name,
            client_name: record.client_name,
            project_name: record.project_name,
            subproject_name: record.subproject_name,
            resource_name: record.resource_name,
            resource_email: record.resource_email,
            resource_role: resource?.role || 'Associate',
            cases: record.cases,
            hours: hours,
            rate: costRate,
            flatrate: flatrate,
            costing: costing,
            total_amount: totalAmount,
            profit: totalAmount - costing,
            billable_status: 'Billable',
            sync_source: `${client.toLowerCase()}_daily_allocation`,
            last_synced_at: new Date(),
            allocation_entry_count: record.entry_count,
            working_days: record.working_days
          }
        };
        
        await Billing.findOneAndUpdate(filter, updateData, { upsert: true });
        syncedCount++;
        
      } catch (err) {
        console.error('Sync error for record:', err.message);
        errorCount++;
      }
    }
    
    res.json({
      success: true,
      synced: syncedCount,
      errors: errorCount,
      total: records.length
    });
    
  } catch (err) {
    console.error('Sync error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET SYNC STATUS
// ═══════════════════════════════════════════════════════════════

router.get('/sync-status', async (req, res) => {
  try {
    const { month, year } = req.query;
    const monthNum = parseInt(month) || new Date().getMonth() + 1;
    const yearNum = parseInt(year) || new Date().getFullYear();
    
    const startDate = new Date(yearNum, monthNum - 1, 1);
    const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59, 999);
    
    const [verismaCount, mroCount, billingCount, lastSync] = await Promise.all([
      VerismaDailyAllocation.countDocuments({
        allocation_date: { $gte: startDate, $lte: endDate },
        is_deleted: { $ne: true }
      }),
      MRODailyAllocation.countDocuments({
        allocation_date: { $gte: startDate, $lte: endDate },
        is_deleted: { $ne: true }
      }),
      Billing.countDocuments({ month: monthNum, year: yearNum }),
      Billing.findOne({ month: monthNum, year: yearNum, last_synced_at: { $exists: true } })
        .sort({ last_synced_at: -1 })
        .select('last_synced_at')
        .lean()
    ]);
    
    res.json({
      month: monthNum,
      year: yearNum,
      allocations: {
        verisma: verismaCount,
        mro: mroCount,
        total: verismaCount + mroCount
      },
      billing_records: billingCount,
      last_synced_at: lastSync?.last_synced_at || null,
      needs_sync: billingCount === 0 && (verismaCount + mroCount) > 0
    });
    
  } catch (err) {
    console.error('Sync status error:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;