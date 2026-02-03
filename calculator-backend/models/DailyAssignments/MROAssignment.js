// models/MROAssignment.js - Track daily case assignments to resources
const mongoose = require('mongoose');

const MROAssignmentSchema = new mongoose.Schema({
  // ============ ASSIGNMENT DATE ============
  assignment_date: { type: Date, required: true, index: true },
  day: { type: Number, min: 1, max: 31 },
  month: { type: Number, min: 1, max: 12, index: true },
  year: { type: Number, index: true },
  
  // ============ RESOURCE INFO ============
  resource_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource', required: true, index: true },
  resource_name: { type: String, required: true },
  resource_email: { type: String, required: true, lowercase: true, index: true },
  
  // ============ LOCATION INFO ============
  geography_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Geography' },
  geography_name: { type: String, required: true },
  client_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
  client_name: { type: String, default: 'MRO' },
  project_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
  project_name: { type: String, required: true }, // Processing, Logging, etc.
  subproject_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Subproject', required: true },
  subproject_name: { type: String, required: true },
  subproject_key: { type: String, index: true },
  
  // ============ ASSIGNMENT STATUS ============
  status: {
    type: String,
    enum: ['pending', 'logged', 'partial', 'skipped'],
    default: 'pending',
    index: true
  },
  
  // ============ LOGGING INFO ============
  logged_allocation_id: { type: mongoose.Schema.Types.ObjectId, ref: 'MRODailyAllocation' },
  logged_at: { type: Date },
  logged_on_date: { type: Date }, // The actual date when it was logged
  is_late_log: { type: Boolean, default: false },
  
  // ============ VISIBILITY CONTROL ============
  // Show until logged or month end
  is_visible: { type: Boolean, default: true, index: true },
  hidden_at: { type: Date },
  hidden_reason: { type: String, enum: ['logged', 'month_end', 'manual'] },
  
  // ============ SOURCE ============
  source: {
    type: String,
    enum: ['csv_upload', 'manual', 'auto_assign'],
    default: 'csv_upload'
  },
  
  // ============ NOTES ============
  notes: { type: String }
  
}, { 
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// ============ INDEXES ============
MROAssignmentSchema.index({ resource_email: 1, assignment_date: 1, subproject_key: 1 }, { unique: true });
MROAssignmentSchema.index({ resource_email: 1, status: 1, is_visible: 1 });
MROAssignmentSchema.index({ month: 1, year: 1, status: 1 });

// ============ PRE-SAVE HOOK ============
MROAssignmentSchema.pre('save', function(next) {
  if (this.assignment_date) {
    const date = new Date(this.assignment_date);
    this.day = date.getDate();
    this.month = date.getMonth() + 1;
    this.year = date.getFullYear();
  }
  
  if (!this.subproject_key && this.client_name && this.project_name && this.subproject_name) {
    this.subproject_key = [
      this.client_name.toLowerCase().trim(),
      this.project_name.toLowerCase().trim(),
      this.subproject_name.toLowerCase().trim()
    ].join('|');
  }
  
  next();
});

// ============ STATIC METHODS ============

// Get pending assignments for a resource (not yet logged)
MROAssignmentSchema.statics.getPendingAssignments = async function(resourceEmail, clientName = 'MRO') {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  
  // Get first day of current month
  const monthStart = new Date(currentYear, currentMonth - 1, 1);
  monthStart.setHours(0, 0, 0, 0);
  
  return this.find({
    resource_email: resourceEmail.toLowerCase(),
    client_name: { $regex: new RegExp(`^${clientName}$`, 'i') },
    status: 'pending',
    is_visible: true,
    assignment_date: { $gte: monthStart }
  }).sort({ assignment_date: 1, subproject_name: 1 });
};

// Get assignments for a specific date
MROAssignmentSchema.statics.getAssignmentsForDate = async function(resourceEmail, date, clientName = 'MRO') {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  return this.find({
    resource_email: resourceEmail.toLowerCase(),
    client_name: { $regex: new RegExp(`^${clientName}$`, 'i') },
    assignment_date: { $gte: startOfDay, $lte: endOfDay }
  }).sort({ subproject_name: 1 });
};

// Mark assignment as logged
MROAssignmentSchema.statics.markAsLogged = async function(assignmentId, allocationId) {
  const assignment = await this.findById(assignmentId);
  if (!assignment) return null;
  
  const now = new Date();
  const assignDate = new Date(assignment.assignment_date);
  assignDate.setHours(0, 0, 0, 0);
  const logDate = new Date(now);
  logDate.setHours(0, 0, 0, 0);
  
  assignment.status = 'logged';
  assignment.logged_allocation_id = allocationId;
  assignment.logged_at = now;
  assignment.logged_on_date = now;
  assignment.is_late_log = logDate > assignDate;
  assignment.is_visible = false;
  assignment.hidden_at = now;
  assignment.hidden_reason = 'logged';
  
  await assignment.save();
  return assignment;
};

// Create assignments from resource's assigned locations
MROAssignmentSchema.statics.createDailyAssignments = async function(resourceEmail, date, locations) {
  const assignments = [];
  const assignmentDate = new Date(date);
  assignmentDate.setHours(0, 0, 0, 0);
  
  for (const location of locations) {
    const subprojectKey = [
      location.client_name?.toLowerCase().trim() || 'mro',
      location.project_name?.toLowerCase().trim() || '',
      location.subproject_name?.toLowerCase().trim() || ''
    ].join('|');
    
    // Check if assignment already exists
    const existing = await this.findOne({
      resource_email: resourceEmail.toLowerCase(),
      assignment_date: assignmentDate,
      subproject_key: subprojectKey
    });
    
    if (!existing) {
      assignments.push({
        assignment_date: assignmentDate,
        resource_email: resourceEmail.toLowerCase(),
        resource_name: location.resource_name || '',
        resource_id: location.resource_id,
        geography_id: location.geography_id,
        geography_name: location.geography_name,
        client_id: location.client_id,
        client_name: location.client_name || 'MRO',
        project_id: location.project_id,
        project_name: location.project_name,
        subproject_id: location.subproject_id,
        subproject_name: location.subproject_name,
        subproject_key: subprojectKey,
        status: 'pending',
        is_visible: true,
        source: 'auto_assign'
      });
    }
  }
  
  if (assignments.length > 0) {
    return this.insertMany(assignments, { ordered: false });
  }
  
  return [];
};

// Hide past month assignments (run as cron job)
MROAssignmentSchema.statics.hideExpiredAssignments = async function() {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  
  // Get last day of previous month
  const lastDayPrevMonth = new Date(currentYear, currentMonth, 0);
  
  const result = await this.updateMany(
    {
      status: 'pending',
      is_visible: true,
      assignment_date: { $lt: lastDayPrevMonth }
    },
    {
      $set: {
        is_visible: false,
        hidden_at: now,
        hidden_reason: 'month_end',
        status: 'skipped'
      }
    }
  );
  
  return result;
};

// Get assignment statistics for a resource
MROAssignmentSchema.statics.getResourceStats = async function(resourceEmail, month, year) {
  return this.aggregate([
    {
      $match: {
        resource_email: resourceEmail.toLowerCase(),
        month: month,
        year: year
      }
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);
};

module.exports = mongoose.model('MROAssignment', MROAssignmentSchema);