// routes/payout.js
// Resource Payout System - Uses existing Subproject flatrate for processing payouts
// Logging payouts use slab-based rates based on avg cases per hour

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Models - adjust paths based on your project structure
const ResourcePayout = require('../models/ResourcePayout');
const Resource = require('../models/Resource');
const Subproject = require('../models/Subproject');
const Project = require('../models/Project');
const Client = require('../models/Client');
const VerismaDailyAllocation = require('../models/Allocations/Verismadailyallocation');
// If you have separate daily allocation models for MRO/Datavant, import them:
// const MRODailyAllocation = require('../models/MRODailyAllocation');

// ================= LOGGING SLAB RATES (for resource payout) =================
// These are PAYOUT slabs - what we pay resources based on their productivity
// Applies to ALL logging cases (Verisma + MRO combined)
const LOGGING_SLABS = [
  { min: 0, max: 12.99, rate: 0.50 },
  { min: 13, max: 15.99, rate: 0.55 },
  { min: 16, max: 20.99, rate: 0.60 },
  { min: 21, max: null, rate: 0.65 }
];

const COMPLETE_LOGGING_RATE = 0.65; // Complete logging always pays $0.65/case

// ================= HELPER FUNCTIONS =================

// Check if process type is "Processing" (paid at subproject flatrate)
const isProcessingType = (processType) => {
  if (!processType) return false;
  const normalized = processType.toLowerCase();
  return normalized.includes('processing') && !normalized.includes('logging');
};

// Check if process type is "Logging" (paid at slab rate)
const isLoggingType = (processType) => {
  if (!processType) return false;
  const normalized = processType.toLowerCase();
  return normalized.includes('logging');
};

// Check if it's "Complete Logging" (logged in regular logging, but gets bonus)
const isCompleteLoggingType = (processType) => {
  if (!processType) return false;
  const normalized = processType.toLowerCase();
  return normalized.includes('complete') && normalized.includes('logging');
};

// Get slab rate based on average cases per hour
const getSlabRate = (avgCasesPerHour) => {
  for (const slab of LOGGING_SLABS) {
    if (slab.max === null) {
      if (avgCasesPerHour >= slab.min) return slab;
    } else {
      if (avgCasesPerHour >= slab.min && avgCasesPerHour <= slab.max) return slab;
    }
  }
  return LOGGING_SLABS[0]; // Default to lowest slab
};

// Get all dates in a month
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

// Get client type from client name
const getClientType = (clientName) => {
  if (!clientName) return 'other';
  const normalized = clientName.toLowerCase();
  if (normalized.includes('verisma')) return 'verisma';
  if (normalized.includes('mro')) return 'mro';
  if (normalized.includes('datavant')) return 'datavant';
  return 'other';
};

