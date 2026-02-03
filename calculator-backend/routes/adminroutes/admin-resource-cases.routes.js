// routes/admin/admin-resource-cases.routes.js
// Admin API routes for viewing resource cases with stats and export
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Resource = require('../../models/Resource');
const MRODailyAllocation = require('../../models/Allocations/MROdailyallocation');
const VerismaDailyAllocation = require('../../models/Allocations/Verismadailyallocation');
const DatavantDailyAllocation = require('../../models/Allocations/DatavantDailyAllocation');

const { authenticateUser } = require('../../middleware/auth');

// ═══════════════════════════════════════════════════════════════
// GET: All Resources with Stats (Today, Till Yesterday, Total)
// ═══════════════════════════════════════════════════════════════
router.get('/resources-with-stats', authenticateUser, async (req, res) => {
  try {
    const { geography_id, client_id, search } = req.query;
    
    // Build resource query
    const resourceQuery = { is_active: { $ne: false } };
    
    if (search) {
      resourceQuery.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Get all resources
    let resources = await Resource.find(resourceQuery)
      .select('name email email_normalized assignments is_active')
      .lean();
    
    // Filter by geography/client if specified
    if (geography_id || client_id) {
      resources = resources.filter(r => {
        if (!r.assignments || r.assignments.length === 0) return false;
        
        return r.assignments.some(a => {
          if (geography_id && a.geography_id?.toString() !== geography_id) return false;
          if (client_id && a.client_id?.toString() !== client_id) return false;
          return true;
        });
      });
    }
    
    // Get today's date boundaries
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Calculate stats for each resource
    const resourcesWithStats = await Promise.all(resources.map(async (resource) => {
      const email = resource.email_normalized || resource.email?.toLowerCase();
      
      // Count from all three allocation collections
      const [mroToday, mroYesterday, mroTotal] = await Promise.all([
        MRODailyAllocation.countDocuments({ 
          resource_email: email, 
          allocation_date: { $gte: today, $lt: tomorrow },
          is_deleted: { $ne: true }
        }),
        MRODailyAllocation.countDocuments({ 
          resource_email: email, 
          allocation_date: { $lt: today },
          is_deleted: { $ne: true }
        }),
        MRODailyAllocation.countDocuments({ 
          resource_email: email,
          is_deleted: { $ne: true }
        })
      ]);
      
      const [verismaToday, verismaYesterday, verismaTotal] = await Promise.all([
        VerismaDailyAllocation.countDocuments({ 
          resource_email: email, 
          allocation_date: { $gte: today, $lt: tomorrow },
          is_deleted: { $ne: true }
        }),
        VerismaDailyAllocation.countDocuments({ 
          resource_email: email, 
          allocation_date: { $lt: today },
          is_deleted: { $ne: true }
        }),
        VerismaDailyAllocation.countDocuments({ 
          resource_email: email,
          is_deleted: { $ne: true }
        })
      ]);
      
      const [datavantToday, datavantYesterday, datavantTotal] = await Promise.all([
        DatavantDailyAllocation.countDocuments({ 
          resource_email: email, 
          allocation_date: { $gte: today, $lt: tomorrow },
          is_deleted: { $ne: true }
        }),
        DatavantDailyAllocation.countDocuments({ 
          resource_email: email, 
          allocation_date: { $lt: today },
          is_deleted: { $ne: true }
        }),
        DatavantDailyAllocation.countDocuments({ 
          resource_email: email,
          is_deleted: { $ne: true }
        })
      ]);
      
      return {
        ...resource,
        stats: {
          today: mroToday + verismaToday + datavantToday,
          till_yesterday: mroYesterday + verismaYesterday + datavantYesterday,
          total: mroTotal + verismaTotal + datavantTotal,
          by_client: {
            mro: { today: mroToday, till_yesterday: mroYesterday, total: mroTotal },
            verisma: { today: verismaToday, till_yesterday: verismaYesterday, total: verismaTotal },
            datavant: { today: datavantToday, till_yesterday: datavantYesterday, total: datavantTotal }
          }
        }
      };
    }));
    
    // Sort by total cases descending
    resourcesWithStats.sort((a, b) => b.stats.total - a.stats.total);
    
    res.json({
      success: true,
      count: resourcesWithStats.length,
      resources: resourcesWithStats
    });
    
  } catch (error) {
    console.error('Error fetching resources with stats:', error);
    res.status(500).json({ message: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET: Cases for a specific resource with filters
// ═══════════════════════════════════════════════════════════════
router.get('/resource-cases', authenticateUser, async (req, res) => {
  try {
    const { 
      resource_email, 
      client, 
      date, 
      start_date, 
      end_date, 
      process_type, 
      subproject_id,
      request_type,
      page = 1, 
      limit = 50 
    } = req.query;
    
    if (!resource_email) {
      return res.status(400).json({ message: 'resource_email is required' });
    }
    
    const email = resource_email.toLowerCase();
    
    // Build base query
    const buildQuery = () => {
      const query = { 
        resource_email: email,
        is_deleted: { $ne: true }
      };
      
      // Date filters
      if (date) {
        const targetDate = new Date(date);
        const startOfDay = new Date(targetDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(targetDate);
        endOfDay.setHours(23, 59, 59, 999);
        query.allocation_date = { $gte: startOfDay, $lte: endOfDay };
      } else if (start_date || end_date) {
        query.allocation_date = {};
        if (start_date) query.allocation_date.$gte = new Date(start_date);
        if (end_date) {
          const endDate = new Date(end_date);
          endDate.setHours(23, 59, 59, 999);
          query.allocation_date.$lte = endDate;
        }
      }
      
      // Process type filter
      if (process_type) {
        query.$or = [
          { process_type: process_type },
          { project_name: process_type }
        ];
      }
      
      // Subproject filter
      if (subproject_id) {
        query.subproject_id = new mongoose.Types.ObjectId(subproject_id);
      }
      
      // Request type filter
      if (request_type) {
        query.request_type = request_type;
      }
      
      return query;
    };
    
    let allCases = [];
    
    // Fetch from relevant collections based on client filter
    const fetchFromCollection = async (Model, clientName) => {
      const query = buildQuery();
      const cases = await Model.find(query)
        .sort({ allocation_date: -1, sr_no: -1 })
        .lean();
      
      return cases.map(c => ({ ...c, client_name: clientName }));
    };
    
    if (!client || client.toLowerCase() === 'mro') {
      const mroCases = await fetchFromCollection(MRODailyAllocation, 'MRO');
      allCases = allCases.concat(mroCases);
    }
    
    if (!client || client.toLowerCase() === 'verisma') {
      const verismaCases = await fetchFromCollection(VerismaDailyAllocation, 'Verisma');
      allCases = allCases.concat(verismaCases);
    }
    
    if (!client || client.toLowerCase() === 'datavant') {
      const datavantCases = await fetchFromCollection(DatavantDailyAllocation, 'Datavant');
      allCases = allCases.concat(datavantCases);
    }
    
    // Sort all cases by date descending
    allCases.sort((a, b) => new Date(b.allocation_date) - new Date(a.allocation_date));
    
    // Pagination
    const total = allCases.length;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const paginatedCases = allCases.slice(skip, skip + parseInt(limit));
    
    res.json({
      success: true,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      cases: paginatedCases
    });
    
  } catch (error) {
    console.error('Error fetching resource cases:', error);
    res.status(500).json({ message: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET: Export resource cases to CSV
// ═══════════════════════════════════════════════════════════════
router.get('/resource-cases/export', authenticateUser, async (req, res) => {
  try {
    const { 
      resource_email, 
      client, 
      date, 
      start_date, 
      end_date, 
      process_type, 
      subproject_id 
    } = req.query;
    
    if (!resource_email) {
      return res.status(400).json({ message: 'resource_email is required' });
    }
    
    const email = resource_email.toLowerCase();
    
    // Build query
    const buildQuery = () => {
      const query = { 
        resource_email: email,
        is_deleted: { $ne: true }
      };
      
      if (date) {
        const targetDate = new Date(date);
        const startOfDay = new Date(targetDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(targetDate);
        endOfDay.setHours(23, 59, 59, 999);
        query.allocation_date = { $gte: startOfDay, $lte: endOfDay };
      } else if (start_date || end_date) {
        query.allocation_date = {};
        if (start_date) query.allocation_date.$gte = new Date(start_date);
        if (end_date) {
          const endDate = new Date(end_date);
          endDate.setHours(23, 59, 59, 999);
          query.allocation_date.$lte = endDate;
        }
      }
      
      if (process_type) {
        query.$or = [
          { process_type: process_type },
          { project_name: process_type }
        ];
      }
      
      if (subproject_id) {
        query.subproject_id = new mongoose.Types.ObjectId(subproject_id);
      }
      
      return query;
    };
    
    let allCases = [];
    
    const fetchFromCollection = async (Model, clientName) => {
      const query = buildQuery();
      const cases = await Model.find(query)
        .sort({ allocation_date: -1, sr_no: -1 })
        .lean();
      
      return cases.map(c => ({ ...c, client_name: clientName }));
    };
    
    if (!client || client.toLowerCase() === 'mro') {
      const mroCases = await fetchFromCollection(MRODailyAllocation, 'MRO');
      allCases = allCases.concat(mroCases);
    }
    
    if (!client || client.toLowerCase() === 'verisma') {
      const verismaCases = await fetchFromCollection(VerismaDailyAllocation, 'Verisma');
      allCases = allCases.concat(verismaCases);
    }
    
    if (!client || client.toLowerCase() === 'datavant') {
      const datavantCases = await fetchFromCollection(DatavantDailyAllocation, 'Datavant');
      allCases = allCases.concat(datavantCases);
    }
    
    // Sort by date
    allCases.sort((a, b) => new Date(b.allocation_date) - new Date(a.allocation_date));
    
    // Build CSV
    const headers = [
      'SR No',
      'Client',
      'Allocation Date',
      'Logged Date',
      'Geography',
      'Process Type',
      'Location',
      'Facility',
      'Request ID',
      'Request Type',
      'Requestor Type',
      'Task Type',
      'Count',
      'Billing Rate',
      'Billing Amount',
      'Is Late Log',
      'Days Late',
      'Edit Count',
      'Status',
      'Remark'
    ];
    
    const rows = allCases.map(c => [
      c.sr_no || '',
      c.client_name || '',
      c.allocation_date ? new Date(c.allocation_date).toISOString().split('T')[0] : '',
      c.logged_date ? new Date(c.logged_date).toISOString().split('T')[0] : '',
      c.geography_name || '',
      c.process_type || c.project_name || '',
      c.subproject_name || '',
      c.facility_name || '',
      c.request_id || '',
      c.request_type || '',
      c.requestor_type || '',
      c.task_type || '',
      c.count || 1,
      c.billing_rate || 0,
      c.billing_amount || 0,
      c.is_late_log ? 'Yes' : 'No',
      c.days_late || 0,
      c.edit_count || 0,
      c.is_deleted ? 'Deleted' : (c.has_pending_delete_request ? 'Delete Pending' : 'Active'),
      (c.remark || '').replace(/"/g, '""')
    ]);
    
    // Escape CSV values
    const escapeCSV = (value) => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(escapeCSV).join(','))
    ].join('\n');
    
    // Send CSV response
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="resource_cases_${email.split('@')[0]}_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csvContent);
    
  } catch (error) {
    console.error('Error exporting resource cases:', error);
    res.status(500).json({ message: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET: Resource summary by date range
// ═══════════════════════════════════════════════════════════════
router.get('/resource-summary/:email', authenticateUser, async (req, res) => {
  try {
    const { email } = req.params;
    const { start_date, end_date } = req.query;
    
    const normalizedEmail = email.toLowerCase();
    
    const dateMatch = {};
    if (start_date) dateMatch.$gte = new Date(start_date);
    if (end_date) {
      const endDate = new Date(end_date);
      endDate.setHours(23, 59, 59, 999);
      dateMatch.$lte = endDate;
    }
    
    const matchStage = {
      resource_email: normalizedEmail,
      is_deleted: { $ne: true }
    };
    
    if (Object.keys(dateMatch).length > 0) {
      matchStage.allocation_date = dateMatch;
    }
    
    // Aggregate from all collections
    const aggregateSummary = async (Model) => {
      return Model.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: '%Y-%m-%d', date: '$allocation_date' } },
              subproject_name: '$subproject_name',
              process_type: { $ifNull: ['$process_type', '$project_name'] }
            },
            count: { $sum: { $ifNull: ['$count', 1] } },
            entries: { $sum: 1 },
            billing: { $sum: '$billing_amount' },
            late_count: { $sum: { $cond: ['$is_late_log', 1, 0] } },
            edited_count: { $sum: { $cond: [{ $gt: ['$edit_count', 0] }, 1, 0] } }
          }
        },
        {
          $group: {
            _id: '$_id.date',
            locations: {
              $push: {
                location: '$_id.subproject_name',
                process_type: '$_id.process_type',
                count: '$count',
                entries: '$entries',
                billing: '$billing',
                late: '$late_count',
                edited: '$edited_count'
              }
            },
            total_count: { $sum: '$count' },
            total_entries: { $sum: '$entries' },
            total_billing: { $sum: '$billing' },
            total_late: { $sum: '$late_count' },
            total_edited: { $sum: '$edited_count' }
          }
        },
        { $sort: { _id: -1 } }
      ]);
    };
    
    const [mroSummary, verismaSummary, datavantSummary] = await Promise.all([
      aggregateSummary(MRODailyAllocation),
      aggregateSummary(VerismaDailyAllocation),
      aggregateSummary(DatavantDailyAllocation)
    ]);
    
    res.json({
      success: true,
      resource_email: normalizedEmail,
      summary: {
        mro: mroSummary,
        verisma: verismaSummary,
        datavant: datavantSummary
      }
    });
    
  } catch (error) {
    console.error('Error fetching resource summary:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;