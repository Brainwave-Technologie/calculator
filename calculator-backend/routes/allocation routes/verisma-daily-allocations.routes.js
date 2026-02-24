// routes/verisma-daily-allocations.routes.js
// FIXED: 
// 1. Fixed future date validation using proper PST comparison
// 2. REMOVED duplicate entry check - allows multiple entries per location per day
// 3. Request ID can only have ONE "New Request" entry (same logic)
const express = require('express');
const router = express.Router();

const VerismaDailyAllocation = require('../../models/Allocations/Verismadailyallocation');
const VerismaAssignment = require('../../models/DailyAssignments/VerismaAssignment');
const Resource = require('../../models/Resource');
const Client = require('../../models/Client');
const Project = require('../../models/Project');
const Subproject = require('../../models/Subproject');
const SubprojectRequestType = require('../../models/SubprojectRequestType');
const ActivityLog = require('../../models/ActivityLog');
const { sendDeleteRequestNotification, getAdminEmails } = require('../../services/emailNotifier');

const { authenticateResource, authenticateUser } = require('../../middleware/auth');

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Get current date in PST as a normalized date string (YYYY-MM-DD)
 */
const getPSTDateString = () => {
  const now = new Date();
  const pstString = now.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  return pstString; // Returns "2026-02-20" format
};

/**
 * Get current datetime in PST
 */
const getPSTNow = () => {
  const now = new Date();
  const pstString = now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
  return new Date(pstString);
};

/**
 * Normalize a date to YYYY-MM-DD string for comparison
 */
const normalizeDateString = (date) => {
  if (!date) return null;
  const d = new Date(date);
  return d.toISOString().split('T')[0]; // Returns "2026-02-20" format
};

/**
 * Check if date is in the future (PST comparison)
 */
const isFutureDate = (dateStr) => {
  const todayPST = getPSTDateString(); // "2026-02-20"
  const targetDate = normalizeDateString(dateStr); // "2026-02-20"
  return targetDate > todayPST;
};

/**
 * Check if date is locked (past month-end in PST)
 */
