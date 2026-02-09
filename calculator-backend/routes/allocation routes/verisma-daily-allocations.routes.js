// routes/verisma-daily-allocations.routes.js
// FIXED: Proper assignment tracking - entries MUST come from assignments
const express = require('express');
const router = express.Router();

const VerismaDailyAllocation = require('../../models/Allocations/Verismadailyallocation');
const VerismaAssignment = require('../../models/DailyAssignments/VerismaAssignment');
const SubprojectRequestType = require('../../models/SubprojectRequestType');
const ActivityLog = require('../../models/ActivityLog');
const { sendDeleteRequestNotification, getAdminEmails } = require('../../services/emailNotifier');

const { authenticateResource, authenticateUser } = require('../../middleware/auth');

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

const isDateLocked = (date) => {
  const now = new Date();
  const estOffset = -5 * 60;
  const estNow = new Date(now.getTime() + (estOffset - now.getTimezoneOffset()) * 60000);
  
  const allocDate = new Date(date);
  const lastDayOfMonth = new Date(allocDate.getFullYear(), allocDate.getMonth() + 1, 0).getDate();
  const lockDate = new Date(allocDate.getFullYear(), allocDate.getMonth(), lastDayOfMonth, 23, 59, 59);
  
  return estNow > lockDate;
};

const getNextSrNo = async (resourceEmail, date) => {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  const lastEntry = await VerismaDailyAllocation.findOne({
    resource_email: resourceEmail.toLowerCase().trim(),
    allocation_date: { $gte: startOfDay, $lte: endOfDay },
    is_deleted: { $ne: true }
  }).sort({ sr_no: -1 });
  
  return lastEntry ? lastEntry.sr_no + 1 : 1;
};

const getBillingRate = async (subprojectId, requestType) => {
  try {
    const rateRecord = await SubprojectRequestType.findOne({
      subproject_id: subprojectId,
      name: requestType
    });
    return rateRecord?.rate || 0;
  } catch (err) {
    return 0;
  }
};

const checkRequestIdExists = async (requestId, excludeId = null) => {
  if (!requestId || requestId.trim() === '') return { exists: false };
  
  const query = {
    request_id: requestId.trim(),
    request_type: 'New Request',
    is_deleted: { $ne: true }
  };
  
  if (excludeId) query._id = { $ne: excludeId };
  
  const existing = await VerismaDailyAllocation.findOne(query);
  
  return {
    exists: !!existing,
    existingEntry: existing,
    suggestedType: existing ? 'Duplicate' : 'New Request'
  };
};

// ═══════════════════════════════════════════════════════════════
// RESOURCE ROUTES
// ═══════════════════════════════════════════════════════════════

/**
 * GET: Pending assignments for resource
 * Returns assignments that need to be logged
 */
