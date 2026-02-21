// models/DatavantDailyAllocation.js - Complete Datavant Daily Allocation with Edit/Delete workflow
const mongoose = require('mongoose');

// Edit history subdocument
const EditHistorySchema = new mongoose.Schema({
  edited_at: { type: Date, default: Date.now },
  edited_by_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource' },
  edited_by_email: { type: String },
  edited_by_name: { type: String },
  editor_type: { type: String, enum: ['resource', 'admin'], default: 'resource' },
  change_reason: { type: String, required: true },
  change_notes: { type: String },
  fields_changed: [{
    field: String,
    old_value: mongoose.Schema.Types.Mixed,
    new_value: mongoose.Schema.Types.Mixed
  }]
}, { _id: true });

// Delete request subdocument
const DeleteRequestSchema = new mongoose.Schema({
  requested_at: { type: Date, default: Date.now },
  requested_by_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource' },
  requested_by_email: { type: String },
  requested_by_name: { type: String },
  delete_reason: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  reviewed_at: { type: Date },
  reviewed_by_id: { type: mongoose.Schema.Types.ObjectId },
  reviewed_by_email: { type: String },
  review_comment: { type: String },
  delete_type: { type: String, enum: ['soft', 'hard'] }
}, { _id: true });

const DatavantDailyAllocationSchema = new mongoose.Schema({
  // ============ SERIAL NUMBER ============
  sr_no: { type: Number },
  
  // ============ DATE FIELDS ============
  allocation_date: { type: Date, required: true, index: true },
  logged_date: { type: Date, index: true },
  // System Captured Date = exact timestamp when the system captured the entry
  system_captured_date: { type: Date, index: true },
  day: { type: Number, min: 1, max: 31 },
  month: { type: Number, min: 1, max: 12, index: true },
  year: { type: Number, index: true },
  
  // ============ RESOURCE INFO ============
  resource_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource', index: true },
  resource_name: { type: String, required: true },
  resource_email: { type: String, required: true, lowercase: true, index: true },
  
  // ============ HIERARCHY ============
  geography_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Geography' },
  geography_name: { type: String, required: true },
  client_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', index: true },
  client_name: { type: String, default: 'Datavant' },
  project_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
  project_name: { type: String, required: true },
  subproject_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Subproject', index: true },
  subproject_name: { type: String, required: true },
  subproject_key: { type: String, index: true },
  
  // ============ DATAVANT-SPECIFIC FIELDS ============
  // Add Datavant-specific fields here based on requirements
  request_id: { type: String, trim: true, default: '', index: true },
  
  request_type: { 
    type: String, 
    enum: ['', 'New Request', 'Duplicate', 'Follow up'],
    default: ''
  },
  
  task_type: { type: String, trim: true, default: '' },
  
  count: { type: Number, default: 1, min: 1 },
  
  remark: { type: String, trim: true, default: '' },
  
  // ============ ASSIGNMENT TRACKING ============
  source: {
    type: String,
    enum: ['assignment', 'direct_entry'],
    default: 'direct_entry'
  },
  assignment_id: { type: mongoose.Schema.Types.ObjectId },
  is_late_log: { type: Boolean, default: false },
  days_late: { type: Number, default: 0 },
  
  // ============ BILLING ============
  billing_rate: { type: Number, default: 0 },
  billing_amount: { type: Number, default: 0 },
  billing_rate_at_logging: { type: Number, default: 0 },
  is_billable: { type: Boolean, default: true },
  
  // ============ STATUS & LOCKING ============
  status: {
    type: String,
    enum: ['draft', 'submitted', 'approved', 'rejected'],
    default: 'submitted'
  },
  is_locked: { type: Boolean, default: false, index: true },
  locked_at: { type: Date },
  locked_reason: { type: String },
  
  // ============ SOFT DELETE ============
  is_deleted: { type: Boolean, default: false, index: true },
  deleted_at: { type: Date },
  deleted_by: { type: String },
  
  // ============ EDIT HISTORY ============
  edit_history: [EditHistorySchema],
  last_edited_at: { type: Date },
  edit_count: { type: Number, default: 0 },
  
  // ============ DELETE REQUEST ============
  delete_request: DeleteRequestSchema,
  has_pending_delete_request: { type: Boolean, default: false, index: true }
  
}, { 
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// ============ INDEXES ============
DatavantDailyAllocationSchema.index({ resource_email: 1, allocation_date: 1 });
DatavantDailyAllocationSchema.index({ resource_email: 1, month: 1, year: 1 });
DatavantDailyAllocationSchema.index({ subproject_key: 1, month: 1, year: 1 });
DatavantDailyAllocationSchema.index({ request_id: 1, client_name: 1 });
DatavantDailyAllocationSchema.index({ month: 1, year: 1, is_locked: 1, is_deleted: 1 });

// ============ PRE-SAVE HOOK ============
DatavantDailyAllocationSchema.pre('save', function(next) {
  if (this.allocation_date) {
    const date = new Date(this.allocation_date);
    this.day = date.getDate();
    this.month = date.getMonth() + 1;
    this.year = date.getFullYear();
  }
  
  // logged_date = same as allocation_date (the work date resource selected)
  if (!this.logged_date) {
    this.logged_date = this.allocation_date || new Date();
  }
  // system_captured_date = actual server time when resource hit submit
  if (!this.system_captured_date) {
    this.system_captured_date = new Date();
  }

  // is_late_log: resource submitted to system (system_captured_date) after the allocation_date
  if (this.allocation_date && this.system_captured_date) {
    const allocDate = new Date(this.allocation_date);
    allocDate.setHours(0, 0, 0, 0);
    const capturedDate = new Date(this.system_captured_date);
    capturedDate.setHours(0, 0, 0, 0);

    if (capturedDate > allocDate) {
      this.is_late_log = true;
      this.days_late = Math.floor((capturedDate - allocDate) / (1000 * 60 * 60 * 24));
    }
  }
  
  // Generate subproject_key
  if (!this.subproject_key && this.client_name && this.project_name && this.subproject_name) {
    this.subproject_key = [
      this.client_name.toLowerCase().trim(),
      this.project_name.toLowerCase().trim(),
      this.subproject_name.toLowerCase().trim()
    ].join('|');
  }
  
  // Store rate at logging time
  if (!this.billing_rate_at_logging && this.billing_rate) {
    this.billing_rate_at_logging = this.billing_rate;
  }
  
  // Calculate billing amount
  this.billing_amount = this.billing_rate * this.count;
  
  next();
});

// ============ STATIC METHODS ============

// Get next SR number
DatavantDailyAllocationSchema.statics.getNextSrNo = async function(resourceEmail, date) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  const lastEntry = await this.findOne({
    resource_email: resourceEmail.toLowerCase().trim(),
    allocation_date: { $gte: startOfDay, $lte: endOfDay },
    is_deleted: { $ne: true }
  }).sort({ sr_no: -1 });
  
  return lastEntry ? lastEntry.sr_no + 1 : 1;
};

// Check if date is locked (EST)
DatavantDailyAllocationSchema.statics.isDateLocked = function(date) {
  const now = new Date();
  const estOffset = -5 * 60;
  const estNow = new Date(now.getTime() + (estOffset - now.getTimezoneOffset()) * 60000);
  
  const entryDate = new Date(date);
  const lastDayOfMonth = new Date(entryDate.getFullYear(), entryDate.getMonth() + 1, 0).getDate();
  const lockDate = new Date(entryDate.getFullYear(), entryDate.getMonth(), lastDayOfMonth, 23, 59, 59);
  
  return estNow > lockDate;
};

// Check if Request ID already has "New Request"
DatavantDailyAllocationSchema.statics.checkRequestIdExists = async function(requestId) {
  if (!requestId || requestId.trim() === '') return { exists: false };
  
  const existing = await this.findOne({
    request_id: requestId.trim(),
    request_type: 'New Request',
    is_deleted: { $ne: true }
  });
  
  return {
    exists: !!existing,
    existingEntry: existing,
    suggestedType: existing ? 'Follow up' : 'New Request'
  };
};

// Get allocations for today
DatavantDailyAllocationSchema.statics.getTodaysAllocations = async function(resourceEmail, date) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  return this.find({
    resource_email: resourceEmail.toLowerCase(),
    logged_date: { $gte: startOfDay, $lte: endOfDay },
    is_deleted: { $ne: true }
  }).sort({ sr_no: -1 });
};

