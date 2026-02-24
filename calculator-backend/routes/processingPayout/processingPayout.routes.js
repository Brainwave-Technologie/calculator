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
// routes/processingPayout.routes.js
// FIXED: Properly fetches flatrate from Subproject model
// Get Verisma Processing Payout
async function getVerismaProcessingPayout(month, year) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);

  // Step 1: Build subproject lookup maps (by ID and by name) for flatrate
  const allSubprojects = await Subproject.find({}).select('_id name flatrate project_id').lean();

  // Map by ID for direct lookup
  const subprojectByIdMap = {};
  // Map by lowercase name for fallback lookup when ID doesn't match
  const subprojectByNameMap = {};
  allSubprojects.forEach(sp => {
    subprojectByIdMap[sp._id.toString()] = {
      name: sp.name,
      flatrate: sp.flatrate || 0
    };
    // Use lowercase name as key for name-based matching
    const nameKey = (sp.name || '').toLowerCase().trim();
    if (nameKey) {
      subprojectByNameMap[nameKey] = {
        name: sp.name,
        flatrate: sp.flatrate || 0
      };
    }
  });

  // Step 2: Get allocations - filter directly by process field (like MRO does with process_type)
  const allocations = await VerismaDailyAllocation.find({
    allocation_date: { $gte: startDate, $lte: endDate },
    is_deleted: { $ne: true },
    process: { $regex: /^processing$/i }
  }).lean();

  const uniqueResources = [...new Set(allocations.map(a => a.resource_name).filter(Boolean))].sort();
  const locationMap = {};

  allocations.forEach(alloc => {
    const spId = alloc.subproject_id?.toString();
    const locationName = alloc.subproject_name || 'Unknown';
    const resourceName = alloc.resource_name;
    const caseCount = alloc.count || 1;

    // Determine flatrate with priority:
    // 1. Try subproject by ID (most accurate, gets updated rate)
    // 2. Try subproject by name (fallback if ID doesn't match, still gets updated rate)
    // 3. Use payout_rate saved on allocation (fallback if subproject was removed)
    let flatrate = 0;
    const subprojectById = spId ? subprojectByIdMap[spId] : null;
    const subprojectByName = subprojectByNameMap[(locationName || '').toLowerCase().trim()];

    if (subprojectById && subprojectById.flatrate > 0) {
      flatrate = subprojectById.flatrate;
    } else if (subprojectByName && subprojectByName.flatrate > 0) {
      flatrate = subprojectByName.flatrate;
    } else if (alloc.payout_rate > 0) {
      flatrate = alloc.payout_rate;
    }

    // Group by location name (not by subproject_id) to handle ID mismatches
    const locationKey = locationName.toLowerCase().trim();

    if (!locationMap[locationKey]) {
      locationMap[locationKey] = {
        location_id: spId || locationKey,
        location_name: locationName,
        flatrate: flatrate,
        resource_cases: {},
        total_cases: 0,
        total_payout: 0
      };
    }

    // Update flatrate if a better (non-zero) rate is found from a later allocation
    if (flatrate > 0 && locationMap[locationKey].flatrate === 0) {
      locationMap[locationKey].flatrate = flatrate;
    }

    if (!locationMap[locationKey].resource_cases[resourceName]) {
      locationMap[locationKey].resource_cases[resourceName] = 0;
    }
    locationMap[locationKey].resource_cases[resourceName] += caseCount;
    locationMap[locationKey].total_cases += caseCount;
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

// Default payout rates for special MRO requestor types (overridable via query params)
const NRS_PAYOUT_RATE = 0.50;          // NRS-NO Records
const OTHER_PROCESSING_PAYOUT_RATE = 0.20; // Other Processing (Canceled/Released By Other)

// Get MRO Processing Payout
async function getMROProcessingPayout(month, year, nrsRate = NRS_PAYOUT_RATE, otherProcessingRate = OTHER_PROCESSING_PAYOUT_RATE) {
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

    const subprojectData = subprojectFlatrateMap[spId];
    const locationName = alloc.subproject_name || subprojectData?.name || 'Unknown';
    const resourceName = alloc.resource_name;
    const requestorType = alloc.requestor_type || '';

    // Determine row key, label and effective payout rate based on requestor type:
    // - NRS-NO Records → fixed $0.50 (aggregated across all locations)
    // - Other Processing (Canceled/Released By Other) → fixed $0.20 (aggregated)
    // - Processed / Manual / Processed through File Drop → location flatrate
    let rowKey, rowName, effectiveRate, isFixedRate;

    if (requestorType === 'NRS-NO Records') {
      rowKey = '__NRS__';
      rowName = 'NRS-NO Records';
      effectiveRate = nrsRate;
      isFixedRate = true;
    } else if (requestorType === 'Other Processing (Canceled/Released By Other)') {
      rowKey = '__OTHER_PROCESSING__';
      rowName = 'Other Processing (Canceled/Released By Other)';
      effectiveRate = otherProcessingRate;
      isFixedRate = true;
    } else {
      // Processed, Manual, Processed through File Drop → use location flatrate
      rowKey = spId;
      rowName = locationName;
      effectiveRate = subprojectData?.flatrate || 0;
      isFixedRate = false;
    }

    if (!locationMap[rowKey]) {
      locationMap[rowKey] = {
        location_id: rowKey,
        location_name: rowName,
        flatrate: effectiveRate,
        is_fixed_rate: isFixedRate,
        resource_cases: {},
        total_cases: 0,
        total_payout: 0
      };
    }

    if (!locationMap[rowKey].resource_cases[resourceName]) {
      locationMap[rowKey].resource_cases[resourceName] = 0;
    }
    locationMap[rowKey].resource_cases[resourceName] += 1;
    locationMap[rowKey].total_cases += 1;
  });

  // Calculate payouts using effective rate per row
  Object.values(locationMap).forEach(loc => {
    loc.total_payout = loc.total_cases * loc.flatrate;
  });

  // Sort: standard location rows first (alphabetical), fixed-rate rows at the bottom
  const locations = Object.values(locationMap).sort((a, b) => {
    if (a.is_fixed_rate !== b.is_fixed_rate) return a.is_fixed_rate ? 1 : -1;
    return a.location_name.localeCompare(b.location_name);
  });

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
    const nrsRate = parseFloat(req.query.nrs_rate) > 0 ? parseFloat(req.query.nrs_rate) : NRS_PAYOUT_RATE;
    const otherRate = parseFloat(req.query.other_processing_rate) > 0 ? parseFloat(req.query.other_processing_rate) : OTHER_PROCESSING_PAYOUT_RATE;
    const data = await getMROProcessingPayout(
      parseInt(req.query.month) || new Date().getMonth() + 1,
      parseInt(req.query.year) || new Date().getFullYear(),
      nrsRate,
      otherRate
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
    const nrsRate = parseFloat(req.query.nrs_rate) > 0 ? parseFloat(req.query.nrs_rate) : NRS_PAYOUT_RATE;
    const otherRate = parseFloat(req.query.other_processing_rate) > 0 ? parseFloat(req.query.other_processing_rate) : OTHER_PROCESSING_PAYOUT_RATE;

    const [verisma, mro] = await Promise.all([
      getVerismaProcessingPayout(monthNum, yearNum),
      getMROProcessingPayout(monthNum, yearNum, nrsRate, otherRate)
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
    const nrsRate = parseFloat(req.query.nrs_rate) > 0 ? parseFloat(req.query.nrs_rate) : NRS_PAYOUT_RATE;
    const otherRate = parseFloat(req.query.other_processing_rate) > 0 ? parseFloat(req.query.other_processing_rate) : OTHER_PROCESSING_PAYOUT_RATE;

    const data = client.toLowerCase() === 'verisma'
      ? await getVerismaProcessingPayout(monthNum, yearNum)
      : await getMROProcessingPayout(monthNum, yearNum, nrsRate, otherRate);

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
    const nrsRate = parseFloat(req.query.nrs_rate) > 0 ? parseFloat(req.query.nrs_rate) : NRS_PAYOUT_RATE;
    const otherRate = parseFloat(req.query.other_processing_rate) > 0 ? parseFloat(req.query.other_processing_rate) : OTHER_PROCESSING_PAYOUT_RATE;

    const [verisma, mro] = await Promise.all([
      getVerismaProcessingPayout(monthNum, yearNum),
      getMROProcessingPayout(monthNum, yearNum, nrsRate, otherRate)
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