// ================= GET VERISMA PAYROLL DATA (Day-wise) =================
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

    // Get all Verisma projects and subprojects
    const verismaProjects = await Project.find({ 
      client_id: verismaClient._id 
    }).lean();
    
    const projectIds = verismaProjects.map(p => p._id);
    
    const verismaSubprojects = await Subproject.find({
      project_id: { $in: projectIds },
      status: 'active'
    }).lean();
    
    const subprojectIds = verismaSubprojects.map(s => s._id);

    // Create subproject lookup for flatrate
    const subprojectLookup = {};
    verismaSubprojects.forEach(sp => {
      subprojectLookup[sp._id.toString()] = {
        name: sp.name,
        flatrate: sp.flatrate || 0,
        process_type: sp.process_type || sp.project_name || ''
      };
    });

    // Fetch daily allocations for the month
    const startDate = new Date(yearNum, monthNum - 1, 1);
    const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59);

    const allocations = await VerismaDailyAllocation.find({
      subproject_id: { $in: subprojectIds },
      date: { $gte: startDate, $lte: endDate }
    }).populate('resource_id', 'name email avatar_url')
      .lean();

    // Get all unique resources
    const resourceIds = [...new Set(allocations.map(a => a.resource_id?._id?.toString()).filter(Boolean))];
    
    const resources = await Resource.find({
      _id: { $in: resourceIds }
    }).select('name email avatar_url').sort({ name: 1 }).lean();

    // Build date headers
    const dates = getDatesInMonth(monthNum, yearNum);

    // Build resource data matrix
    const resourceData = {};
    
    resources.forEach(resource => {
      resourceData[resource._id.toString()] = {
        resource_id: resource._id,
        name: resource.name,
        email: resource.email,
        avatar_url: resource.avatar_url,
        daily_cases: {},
        total_cases: 0
      };
      
      // Initialize all dates with 0
      dates.forEach(d => {
        resourceData[resource._id.toString()].daily_cases[d.dateStr] = 0;
      });
    });

    // Populate cases from allocations
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

    // Calculate daily totals
    const dailyTotals = {};
    dates.forEach(d => {
      dailyTotals[d.dateStr] = 0;
    });

    Object.values(resourceData).forEach(r => {
      Object.entries(r.daily_cases).forEach(([dateStr, cases]) => {
        dailyTotals[dateStr] = (dailyTotals[dateStr] || 0) + cases;
      });
    });

    // Calculate grand total
    const grandTotal = Object.values(resourceData).reduce((sum, r) => sum + r.total_cases, 0);

    res.json({
      client: 'Verisma',
      month: monthNum,
      year: yearNum,
      dates,
      resources: Object.values(resourceData).sort((a, b) => a.name.localeCompare(b.name)),
      dailyTotals,
      grandTotal,
      resourceCount: resources.length
    });

  } catch (err) {
    console.error('Verisma payroll error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ================= GET MRO PAYROLL DATA (Location-wise) =================
router.get('/mro', async (req, res) => {
  try {
    const { month, year } = req.query;
    const monthNum = parseInt(month) || new Date().getMonth() + 1;
    const yearNum = parseInt(year) || new Date().getFullYear();

    // Get MRO client
    const mroClient = await Client.findOne({ 
      name: { $regex: /^mro$/i } 
    }).lean();
    
    if (!mroClient) {
      return res.status(404).json({ message: 'MRO client not found' });
    }

    // Get all MRO projects (Processing, Logging, MRO Payer Project)
    const mroProjects = await Project.find({ 
      client_id: mroClient._id 
    }).lean();
    
    const projectIds = mroProjects.map(p => p._id);
    const projectLookup = {};
    mroProjects.forEach(p => {
      projectLookup[p._id.toString()] = p.name;
    });

    // Get all MRO subprojects with their flatrates
    const mroSubprojects = await Subproject.find({
      project_id: { $in: projectIds },
      status: 'active'
    }).lean();
    
    const subprojectIds = mroSubprojects.map(s => s._id);

    // Fetch allocations for the month
    const startDate = new Date(yearNum, monthNum - 1, 1);
    const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59);

    // Use same VerismaDailyAllocation model or MRO-specific model
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

    // Build location data with flatrate from subproject
    const locationData = {};
    
    mroSubprojects.forEach(sp => {
      const projectName = projectLookup[sp.project_id?.toString()] || '';
      locationData[sp._id.toString()] = {
        subproject_id: sp._id,
        location_name: sp.name,
        project_name: projectName,
        // FLATRATE comes from the subproject (set during upload)
        cost_per_case: sp.flatrate || 0,
        resource_cases: {},
        total_cases: 0,
        total_payout: 0
      };
    });

    // Populate resource cases per location
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

    // Calculate payouts using subproject flatrate
    Object.values(locationData).forEach(loc => {
      loc.total_payout = loc.total_cases * loc.cost_per_case;
    });

    // Calculate totals
    const totalProcessing = Object.values(locationData).reduce((sum, l) => sum + l.total_cases, 0);
    const totalPayout = Object.values(locationData).reduce((sum, l) => sum + l.total_payout, 0);

    res.json({
      client: 'MRO',
      month: monthNum,
      year: yearNum,
      locations: Object.values(locationData).filter(l => l.total_cases > 0 || l.cost_per_case > 0),
      resources: resources.map(r => ({ id: r._id.toString(), name: r.name })),
      totalProcessing,
      totalPayout,
      locationCount: mroSubprojects.length
    });

  } catch (err) {
    console.error('MRO payroll error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ================= GET DATAVANT PAYROLL DATA =================
router.get('/datavant', async (req, res) => {
  try {
    const { month, year } = req.query;
    const monthNum = parseInt(month) || new Date().getMonth() + 1;
    const yearNum = parseInt(year) || new Date().getFullYear();

    // Get Datavant client
    const datavantClient = await Client.findOne({ 
      name: { $regex: /datavant/i } 
    }).lean();
    
    if (!datavantClient) {
      return res.json({
        client: 'Datavant',
        month: monthNum,
        year: yearNum,
        locations: [],
        resources: [],
        totalProcessing: 0,
        totalPayout: 0,
        message: 'Datavant client not found or no data configured'
      });
    }

    // Similar structure to MRO - implement when Datavant data is ready
    res.json({
      client: 'Datavant',
      month: monthNum,
      year: yearNum,
      locations: [],
      resources: [],
      totalProcessing: 0,
      totalPayout: 0
    });

  } catch (err) {
    console.error('Datavant payroll error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ================= CALCULATE RESOURCE PAYOUT =================
// This is the main calculation endpoint that:
// 1. Gets processing cases and pays at subproject flatrate
// 2. Gets logging cases (all types) and pays at slab rate based on avg/hour
// 3. Calculates complete logging bonus
router.post('/calculate', async (req, res) => {
  try {
    const { month, year, resource_id } = req.body;
    const monthNum = parseInt(month) || new Date().getMonth() + 1;
    const yearNum = parseInt(year) || new Date().getFullYear();

    // Get date range
    const startDate = new Date(yearNum, monthNum - 1, 1);
    const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59);

    // Get all clients for categorization
    const clients = await Client.find({}).lean();
    const clientLookup = {};
    clients.forEach(c => {
      clientLookup[c._id.toString()] = {
        name: c.name,
        type: getClientType(c.name)
      };
    });

    // Get all active subprojects with their flatrates and project info
    const subprojects = await Subproject.find({ status: 'active' })
      .populate('project_id', 'name client_id')
      .lean();
    
    const subprojectLookup = {};
    subprojects.forEach(sp => {
      const clientId = sp.project_id?.client_id?.toString() || sp.client_id?.toString();
      const clientInfo = clientLookup[clientId] || { name: 'Unknown', type: 'other' };
      const projectName = sp.project_id?.name || sp.project_name || '';
      
      subprojectLookup[sp._id.toString()] = {
        name: sp.name,
        flatrate: sp.flatrate || 0,
        project_name: projectName,
        client_name: clientInfo.name,
        client_type: clientInfo.type,
        // Determine if this is processing or logging based on project name
        is_processing: isProcessingType(projectName),
        is_logging: isLoggingType(projectName),
        is_complete_logging: isCompleteLoggingType(projectName)
      };
    });

    // Build resource filter
    let resourceFilter = {};
    if (resource_id) {
      resourceFilter._id = new mongoose.Types.ObjectId(resource_id);
    }

    const resources = await Resource.find(resourceFilter).lean();
    const results = [];

    for (const resource of resources) {
      // Fetch all allocations for this resource this month
      const allocations = await VerismaDailyAllocation.find({
        resource_id: resource._id,
        date: { $gte: startDate, $lte: endDate }
      }).lean();

      if (allocations.length === 0) continue;

      // Initialize counters
      let verismaProcessingCases = 0;
      let verismaProcessingAmount = 0;
      let verismaLoggingCases = 0;
      
      let mroProcessingCases = 0;
      let mroProcessingAmount = 0;
      let mroLoggingCases = 0;
      
      let datavantProcessingCases = 0;
      let datavantProcessingAmount = 0;
      let datavantLoggingCases = 0;
      
      let completeLoggingCases = 0;
      let totalHours = 0;
      let workingDays = new Set();

      const processingBreakdown = [];
      const dailyBreakdown = {};

      // Process each allocation
      for (const alloc of allocations) {
        const spId = alloc.subproject_id?.toString();
        const spInfo = subprojectLookup[spId];
        
        if (!spInfo) continue;

        const cases = alloc.cases_allocated || alloc.cases || 0;
        const hours = alloc.hours || 8; // Default 8 hours if not specified
        const date = new Date(alloc.date);
        const dateKey = date.toISOString().split('T')[0];
        
        workingDays.add(dateKey);
        totalHours += hours;
        
        // Initialize daily breakdown
        if (!dailyBreakdown[dateKey]) {
          dailyBreakdown[dateKey] = {
            date,
            day_name: date.toLocaleString('en-US', { weekday: 'short' }),
            verisma_cases: 0,
            mro_cases: 0,
            datavant_cases: 0,
            hours_worked: 0,
            total_cases: 0
          };
        }
        dailyBreakdown[dateKey].hours_worked += hours;
        dailyBreakdown[dateKey].total_cases += cases;

        // Categorize by client and type
        const clientType = spInfo.client_type;
        
        if (spInfo.is_processing) {
          // PROCESSING: Pay at subproject flatrate
          const payoutAmount = cases * spInfo.flatrate;
          
          processingBreakdown.push({
            subproject_id: spId,
            subproject_name: spInfo.name,
            location_name: spInfo.name,
            cases,
            rate: spInfo.flatrate,
            amount: payoutAmount,
            client: clientType
          });

          if (clientType === 'verisma') {
            verismaProcessingCases += cases;
            verismaProcessingAmount += payoutAmount;
            dailyBreakdown[dateKey].verisma_cases += cases;
          } else if (clientType === 'mro') {
            mroProcessingCases += cases;
            mroProcessingAmount += payoutAmount;
            dailyBreakdown[dateKey].mro_cases += cases;
          } else if (clientType === 'datavant') {
            datavantProcessingCases += cases;
            datavantProcessingAmount += payoutAmount;
            dailyBreakdown[dateKey].datavant_cases += cases;
          }
        } else if (spInfo.is_logging) {
          // LOGGING: Will be paid at slab rate (calculated after all cases counted)
          
          if (spInfo.is_complete_logging) {
            // Complete logging cases get counted in regular logging AND get bonus
            completeLoggingCases += cases;
          }

          if (clientType === 'verisma') {
            verismaLoggingCases += cases;
            dailyBreakdown[dateKey].verisma_cases += cases;
          } else if (clientType === 'mro') {
            mroLoggingCases += cases;
            dailyBreakdown[dateKey].mro_cases += cases;
          } else if (clientType === 'datavant') {
            datavantLoggingCases += cases;
            dailyBreakdown[dateKey].datavant_cases += cases;
          }
        }
      }

      // Calculate total logging (Verisma + MRO + Datavant)
      const totalLoggingCases = verismaLoggingCases + mroLoggingCases + datavantLoggingCases;
      
      // Calculate average cases per hour for slab determination
      const avgCasesPerHour = totalHours > 0 ? totalLoggingCases / totalHours : 0;
      
      // Get slab rate based on productivity
      const slab = getSlabRate(avgCasesPerHour);
      const loggingBaseAmount = totalLoggingCases * slab.rate;
      
      // Calculate complete logging bonus
      // Complete logging gets $0.65 per case, but slab amount already included
      // So bonus = (0.65 - slab.rate) * completeLoggingCases
      const completeLoggingBonusRate = Math.max(0, COMPLETE_LOGGING_RATE - slab.rate);
      const completeLoggingBonusAmount = completeLoggingCases * completeLoggingBonusRate;

      // Calculate totals
      const totalProcessingAmount = verismaProcessingAmount + mroProcessingAmount + datavantProcessingAmount;
      const totalLoggingAmount = loggingBaseAmount;
      const totalBonusAmount = completeLoggingBonusAmount;
      const grandTotalPayout = totalProcessingAmount + totalLoggingAmount + totalBonusAmount;

      // Upsert payout record
      const payoutData = {
        resource_id: resource._id,
        resource_name: resource.name,
        resource_email: resource.email,
        month: monthNum,
        year: yearNum,
        
        // Verisma
        verisma_processing_cases: verismaProcessingCases,
        verisma_processing_amount: verismaProcessingAmount,
        verisma_processing_breakdown: processingBreakdown.filter(b => b.client === 'verisma'),
        verisma_logging_cases: verismaLoggingCases,
        
        // MRO
        mro_processing_cases: mroProcessingCases,
        mro_processing_amount: mroProcessingAmount,
        mro_processing_breakdown: processingBreakdown.filter(b => b.client === 'mro'),
        mro_logging_cases: mroLoggingCases,
        
        // Datavant
        datavant_processing_cases: datavantProcessingCases,
        datavant_processing_amount: datavantProcessingAmount,
        datavant_processing_breakdown: processingBreakdown.filter(b => b.client === 'datavant'),
        datavant_logging_cases: datavantLoggingCases,
        
        // Logging totals (all clients combined for slab calculation)
        total_logging_cases: totalLoggingCases,
        total_logging_hours: totalHours,
        total_working_days: workingDays.size,
        avg_cases_per_hour: avgCasesPerHour,
        
        // Slab info
        logging_slab_min: slab.min,
        logging_slab_max: slab.max,
        logging_rate_per_case: slab.rate,
        logging_base_amount: loggingBaseAmount,
        
        // Complete logging bonus
        complete_logging_cases: completeLoggingCases,
        complete_logging_bonus_rate: completeLoggingBonusRate,
        complete_logging_bonus_amount: completeLoggingBonusAmount,
        
        // Totals
        total_processing_amount: totalProcessingAmount,
        total_logging_amount: totalLoggingAmount,
        total_bonus_amount: totalBonusAmount,
        grand_total_payout: grandTotalPayout,
        
        daily_breakdown: Object.values(dailyBreakdown),
        status: 'calculated',
        calculated_at: new Date()
      };

      const payout = await ResourcePayout.findOneAndUpdate(
        { resource_id: resource._id, month: monthNum, year: yearNum },
        { $set: payoutData },
        { upsert: true, new: true }
      );

      results.push(payout);
    }

    res.json({
      success: true,
      message: `Calculated payouts for ${results.length} resources`,
      slabs_used: LOGGING_SLABS,
      complete_logging_rate: COMPLETE_LOGGING_RATE,
      results
    });

  } catch (err) {
    console.error('Payout calculation error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ================= GET RESOURCE PAYOUTS =================
router.get('/resources', async (req, res) => {
  try {
    const { month, year, status, search, page = 1, limit = 50 } = req.query;
    
    const query = {};
    if (month) query.month = parseInt(month);
    if (year) query.year = parseInt(year);
    if (status) query.status = status;
    
    if (search) {
      query.$or = [
        { resource_name: { $regex: search, $options: 'i' } },
        { resource_email: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [payouts, total] = await Promise.all([
      ResourcePayout.find(query)
        .sort({ grand_total_payout: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      ResourcePayout.countDocuments(query)
    ]);

    // Calculate summary
    const summary = await ResourcePayout.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          total_processing: { $sum: '$total_processing_amount' },
          total_logging: { $sum: '$total_logging_amount' },
          total_bonus: { $sum: '$total_bonus_amount' },
          grand_total: { $sum: '$grand_total_payout' },
          total_resources: { $sum: 1 }
        }
      }
    ]);

    res.json({
      payouts,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      summary: summary[0] || {
        total_processing: 0,
        total_logging: 0,
        total_bonus: 0,
        grand_total: 0,
        total_resources: 0
      }
    });

  } catch (err) {
    console.error('Get payouts error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ================= GET SINGLE RESOURCE PAYOUT DETAIL =================
router.get('/resources/:resource_id', async (req, res) => {
  try {
    const { resource_id } = req.params;
    const { month, year } = req.query;
    
    const query = { resource_id: new mongoose.Types.ObjectId(resource_id) };
    if (month) query.month = parseInt(month);
    if (year) query.year = parseInt(year);

    const payout = await ResourcePayout.findOne(query).lean();
    
    if (!payout) {
      return res.status(404).json({ message: 'Payout record not found' });
    }

    res.json(payout);

  } catch (err) {
    console.error('Get payout detail error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ================= GET LOGGING SLABS REFERENCE =================
router.get('/slabs', async (req, res) => {
  try {
    res.json({
      logging_slabs: LOGGING_SLABS,
      complete_logging_rate: COMPLETE_LOGGING_RATE,
      note: 'Processing cases are paid at the subproject flatrate (configured during upload). Logging cases are paid based on these slabs.'
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ================= APPROVE PAYOUT =================
router.patch('/:payout_id/approve', async (req, res) => {
  try {
    const { payout_id } = req.params;
    const { approved_by } = req.body;

    const payout = await ResourcePayout.findByIdAndUpdate(
      payout_id,
      {
        $set: {
          status: 'approved',
          approved_by,
          approved_at: new Date()
        }
      },
      { new: true }
    );

    if (!payout) {
      return res.status(404).json({ message: 'Payout not found' });
    }

    res.json({ success: true, payout });

  } catch (err) {
    console.error('Approve payout error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ================= MARK PAYOUT AS PAID =================
router.patch('/:payout_id/paid', async (req, res) => {
  try {
    const { payout_id } = req.params;
    const { paid_by, payment_reference } = req.body;

    const payout = await ResourcePayout.findByIdAndUpdate(
      payout_id,
      {
        $set: {
          status: 'paid',
          paid_at: new Date(),
          payment_reference
        }
      },
      { new: true }
    );

    if (!payout) {
      return res.status(404).json({ message: 'Payout not found' });
    }

    res.json({ success: true, payout });

  } catch (err) {
    console.error('Mark paid error:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;