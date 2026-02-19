// routes/payoutExport.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const {
  generateVerismaPayrollExcel,
  generateMROPayrollExcel,
  generateLoggingSlabExcel,
  generateResourcePayoutExcel
} = require('../services/payrollExcelExport');

// Models
const ResourcePayout = require('../models/ResourcePayout');
const Resource = require('../models/Resource');
const Subproject = require('../models/Subproject');
const Project = require('../models/Project');
const Client = require('../models/Client');

// Daily Allocation Model
const VerismaDailyAllocation = require('../models/Allocations//Verismadailyallocation');

// Helper: Get all dates in a month
const getDatesInMonth = (month, year) => {
  const dates = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    dates.push({
      date,
      dateStr: `${day}-${date.toLocaleString('en-US', { month: 'short' })}-${year.toString().slice(-2)}`,
      dayName: date.toLocaleString('en-US', { weekday: 'short' })
    });
  }
  return dates;
};

// ================= EXPORT VERISMA PAYROLL EXCEL =================
router.get('/verisma', async (req, res) => {
  try {
    const { month, year } = req.query;
    const monthNum = parseInt(month) || new Date().getMonth() + 1;
    const yearNum = parseInt(year) || new Date().getFullYear();

    // Get Verisma client
    const verismaClient = await Client.findOne({ 
      name: { $regex: /verisma/i } 
    }).lean();
    
    if (!verismaClient) {
      return res.status(404).json({ message: 'Verisma client not found' });
    }

    // Get Verisma projects and subprojects
    const verismaProjects = await Project.find({ 
      client_id: verismaClient._id 
    }).lean();
    const projectIds = verismaProjects.map(p => p._id);
    const verismaSubprojects = await Subproject.find({
      project_id: { $in: projectIds }
    }).lean();
    const subprojectIds = verismaSubprojects.map(s => s._id);

    // Fetch daily allocations
    const startDate = new Date(yearNum, monthNum - 1, 1);
    const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59);

    const allocations = await VerismaDailyAllocation.find({
      subproject_id: { $in: subprojectIds },
      date: { $gte: startDate, $lte: endDate }
    }).populate('resource_id', 'name email avatar_url')
      .lean();

    // Get unique resources
    const resourceIds = [...new Set(allocations.map(a => a.resource_id?._id?.toString()).filter(Boolean))];
    const resources = await Resource.find({
      _id: { $in: resourceIds }
    }).select('name email').sort({ name: 1 }).lean();

    // Build date headers
    const dates = getDatesInMonth(monthNum, yearNum);

    // Build resource data
    const resourceData = {};
    resources.forEach(resource => {
      resourceData[resource._id.toString()] = {
        resource_id: resource._id,
        name: resource.name,
        email: resource.email,
        daily_cases: {},
        total_cases: 0
      };
      dates.forEach(d => {
        resourceData[resource._id.toString()].daily_cases[d.dateStr] = 0;
      });
    });

    // Populate cases
    allocations.forEach(alloc => {
      if (!alloc.resource_id) return;
      const resourceId = alloc.resource_id._id.toString();
      const allocDate = new Date(alloc.date);
      const dateStr = `${allocDate.getDate()}-${allocDate.toLocaleString('en-US', { month: 'short' })}-${allocDate.getFullYear().toString().slice(-2)}`;
      
      if (resourceData[resourceId]) {
        const cases = alloc.cases_allocated || alloc.cases || 0;
        resourceData[resourceId].daily_cases[dateStr] = (resourceData[resourceId].daily_cases[dateStr] || 0) + cases;
        resourceData[resourceId].total_cases += cases;
      }
    });

    // Calculate totals
    const dailyTotals = {};
    dates.forEach(d => { dailyTotals[d.dateStr] = 0; });
    
    Object.values(resourceData).forEach(r => {
      Object.entries(r.daily_cases).forEach(([dateStr, cases]) => {
        dailyTotals[dateStr] = (dailyTotals[dateStr] || 0) + cases;
      });
    });

    const grandTotal = Object.values(resourceData).reduce((sum, r) => sum + r.total_cases, 0);

    // Generate Excel
    const data = {
      client: 'Verisma',
      month: monthNum,
      year: yearNum,
      dates,
      resources: Object.values(resourceData).sort((a, b) => a.name.localeCompare(b.name)),
      dailyTotals,
      grandTotal
    };

    const workbook = await generateVerismaPayrollExcel(data);

    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Verisma_Payroll_${monthNum}_${yearNum}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error('Verisma Excel export error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ================= EXPORT MRO PAYROLL EXCEL =================
router.get('/mro', async (req, res) => {
  try {
    const { month, year } = req.query;
    const monthNum = parseInt(month) || new Date().getMonth() + 1;
    const yearNum = parseInt(year) || new Date().getFullYear();

    // Get MRO client
    const mroClient = await Client.findOne({ 
      name: { $regex: /mro/i } 
    }).lean();
    
    if (!mroClient) {
      return res.status(404).json({ message: 'MRO client not found' });
    }

    // Get MRO subprojects with their flatrates
    const mroProjects = await Project.find({ 
      client_id: mroClient._id 
    }).lean();
    const projectIds = mroProjects.map(p => p._id);
    const projectLookup = {};
    mroProjects.forEach(p => {
      projectLookup[p._id.toString()] = p.name;
    });
    
    const mroSubprojects = await Subproject.find({
      project_id: { $in: projectIds },
      status: 'active'
    }).lean();
    const subprojectIds = mroSubprojects.map(s => s._id);

    // Fetch allocations
    const startDate = new Date(yearNum, monthNum - 1, 1);
    const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59);

    const allocations = await VerismaDailyAllocation.find({
      subproject_id: { $in: subprojectIds },
      date: { $gte: startDate, $lte: endDate }
    }).populate('resource_id', 'name email')
      .lean();

    // Get unique resources
    const resourceIds = [...new Set(allocations.map(a => a.resource_id?._id?.toString()).filter(Boolean))];
    const resources = await Resource.find({
      _id: { $in: resourceIds }
    }).select('name email').sort({ name: 1 }).lean();

    // Build location data - use subproject.flatrate directly
    const locationData = {};
    mroSubprojects.forEach(sp => {
      const projectName = projectLookup[sp.project_id?.toString()] || '';
      locationData[sp._id.toString()] = {
        subproject_id: sp._id,
        location_name: sp.name,
        project_name: projectName,
        // Use flatrate from subproject (set during CSV upload)
        cost_per_case: sp.flatrate || 0,
        resource_cases: {},
        total_cases: 0
      };
    });

    // Populate resource cases
    allocations.forEach(alloc => {
      if (!alloc.resource_id || !alloc.subproject_id) return;
      const spId = alloc.subproject_id.toString();
      const resourceId = alloc.resource_id._id.toString();
      const cases = alloc.cases_allocated || alloc.cases || 0;
      
      if (locationData[spId]) {
        if (!locationData[spId].resource_cases[resourceId]) {
          locationData[spId].resource_cases[resourceId] = {
            resource_id: resourceId,
            name: alloc.resource_id.name,
            cases: 0
          };
        }
        locationData[spId].resource_cases[resourceId].cases += cases;
        locationData[spId].total_cases += cases;
      }
    });

    // Calculate totals
    const totalProcessing = Object.values(locationData).reduce((sum, l) => sum + l.total_cases, 0);
    const totalPayout = Object.values(locationData).reduce((sum, l) => sum + (l.total_cases * l.cost_per_case), 0);

    // Generate Excel
    const data = {
      client: 'MRO',
      month: monthNum,
      year: yearNum,
      locations: Object.values(locationData).filter(l => l.total_cases > 0 || l.cost_per_case > 0),
      resources: resources.map(r => ({ id: r._id.toString(), name: r.name })),
      totalProcessing,
      totalPayout
    };

    const workbook = await generateMROPayrollExcel(data);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=MRO_Payroll_${monthNum}_${yearNum}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error('MRO Excel export error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ================= EXPORT DATAVANT PAYROLL EXCEL =================
router.get('/datavant', async (req, res) => {
  try {
    const { month, year } = req.query;
    const monthNum = parseInt(month) || new Date().getMonth() + 1;
    const yearNum = parseInt(year) || new Date().getFullYear();

    // Similar structure to MRO
    const datavantClient = await Client.findOne({ 
      name: { $regex: /datavant/i } 
    }).lean();
    
    if (!datavantClient) {
      return res.status(404).json({ message: 'Datavant client not found' });
    }

    // Similar processing as MRO...
    const data = {
      client: 'Datavant',
      month: monthNum,
      year: yearNum,
      locations: [],
      resources: [],
      totalProcessing: 0,
      totalPayout: 0
    };

    const workbook = await generateMROPayrollExcel(data);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Datavant_Payroll_${monthNum}_${yearNum}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error('Datavant Excel export error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ================= EXPORT LOGGING SLAB ANALYSIS EXCEL =================
router.get('/logging-analysis', async (req, res) => {
  try {
    const { month, year } = req.query;
    const monthNum = parseInt(month) || new Date().getMonth() + 1;
    const yearNum = parseInt(year) || new Date().getFullYear();

    // Fetch resource payouts
    const payouts = await ResourcePayout.find({
      month: monthNum,
      year: yearNum
    }).lean();

    // Calculate summary
    const summary = {
      total_logging_cases: payouts.reduce((sum, p) => sum + (p.total_logging_cases || 0), 0),
      total_working_days: Math.max(...payouts.map(p => p.total_working_days || 0)),
      total_logging_hours: payouts.reduce((sum, p) => sum + (p.total_logging_hours || 0), 0),
      avg_cases_per_hour: 0
    };
    
    if (summary.total_logging_hours > 0) {
      summary.avg_cases_per_hour = summary.total_logging_cases / summary.total_logging_hours;
    }

    const data = {
      month: monthNum,
      year: yearNum,
      resources: payouts.map(p => ({
        name: p.resource_name,
        total_logging_cases: p.total_logging_cases,
        total_working_days: p.total_working_days,
        total_logging_hours: p.total_logging_hours,
        avg_cases_per_hour: p.avg_cases_per_hour
      })),
      summary
    };

    const workbook = await generateLoggingSlabExcel(data);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Logging_Slab_Analysis_${monthNum}_${yearNum}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error('Logging analysis Excel export error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ================= EXPORT COMPLETE RESOURCE PAYOUT EXCEL =================
router.get('/resource-payouts', async (req, res) => {
  try {
    const { month, year } = req.query;
    const monthNum = parseInt(month) || new Date().getMonth() + 1;
    const yearNum = parseInt(year) || new Date().getFullYear();

    const payouts = await ResourcePayout.find({
      month: monthNum,
      year: yearNum
    }).sort({ grand_total_payout: -1 }).lean();

    const workbook = await generateResourcePayoutExcel(payouts, monthNum, yearNum);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Resource_Payouts_${monthNum}_${yearNum}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error('Resource payout Excel export error:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;