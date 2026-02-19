// routes/processingPayout.routes.js
// Processing Payout routes - ONLY for "Processing" project type locations
// Excludes: Complete_logging, Indexing, Intake, Logging, etc.

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');

// Models..
const VerismaDailyAllocation = require('../../models/Allocations/Verismadailyallocation');
const MRODailyAllocation = require('../../models/Allocations/MROdailyallocation');
const Subproject = require('../../models/Subproject');
const Project = require('../../models/Project');
// routes/processingPayout.routes.js
// FIXED: Properly fetches flatrate from Subproject model
// Get Verisma Processing Payout
async function getVerismaProcessingPayout(month, year) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);

  // Step 1: Get ALL subprojects with flatrate FIRST
  const allSubprojects = await Subproject.find({}).select('_id name flatrate project_id').lean();
  
  // Create a lookup map for subproject flatrates
  const subprojectFlatrateMap = {};
  allSubprojects.forEach(sp => {
    subprojectFlatrateMap[sp._id.toString()] = {
      name: sp.name,
      flatrate: sp.flatrate || 0
    };
  });

  // Step 2: Get Processing projects
  const processingProjects = await Project.find({
    name: { $regex: /processing/i, $not: { $regex: /logging|indexing|intake/i } }
  }).select('_id').lean();
  
  const processingProjectIds = processingProjects.map(p => p._id.toString());

  // Step 3: Get Processing subprojects
  const processingSubprojectIds = allSubprojects
    .filter(sp => processingProjectIds.includes(sp.project_id?.toString()))
    .map(sp => sp._id);

  // Step 4: Get allocations
  const allocations = await VerismaDailyAllocation.find({
    allocation_date: { $gte: startDate, $lte: endDate },
    is_deleted: { $ne: true },
    subproject_id: { $in: processingSubprojectIds }
  }).lean();

  const uniqueResources = [...new Set(allocations.map(a => a.resource_name).filter(Boolean))].sort();
  const locationMap = {};

  allocations.forEach(alloc => {
    const spId = alloc.subproject_id?.toString();
    if (!spId) return;

    // Get flatrate from our pre-fetched map
    const subprojectData = subprojectFlatrateMap[spId];
    const flatrate = subprojectData?.flatrate || 0;
    const locationName = alloc.subproject_name || subprojectData?.name || 'Unknown';
    const resourceName = alloc.resource_name;
    const caseCount = alloc.count || 1;

    if (!locationMap[spId]) {
      locationMap[spId] = {
        location_id: spId,
        location_name: locationName,
        flatrate: flatrate,
        resource_cases: {},
        total_cases: 0,
        total_payout: 0
      };
    }

    if (!locationMap[spId].resource_cases[resourceName]) {
      locationMap[spId].resource_cases[resourceName] = 0;
    }
    locationMap[spId].resource_cases[resourceName] += caseCount;
    locationMap[spId].total_cases += caseCount;
  });

  // Calculate payouts
  Object.values(locationMap).forEach(loc => {
    loc.total_payout = loc.total_cases * loc.flatrate;
  });

  const locations = Object.values(locationMap).sort((a, b) => a.location_name.localeCompare(b.location_name));

  // Resource totals
  const resourceTotals = {};
  uniqueResources.forEach(name => { resourceTotals[name] = { cases: 0, payout: 0 }; });

  locations.forEach(loc => {
    Object.entries(loc.resource_cases).forEach(([resourceName, cases]) => {
      if (resourceTotals[resourceName]) {
        resourceTotals[resourceName].cases += cases;
        resourceTotals[resourceName].payout += cases * loc.flatrate;
      }
    });
  });

  return {
    client: 'Verisma',
    month, year,
    resources: uniqueResources,
    locations,
    resourceTotals,
    grandTotalCases: locations.reduce((sum, loc) => sum + loc.total_cases, 0),
    grandTotalPayout: locations.reduce((sum, loc) => sum + loc.total_payout, 0)
  };
}

// Get MRO Processing Payout
async function getMROProcessingPayout(month, year) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);

  // Step 1: Get ALL subprojects with flatrate FIRST
  const allSubprojects = await Subproject.find({}).select('_id name flatrate').lean();
  
  const subprojectFlatrateMap = {};
  allSubprojects.forEach(sp => {
    subprojectFlatrateMap[sp._id.toString()] = {
      name: sp.name,
      flatrate: sp.flatrate || 0
    };
  });

  // Step 2: Get MRO Processing allocations
  const allocations = await MRODailyAllocation.find({
    allocation_date: { $gte: startDate, $lte: endDate },
    is_deleted: { $ne: true },
    process_type: { $regex: /^processing$/i }
  }).lean();

  const uniqueResources = [...new Set(allocations.map(a => a.resource_name).filter(Boolean))].sort();
  const locationMap = {};

  allocations.forEach(alloc => {
    const spId = alloc.subproject_id?.toString();
    if (!spId) return;

    // Get flatrate from our pre-fetched map - THIS IS THE KEY FIX
    const subprojectData = subprojectFlatrateMap[spId];
    const flatrate = subprojectData?.flatrate || 0;
    const locationName = alloc.subproject_name || subprojectData?.name || 'Unknown';
    const resourceName = alloc.resource_name;

    if (!locationMap[spId]) {
      locationMap[spId] = {
        location_id: spId,
        location_name: locationName,
        flatrate: flatrate,
        resource_cases: {},
        total_cases: 0,
        total_payout: 0
      };
    }

    if (!locationMap[spId].resource_cases[resourceName]) {
      locationMap[spId].resource_cases[resourceName] = 0;
    }
    locationMap[spId].resource_cases[resourceName] += 1;
    locationMap[spId].total_cases += 1;
  });

  // Calculate payouts
  Object.values(locationMap).forEach(loc => {
    loc.total_payout = loc.total_cases * loc.flatrate;
  });

  const locations = Object.values(locationMap).sort((a, b) => a.location_name.localeCompare(b.location_name));

  const resourceTotals = {};
  uniqueResources.forEach(name => { resourceTotals[name] = { cases: 0, payout: 0 }; });

  locations.forEach(loc => {
    Object.entries(loc.resource_cases).forEach(([resourceName, cases]) => {
      if (resourceTotals[resourceName]) {
        resourceTotals[resourceName].cases += cases;
        resourceTotals[resourceName].payout += cases * loc.flatrate;
      }
    });
  });

  return {
    client: 'MRO',
    month, year,
    resources: uniqueResources,
    locations,
    resourceTotals,
    grandTotalCases: locations.reduce((sum, loc) => sum + loc.total_cases, 0),
    grandTotalPayout: locations.reduce((sum, loc) => sum + loc.total_payout, 0)
  };
}