// Get previous logged cases
DatavantDailyAllocationSchema.statics.getPreviousLoggedCases = async function(resourceEmail, filters = {}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const query = {
    resource_email: resourceEmail.toLowerCase(),
    logged_date: { $lt: today },
    is_deleted: { $ne: true }
  };
  
  if (filters.month && filters.year) {
    query.month = parseInt(filters.month);
    query.year = parseInt(filters.year);
  }
  
  if (filters.subproject_key) {
    query.subproject_key = filters.subproject_key;
  }
  
  if (filters.request_id) {
    query.request_id = { $regex: filters.request_id, $options: 'i' };
  }
  
  return this.find(query).sort({ allocation_date: -1, sr_no: -1 });
};

// Add edit with history
DatavantDailyAllocationSchema.statics.editWithHistory = async function(
  allocationId, 
  updates, 
  editorInfo, 
  changeReason, 
  changeNotes = ''
) {
  const allocation = await this.findById(allocationId);
  if (!allocation) throw new Error('Allocation not found');
  
  if (allocation.is_locked || this.isDateLocked(allocation.allocation_date)) {
    throw new Error('Cannot edit locked entries');
  }
  
  const fieldsChanged = [];
  for (const [field, newValue] of Object.entries(updates)) {
    if (allocation[field] !== newValue) {
      fieldsChanged.push({
        field,
        old_value: allocation[field],
        new_value: newValue
      });
    }
  }
  
  if (fieldsChanged.length === 0) {
    return allocation;
  }
  
  const editEntry = {
    edited_at: new Date(),
    edited_by_id: editorInfo.id,
    edited_by_email: editorInfo.email,
    edited_by_name: editorInfo.name,
    editor_type: editorInfo.type || 'resource',
    change_reason: changeReason,
    change_notes: changeNotes,
    fields_changed: fieldsChanged
  };
  
  for (const [field, value] of Object.entries(updates)) {
    allocation[field] = value;
  }
  
  allocation.edit_history.push(editEntry);
  allocation.last_edited_at = new Date();
  allocation.edit_count = (allocation.edit_count || 0) + 1;
  
  await allocation.save();
  return allocation;
};

