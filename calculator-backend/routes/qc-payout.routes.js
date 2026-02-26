// routes/qc-payout.routes.js - QC Payout dashboard API
const express = require('express');
const router = express.Router();

const QCAssignment = require('../models/QCAssignment');
const { authenticateUser } = require('../middleware/auth');

const QC_RATE_PER_CASE = 0.50;

/**
 * GET /api/qc-payout?month=2&year=2026
 * Returns QC payout summary grouped by resource, broken down by client (MRO/Verisma)
 * Only counts completed QC assignments.
 */
router.get('/', authenticateUser, async (req, res) => {
  try {
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year) || new Date().getFullYear();

    const matchStage = {
      is_deleted: false,
      status: 'completed',
      month,
      year
    };

    // Aggregate completed QC cases per resource per client
    const resourceBreakdown = await QCAssignment.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            resource_email: '$assigned_to_resource_email',
            resource_name: '$assigned_to_resource_name',
            client_type: '$client_type'
          },
          cases: { $sum: 1 }
        }
      },
      { $sort: { '_id.resource_name': 1 } }
    ]);

    // Build per-resource map
    const resourceMap = {};

    resourceBreakdown.forEach(row => {
      const email = row._id.resource_email;
      if (!resourceMap[email]) {
        resourceMap[email] = {
          resource_name: row._id.resource_name,
          resource_email: email,
          mro_qc_cases: 0,
          verisma_qc_cases: 0,
          datavant_qc_cases: 0,
          total_qc_cases: 0,
          total_payout: 0
        };
      }

      const client = row._id.client_type;
      if (client === 'MRO') resourceMap[email].mro_qc_cases += row.cases;
      else if (client === 'Verisma') resourceMap[email].verisma_qc_cases += row.cases;
      else if (client === 'Datavant') resourceMap[email].datavant_qc_cases += row.cases;
    });

    // Calculate totals
    const resources = Object.values(resourceMap).map(r => {
      r.total_qc_cases = r.mro_qc_cases + r.verisma_qc_cases + r.datavant_qc_cases;
      r.total_payout = parseFloat((r.total_qc_cases * QC_RATE_PER_CASE).toFixed(2));
      return r;
    });

    // Sort by name
    resources.sort((a, b) => a.resource_name.localeCompare(b.resource_name));

    // Grand totals
    const totals = resources.reduce((acc, r) => {
      acc.mro_qc_cases += r.mro_qc_cases;
      acc.verisma_qc_cases += r.verisma_qc_cases;
      acc.datavant_qc_cases += r.datavant_qc_cases;
      acc.total_qc_cases += r.total_qc_cases;
      acc.total_payout += r.total_payout;
      return acc;
    }, { mro_qc_cases: 0, verisma_qc_cases: 0, datavant_qc_cases: 0, total_qc_cases: 0, total_payout: 0 });

    totals.total_payout = parseFloat(totals.total_payout.toFixed(2));

    res.json({
      success: true,
      month,
      year,
      qc_rate: QC_RATE_PER_CASE,
      totals,
      resources,
      resource_count: resources.length
    });

  } catch (error) {
    console.error('QC Payout API error:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