const isDateLocked = (date) => {
  const pstNow = getPSTNow();
  const allocDate = new Date(date);
  
  // Get last day of the allocation month
  const lastDayOfMonth = new Date(allocDate.getFullYear(), allocDate.getMonth() + 1, 0);
  lastDayOfMonth.setHours(23, 59, 59, 999);
  
  // Convert to PST for comparison
  const lockDatePST = new Date(lastDayOfMonth.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  
  return pstNow > lockDatePST;
};

const getNextSrNo = async (resourceEmail, date) => {
  const dateStr = normalizeDateString(date);
  const startOfDay = new Date(dateStr + 'T00:00:00.000Z');
  const endOfDay = new Date(dateStr + 'T23:59:59.999Z');
  
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
 * POST: Create new allocation entry
 * ALLOWS multiple entries per location per day (different Request IDs)
 */
router.post('/', authenticateResource, async (req, res) => {
  try {
    const { 
      subproject_id,
      allocation_date,
      facility,
      request_id, 
      request_type, 
      requestor_type, 
      bronx_care_processing_time,
      count, 
      remark,
      geography_id,
      geography_name
    } = req.body;
    
    // Validate required fields
    if (!subproject_id) {
      return res.status(400).json({ message: 'Location (subproject_id) is required' });
    }
    
    if (!request_id || request_id.trim() === '') {
      return res.status(400).json({ message: 'Request ID is required' });
    }
    
    if (!request_type) {
      return res.status(400).json({ message: 'Request type is required' });
    }
    
    if (!requestor_type) {
      return res.status(400).json({ message: 'Requestor type is required' });
    }
    
    const resource = req.resource;
    
    // Normalize allocation date to YYYY-MM-DD
    const targetDateStr = allocation_date ? normalizeDateString(allocation_date) : getPSTDateString();
    const targetDate = new Date(targetDateStr + 'T00:00:00.000Z');
    
    // Check if date is in the future (using string comparison to avoid timezone issues)
    if (isFutureDate(targetDateStr)) {
      return res.status(400).json({ message: 'Cannot add entries for future dates.' });
    }
    
    // Check if date is locked (past month-end)
    if (isDateLocked(targetDate)) {
      return res.status(403).json({ message: 'Cannot add entries for locked month.' });
    }
    
    // Get subproject details
    const subproject = await Subproject.findById(subproject_id);
    if (!subproject) {
      return res.status(404).json({ message: 'Location not found' });
    }
    
    // Get project details
    const project = await Project.findById(subproject.project_id);
    
    // Verify resource has access to this location
    const resourceData = await Resource.findById(resource._id).lean();
    let hasAccess = false;
    let assignmentInfo = null;
    
    for (const assignment of resourceData.assignments || []) {
      if (assignment.client_name?.toLowerCase() !== 'verisma') continue;
      
      for (const sp of assignment.subprojects || []) {
        if (sp.subproject_id?.toString() === subproject_id.toString()) {
          hasAccess = true;
          assignmentInfo = {
            geography_id: assignment.geography_id,
            geography_name: assignment.geography_name,
            client_id: assignment.client_id,
            client_name: assignment.client_name,
            project_id: assignment.project_id,
            project_name: assignment.project_name
          };
          break;
        }
      }
      if (hasAccess) break;
    }
    
    if (!hasAccess) {
      return res.status(403).json({ message: 'You do not have access to this location' });
    }
    
    // ═══════════════════════════════════════════════════════════════
    // REMOVED: The duplicate entry check that was blocking multiple entries
    // per location per day. Now resources CAN log multiple entries for the
    // same location on the same day (with different Request IDs).
    // ═══════════════════════════════════════════════════════════════
    
    // Request ID "New Request" validation (only ONE "New Request" per Request ID)
    if (request_type === 'New Request' && request_id && request_id.trim() !== '') {
      const requestCheck = await checkRequestIdExists(request_id);
      if (requestCheck.exists) {
        return res.status(400).json({ 
          message: `Request ID "${request_id}" already has a "New Request" entry. Use "${requestCheck.suggestedType}" instead.`,
          suggested_type: requestCheck.suggestedType
        });
      }
    }
    
    // Get billing rate
    const billingRate = await getBillingRate(subproject_id, request_type);
    const entryCount = parseInt(count) || 1;
    const srNo = await getNextSrNo(resource.email, targetDate);
    
    // Calculate late log: did resource submit to system after the allocation_date?
    const todayStr = getPSTDateString();
    const isLateLog = targetDateStr < todayStr;  // system_captured_date (today) is after allocation_date
    const daysLate = isLateLog ? Math.floor((new Date(todayStr) - new Date(targetDateStr)) / (1000 * 60 * 60 * 24)) : 0;
    
    // Create allocation
    const allocation = new VerismaDailyAllocation({
      sr_no: srNo,
      allocation_date: targetDate,
      logged_date: targetDate,                      // same as allocation_date (the work date resource selected)
      system_captured_date: new Date(),             // actual server time when resource hit submit
      resource_id: resource._id,
      resource_name: resource.name,
      resource_email: resource.email.toLowerCase(),
      geography_id: geography_id || assignmentInfo?.geography_id,
      geography_name: geography_name || assignmentInfo?.geography_name || 'Unknown',
      client_id: assignmentInfo?.client_id,
      client_name: 'Verisma',
      project_id: assignmentInfo?.project_id || subproject.project_id,
      project_name: assignmentInfo?.project_name || project?.name || 'Unknown',
      subproject_id: subproject._id,
      subproject_name: subproject.name,
      subproject_key: `verisma|${project?.name || 'unknown'}|${subproject.name}`.toLowerCase(),
      process: project?.name || '',
      facility: facility || '',
      bronx_care_processing_time: bronx_care_processing_time || '',
      request_id: request_id.trim(),
      request_type,
      requestor_type: requestor_type || '',
      count: entryCount,
      remark: remark || '',
      billing_rate: billingRate,
      billing_amount: billingRate * entryCount,
      billing_rate_at_logging: billingRate,
      payout_rate: subproject.flatrate || 0,
      source: 'direct_entry',
      is_late_log: isLateLog,
      days_late: daysLate,
      is_locked: false
    });
    
    await allocation.save();
    
    // Activity Log
    try {
      await ActivityLog.create({
        activity_type: 'CASE_LOGGED',
        actor_type: 'resource',
        actor_id: resource._id,
        actor_email: resource.email,
        actor_name: resource.name,
        client_name: 'Verisma',
        project_name: allocation.project_name,
        subproject_name: allocation.subproject_name,
        allocation_id: allocation._id,
        allocation_date: allocation.allocation_date,
        request_type,
        details: { 
          sr_no: srNo, 
          count: entryCount,
          is_late_log: isLateLog,
          days_late: daysLate,
          request_id: request_id.trim()
        }
      });
    } catch (logErr) {
      console.log('Activity log error (non-fatal):', logErr.message);
    }
    
    res.status(201).json({ 
      success: true, 
      message: 'Entry logged successfully.',
      allocation
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
    const targetDateStr = date ? normalizeDateString(date) : getPSTDateString();
    
    const startOfDay = new Date(targetDateStr + 'T00:00:00.000Z');
    const endOfDay = new Date(targetDateStr + 'T23:59:59.999Z');
    
    const allocations = await VerismaDailyAllocation.find({
      resource_email: req.resource.email.toLowerCase(),
      allocation_date: { $gte: startOfDay, $lte: endOfDay },
      is_deleted: { $ne: true }
    }).sort({ sr_no: -1 }).lean();
    
    res.json({ 
      success: true, 
      date: targetDateStr, 
      count: allocations.length, 
      allocations 
    });
    
  } catch (error) {
    res.status(500).json({ message: error.message });
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

/**
 * GET: My stats/summary
 */
router.get('/my-stats', authenticateResource, async (req, res) => {
  try {
    const { month, year, from_date, to_date } = req.query;
    const resourceEmail = req.resource.email.toLowerCase();
    
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
    
    const totalAgg = await VerismaDailyAllocation.aggregate([
      { $match: matchQuery },
      { $group: { _id: null, total_entries: { $sum: 1 }, total_count: { $sum: '$count' }, total_billing: { $sum: '$billing_amount' } } }
    ]);
    
    const totals = totalAgg[0] || { total_entries: 0, total_count: 0, total_billing: 0 };
    
    const byRequestType = await VerismaDailyAllocation.aggregate([
      { $match: matchQuery },
      { $group: { _id: '$request_type', entries: { $sum: 1 }, count: { $sum: '$count' } } },
      { $sort: { count: -1 } }
    ]);
    
    const pendingDeletes = await VerismaDailyAllocation.countDocuments({
      resource_email: resourceEmail,
      has_pending_delete_request: true,
      is_deleted: { $ne: true }
    });
    
    res.json({
      success: true,
      client: 'Verisma',
      total_entries: totals.total_entries,
      total_cases: totals.total_count,
      total_billing: totals.total_billing,
      pending_delete_requests: pendingDeletes,
      by_request_type: byRequestType
    });
    
  } catch (error) {
    console.error('My stats error:', error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * GET: Previous cases
 */
router.get('/previous-cases', authenticateResource, async (req, res) => {
  try {
    const { month, year, from_date, to_date, subproject_id, request_type, request_id, page = 1, limit = 50 } = req.query;
    
    const query = {
      resource_email: req.resource.email.toLowerCase(),
      is_deleted: { $ne: true }
    };
    
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
    const { change_reason, change_notes, facility, request_id, request_type, requestor_type, count, remark } = req.body;
    
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
    
    if (request_type === 'New Request' && request_id && request_id.trim() !== '') {
      const requestCheck = await checkRequestIdExists(request_id, id);
      if (requestCheck.exists) {
        return res.status(400).json({ message: `Request ID already has "New Request"` });
      }
    }
    
    const fieldsChanged = [];
    
    if (facility !== undefined && facility !== allocation.facility) { 
      fieldsChanged.push({ field: 'facility', old_value: allocation.facility, new_value: facility }); 
      allocation.facility = facility; 
    }
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
    
    const newRate = await getBillingRate(allocation.subproject_id, allocation.request_type);
    allocation.billing_rate = newRate;
    allocation.billing_amount = newRate * allocation.count;
    
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

// ═══════════════════════════════════════════════════════════════
// ADMIN ROUTES
// ═══════════════════════════════════════════════════════════════

/**
 * GET: All allocations (admin)
 */
router.get('/admin/all', authenticateUser, async (req, res) => {
  try {
    const { 
      month, year, start_date, end_date, 
      resource_email, request_type, subproject_id,
      include_deleted, page = 1, limit = 100 
    } = req.query;
    
    const query = {};
    
    if (start_date || end_date) {
      query.allocation_date = {};
      if (start_date) {
        const start = new Date(start_date);
        start.setHours(0, 0, 0, 0);
        query.allocation_date.$gte = start;
      }
      if (end_date) {
        const end = new Date(end_date);
        end.setHours(23, 59, 59, 999);
        query.allocation_date.$lte = end;
      }
    } else if (month && year) {
      const m = parseInt(month);
      const y = parseInt(year);
      const startDate = new Date(y, m - 1, 1);
      const endDate = new Date(y, m, 0, 23, 59, 59, 999);
      query.allocation_date = { $gte: startDate, $lte: endDate };
    }
    
    if (resource_email) query.resource_email = resource_email.toLowerCase();
    if (request_type) query.request_type = request_type;
    if (subproject_id) query.subproject_id = subproject_id;
    if (!include_deleted || include_deleted !== 'true') query.is_deleted = { $ne: true };
    
    const total = await VerismaDailyAllocation.countDocuments(query);
    const allocations = await VerismaDailyAllocation.find(query)
      .sort({ allocation_date: -1, sr_no: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .lean();
    
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