// routes/mro-daily-allocation.routes.js - Complete MRO allocation routes
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const MRODailyAllocation = require('../../models/Allocations/MROdailyallocation');
const MROAssignment = require('../../models/DailyAssignments/MROAssignment');
const Resource = require('../../models/Resource');
const Subproject = require('../../models/Subproject');
const ActivityLog = require('../../models/ActivityLog');
const { sendDeleteRequestNotification, getAdminEmails, sendDeleteRequestNotification_Development } = require('../../services/emailNotifier'); 

// Middleware to verify resource token
const verifyResourceToken = require('../../middleware/auth').authenticateResource;
// Middleware to verify admin token
const verifyAdminToken = require('../../middleware/auth').authenticateUser;

// ═══════════════════════════════════════════════════════════════
// RESOURCE ROUTES
// ═══════════════════════════════════════════════════════════════

// POST: Create new allocation entry
router.post('/', verifyResourceToken, async (req, res) => {
  try {
    const {
      subproject_id,
      allocation_date,
      facility_name,
      request_id,
      request_type,
      requestor_type,
      processing_time,
      remark,
      assignment_id // If logging from an assignment
    } = req.body;
    
    // Validate required fields
    if (!subproject_id || !allocation_date || !request_type) {
      return res.status(400).json({ 
        message: 'Subproject, allocation date, and request type are required' 
      });
    }
    
    // Check if date is locked
    if (MRODailyAllocation.isDateLocked(allocation_date)) {
      return res.status(400).json({ 
        message: 'Cannot add entries for locked month. Month has ended.' 
      });
    }
    
    // Get subproject details
    const subproject = await Subproject.findById(subproject_id);
    if (!subproject) {
      return res.status(404).json({ message: 'Location not found' });
    }
    
    // Check Request ID - if "New Request", verify it doesn't already exist
    if (request_type === 'New Request' && request_id && request_id.trim() !== '') {
      const requestCheck = await MRODailyAllocation.checkRequestIdExists(request_id, 'MRO');
      if (requestCheck.exists) {
        return res.status(400).json({ 
          message: `Request ID "${request_id}" already has a "New Request" entry. Use "${requestCheck.suggestedType}" instead.`,
          suggested_type: requestCheck.suggestedType,
          existing_entry: {
            id: requestCheck.existingEntry._id,
            allocation_date: requestCheck.existingEntry.allocation_date,
            location: requestCheck.existingEntry.subproject_name
          }
        });
      }
    }
    
    // Get next SR number
    const srNo = await MRODailyAllocation.getNextSrNo(req.resource.email, allocation_date);
    
    // Determine process type from project name
    const processType = subproject.project_name?.includes('Processing') ? 'Processing' :
                        subproject.project_name?.includes('Logging') ? 'Logging' : 
                        'MRO Payer Project';
    
    // Get billing rate
    let billingRate = 0;
    if (processType === 'Processing' && requestor_type) {
      const rateEntry = subproject.billing_rates?.find(r => r.requestor_type === requestor_type);
      billingRate = rateEntry?.rate || 0;
    } else if (processType === 'Logging') {
      billingRate = subproject.flatrate || 1.08;
    }
    
    // Create allocation
    const allocation = new MRODailyAllocation({
      sr_no: srNo,
      allocation_date: new Date(allocation_date),
      logged_date: new Date(),
      
      resource_id: req.resource._id,
      resource_name: req.resource.name,
      resource_email: req.resource.email,
      
      geography_id: subproject.geography_id,
      geography_name: subproject.geography_name,
      client_id: subproject.client_id,
      client_name: subproject.client_name || 'MRO',
      project_id: subproject.project_id,
      project_name: subproject.project_name,
      subproject_id: subproject._id,
      subproject_name: subproject.name,
      subproject_key: subproject.business_key,
      
      facility_name: facility_name || '',
      request_id: request_id || '',
      request_type,
      requestor_type: requestor_type || '',
      process_type: processType,
      processing_time: processing_time || '',
      remark: remark || '',
      
      billing_rate: billingRate,
      billing_amount: billingRate,
      billing_rate_at_logging: billingRate,
      
      source: assignment_id ? 'assignment' : 'direct_entry',
      assignment_id
    });
    
    await allocation.save();
    
    // If from assignment, mark it as logged
    if (assignment_id) {
      await MROAssignment.markAsLogged(assignment_id, allocation._id);
    }
    
    // Log activity
    try {
      await ActivityLog.logCaseEntry(allocation, req.resource, 'resource');
    } catch (logErr) {
      console.log('Activity log error (non-fatal):', logErr.message);
    }
    
    res.status(201).json({
      success: true,
      message: 'Entry created successfully',
      data: allocation
    });
    
  } catch (error) {
    console.error('Create allocation error:', error);
    res.status(500).json({ message: error.message });
  }
});