router.get('/pending-assignments', authenticateResource, async (req, res) => {
  try {
    const result = await VerismaAssignment.getPendingAssignments(req.resource.email);
    
    res.json({
      success: true,
      count: result.assignments.length,
      assignments: result.assignments,
      has_previous_pending: result.has_previous_pending,
      previous_pending_count: result.previous_pending_count,
      blocked_message: result.blocked_message
    });
  } catch (error) {
    console.error('Get pending assignments error:', error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * GET: Pending summary by date
 */
router.get('/pending-summary', authenticateResource, async (req, res) => {
  try {
    const summary = await VerismaAssignment.getPendingSummary(req.resource.email);
    const totalPending = summary.reduce((sum, s) => sum + s.count, 0);
    
    res.json({
      success: true,
      total_pending: totalPending,
      by_date: summary
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * POST: Create new allocation entry
 * MUST have assignment_id - entries come from pending assignments
 */
router.post('/', authenticateResource, async (req, res) => {
  try {
    const { 
      assignment_id, // REQUIRED
      facility,
      request_id, 
      request_type, 
      requestor_type, 
      bronx_care_processing_time,
      count, 
      remark
    } = req.body;
    
    // ═══════════════════════════════════════════════════════════
    // VALIDATE: Must have assignment_id
    // ═══════════════════════════════════════════════════════════
    if (!assignment_id) {
      return res.status(400).json({ 
        message: 'Assignment ID is required. Please select from your pending assignments.' 
      });
    }
    
    if (!request_type) {
      return res.status(400).json({ message: 'Request type is required' });
    }
    
    const resource = req.resource;
    
    // ═══════════════════════════════════════════════════════════
    // FIND AND VALIDATE ASSIGNMENT
    // ═══════════════════════════════════════════════════════════
    const assignment = await VerismaAssignment.findById(assignment_id);
    
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }
    
    // Verify ownership
    if (assignment.resource_email.toLowerCase() !== resource.email.toLowerCase()) {
      return res.status(403).json({ message: 'This assignment is not assigned to you' });
    }
    
    // Check if already logged
    if (assignment.status === 'logged') {
      return res.status(400).json({ 
        message: 'This assignment has already been logged. It should not appear in your pending list.' 
      });
    }
    
    // Check if date is locked
    if (isDateLocked(assignment.assignment_date)) {
      return res.status(403).json({ message: 'Cannot add entries for locked month.' });
    }
    
    // ═══════════════════════════════════════════════════════════
    // REQUEST ID VALIDATION
    // ═══════════════════════════════════════════════════════════
    if (request_type === 'New Request' && request_id && request_id.trim() !== '') {
      const requestCheck = await checkRequestIdExists(request_id);
      if (requestCheck.exists) {
        return res.status(400).json({ 
          message: `Request ID "${request_id}" already has a "New Request" entry. Use "${requestCheck.suggestedType}" instead.`,
          suggested_type: requestCheck.suggestedType
        });
      }
    }
    
    // ═══════════════════════════════════════════════════════════
    // CREATE ALLOCATION ENTRY
    // ═══════════════════════════════════════════════════════════
    const billingRate = await getBillingRate(assignment.subproject_id, request_type);
    const entryCount = parseInt(count) || 1;
    const srNo = await getNextSrNo(resource.email, assignment.assignment_date);
    
    // Calculate late log
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const allocDateNorm = new Date(assignment.assignment_date);
    allocDateNorm.setHours(0, 0, 0, 0);
    const isLateLog = today > allocDateNorm;
    const daysLate = isLateLog ? Math.floor((today - allocDateNorm) / (1000 * 60 * 60 * 24)) : 0;
    
    const allocation = new VerismaDailyAllocation({
      sr_no: srNo,
      allocation_date: assignment.assignment_date,
      logged_date: new Date(),
      resource_id: resource._id,
      resource_name: resource.name,
      resource_email: resource.email,
      geography_id: assignment.geography_id,
      geography_name: assignment.geography_name,
      client_id: assignment.client_id,
      client_name: 'Verisma',
      project_id: assignment.project_id,
      project_name: assignment.project_name,
      subproject_id: assignment.subproject_id,
      subproject_name: assignment.subproject_name,
      subproject_key: assignment.subproject_key,
      process: assignment.project_name || '',
      facility: facility || '',
      bronx_care_processing_time: bronx_care_processing_time || '',
      request_id: request_id || '',
      request_type,
      requestor_type: requestor_type || '',
      count: entryCount,
      remark: remark || '',
      billing_rate: billingRate,
      billing_amount: billingRate * entryCount,
      billing_rate_at_logging: billingRate,
      source: 'assignment',
      assignment_id: assignment._id,
      is_late_log: isLateLog,
      days_late: daysLate,
      is_locked: false
    });
    
    await allocation.save();
    
    // ═══════════════════════════════════════════════════════════
    // CRITICAL: MARK ASSIGNMENT AS LOGGED
    // This removes it from the pending list
    // ═══════════════════════════════════════════════════════════
    await VerismaAssignment.markAsLogged(assignment._id, allocation._id);
    
    // Activity Log
    try {
      await ActivityLog.create({
        activity_type: 'CASE_LOGGED',
        actor_type: 'resource',
        actor_id: resource._id,
        actor_email: resource.email,
        actor_name: resource.name,
        client_name: 'Verisma',
        project_name: assignment.project_name,
        subproject_name: assignment.subproject_name,
        allocation_id: allocation._id,
        allocation_date: allocation.allocation_date,
        request_type,
        details: { 
          sr_no: srNo, 
          count: entryCount, 
          assignment_id: assignment._id.toString(),
          is_late_log: isLateLog,
          days_late: daysLate
        }
      });
    } catch (logErr) {
      console.log('Activity log error (non-fatal):', logErr.message);
    }
    
    // Get updated pending count
    const pendingResult = await VerismaAssignment.getPendingAssignments(resource.email);
    
    res.status(201).json({ 
      success: true, 
      message: 'Entry logged successfully. Assignment marked as complete.',
      allocation,
      remaining_pending: pendingResult.assignments.length,
      has_previous_pending: pendingResult.has_previous_pending
    });
    
  } catch (error) {
    console.error('Create Verisma allocation error:', error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * GET: My allocations for a specific date
 */
router.get('/my-allocations', authenticateResource, async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date ? new Date(date) : new Date();
    
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);
    
    const allocations = await VerismaDailyAllocation.find({
      resource_email: req.resource.email.toLowerCase(),
      allocation_date: { $gte: startOfDay, $lte: endOfDay },
      is_deleted: { $ne: true }
    }).sort({ sr_no: -1 }).lean();
    
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

/**
 * GET: My stats/summary (for dashboard)
 */
router.get('/my-stats', authenticateResource, async (req, res) => {
  try {
    const { month, year, from_date, to_date } = req.query;
    const resourceEmail = req.resource.email.toLowerCase();
    
    // Build date filter
    let dateFilter = {};
    if (from_date) {
      dateFilter = { $gte: new Date(from_date) };
      if (to_date) {
        const end = new Date(to_date);
        end.setHours(23, 59, 59, 999);
        dateFilter.$lte = end;
      }
    } else if (month && year) {
      const m = parseInt(month);
      const y = parseInt(year);
      const startDate = new Date(y, m - 1, 1);
      const endDate = new Date(y, m, 0, 23, 59, 59, 999);
      dateFilter = { $gte: startDate, $lte: endDate };
    }
    
    const matchQuery = {
      resource_email: resourceEmail,
      is_deleted: { $ne: true }
    };
    
    if (Object.keys(dateFilter).length > 0) {
      matchQuery.allocation_date = dateFilter;
    }
    
    // Total count
    const totalAgg = await VerismaDailyAllocation.aggregate([
      { $match: matchQuery },
      { $group: { _id: null, total_entries: { $sum: 1 }, total_count: { $sum: '$count' }, total_billing: { $sum: '$billing_amount' } } }
    ]);
    
    const totals = totalAgg[0] || { total_entries: 0, total_count: 0, total_billing: 0 };
    
    // By request type
    const byRequestType = await VerismaDailyAllocation.aggregate([
      { $match: matchQuery },
      { $group: { _id: '$request_type', entries: { $sum: 1 }, count: { $sum: '$count' } } },
      { $sort: { count: -1 } }
    ]);
    
    // By process type (Processing vs Logging/Complete logging)
    const byProcessType = await VerismaDailyAllocation.aggregate([
      { $match: matchQuery },
      { $group: { _id: '$process_type', entries: { $sum: 1 }, count: { $sum: '$count' } } },
      { $sort: { count: -1 } }
    ]);
    
    // Pending delete requests
    const pendingDeletes = await VerismaDailyAllocation.countDocuments({
      resource_email: resourceEmail,
      has_pending_delete_request: true,
      is_deleted: { $ne: true }
    });
    
    // Pending assignments
    const pendingResult = await VerismaAssignment.getPendingAssignments(resourceEmail);
    
    res.json({
      success: true,
      client: 'Verisma',
      total_entries: totals.total_entries,
      total_cases: totals.total_count,
      total_billing: totals.total_billing,
      pending_delete_requests: pendingDeletes,
      pending_assignments: pendingResult.assignments.length,
      has_previous_pending: pendingResult.has_previous_pending,
      by_request_type: byRequestType,
      by_process_type: byProcessType
    });
    
  } catch (error) {
    console.error('My stats error:', error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * GET: Previous cases
 * Supports both month/year and from_date/to_date filtering
 */
router.get('/previous-cases', authenticateResource, async (req, res) => {
  try {
    const { month, year, from_date, to_date, subproject_id, request_type, request_id, page = 1, limit = 50 } = req.query;
    
    const query = {
      resource_email: req.resource.email.toLowerCase(),
      is_deleted: { $ne: true }
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
      // Use month/year filter
      const m = parseInt(month);
      const y = parseInt(year);
      const startDate = new Date(y, m - 1, 1);
      const endDate = new Date(y, m, 0, 23, 59, 59, 999);
      query.allocation_date = { $gte: startDate, $lte: endDate };
    }
    
    if (subproject_id) query.subproject_id = subproject_id;
    if (request_type) query.request_type = request_type;
    if (request_id) query.request_id = { $regex: request_id, $options: 'i' };
    
    const total = await VerismaDailyAllocation.countDocuments(query);
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const allocations = await VerismaDailyAllocation.find(query)
      .sort({ allocation_date: -1, sr_no: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();
    
    const allocationsWithLockStatus = allocations.map(a => ({
      ...a,
      is_locked: a.is_locked || isDateLocked(a.allocation_date)
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

/**
 * PUT: Edit allocation
 */
router.put('/:id', authenticateResource, async (req, res) => {
  try {
    const { id } = req.params;
    const { change_reason, change_notes, request_id, request_type, requestor_type, count, remark } = req.body;
    
    if (!change_reason || change_reason.trim() === '') {
      return res.status(400).json({ message: 'Change reason is required' });
    }
    
    const allocation = await VerismaDailyAllocation.findById(id);
    if (!allocation) return res.status(404).json({ message: 'Allocation not found' });
    
    if (allocation.resource_id.toString() !== req.resource._id.toString()) {
      return res.status(403).json({ message: 'You can only edit your own entries' });
    }
    
    if (allocation.is_locked || isDateLocked(allocation.allocation_date)) {
      return res.status(403).json({ message: 'This entry is locked' });
    }
    
    // Request ID check
    if (request_type === 'New Request' && request_id && request_id.trim() !== '') {
      const requestCheck = await checkRequestIdExists(request_id, id);
      if (requestCheck.exists) {
        return res.status(400).json({ message: `Request ID already has "New Request"` });
      }
    }
    
    const fieldsChanged = [];
    if (request_id !== undefined && request_id !== allocation.request_id) { 
      fieldsChanged.push({ field: 'request_id', old_value: allocation.request_id, new_value: request_id }); 
      allocation.request_id = request_id; 
    }
    if (request_type !== undefined && request_type !== allocation.request_type) { 
      fieldsChanged.push({ field: 'request_type', old_value: allocation.request_type, new_value: request_type }); 
      allocation.request_type = request_type; 
    }
    if (requestor_type !== undefined && requestor_type !== allocation.requestor_type) { 
      fieldsChanged.push({ field: 'requestor_type', old_value: allocation.requestor_type, new_value: requestor_type }); 
      allocation.requestor_type = requestor_type; 
    }
    if (count !== undefined && parseInt(count) !== allocation.count) { 
      fieldsChanged.push({ field: 'count', old_value: allocation.count, new_value: parseInt(count) }); 
      allocation.count = parseInt(count) || 1; 
    }
    if (remark !== undefined && remark !== allocation.remark) { 
      fieldsChanged.push({ field: 'remark', old_value: allocation.remark, new_value: remark }); 
      allocation.remark = remark; 
    }
    
    if (fieldsChanged.length === 0) {
      return res.json({ success: true, message: 'No changes', allocation });
    }
    
    // Recalculate billing
    const newRate = await getBillingRate(allocation.subproject_id, allocation.request_type);
    allocation.billing_rate = newRate;
    allocation.billing_amount = newRate * allocation.count;
    
    // Edit history
    if (!allocation.edit_history) allocation.edit_history = [];
    allocation.edit_history.push({
      edited_at: new Date(),
      edited_by_id: req.resource._id,
      edited_by_email: req.resource.email,
      edited_by_name: req.resource.name,
      editor_type: 'resource',
      change_reason,
      change_notes: change_notes || '',
      fields_changed: fieldsChanged
    });
    allocation.last_edited_at = new Date();
    allocation.edit_count = (allocation.edit_count || 0) + 1;
    
    await allocation.save();
    
    res.json({ success: true, message: 'Updated', allocation });
    
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

/**
 * POST: Request deletion
 */
router.post('/:id/request-delete', authenticateResource, async (req, res) => {
  try {
    const { id } = req.params;
    const { delete_reason } = req.body;
    
    if (!delete_reason || delete_reason.trim() === '') {
      return res.status(400).json({ message: 'Delete reason is required' });
    }
    
    const allocation = await VerismaDailyAllocation.findById(id);
    if (!allocation) return res.status(404).json({ message: 'Not found' });
    
    if (allocation.resource_id.toString() !== req.resource._id.toString()) {
      return res.status(403).json({ message: 'Not your entry' });
    }
    
    if (allocation.is_locked || isDateLocked(allocation.allocation_date)) {
      return res.status(403).json({ message: 'Locked' });
    }
    
    if (allocation.has_pending_delete_request) {
      return res.status(400).json({ message: 'Already pending' });
    }
    
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
    
    // Email notification
    try {
      const adminEmails = await getAdminEmails();
      await sendDeleteRequestNotification({
        adminEmails,
        resourceName: req.resource.name,
        resourceEmail: req.resource.email,
        clientName: 'Verisma',
        allocationId: allocation._id,
        allocationDate: allocation.allocation_date,
        subprojectName: allocation.subproject_name,
        requestId: allocation.request_id,
        requestType: allocation.request_type,
        deleteReason: delete_reason
      });
    } catch (emailErr) {
      console.log('Email error:', emailErr.message);
    }
    
    res.json({ success: true, message: 'Delete request submitted', allocation });
    
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

/**
 * GET: Check Request ID
 */
router.get('/check-request-id', authenticateResource, async (req, res) => {
  try {
    const { request_id } = req.query;
    if (!request_id || request_id.trim() === '') {
      return res.json({ exists: false, suggested_type: 'New Request' });
    }
    
    const allEntries = await VerismaDailyAllocation.find({
      request_id: request_id.trim(),
      is_deleted: { $ne: true }
    }).sort({ allocation_date: -1 }).lean();
    
    const hasNewRequest = allEntries.some(e => e.request_type === 'New Request');
    
    res.json({
      exists: allEntries.length > 0,
      has_new_request: hasNewRequest,
      suggested_type: hasNewRequest ? 'Duplicate' : 'New Request',
      existing_entries: allEntries.map(e => ({
        id: e._id,
        request_type: e.request_type,
        allocation_date: e.allocation_date,
        location: e.subproject_name
      })),
      total_entries: allEntries.length
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// ADMIN ROUTES
// ═══════════════════════════════════════════════════════════════

/**
 * GET: All assignments (admin view)
 */
router.get('/admin/assignments', authenticateUser, async (req, res) => {
  try {
    const { month, year, status, resource_email, page = 1, limit = 100 } = req.query;
    
    const query = {};
    if (month) query.month = parseInt(month);
    if (year) query.year = parseInt(year);
    if (status) query.status = status;
    if (resource_email) query.resource_email = resource_email.toLowerCase();
    
    const total = await VerismaAssignment.countDocuments(query);
    const assignments = await VerismaAssignment.find(query)
      .sort({ assignment_date: -1, resource_name: 1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .lean();
    
    res.json({ success: true, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)), assignments });
    
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * GET: All allocations (admin)
 */
router.get('/admin/all', authenticateUser, async (req, res) => {
  try {
    const { month, year, resource_email, request_type, include_deleted, page = 1, limit = 100 } = req.query;
    
    const query = {};
    if (month) query.month = parseInt(month);
    if (year) query.year = parseInt(year);
    if (resource_email) query.resource_email = resource_email.toLowerCase();
    if (request_type) query.request_type = request_type;
    if (!include_deleted) query.is_deleted = { $ne: true };
    
    const total = await VerismaDailyAllocation.countDocuments(query);
    const allocations = await VerismaDailyAllocation.find(query)
      .sort({ allocation_date: -1, sr_no: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .lean();
    
    res.json({ success: true, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)), allocations });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * GET: Pending delete requests (admin)
 */
router.get('/admin/delete-requests', authenticateUser, async (req, res) => {
  try {
    const requests = await VerismaDailyAllocation.find({ 
      has_pending_delete_request: true, 
      is_deleted: { $ne: true } 
    }).sort({ 'delete_request.requested_at': -1 }).lean();
    
    res.json({ success: true, count: requests.length, requests });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * POST: Review delete request (admin)
 */
router.post('/admin/review-delete/:id', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { action, comment, delete_type } = req.body;
    
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ message: 'Invalid action' });
    }
    
    const allocation = await VerismaDailyAllocation.findById(id);
    if (!allocation) return res.status(404).json({ message: 'Not found' });
    if (!allocation.has_pending_delete_request) return res.status(400).json({ message: 'No pending request' });
    
    allocation.delete_request.reviewed_at = new Date();
    allocation.delete_request.reviewed_by_id = req.user._id;
    allocation.delete_request.reviewed_by_email = req.user.email;
    allocation.delete_request.review_comment = comment || '';
    
    if (action === 'approve') {
      allocation.delete_request.status = 'approved';
      if (delete_type === 'hard') {
        await allocation.deleteOne();
        return res.json({ success: true, message: 'Permanently deleted' });
      } else {
        allocation.is_deleted = true;
        allocation.deleted_at = new Date();
        allocation.deleted_by = req.user.email;
      }
    } else {
      allocation.delete_request.status = 'rejected';
    }
    
    allocation.has_pending_delete_request = false;
    await allocation.save();
    
    res.json({ success: true, message: `Delete ${action}ed`, allocation });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;