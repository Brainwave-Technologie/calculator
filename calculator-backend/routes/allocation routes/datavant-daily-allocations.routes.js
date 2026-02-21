// routes/datavant-daily-allocations.routes.js - Complete Datavant allocation routes
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const DatavantDailyAllocation = require('../../models/Allocations/DatavantDailyAllocation');
const DatavantAssignment = require('../../models/DailyAssignments/DatavantAssignment');
const SubprojectRequestType = require('../../models/SubprojectRequestType');
const Subproject = require('../../models/Subproject');
const ActivityLog = require('../../models/ActivityLog');

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
  
  const lastEntry = await DatavantDailyAllocation.findOne({
    resource_email: resourceEmail.toLowerCase().trim(),
    allocation_date: { $gte: startOfDay, $lte: endOfDay },
    is_deleted: { $ne: true }
  }).sort({ sr_no: -1 });
  
  return lastEntry ? lastEntry.sr_no + 1 : 1;
};

const getBillingRate = async (subprojectId, requestType) => {
  try {
    // Use 'Default' rate when no request_type provided (simplified Datavant model)
    const effectiveType = requestType || 'Default';
    const rateRecord = await SubprojectRequestType.findOne({ subproject_id: subprojectId, name: effectiveType });
    return rateRecord?.rate || 0;
  } catch (err) {
    return 0;
  }
};

const checkRequestIdExists = async (requestId, excludeId = null) => {
  if (!requestId || requestId.trim() === '') return { exists: false };
  
  const query = { request_id: requestId.trim(), request_type: 'New Request', is_deleted: { $ne: true } };
  if (excludeId) query._id = { $ne: excludeId };
  
  const existing = await DatavantDailyAllocation.findOne(query);
  return { exists: !!existing, existingEntry: existing, suggestedType: existing ? 'Follow up' : 'New Request' };
};

// ═══════════════════════════════════════════════════════════════
// RESOURCE ROUTES
// ═══════════════════════════════════════════════════════════════

