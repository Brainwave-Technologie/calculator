// routes/qc-assignment.routes.js - QC Assignment routes for admin and resource
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const QCAssignment = require('../models/QCAssignment');
const Resource = require('../models/Resource');
const MRODailyAllocation = require('../models/Allocations/MROdailyallocation');
const VerismaDailyAllocation = require('../models/Allocations/Verismadailyallocation');
const DatavantDailyAllocation = require('../models/Allocations/DatavantDailyAllocation');

const { authenticateResource, authenticateUser } = require('../middleware/auth');

// Helper: get the right allocation model for a client type
function getAllocationModel(clientType) {
  switch (clientType) {
    case 'MRO': return MRODailyAllocation;
    case 'Verisma': return VerismaDailyAllocation;
    case 'Datavant': return DatavantDailyAllocation;
    default: return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// ADMIN ROUTES
// ═══════════════════════════════════════════════════════════════

// POST: Assign QC cases to a resource
// Admin selects: target resource, source resource, date, client type
// All logged cases from source resource for that date/client get assigned as QC tasks to target resource
router.post('/', authenticateUser, async (req, res) => {
  try {
    const { target_resource_id, source_resource_email, date, client_type } = req.body;

    // Validate required fields
    if (!target_resource_id || !source_resource_email || !date || !client_type) {
      return res.status(400).json({
        message: 'target_resource_id, source_resource_email, date, and client_type are required'
      });
    }

    // Validate client type
    const AllocationModel = getAllocationModel(client_type);
    if (!AllocationModel) {
      return res.status(400).json({ message: 'Invalid client_type. Must be MRO, Verisma, or Datavant' });
    }

    // Find target resource
    const targetResource = await Resource.findById(target_resource_id);
    if (!targetResource) {
      return res.status(404).json({ message: 'Target resource not found' });
    }

    // Query source cases for that date
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const cases = await AllocationModel.find({
      resource_email: source_resource_email.toLowerCase().trim(),
      allocation_date: { $gte: startOfDay, $lte: endOfDay },
      is_deleted: { $ne: true }
    }).sort({ sr_no: 1 });

    if (cases.length === 0) {
      return res.status(404).json({
        message: `No cases found for ${source_resource_email} on ${date} for ${client_type}`
      });
    }

    // Check for already-assigned cases (prevent duplicates)
    // Also fix old records with null month/year
    const existingQCDocs = await QCAssignment.find({
      original_allocation_id: { $in: cases.map(c => c._id) },
      assigned_to_resource_id: target_resource_id,
      is_deleted: false
    });

    // Fix any old records missing month/year
    for (const doc of existingQCDocs) {
      if (!doc.month || !doc.year) {
        const d = new Date(doc.original_allocation_date);
        doc.month = d.getMonth() + 1;
        doc.year = d.getFullYear();
        await doc.save();
      }
    }

    const existingIdStrings = existingQCDocs.map(d => d.original_allocation_id.toString());
    const newCases = cases.filter(c => !existingIdStrings.includes(c._id.toString()));

    if (newCases.length === 0) {
      const fixedCount = existingQCDocs.filter(d => !d.month || !d.year).length;
      return res.status(200).json({
        success: true,
        message: fixedCount > 0
          ? `All cases already assigned. Fixed ${fixedCount} record(s) with missing data.`
          : 'All cases are already assigned for QC to this resource',
        assigned_count: 0,
        skipped_count: cases.length,
        fixed_count: fixedCount
      });
    }

    // Create QC assignment documents
    const adminEmail = req.user?.email || 'admin';
    const adminId = req.user?._id || req.user?.id;

    const qcDocs = newCases.map((c, idx) => {
      // Manually compute month/year (insertMany skips pre-save hooks)
      const allocDate = new Date(c.allocation_date);

      return {
        original_allocation_id: c._id,
        client_type,
        sr_no: idx + 1,
        original_allocation_date: c.allocation_date,
        original_resource_id: c.resource_id,
        original_resource_name: c.resource_name,
        original_resource_email: c.resource_email,
        geography_id: c.geography_id,
        geography_name: c.geography_name,
        client_id: c.client_id,
        client_name: c.client_name,
        project_id: c.project_id,
        project_name: c.project_name,
        subproject_id: c.subproject_id,
        subproject_name: c.subproject_name,
        request_id: c.request_id || '',
        request_type: c.request_type || '',
        requestor_type: c.requestor_type || '',
        process_type: c.process_type || c.project_name || '',
        facility_name: c.facility_name || '',
        duplicate_code: '',
        month: allocDate.getMonth() + 1,
        year: allocDate.getFullYear(),
        assigned_to_resource_id: targetResource._id,
        assigned_to_resource_name: targetResource.name,
        assigned_to_resource_email: targetResource.email,
        assigned_by_admin_id: adminId,
        assigned_by_admin_email: adminEmail,
        status: 'pending'
      };
    });

    await QCAssignment.insertMany(qcDocs);

    res.status(201).json({
      success: true,
      message: `${qcDocs.length} case(s) assigned for QC${existingIdStrings.length > 0 ? ` (${existingIdStrings.length} already assigned, skipped)` : ''}`,
      assigned_count: qcDocs.length,
      skipped_count: existingIdStrings.length,
      total_source_cases: cases.length
    });

  } catch (error) {
    console.error('QC assign error:', error);
    res.status(500).json({ message: error.message });
  }
});

// GET: Active resources list for admin dropdown
router.get('/resources-list', authenticateUser, async (req, res) => {
  try {
    const resources = await Resource.find({ status: 'active' })
      .select('name email role')
      .sort({ name: 1 })
      .lean();

    res.json({ success: true, resources });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET: Resources who logged cases on a specific date for a specific client
router.get('/logged-resources', authenticateUser, async (req, res) => {
  try {
    const { date, client_type } = req.query;

    if (!date || !client_type) {
      return res.status(400).json({ message: 'date and client_type are required' });
    }

    const AllocationModel = getAllocationModel(client_type);
    if (!AllocationModel) {
      return res.status(400).json({ message: 'Invalid client_type' });
    }

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // Aggregate distinct resources who logged on that date
    const loggedResources = await AllocationModel.aggregate([
      {
        $match: {
          allocation_date: { $gte: startOfDay, $lte: endOfDay },
          is_deleted: { $ne: true }
        }
      },
      {
        $group: {
          _id: '$resource_email',
          resource_name: { $first: '$resource_name' },
          resource_id: { $first: '$resource_id' },
          case_count: { $sum: 1 }
        }
      },
      { $sort: { resource_name: 1 } }
    ]);

    res.json({
      success: true,
      resources: loggedResources.map(r => ({
        email: r._id,
        name: r.resource_name,
        resource_id: r.resource_id,
        case_count: r.case_count
      }))
    });
  } catch (error) {
    console.error('Get logged resources error:', error);
    res.status(500).json({ message: error.message });
  }
});

// POST: Admin cleanup - clear old auto-generated duplicate_code values
router.post('/admin/clear-duplicate-codes', authenticateUser, async (req, res) => {
  try {
    const result = await QCAssignment.updateMany(
      { duplicate_code: { $ne: '' }, is_deleted: false },
      { $set: { duplicate_code: '' } }
    );
    res.json({ success: true, message: `Cleared duplicate_code for ${result.modifiedCount} record(s)` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET: Admin QC summary - grouped by date + QC resource
router.get('/admin/summary', authenticateUser, async (req, res) => {
  try {
    const { client_type, month, year, assigned_to, source_resource } = req.query;

    const matchStage = { is_deleted: false };
    if (client_type) matchStage.client_type = client_type;
    if (month) matchStage.month = parseInt(month);
    if (year) matchStage.year = parseInt(year);
    if (assigned_to) matchStage.assigned_to_resource_email = assigned_to.toLowerCase();
    if (source_resource) matchStage.original_resource_email = source_resource.toLowerCase();

    // Run all queries in parallel
    const [summary, statusCounts, clientCounts, assignedResources, sourceResources] = await Promise.all([
      QCAssignment.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: '%Y-%m-%d', date: '$original_allocation_date' } },
              qc_resource_email: '$assigned_to_resource_email',
              qc_resource_name: '$assigned_to_resource_name',
              source_resource_email: '$original_resource_email',
              source_resource_name: '$original_resource_name',
              client_type: '$client_type'
            },
            total_assigned: { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
            pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
            in_progress: { $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] } },
            assigned_at: { $first: '$assigned_at' }
          }
        },
        { $sort: { '_id.date': -1, '_id.qc_resource_name': 1 } }
      ]),
      QCAssignment.aggregate([
        { $match: { ...matchStage } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      QCAssignment.aggregate([
        { $match: { is_deleted: false, ...(month ? { month: parseInt(month) } : {}), ...(year ? { year: parseInt(year) } : {}) } },
        { $group: { _id: '$client_type', count: { $sum: 1 } } }
      ]),
      QCAssignment.aggregate([
        { $match: { is_deleted: false } },
        { $group: { _id: '$assigned_to_resource_email', name: { $first: '$assigned_to_resource_name' } } },
        { $sort: { name: 1 } }
      ]),
      QCAssignment.aggregate([
        { $match: { is_deleted: false } },
        { $group: { _id: '$original_resource_email', name: { $first: '$original_resource_name' } } },
        { $sort: { name: 1 } }
      ])
    ]);

    const counts = { pending: 0, in_progress: 0, completed: 0 };
    statusCounts.forEach(s => { counts[s._id] = s.count; });

    res.json({
      success: true,
      summary: summary.map(s => ({
        date: s._id.date,
        client_type: s._id.client_type,
        qc_resource_name: s._id.qc_resource_name,
        qc_resource_email: s._id.qc_resource_email,
        source_resource_name: s._id.source_resource_name,
        source_resource_email: s._id.source_resource_email,
        total_assigned: s.total_assigned,
        completed: s.completed,
        pending: s.pending,
        in_progress: s.in_progress,
        assigned_at: s.assigned_at
      })),
      counts,
      clientCounts: clientCounts.reduce((acc, c) => { acc[c._id] = c.count; return acc; }, {}),
      assignedResources: assignedResources.map(r => ({ email: r._id, name: r.name })),
      sourceResources: sourceResources.map(r => ({ email: r._id, name: r.name }))
    });
  } catch (error) {
    console.error('Admin QC summary error:', error);
    res.status(500).json({ message: error.message });
  }
});

// GET: Admin view all QC assignments with filters + stats
router.get('/admin/all', authenticateUser, async (req, res) => {
  try {
    const { client_type, status, month, year, assigned_to, source_resource } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));

    const query = { is_deleted: false };
    if (client_type) query.client_type = client_type;
    if (status) query.status = status;
    if (month) query.month = parseInt(month);
    if (year) query.year = parseInt(year);
    if (assigned_to) query.assigned_to_resource_email = assigned_to.toLowerCase();
    if (source_resource) query.original_resource_email = source_resource.toLowerCase();

    const countQuery = { ...query };
    delete countQuery.status;

    // Run all queries in parallel
    const [total, tasks, statusCounts, clientCounts, assignedResources, sourceResources] = await Promise.all([
      QCAssignment.countDocuments(query),
      QCAssignment.find(query)
        .sort({ assigned_at: -1, sr_no: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      QCAssignment.aggregate([
        { $match: countQuery },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      QCAssignment.aggregate([
        { $match: { is_deleted: false, ...(month ? { month: parseInt(month) } : {}), ...(year ? { year: parseInt(year) } : {}) } },
        { $group: { _id: '$client_type', count: { $sum: 1 } } }
      ]),
      QCAssignment.aggregate([
        { $match: { is_deleted: false } },
        { $group: { _id: '$assigned_to_resource_email', name: { $first: '$assigned_to_resource_name' } } },
        { $sort: { name: 1 } }
      ]),
      QCAssignment.aggregate([
        { $match: { is_deleted: false } },
        { $group: { _id: '$original_resource_email', name: { $first: '$original_resource_name' } } },
        { $sort: { name: 1 } }
      ])
    ]);

    const counts = { pending: 0, in_progress: 0, completed: 0 };
    statusCounts.forEach(s => { counts[s._id] = s.count; });

    res.json({
      success: true,
      total,
      tasks,
      counts,
      clientCounts: clientCounts.reduce((acc, c) => { acc[c._id] = c.count; return acc; }, {}),
      assignedResources: assignedResources.map(r => ({ email: r._id, name: r.name })),
      sourceResources: sourceResources.map(r => ({ email: r._id, name: r.name })),
      page,
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// RESOURCE ROUTES
// ═══════════════════════════════════════════════════════════════

// GET: Fetch QC tasks assigned to the current resource
router.get('/my-qc-tasks', authenticateResource, async (req, res) => {
  try {
    const { client_type, status, month, year } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));

    const query = {
      assigned_to_resource_email: req.resource.email.toLowerCase(),
      is_deleted: false
    };
    if (client_type) query.client_type = client_type;
    if (status) query.status = status;
    if (month) query.month = parseInt(month);
    if (year) query.year = parseInt(year);

    // Run count, tasks, and status counts in parallel
    const [total, tasks, statusCounts] = await Promise.all([
      QCAssignment.countDocuments(query),
      QCAssignment.find(query)
        .sort({ original_allocation_date: -1, sr_no: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      QCAssignment.aggregate([
        { $match: { assigned_to_resource_email: req.resource.email.toLowerCase(), is_deleted: false, ...(client_type ? { client_type } : {}) } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ])
    ]);

    const counts = { pending: 0, in_progress: 0, completed: 0 };
    statusCounts.forEach(s => { counts[s._id] = s.count; });

    res.json({
      success: true,
      total,
      tasks,
      counts,
      page,
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Get QC tasks error:', error);
    res.status(500).json({ message: error.message });
  }
});

// GET: QC stats for current resource
router.get('/my-qc-stats', authenticateResource, async (req, res) => {
  try {
    const email = req.resource.email.toLowerCase();

    const stats = await QCAssignment.aggregate([
      { $match: { assigned_to_resource_email: email, is_deleted: false } },
      {
        $group: {
          _id: '$client_type',
          total: { $sum: 1 },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } }
        }
      }
    ]);

    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PUT: Update QC fields for a single task
router.put('/:id', authenticateResource, async (req, res) => {
  try {
    const task = await QCAssignment.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ message: 'QC task not found' });
    }

    // Verify ownership
    if (task.assigned_to_resource_id.toString() !== req.resource._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to update this QC task' });
    }

    const { qc_date, qc_request_type, qc_action_taken, qc_error_type, qc_remark, qc_code, duplicate_code, status } = req.body;

    if (qc_date !== undefined) task.qc_date = qc_date;
    if (qc_request_type !== undefined) task.qc_request_type = qc_request_type;
    if (qc_action_taken !== undefined) task.qc_action_taken = qc_action_taken;
    if (qc_error_type !== undefined) task.qc_error_type = qc_error_type;
    if (qc_remark !== undefined) task.qc_remark = qc_remark;
    if (qc_code !== undefined) task.qc_code = qc_code;
    if (duplicate_code !== undefined) task.duplicate_code = duplicate_code;

    // Auto-fill qc_done_by
    task.qc_done_by = req.resource.name;

    // Update status
    if (status) {
      task.status = status;
    } else if (qc_request_type || qc_action_taken) {
      // Auto-mark as completed if QC fields are being filled
      task.status = 'completed';
      task.completed_at = new Date();
    }

    await task.save();

    res.json({ success: true, message: 'QC task updated', task });
  } catch (error) {
    console.error('Update QC task error:', error);
    res.status(500).json({ message: error.message });
  }
});

// PUT: Batch update multiple QC tasks
router.put('/batch-update', authenticateResource, async (req, res) => {
  try {
    const { updates } = req.body; // Array of { id, qc_date, qc_request_type, qc_action_taken, qc_error_type, qc_remark, qc_code }

    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ message: 'Updates array is required' });
    }
    if (updates.length > 500) {
      return res.status(400).json({ message: 'Maximum 500 updates per batch' });
    }

    const results = { success: 0, failed: 0 };

    for (const update of updates) {
      try {
        const task = await QCAssignment.findById(update.id);
        if (!task) { results.failed++; continue; }
        if (task.assigned_to_resource_id.toString() !== req.resource._id.toString()) { results.failed++; continue; }

        if (update.qc_date !== undefined) task.qc_date = update.qc_date;
        if (update.qc_request_type !== undefined) task.qc_request_type = update.qc_request_type;
        if (update.qc_action_taken !== undefined) task.qc_action_taken = update.qc_action_taken;
        if (update.qc_error_type !== undefined) task.qc_error_type = update.qc_error_type;
        if (update.qc_remark !== undefined) task.qc_remark = update.qc_remark;
        if (update.qc_code !== undefined) task.qc_code = update.qc_code;
        if (update.duplicate_code !== undefined) task.duplicate_code = update.duplicate_code;

        task.qc_done_by = req.resource.name;
        task.status = 'completed';
        task.completed_at = new Date();

        await task.save();
        results.success++;
      } catch (err) {
        results.failed++;
      }
    }

    res.json({
      success: true,
      message: `Updated ${results.success} tasks, ${results.failed} failed`,
      results
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