// GET: Today's allocations for current resource
router.get('/my-allocations', verifyResourceToken, async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date ? new Date(date) : new Date();
    
    const allocations = await MRODailyAllocation.getTodaysAllocations(
      req.resource.email, 
      targetDate
    );
    
    res.json({
      success: true,
      date: targetDate.toISOString().split('T')[0],
      count: allocations.length,
      allocations
    });
    
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET: Pending assignments (not yet logged)
router.get('/pending-assignments', verifyResourceToken, async (req, res) => {
  try {
    const assignments = await MROAssignment.getPendingAssignments(
      req.resource.email, 
      'MRO'
    );
    
    res.json({
      success: true,
      count: assignments.length,
      assignments
    });
    
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Build date filter based on params
const buildDateFilter = (query) => {
  const { from_date, to_date, month, year } = query;

  if (from_date) {
    // Date range mode
    const filter = { $gte: new Date(from_date) };
    if (to_date) {
      const end = new Date(to_date);
      end.setHours(23, 59, 59, 999);
      filter.$lte = end;
    } else {
      // Default to today
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      filter.$lte = today;
    }
    return filter;
  }

  // Month/year mode (existing logic)
  const m = parseInt(month) || new Date().getMonth() + 1;
  const y = parseInt(year) || new Date().getFullYear();
  const startDate = new Date(y, m - 1, 1);
  const endDate = new Date(y, m, 0, 23, 59, 59, 999);
  return { $gte: startDate, $lte: endDate };
};

// GET: My stats/summary (for dashboard) - WITH PROCESS TYPE BREAKDOWN
router.get('/my-stats', verifyResourceToken, async (req, res) => {
  try {
    const resourceEmail = req.resource.email.toLowerCase();
    const dateFilter = buildDateFilter(req.query);

    const matchStage = {
      resource_email: resourceEmail,
      allocation_date: dateFilter,
      is_deleted: { $ne: true }
    };

    // Total count
    const totalCases = await MRODailyAllocation.countDocuments(matchStage);

    // By request type
    const byRequestType = await MRODailyAllocation.aggregate([
      { $match: matchStage },
      { $group: { _id: '$request_type', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // By process type (Processing vs Logging)
    const byProcessType = await MRODailyAllocation.aggregate([
      { $match: matchStage },
      { $group: { _id: '$process_type', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // Pending deletes
    const pendingDeletes = await MRODailyAllocation.countDocuments({
      ...matchStage,
      has_pending_delete_request: true
    });

    res.json({
      success: true,
      client: 'MRO',
      total_cases: totalCases,
      total_entries: totalCases,
      by_request_type: byRequestType,
      by_process_type: byProcessType,
      pending_delete_requests: pendingDeletes
    });
  } catch (err) {
    console.error('MRO my-stats error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET: Previous logged cases (separate page)
router.get('/previous-cases', verifyResourceToken, async (req, res) => {
  try {
    const { month, year, from_date, to_date, subproject_key, subproject_id, process_type, request_id, request_type, geography_id, page = 1, limit = 50 } = req.query;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const query = {
      resource_email: req.resource.email.toLowerCase(),
      is_deleted: { $ne: true },
      logged_date: { $lt: today }
    };
    
    // Date filtering - prioritize from_date/to_date over month/year
    if (from_date || to_date) {
      query.allocation_date = {};
      if (from_date) {
        const start = new Date(from_date);
        start.setHours(0, 0, 0, 0);
        query.allocation_date.$gte = start;
      }
      if (to_date) {
        const end = new Date(to_date);
        end.setHours(23, 59, 59, 999);
        query.allocation_date.$lte = end;
      }
    } else if (month && year) {
      query.month = parseInt(month);
      query.year = parseInt(year);
    }
    
    if (subproject_key) query.subproject_key = subproject_key;
    if (subproject_id) query.subproject_id = subproject_id;
    if (process_type) query.process_type = process_type;
    if (request_id) query.request_id = { $regex: request_id, $options: 'i' };
    if (request_type) query.request_type = request_type;
    if (geography_id) query.geography_id = geography_id;
    
    const total = await MRODailyAllocation.countDocuments(query);
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const allocations = await MRODailyAllocation.find(query)
      .sort({ allocation_date: -1, sr_no: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();
    
    // Add lock status
    const allocationsWithLockStatus = allocations.map(a => ({
      ...a,
      is_locked: a.is_locked || (MRODailyAllocation.isDateLocked ? MRODailyAllocation.isDateLocked(a.allocation_date) : false)
    }));
    
    res.json({
      success: true,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      allocations: allocationsWithLockStatus
    });
    
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PUT: Edit allocation (with mandatory change reason)
router.put('/:id', verifyResourceToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      change_reason, 
      change_notes,
      facility_name,
      request_id,
      request_type,
      requestor_type,
      processing_time,
      remark
    } = req.body;
    
    // Validate change reason
    if (!change_reason || change_reason.trim() === '') {
      return res.status(400).json({ 
        message: 'Change reason is required for editing' 
      });
    }
    
    // Build updates object (only include changed fields)
    const updates = {};
    if (facility_name !== undefined) updates.facility_name = facility_name;
    if (request_id !== undefined) updates.request_id = request_id;
    if (request_type !== undefined) updates.request_type = request_type;
    if (requestor_type !== undefined) updates.requestor_type = requestor_type;
    if (processing_time !== undefined) updates.processing_time = processing_time;
    if (remark !== undefined) updates.remark = remark;
    
    // Check if changing to "New Request" when request_id already has one
    if (request_type === 'New Request' && request_id && request_id.trim() !== '') {
      const requestCheck = await MRODailyAllocation.checkRequestIdExists(request_id, 'MRO');
      // Exclude current entry from check
      if (requestCheck.exists && requestCheck.existingEntry._id.toString() !== id) {
        return res.status(400).json({ 
          message: `Request ID "${request_id}" already has a "New Request" entry.`,
          suggested_type: requestCheck.suggestedType
        });
      }
    }
    
    const editorInfo = {
      id: req.resource._id,
      email: req.resource.email,
      name: req.resource.name,
      type: 'resource'
    };
    
    const allocation = await MRODailyAllocation.editWithHistory(
      id,
      updates,
      editorInfo,
      change_reason,
      change_notes || ''
    );
    
    // Log to activity log
    try {
      await ActivityLog.create({
        activity_type: 'CASE_UPDATED',
        actor_type: 'resource',
        actor_id: req.resource._id,
        actor_email: req.resource.email,
        actor_name: req.resource.name,
        allocation_id: allocation._id,
        details: {
          change_reason,
          change_notes,
          fields_changed: Object.keys(updates)
        }
      });
    } catch (logErr) {
      console.log('Activity log error:', logErr.message);
    }
    
    res.json({
      success: true,
      message: 'Entry updated successfully',
      data: allocation
    });
    
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// POST: Request deletion (resources cannot hard delete) - WITH EMAIL NOTIFICATION
router.post('/:id/request-delete', verifyResourceToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { delete_reason } = req.body;
    
    if (!delete_reason || delete_reason.trim() === '') {
      return res.status(400).json({ 
        message: 'Delete reason is required' 
      });
    }
    
    // Find the allocation first
    const allocation = await MRODailyAllocation.findById(id);
    if (!allocation) {
      return res.status(404).json({ message: 'Allocation not found' });
    }
    
    // Verify ownership
    if (allocation.resource_id.toString() !== req.resource._id.toString()) {
      return res.status(403).json({ message: 'You can only delete your own entries' });
    }
    
    // Check if already has pending delete request
    if (allocation.has_pending_delete_request) {
      return res.status(400).json({ message: 'Delete request already pending for this entry' });
    }
    
    // Check if locked
    if (allocation.is_locked || (MRODailyAllocation.isDateLocked && MRODailyAllocation.isDateLocked(allocation.allocation_date))) {
      return res.status(403).json({ message: 'This entry is locked and cannot be deleted' });
    }
    
    // Set delete request fields directly
    allocation.delete_request = {
      requested_at: new Date(),
      requested_by_id: req.resource._id,
      requested_by_email: req.resource.email,
      requested_by_name: req.resource.name,
      delete_reason,
      status: 'pending'
    };
    allocation.has_pending_delete_request = true;
    
    await allocation.save();
    
    // Log activity
    try {
      await ActivityLog.create({
        activity_type: 'CASE_DELETED',
        actor_type: 'resource',
        actor_id: req.resource._id,
        actor_email: req.resource.email,
        actor_name: req.resource.name,
        allocation_id: allocation._id,
        allocation_date: allocation.allocation_date,
        client_name: 'MRO',
        subproject_name: allocation.subproject_name,
        details: {
          action: 'delete_requested',
          delete_reason
        }
      });
    } catch (logErr) {
      console.log('Activity log error:', logErr.message);
    }
    
    // Send email notification to admin(s)
    try {
      const adminEmails = await getAdminEmails();
      console.log(adminEmails);
      await sendDeleteRequestNotification({
        adminEmails,
        resourceName: req.resource.name,
        resourceEmail: req.resource.email,
        clientName: 'MRO',
        allocationId: allocation._id,
        allocationDate: allocation.allocation_date,
        subprojectName: allocation.subproject_name,
        requestId: allocation.request_id,
        requestType: allocation.request_type,
        deleteReason: delete_reason,
        dashboardUrl: process.env.ADMIN_DASHBOARD_URL
      });
    } catch (emailErr) {
      console.log('Email notification error (non-fatal):', emailErr.message);
    }
    
    res.json({
      success: true,
      message: 'Delete request submitted for admin approval',
      data: allocation
    });
    
  } catch (error) {
    console.error('Delete request error:', error);
    res.status(400).json({ message: error.message });
  }
});

// GET: Check if Request ID exists
router.get('/check-request-id', verifyResourceToken, async (req, res) => {
  try {
    const { request_id } = req.query;
    
    if (!request_id) {
      return res.json({ exists: false, suggested_type: 'New Request' });
    }
    
    const result = await MRODailyAllocation.checkRequestIdExists(request_id, 'MRO');
    
    res.json({
      exists: result.exists,
      suggested_type: result.suggestedType,
      existing_entry: result.existingEntry ? {
        id: result.existingEntry._id,
        allocation_date: result.existingEntry.allocation_date,
        location: result.existingEntry.subproject_name,
        logged_by: result.existingEntry.resource_name
      } : null
    });
    
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET: Monthly summary
router.get('/monthly-summary', verifyResourceToken, async (req, res) => {
  try {
    const { month, year } = req.query;
    const targetMonth = month ? parseInt(month) : new Date().getMonth() + 1;
    const targetYear = year ? parseInt(year) : new Date().getFullYear();
    
    const summary = await MRODailyAllocation.aggregate([
      {
        $match: {
          resource_email: req.resource.email.toLowerCase(),
          month: targetMonth,
          year: targetYear,
          is_deleted: { $ne: true }
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$allocation_date' } },
            subproject_name: '$subproject_name',
            process_type: '$process_type'
          },
          count: { $sum: 1 },
          total_billing: { $sum: '$billing_amount' }
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
              billing: '$total_billing'
            }
          },
          total_count: { $sum: '$count' },
          total_billing: { $sum: '$total_billing' }
        }
      },
      { $sort: { _id: -1 } }
    ]);
    
    res.json({
      success: true,
      month: targetMonth,
      year: targetYear,
      data: summary
    });
    
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// ADMIN ROUTES
// ═══════════════════════════════════════════════════════════════

// GET: All allocations (admin)
router.get('/admin/all', verifyAdminToken, async (req, res) => {
  try {
    const { 
      month, year, resource_email, subproject_key, process_type,
      include_deleted, page = 1, limit = 100 
    } = req.query;
    
    const query = {};
    
    if (month) query.month = parseInt(month);
    if (year) query.year = parseInt(year);
    if (resource_email) query.resource_email = resource_email.toLowerCase();
    if (subproject_key) query.subproject_key = subproject_key;
    if (process_type) query.process_type = process_type;
    if (!include_deleted) query.is_deleted = { $ne: true };
    
    const total = await MRODailyAllocation.countDocuments(query);
    const allocations = await MRODailyAllocation.find(query)
      .sort({ allocation_date: -1, sr_no: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));
    
    res.json({
      success: true,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      allocations
    });
    
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET: Pending delete requests (admin)
router.get('/admin/delete-requests', verifyAdminToken, async (req, res) => {
  try {
    const requests = await MRODailyAllocation.find({
      has_pending_delete_request: true,
      is_deleted: { $ne: true }
    }).sort({ 'delete_request.requested_at': -1 }).lean();
    
    res.json({
      success: true,
      count: requests.length,
      requests
    });
    
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST: Review delete request (admin)
router.post('/admin/review-delete/:id', verifyAdminToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { action, comment, delete_type } = req.body;
    
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ message: 'Action must be "approve" or "reject"' });
    }
    
    const allocation = await MRODailyAllocation.findById(id);
    if (!allocation) {
      return res.status(404).json({ message: 'Allocation not found' });
    }
    if (!allocation.has_pending_delete_request) {
      return res.status(400).json({ message: 'No pending delete request' });
    }
    
    const adminUser = req.admin || req.user;
    
    allocation.delete_request.reviewed_at = new Date();
    allocation.delete_request.reviewed_by_id = adminUser._id;
    allocation.delete_request.reviewed_by_email = adminUser.email;
    allocation.delete_request.review_comment = comment || '';
    
    if (action === 'approve') {
      allocation.delete_request.status = 'approved';
      allocation.delete_request.delete_type = delete_type || 'soft';
      
      if (delete_type === 'hard') {
        await allocation.deleteOne();
        await ActivityLog.create({
          activity_type: 'CASE_DELETED',
          actor_type: 'admin',
          actor_email: adminUser.email,
          client_name: 'MRO',
          allocation_id: id,
          details: { action: 'delete_approved', delete_type: 'hard', comment }
        });
        return res.json({ success: true, message: 'Delete request approved - entry permanently deleted' });
      } else {
        allocation.is_deleted = true;
        allocation.deleted_at = new Date();
        allocation.deleted_by = adminUser.email;
      }
    } else {
      allocation.delete_request.status = 'rejected';
    }
    
    allocation.has_pending_delete_request = false;
    await allocation.save();
    
    // Log activity
    await ActivityLog.create({
      activity_type: 'CASE_DELETED',
      actor_type: 'admin',
      actor_email: adminUser.email,
      client_name: 'MRO',
      allocation_id: allocation._id,
      details: {
        action: `delete_${action}ed`,
        delete_type: action === 'approve' ? (delete_type || 'soft') : null,
        comment
      }
    });
    
    res.json({
      success: true,
      message: `Delete request ${action}ed`,
      result: allocation
    });
    
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// PUT: Admin edit (with mandatory change reason)
router.put('/admin/:id', verifyAdminToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { change_reason, change_notes, ...updates } = req.body;
    
    if (!change_reason || change_reason.trim() === '') {
      return res.status(400).json({ 
        message: 'Change reason is required for editing' 
      });
    }
    
    const adminUser = req.admin || req.user;
    
    const editorInfo = {
      id: adminUser._id,
      email: adminUser.email,
      name: adminUser.name || 'Admin',
      type: 'admin'
    };
    
    const allocation = await MRODailyAllocation.editWithHistory(
      id,
      updates,
      editorInfo,
      change_reason,
      change_notes || ''
    );
    
    res.json({
      success: true,
      message: 'Entry updated by admin',
      data: allocation
    });
    
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// GET: Late logs (admin activity tracking)
router.get('/admin/late-logs', verifyAdminToken, async (req, res) => {
  try {
    const { month, year, resource_email } = req.query;
    
    const filters = {};
    if (month) filters.month = parseInt(month);
    if (year) filters.year = parseInt(year);
    if (resource_email) filters.resource_email = resource_email;
    
    const lateLogs = await MRODailyAllocation.getLateLogs(filters);
    
    res.json({
      success: true,
      count: lateLogs.length,
      data: lateLogs
    });
    
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET: Edit history for an allocation (admin)
router.get('/admin/:id/history', verifyAdminToken, async (req, res) => {
  try {
    const allocation = await MRODailyAllocation.findById(req.params.id)
      .select('edit_history edit_count last_edited_at resource_name subproject_name');
    
    if (!allocation) {
      return res.status(404).json({ message: 'Allocation not found' });
    }
    
    res.json({
      success: true,
      allocation_info: {
        resource_name: allocation.resource_name,
        location: allocation.subproject_name
      },
      edit_count: allocation.edit_count,
      last_edited_at: allocation.last_edited_at,
      history: allocation.edit_history.sort((a, b) => b.edited_at - a.edited_at)
    });
    
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET: Billing summary (admin)
router.get('/admin/billing-summary', verifyAdminToken, async (req, res) => {
  try {
    const { month, year } = req.query;
    const targetMonth = month ? parseInt(month) : new Date().getMonth() + 1;
    const targetYear = year ? parseInt(year) : new Date().getFullYear();
    
    const summary = await MRODailyAllocation.getBillingSummaryBySubprojectKey(
      targetMonth,
      targetYear,
      'MRO'
    );
    
    res.json({
      success: true,
      month: targetMonth,
      year: targetYear,
      data: summary
    });
    
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;