// Request deletion
DatavantDailyAllocationSchema.statics.requestDeletion = async function(
  allocationId,
  requesterInfo,
  deleteReason
) {
  const allocation = await this.findById(allocationId);
  if (!allocation) throw new Error('Allocation not found');
  
  if (allocation.is_locked || this.isDateLocked(allocation.allocation_date)) {
    throw new Error('Cannot delete locked entries');
  }
  
  if (allocation.has_pending_delete_request) {
    throw new Error('Delete request already pending');
  }
  
  allocation.delete_request = {
    requested_at: new Date(),
    requested_by_id: requesterInfo.id,
    requested_by_email: requesterInfo.email,
    requested_by_name: requesterInfo.name,
    delete_reason: deleteReason,
    status: 'pending'
  };
  allocation.has_pending_delete_request = true;
  
  await allocation.save();
  return allocation;
};

// Admin: Review delete request
DatavantDailyAllocationSchema.statics.reviewDeleteRequest = async function(
  allocationId,
  adminInfo,
  action,
  comment = '',
  deleteType = 'soft'
) {
  const allocation = await this.findById(allocationId);
  if (!allocation) throw new Error('Allocation not found');
  
  if (!allocation.has_pending_delete_request) {
    throw new Error('No pending delete request');
  }
  
  allocation.delete_request.reviewed_at = new Date();
  allocation.delete_request.reviewed_by_id = adminInfo.id;
  allocation.delete_request.reviewed_by_email = adminInfo.email;
  allocation.delete_request.review_comment = comment;
  
  if (action === 'approve') {
    allocation.delete_request.status = 'approved';
    allocation.delete_request.delete_type = deleteType;
    
    if (deleteType === 'hard') {
      await this.deleteOne({ _id: allocationId });
      return { deleted: true, type: 'hard' };
    } else {
      allocation.is_deleted = true;
      allocation.deleted_at = new Date();
      allocation.deleted_by = adminInfo.email;
    }
  } else {
    allocation.delete_request.status = 'rejected';
  }
  
  allocation.has_pending_delete_request = false;
  await allocation.save();
  return allocation;
};

// Get late logs
DatavantDailyAllocationSchema.statics.getLateLogs = async function(filters = {}) {
  const query = {
    is_late_log: true,
    is_deleted: { $ne: true }
  };
  
  if (filters.month && filters.year) {
    query.month = parseInt(filters.month);
    query.year = parseInt(filters.year);
  }
  
  if (filters.resource_email) {
    query.resource_email = filters.resource_email.toLowerCase();
  }
  
  return this.find(query).sort({ logged_date: -1 });
};

// Get pending delete requests
DatavantDailyAllocationSchema.statics.getPendingDeleteRequests = async function() {
  return this.find({
    has_pending_delete_request: true,
    is_deleted: { $ne: true }
  }).sort({ 'delete_request.requested_at': -1 });
};

module.exports = mongoose.model('DatavantDailyAllocation', DatavantDailyAllocationSchema);