// Routes
router.get('/verisma', async (req, res) => {
  try {
    const data = await getVerismaProcessingPayout(
      parseInt(req.query.month) || new Date().getMonth() + 1,
      parseInt(req.query.year) || new Date().getFullYear()
    );
    res.json({ success: true, ...data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/mro', async (req, res) => {
  try {
    const data = await getMROProcessingPayout(
      parseInt(req.query.month) || new Date().getMonth() + 1,
      parseInt(req.query.year) || new Date().getFullYear()
    );
    res.json({ success: true, ...data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/combined', async (req, res) => {
  try {
    const monthNum = parseInt(req.query.month) || new Date().getMonth() + 1;
    const yearNum = parseInt(req.query.year) || new Date().getFullYear();

    const [verisma, mro] = await Promise.all([
      getVerismaProcessingPayout(monthNum, yearNum),
      getMROProcessingPayout(monthNum, yearNum)
    ]);

    res.json({
      success: true,
      month: monthNum,
      year: yearNum,
      verisma,
      mro,
      combinedGrandTotal: {
        cases: verisma.grandTotalCases + mro.grandTotalCases,
        payout: verisma.grandTotalPayout + mro.grandTotalPayout
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Export
router.get('/export/:client', async (req, res) => {
  try {
    const { client } = req.params;
    const monthNum = parseInt(req.query.month) || new Date().getMonth() + 1;
    const yearNum = parseInt(req.query.year) || new Date().getFullYear();

    const data = client.toLowerCase() === 'verisma' 
      ? await getVerismaProcessingPayout(monthNum, yearNum)
      : await getMROProcessingPayout(monthNum, yearNum);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(`${client} Payout`, { views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }] });

    const headers = ['Location', 'Cost', ...data.resources, 'Total'];
    const headerRow = sheet.addRow(headers);
    headerRow.font = { bold: true };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
    sheet.getColumn(1).width = 28;
    sheet.getColumn(2).width = 10;

    data.locations.forEach(loc => {
      const row = sheet.addRow([loc.location_name, loc.flatrate, ...data.resources.map(r => loc.resource_cases[r] || 0), loc.total_cases]);
      row.getCell(2).numFmt = '$#,##0.00';
      row.eachCell((cell, col) => {
        if (col > 2 && col <= data.resources.length + 2 && (cell.value || 0) > 0) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF92D050' } };
        }
      });
    });

    sheet.addRow(['Total', '', ...data.resources.map(r => data.resourceTotals[r]?.cases || 0), data.grandTotalCases]).font = { bold: true };
    const pr = sheet.addRow(['Payout', '', ...data.resources.map(r => data.resourceTotals[r]?.payout || 0), data.grandTotalPayout]);
    pr.font = { bold: true };
    pr.eachCell((cell, col) => { if (col > 2) cell.numFmt = '$#,##0.00'; });

    const monthName = new Date(yearNum, monthNum - 1).toLocaleString('default', { month: 'short' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${client}_Payout_${monthName}_${yearNum}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/export-combined', async (req, res) => {
  try {
    const monthNum = parseInt(req.query.month) || new Date().getMonth() + 1;
    const yearNum = parseInt(req.query.year) || new Date().getFullYear();

    const [verisma, mro] = await Promise.all([
      getVerismaProcessingPayout(monthNum, yearNum),
      getMROProcessingPayout(monthNum, yearNum)
    ]);

    const workbook = new ExcelJS.Workbook();

    [{ data: verisma, name: 'Verisma' }, { data: mro, name: 'MRO' }].forEach(({ data, name }) => {
      const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }] });
      const headers = ['Location', 'Cost', ...data.resources, 'Total'];
      sheet.addRow(headers).font = { bold: true };
      sheet.getColumn(1).width = 28;
      sheet.getColumn(2).width = 10;

      data.locations.forEach(loc => {
        const row = sheet.addRow([loc.location_name, loc.flatrate, ...data.resources.map(r => loc.resource_cases[r] || 0), loc.total_cases]);
        row.getCell(2).numFmt = '$#,##0.00';
      });

      sheet.addRow(['Total', '', ...data.resources.map(r => data.resourceTotals[r]?.cases || 0), data.grandTotalCases]);
      const pr = sheet.addRow(['Payout', '', ...data.resources.map(r => data.resourceTotals[r]?.payout || 0), data.grandTotalPayout]);
      pr.eachCell((cell, col) => { if (col > 2) cell.numFmt = '$#,##0.00'; });
    });

    const monthName = new Date(yearNum, monthNum - 1).toLocaleString('default', { month: 'short' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Processing_Payout_${monthName}_${yearNum}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;