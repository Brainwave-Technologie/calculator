// models/MRODailyAllocation.js - Complete MRO Daily Allocation with Assignment Tracking
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

const MRODailyAllocationSchema = new mongoose.Schema({
  // ============ SERIAL NUMBER ============
  sr_no: { type: Number },
  
  // ============ DATE FIELDS ============
  // Allocation Date = Date when case was ASSIGNED to resource
  allocation_date: { type: Date, required: true, index: true },
  // Logged Date = Date when resource actually LOGGED the case (kept for backward compat)
  logged_date: { type: Date, index: true },
  // System Captured Date = exact timestamp when the system captured the entry (same as logged_date)
  system_captured_date: { type: Date, index: true },
  day: { type: Number, min: 1, max: 31 },
  month: { type: Number, min: 1, max: 12, index: true },
  year: { type: Number, index: true },
  
  // ============ RESOURCE INFO (Assigner) ============
  resource_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource', index: true },
  resource_name: { type: String, required: true }, // Assigner Name
  resource_email: { type: String, required: true, lowercase: true, index: true },
  
  // ============ HIERARCHY ============
  geography_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Geography' },
  geography_name: { type: String, required: true },
  client_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', index: true },
  client_name: { type: String, default: 'MRO' },
  project_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
  project_name: { type: String, required: true }, // Process Type: Processing, Logging, MRO Payer Project
  subproject_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Subproject', index: true },
  subproject_name: { type: String, required: true }, // Location name
  subproject_key: { type: String, index: true }, // Business key for persistence
  
  // ============ MRO-SPECIFIC FIELDS (Excel Columns) ============
  facility_name: { type: String, trim: true, default: '' }, // Facility - Free text
  
  request_id: { type: String, trim: true, default: '', index: true }, // Request ID - Important for duplicate check
  
  request_type: { 
    type: String, 
    enum: ['', 'Batch', 'DDS', 'E-link', 'E-Request', 'Follow up', 'New Request'],
    required: true
  },
  
  // Requestor Type - determines billing rate for Processing
  requestor_type: { 
    type: String, 
    enum: [
      '',
      'NRS-NO Records',
      'Manual',
      'Other Processing (Canceled/Released By Other)',
      'Processed',
      'Processed through File Drop'
    ],
    default: ''
  },
  
  // Process Type derived from project_name
  process_type: { 
    type: String, 
    enum: ['Processing', 'Logging', 'MRO Payer Project'],
    required: true
  },
  
  // Additional tracking field (like "Bronx Care Processing Time")
  processing_time: { type: String, trim: true, default: '' },
  
  remark: { type: String, trim: true, default: '' },
  
  // ============ ASSIGNMENT TRACKING ============
  // Was this entry from an assignment or direct entry?
  source: {
    type: String,
    enum: ['assignment', 'direct_entry'],
    default: 'direct_entry'
  },
  assignment_id: { type: mongoose.Schema.Types.ObjectId, ref: 'MROAssignment' },
  
  // Track if logged late (after allocation_date)
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
MRODailyAllocationSchema.index({ resource_email: 1, allocation_date: 1 });
MRODailyAllocationSchema.index({ resource_email: 1, month: 1, year: 1 });
MRODailyAllocationSchema.index({ subproject_key: 1, month: 1, year: 1 });
MRODailyAllocationSchema.index({ request_id: 1, client_name: 1 }); // For duplicate check
MRODailyAllocationSchema.index({ month: 1, year: 1, is_locked: 1, is_deleted: 1 });
MRODailyAllocationSchema.index({ has_pending_delete_request: 1 });
MRODailyAllocationSchema.index({ logged_date: 1, allocation_date: 1 }); // For late log detection

// ============ PRE-SAVE HOOK ============
MRODailyAllocationSchema.pre('save', function(next) {
  // Extract date components from allocation_date
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
  
  // Normalize email
  if (this.resource_email) {
    this.resource_email = this.resource_email.toLowerCase().trim();
  }
  
  // Auto-calculate billing
  if (!this.billing_rate_at_logging) {
    if (this.process_type === 'Processing') {
      if (this.requestor_type === 'NRS-NO Records') {
        this.billing_rate = 2.25;
      } else if (
        this.requestor_type === 'Manual' ||
        this.requestor_type === 'Processed' ||
        this.requestor_type === 'Processed through File Drop'
      ) {
        this.billing_rate = 3.00;
      } else {
        this.billing_rate = 0;
      }
    } else if (this.process_type === 'Logging') {
      this.billing_rate = 1.08;
    } else {
      this.billing_rate = 0;
    }
    this.billing_rate_at_logging = this.billing_rate;
  }
  
  this.billing_amount = this.billing_rate;
  next();
});

// ============ STATIC METHODS ============

// Get next SR number
MRODailyAllocationSchema.statics.getNextSrNo = async function(resourceEmail, date) {
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

// Check if date is locked (after month end in EST)
MRODailyAllocationSchema.statics.isDateLocked = function(date) {
  const now = new Date();
  // EST offset (-5 hours, or -4 during DST)
  const estOffset = -5 * 60; // Use -5 for EST
  const estNow = new Date(now.getTime() + (estOffset - now.getTimezoneOffset()) * 60000);
  
  const entryDate = new Date(date);
  const lastDayOfMonth = new Date(entryDate.getFullYear(), entryDate.getMonth() + 1, 0).getDate();
  const lockDate = new Date(entryDate.getFullYear(), entryDate.getMonth(), lastDayOfMonth, 23, 59, 59);
  
  return estNow > lockDate;
};

// Check if Request ID already has "New Request" for this client
MRODailyAllocationSchema.statics.checkRequestIdExists = async function(requestId, clientName = 'MRO') {
  if (!requestId || requestId.trim() === '') return { exists: false };
  
  const existing = await this.findOne({
    request_id: requestId.trim(),
    client_name: { $regex: new RegExp(`^${clientName}$`, 'i') },
    request_type: 'New Request',
    is_deleted: { $ne: true }
  });
  
  return {
    exists: !!existing,
    existingEntry: existing,
    suggestedType: existing ? 'Follow up' : 'New Request' // MRO uses "Follow up" for duplicates
  };
};

// Get allocations for today
MRODailyAllocationSchema.statics.getTodaysAllocations = async function(resourceEmail, date) {
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

// Get previous logged cases (for separate page)
MRODailyAllocationSchema.statics.getPreviousLoggedCases = async function(resourceEmail, filters = {}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const query = {
    resource_email: resourceEmail.toLowerCase(),
    logged_date: { $lt: today },
    is_deleted: { $ne: true }
  };
  
  // Apply filters
  if (filters.month && filters.year) {
    query.month = parseInt(filters.month);
    query.year = parseInt(filters.year);
  }
  
  if (filters.subproject_key) {
    query.subproject_key = filters.subproject_key;
  }
  
  if (filters.process_type) {
    query.process_type = filters.process_type;
  }
  
  if (filters.request_id) {
    query.request_id = { $regex: filters.request_id, $options: 'i' };
  }
  
  if (filters.geography_id) {
    query.geography_id = filters.geography_id;
  }
  
  return this.find(query).sort({ allocation_date: -1, sr_no: -1 });
};

// Add edit with history
MRODailyAllocationSchema.statics.editWithHistory = async function(
  allocationId, 
  updates, 
  editorInfo, 
  changeReason, 
  changeNotes = ''
) {
  const allocation = await this.findById(allocationId);
  if (!allocation) throw new Error('Allocation not found');
  
  // Check if locked
  if (allocation.is_locked || this.isDateLocked(allocation.allocation_date)) {
    throw new Error('Cannot edit locked entries');
  }
  
  // Build change history
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
    return allocation; // No changes
  }
  
  // Create edit history entry
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
  
  // Apply updates
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
MRODailyAllocationSchema.statics.requestDeletion = async function(
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

// Admin: Approve or reject delete request
MRODailyAllocationSchema.statics.reviewDeleteRequest = async function(
  allocationId,
  adminInfo,
  action, // 'approve' or 'reject'
  comment = '',
  deleteType = 'soft' // 'soft' or 'hard'
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

// Get late logs for activity tracking
MRODailyAllocationSchema.statics.getLateLogs = async function(filters = {}) {
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

// Get pending delete requests (for admin)
MRODailyAllocationSchema.statics.getPendingDeleteRequests = async function() {
  return this.find({
    has_pending_delete_request: true,
    is_deleted: { $ne: true }
  }).sort({ 'delete_request.requested_at': -1 });
};

module.exports = mongoose.model('MRODailyAllocation', MRODailyAllocationSchema);