router.post('/', authenticateResource, async (req, res) => {
  try {
    const { subproject_id, allocation_date, request_id, request_type, task_type, count, remark, geography_id, geography_name, assignment_id } = req.body;
    
    if (!subproject_id || !allocation_date) {
      return res.status(400).json({ message: 'Location and allocation date are required' });
    }
    
    if (isDateLocked(allocation_date)) {
      return res.status(403).json({ message: 'Cannot add entries for locked month. Month has ended.' });
    }
    
    const resource = req.resource;
    let hasAccess = false;
    let locationInfo = null;

    for (const assignment of resource.assignments || []) {
      if (assignment.client_name?.toLowerCase() !== 'datavant') continue;
      for (const sp of assignment.subprojects || []) {
        if (sp.subproject_id.toString() === subproject_id) {
          hasAccess = true;
          locationInfo = {
            geography_id: geography_id || assignment.geography_id,
            geography_name: geography_name || assignment.geography_name,
            client_id: assignment.client_id,
            client_name: 'Datavant',
            project_id: assignment.project_id,
            project_name: assignment.project_name,
            subproject_id: sp.subproject_id,
            subproject_name: sp.subproject_name,
            subproject_key: sp.subproject_key
          };
          break;
        }
      }
      if (hasAccess) break;
    }

    if (!hasAccess) {
      return res.status(403).json({ message: 'You do not have access to this Datavant location' });
    }
    
    if (request_type === 'New Request' && request_id && request_id.trim() !== '') {
      const requestCheck = await checkRequestIdExists(request_id);
      if (requestCheck.exists) {
        return res.status(400).json({ message: `Request ID "${request_id}" already exists. Use "${requestCheck.suggestedType}" instead.`, suggested_type: requestCheck.suggestedType });
      }
    }
    
    const billingRate = await getBillingRate(subproject_id, request_type || 'default');
    const entryCount = parseInt(count) || 1;
    const srNo = await getNextSrNo(resource.email, allocation_date);
    
    const allocation = new DatavantDailyAllocation({
      sr_no: srNo,
      allocation_date: new Date(allocation_date),
      logged_date: new Date(allocation_date),       // same as allocation_date (the work date resource selected)
      system_captured_date: new Date(),             // actual server time when resource hit submit
      resource_id: resource._id,
      resource_name: resource.name,
      resource_email: resource.email,
      geography_id: locationInfo.geography_id,
      geography_name: locationInfo.geography_name,
      client_id: locationInfo.client_id,
      client_name: 'Datavant',
      project_id: locationInfo.project_id,
      project_name: locationInfo.project_name,
      subproject_id: locationInfo.subproject_id,
      subproject_name: locationInfo.subproject_name,
      subproject_key: locationInfo.subproject_key,
      request_id: request_id || '',
      request_type: request_type || '',
      task_type: task_type || '',
      count: entryCount,
      remark: remark || '',
      billing_rate: billingRate,
      billing_amount: billingRate * entryCount,
      billing_rate_at_logging: billingRate,
      source: assignment_id ? 'assignment' : 'direct_entry',
      assignment_id,
      is_locked: false
    });
    
    await allocation.save();
    
    if (assignment_id) {
      try { await DatavantAssignment.markAsLogged(assignment_id, allocation._id); } catch (err) {}
    }
    
    try {
      await ActivityLog.create({
        activity_type: 'CASE_LOGGED',
        actor_type: 'resource',
        actor_id: resource._id,
        actor_email: resource.email,
        actor_name: resource.name,
        resource_id: resource._id,
        resource_email: resource.email,
        resource_name: resource.name,
        client_name: 'Datavant',
        project_name: locationInfo.project_name,
        subproject_name: locationInfo.subproject_name,
        subproject_key: locationInfo.subproject_key,
        allocation_id: allocation._id,
        allocation_date: allocation.allocation_date,
        request_type: request_type || '',
        details: { sr_no: srNo, count: entryCount, request_id: request_id || '', task_type: task_type || '' }
      });
    } catch (logErr) {}
    
    res.status(201).json({ success: true, message: 'Entry created successfully', allocation });
    
  } catch (error) {
    console.error('Create Datavant allocation error:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/my-allocations', authenticateResource, async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date ? new Date(date) : new Date();
    
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);
    
    const allocations = await DatavantDailyAllocation.find({
      resource_email: req.resource.email.toLowerCase(),
      allocation_date: { $gte: startOfDay, $lte: endOfDay },
      is_deleted: { $ne: true }
    }).sort({ sr_no: -1 }).lean();
    
    const allocationsWithLockStatus = allocations.map(a => ({ ...a, is_locked: a.is_locked || isDateLocked(a.allocation_date) }));
    
    res.json({ success: true, date: targetDate.toISOString().split('T')[0], count: allocations.length, allocations: allocationsWithLockStatus });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/pending-assignments', authenticateResource, async (req, res) => {
  try {
    const assignments = await DatavantAssignment.getPendingAssignments(req.resource.email);
    res.json({ success: true, count: assignments.length, assignments });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/previous-cases', authenticateResource, async (req, res) => {
  try {
    const { month, year, subproject_id, subproject_key, request_type, request_id, page = 1, limit = 50 } = req.query;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const query = {
      resource_email: req.resource.email.toLowerCase(),
      is_deleted: { $ne: true },
      logged_date: { $lt: today }
    };
    
    if (month && year) { query.month = parseInt(month); query.year = parseInt(year); }
    if (subproject_id) query.subproject_id = subproject_id;
    if (subproject_key) query.subproject_key = subproject_key;
    if (request_type) query.request_type = request_type;
    if (request_id) query.request_id = { $regex: request_id, $options: 'i' };
    
    const total = await DatavantDailyAllocation.countDocuments(query);
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const allocations = await DatavantDailyAllocation.find(query).sort({ allocation_date: -1, sr_no: -1 }).skip(skip).limit(parseInt(limit)).lean();
    const allocationsWithLockStatus = allocations.map(a => ({ ...a, is_locked: a.is_locked || isDateLocked(a.allocation_date) }));
    
    res.json({ success: true, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)), allocations: allocationsWithLockStatus });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/:id', authenticateResource, async (req, res) => {
  try {
    const { id } = req.params;
    const { change_reason, change_notes, request_id, request_type, task_type, count, remark } = req.body;
    
    if (!change_reason || change_reason.trim() === '') {
      return res.status(400).json({ message: 'Change reason is required for editing' });
    }
    
    const allocation = await DatavantDailyAllocation.findById(id);
    if (!allocation) return res.status(404).json({ message: 'Allocation not found' });
    if (allocation.resource_id.toString() !== req.resource._id.toString()) {
      return res.status(403).json({ message: 'You can only edit your own entries' });
    }
    if (allocation.is_locked || isDateLocked(allocation.allocation_date)) {
      return res.status(403).json({ message: 'This entry is locked and cannot be modified' });
    }
    
    if (request_type === 'New Request' && request_id && request_id.trim() !== '') {
      const requestCheck = await checkRequestIdExists(request_id, id);
      if (requestCheck.exists) {
        return res.status(400).json({ message: `Request ID "${request_id}" already exists.`, suggested_type: requestCheck.suggestedType });
      }
    }
    
    const fieldsChanged = [];
    if (request_id !== undefined && request_id !== allocation.request_id) { fieldsChanged.push({ field: 'request_id', old_value: allocation.request_id, new_value: request_id }); allocation.request_id = request_id; }
    if (request_type !== undefined && request_type !== allocation.request_type) { fieldsChanged.push({ field: 'request_type', old_value: allocation.request_type, new_value: request_type }); allocation.request_type = request_type; }
    if (task_type !== undefined && task_type !== allocation.task_type) { fieldsChanged.push({ field: 'task_type', old_value: allocation.task_type, new_value: task_type }); allocation.task_type = task_type; }
    if (count !== undefined && parseInt(count) !== allocation.count) { fieldsChanged.push({ field: 'count', old_value: allocation.count, new_value: parseInt(count) }); allocation.count = parseInt(count) || 1; }
    if (remark !== undefined && remark !== allocation.remark) { fieldsChanged.push({ field: 'remark', old_value: allocation.remark, new_value: remark }); allocation.remark = remark; }
    
    if (fieldsChanged.length === 0) {
      return res.json({ success: true, message: 'No changes detected', allocation });
    }
    
    const newRate = await getBillingRate(allocation.subproject_id, allocation.request_type || 'default');
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
    
    try {
      await ActivityLog.create({
        activity_type: 'CASE_UPDATED',
        actor_type: 'resource',
        actor_id: req.resource._id,
        actor_email: req.resource.email,
        actor_name: req.resource.name,
        resource_id: req.resource._id,
        resource_email: req.resource.email,
        resource_name: req.resource.name,
        client_name: 'Datavant',
        project_name: allocation.project_name,
        subproject_name: allocation.subproject_name,
        subproject_key: allocation.subproject_key,
        allocation_id: allocation._id,
        allocation_date: allocation.allocation_date,
        details: { change_reason, change_notes, fields_changed: fieldsChanged.map(f => f.field), edit_count: allocation.edit_count }
      });
    } catch (logErr) {}
    
    res.json({ success: true, message: 'Entry updated successfully', allocation });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post('/:id/request-delete', authenticateResource, async (req, res) => {
  try {
    const { id } = req.params;
    const { delete_reason } = req.body;
    
    if (!delete_reason || delete_reason.trim() === '') {
      return res.status(400).json({ message: 'Delete reason is required' });
    }
    
    const allocation = await DatavantDailyAllocation.findById(id);
    if (!allocation) return res.status(404).json({ message: 'Allocation not found' });
    if (allocation.resource_id.toString() !== req.resource._id.toString()) {
      return res.status(403).json({ message: 'You can only delete your own entries' });
    }
    if (allocation.is_locked || isDateLocked(allocation.allocation_date)) {
      return res.status(403).json({ message: 'This entry is locked and cannot be deleted' });
    }
    if (allocation.has_pending_delete_request) {
      return res.status(400).json({ message: 'Delete request already pending' });
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
      await ActivityLog.create({
        activity_type: 'CASE_DELETED',
        actor_type: 'resource',
        actor_id: req.resource._id,
        actor_email: req.resource.email,
        actor_name: req.resource.name,
        resource_id: req.resource._id,
        resource_email: req.resource.email,
        resource_name: req.resource.name,
        client_name: 'Datavant',
        allocation_id: allocation._id,
        allocation_date: allocation.allocation_date,
        details: { action: 'delete_requested', delete_reason }
      });
    } catch (logErr) {}
    
    res.json({ success: true, message: 'Delete request submitted for admin approval', allocation });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.get('/check-request-id', authenticateResource, async (req, res) => {
  try {
    const { request_id } = req.query;
    if (!request_id) return res.json({ exists: false, suggested_type: 'New Request' });
    
    const result = await checkRequestIdExists(request_id);
    res.json({
      exists: result.exists,
      suggested_type: result.suggestedType,
      existing_entry: result.existingEntry ? { id: result.existingEntry._id, allocation_date: result.existingEntry.allocation_date, location: result.existingEntry.subproject_name } : null
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// ADMIN ROUTES
// ═══════════════════════════════════════════════════════════════

router.get('/admin/all', authenticateUser, async (req, res) => {
  try {
    const { month, year, resource_email, subproject_key, request_type, include_deleted, page = 1, limit = 100 } = req.query;
    
    const query = {};
    if (month) query.month = parseInt(month);
    if (year) query.year = parseInt(year);
    if (resource_email) query.resource_email = resource_email.toLowerCase();
    if (subproject_key) query.subproject_key = subproject_key;
    if (request_type) query.request_type = request_type;
    if (!include_deleted) query.is_deleted = { $ne: true };
    
    const total = await DatavantDailyAllocation.countDocuments(query);
    const allocations = await DatavantDailyAllocation.find(query).sort({ allocation_date: -1, sr_no: -1 }).skip((parseInt(page) - 1) * parseInt(limit)).limit(parseInt(limit)).lean();
    const allocationsWithLockStatus = allocations.map(a => ({ ...a, is_locked: a.is_locked || isDateLocked(a.allocation_date) }));
    
    res.json({ success: true, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)), allocations: allocationsWithLockStatus });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/admin/delete-requests', authenticateUser, async (req, res) => {
  try {
    const requests = await DatavantDailyAllocation.find({ has_pending_delete_request: true, is_deleted: { $ne: true } }).sort({ 'delete_request.requested_at': -1 }).lean();
    res.json({ success: true, count: requests.length, requests });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/admin/review-delete/:id', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { action, comment, delete_type } = req.body;
    
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ message: 'Action must be "approve" or "reject"' });
    }
    
    const allocation = await DatavantDailyAllocation.findById(id);
    if (!allocation) return res.status(404).json({ message: 'Allocation not found' });
    if (!allocation.has_pending_delete_request) return res.status(400).json({ message: 'No pending delete request' });
    
    allocation.delete_request.reviewed_at = new Date();
    allocation.delete_request.reviewed_by_id = req.user._id;
    allocation.delete_request.reviewed_by_email = req.user.email;
    allocation.delete_request.review_comment = comment || '';
    
    if (action === 'approve') {
      allocation.delete_request.status = 'approved';
      allocation.delete_request.delete_type = delete_type || 'soft';
      
      if (delete_type === 'hard') {
        await allocation.deleteOne();
        await ActivityLog.create({ activity_type: 'CASE_DELETED', actor_type: 'admin', actor_email: req.user.email, client_name: 'Datavant', allocation_id: id, details: { action: 'delete_approved', delete_type: 'hard', comment } });
        return res.json({ success: true, message: 'Entry permanently deleted' });
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
    
    await ActivityLog.create({ activity_type: 'CASE_DELETED', actor_type: 'admin', actor_email: req.user.email, client_name: 'Datavant', allocation_id: allocation._id, details: { action: `delete_${action}ed`, delete_type: action === 'approve' ? (delete_type || 'soft') : null, comment } });
    
    res.json({ success: true, message: `Delete request ${action}ed`, allocation });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.put('/admin/:id', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { change_reason, change_notes, ...updates } = req.body;
    
    if (!change_reason || change_reason.trim() === '') {
      return res.status(400).json({ message: 'Change reason is required' });
    }
    
    const allocation = await DatavantDailyAllocation.findById(id);
    if (!allocation) return res.status(404).json({ message: 'Allocation not found' });
    
    const fieldsChanged = [];
    for (const [field, newValue] of Object.entries(updates)) {
      if (allocation[field] !== newValue) {
        fieldsChanged.push({ field, old_value: allocation[field], new_value: newValue });
        allocation[field] = newValue;
      }
    }
    
    if (fieldsChanged.length === 0) return res.json({ success: true, message: 'No changes', allocation });
    
    if (!allocation.edit_history) allocation.edit_history = [];
    allocation.edit_history.push({ edited_at: new Date(), edited_by_id: req.user._id, edited_by_email: req.user.email, edited_by_name: req.user.name || 'Admin', editor_type: 'admin', change_reason, change_notes: change_notes || '', fields_changed: fieldsChanged });
    allocation.last_edited_at = new Date();
    allocation.edit_count = (allocation.edit_count || 0) + 1;
    
    await allocation.save();
    await ActivityLog.create({ activity_type: 'CASE_UPDATED', actor_type: 'admin', actor_email: req.user.email, client_name: 'Datavant', allocation_id: allocation._id, details: { change_reason, fields_changed: fieldsChanged.map(f => f.field) } });
    
    res.json({ success: true, message: 'Entry updated by admin', allocation });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.get('/admin/late-logs', authenticateUser, async (req, res) => {
  try {
    const { month, year, resource_email } = req.query;
    const query = { is_late_log: true, is_deleted: { $ne: true } };
    if (month) query.month = parseInt(month);
    if (year) query.year = parseInt(year);
    if (resource_email) query.resource_email = resource_email.toLowerCase();
    
    const lateLogs = await DatavantDailyAllocation.find(query).sort({ logged_date: -1 }).lean();
    res.json({ success: true, count: lateLogs.length, data: lateLogs });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/admin/:id/history', authenticateUser, async (req, res) => {
  try {
    const allocation = await DatavantDailyAllocation.findById(req.params.id).select('edit_history edit_count last_edited_at resource_name subproject_name');
    if (!allocation) return res.status(404).json({ message: 'Allocation not found' });
    
    res.json({ success: true, allocation_info: { resource_name: allocation.resource_name, location: allocation.subproject_name }, edit_count: allocation.edit_count, last_edited_at: allocation.last_edited_at, history: (allocation.edit_history || []).sort((a, b) => b.edited_at - a.edited_at) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/admin/billing-summary', authenticateUser, async (req, res) => {
  try {
    const { month, year } = req.query;
    const targetMonth = month ? parseInt(month) : new Date().getMonth() + 1;
    const targetYear = year ? parseInt(year) : new Date().getFullYear();

    const summary = await DatavantDailyAllocation.aggregate([
      { $match: { month: targetMonth, year: targetYear, is_deleted: { $ne: true } } },
      { $group: { _id: '$subproject_key', subproject_name: { $first: '$subproject_name' }, project_name: { $first: '$project_name' }, total_count: { $sum: '$count' }, total_entries: { $sum: 1 }, total_billing: { $sum: '$billing_amount' }, resources: { $addToSet: '$resource_email' } } },
      { $sort: { subproject_name: 1 } }
    ]);

    res.json({ success: true, month: targetMonth, year: targetYear, data: summary });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// DATAVANT DASHBOARD - Process Type × Resource Matrix
// ═══════════════════════════════════════════════════════════════

router.get('/admin/dashboard', authenticateUser, async (req, res) => {
  try {
    const { month, year } = req.query;
    const targetMonth = month ? parseInt(month) : new Date().getMonth() + 1;
    const targetYear = year ? parseInt(year) : new Date().getFullYear();

    // Aggregate: group by process_type × resource
    const allocData = await DatavantDailyAllocation.aggregate([
      { $match: { month: targetMonth, year: targetYear, is_deleted: { $ne: true } } },
      {
        $group: {
          _id: { project_name: '$project_name', resource_email: '$resource_email' },
          resource_name: { $first: '$resource_name' },
          resource_email: { $first: '$resource_email' },
          project_name: { $first: '$project_name' },
          cases: { $sum: '$count' },
          billing_amount: { $sum: '$billing_amount' },
          subproject_id: { $first: '$subproject_id' }
        }
      },
      { $sort: { 'resource_name': 1, 'project_name': 1 } }
    ]);

    // Get flatrates (resource payout rate) for each unique subproject
    const subprojectIds = [...new Set(
      allocData.map(r => r.subproject_id?.toString()).filter(Boolean)
    )];
    const subprojects = await Subproject.find({ _id: { $in: subprojectIds } })
      .select('_id flatrate').lean();
    const flatrateMap = {};
    subprojects.forEach(s => { flatrateMap[s._id.toString()] = s.flatrate || 0; });

    // Build result with payout computed
    const data = allocData.map(r => ({
      resource_name: r.resource_name,
      resource_email: r.resource_email,
      process_type: r.project_name,
      cases: r.cases,
      billing_amount: r.billing_amount,
      flatrate: flatrateMap[r.subproject_id?.toString()] || 0,
      payout: (flatrateMap[r.subproject_id?.toString()] || 0) * r.cases
    }));

    // Compute overall summary
    const summary = {
      total_cases: data.reduce((s, r) => s + r.cases, 0),
      total_billing: data.reduce((s, r) => s + r.billing_amount, 0),
      total_payout: data.reduce((s, r) => s + r.payout, 0),
      resource_count: new Set(data.map(r => r.resource_email)).size,
      process_types: [...new Set(data.map(r => r.process_type))]
    };

    res.json({ success: true, month: targetMonth, year: targetYear, data, summary });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;