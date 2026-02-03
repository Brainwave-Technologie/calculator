// models/DatavantAssignment.js - Track daily case assignments to resources for Datavant
const mongoose = require('mongoose');

const DatavantAssignmentSchema = new mongoose.Schema({
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
  client_name: { type: String, default: 'Datavant' },
  project_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
  project_name: { type: String, required: true },
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
  logged_allocation_id: { type: mongoose.Schema.Types.ObjectId, ref: 'DatavantDailyAllocation' },
  logged_at: { type: Date },
  logged_on_date: { type: Date },
  is_late_log: { type: Boolean, default: false },
  days_late: { type: Number, default: 0 },
  
  // ============ VISIBILITY CONTROL ============
  is_visible: { type: Boolean, default: true, index: true },
  hidden_at: { type: Date },
  hidden_reason: { type: String, enum: ['logged', 'month_end', 'manual'] },
  
  // ============ SOURCE ============
  source: {
    type: String,
    enum: ['csv_upload', 'manual', 'auto_assign'],
    default: 'csv_upload'
  },
  
  notes: { type: String }
  
}, { 
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// ============ INDEXES ============
DatavantAssignmentSchema.index({ resource_email: 1, assignment_date: 1, subproject_key: 1 }, { unique: true });
DatavantAssignmentSchema.index({ resource_email: 1, status: 1, is_visible: 1 });
DatavantAssignmentSchema.index({ month: 1, year: 1, status: 1 });

// ============ PRE-SAVE HOOK ============
DatavantAssignmentSchema.pre('save', function(next) {
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
DatavantAssignmentSchema.statics.getPendingAssignments = async function(resourceEmail) {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  
  const monthStart = new Date(currentYear, currentMonth - 1, 1);
  monthStart.setHours(0, 0, 0, 0);
  
  return this.find({
    resource_email: resourceEmail.toLowerCase(),
    status: 'pending',
    is_visible: true,
    assignment_date: { $gte: monthStart }
  }).sort({ assignment_date: 1, subproject_name: 1 });
};

// Get assignments for a specific date
DatavantAssignmentSchema.statics.getAssignmentsForDate = async function(resourceEmail, date) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  return this.find({
    resource_email: resourceEmail.toLowerCase(),
    assignment_date: { $gte: startOfDay, $lte: endOfDay }
  }).sort({ subproject_name: 1 });
};

// Mark assignment as logged
DatavantAssignmentSchema.statics.markAsLogged = async function(assignmentId, allocationId) {
  const assignment = await this.findById(assignmentId);
  if (!assignment) return null;
  
  const now = new Date();
  const assignDate = new Date(assignment.assignment_date);
  assignDate.setHours(0, 0, 0, 0);
  const logDate = new Date(now);
  logDate.setHours(0, 0, 0, 0);
  
  const isLate = logDate > assignDate;
  const daysLate = isLate ? Math.floor((logDate - assignDate) / (1000 * 60 * 60 * 24)) : 0;
  
  assignment.status = 'logged';
  assignment.logged_allocation_id = allocationId;
  assignment.logged_at = now;
  assignment.logged_on_date = now;
  assignment.is_late_log = isLate;
  assignment.days_late = daysLate;
  assignment.is_visible = false;
  assignment.hidden_at = now;
  assignment.hidden_reason = 'logged';
  
  await assignment.save();
  return assignment;
};

// Create assignments from resource's assigned locations
DatavantAssignmentSchema.statics.createDailyAssignments = async function(resourceEmail, date, locations, resourceInfo = {}) {
  const assignments = [];
  const assignmentDate = new Date(date);
  assignmentDate.setHours(0, 0, 0, 0);
  
  for (const location of locations) {
    const subprojectKey = [
      'datavant',
      location.project_name?.toLowerCase().trim() || '',
      location.subproject_name?.toLowerCase().trim() || ''
    ].join('|');
    
    const existing = await this.findOne({
      resource_email: resourceEmail.toLowerCase(),
      assignment_date: assignmentDate,
      subproject_key: subprojectKey
    });
    
    if (!existing) {
      assignments.push({
        assignment_date: assignmentDate,
        resource_email: resourceEmail.toLowerCase(),
        resource_name: resourceInfo.name || location.resource_name || '',
        resource_id: resourceInfo._id || location.resource_id,
        geography_id: location.geography_id,
        geography_name: location.geography_name,
        client_id: location.client_id,
        client_name: 'Datavant',
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
    return this.insertMany(assignments, { ordered: false }).catch(err => {
      if (err.code === 11000) {
        console.log('Some Datavant assignments already exist, skipping duplicates');
        return [];
      }
      throw err;
    });
  }
  
  return [];
};

// Hide past month assignments (run as cron job)
DatavantAssignmentSchema.statics.hideExpiredAssignments = async function() {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  
  const lastDayPrevMonth = new Date(currentYear, currentMonth, 0);
  
  return this.updateMany(
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
};

// Get assignment statistics for a resource
DatavantAssignmentSchema.statics.getResourceStats = async function(resourceEmail, month, year) {
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

// Get late logs for admin tracking
DatavantAssignmentSchema.statics.getLateLogs = async function(filters = {}) {
  const query = { is_late_log: true };
  
  if (filters.month && filters.year) {
    query.month = parseInt(filters.month);
    query.year = parseInt(filters.year);
  }
  
  if (filters.resource_email) {
    query.resource_email = filters.resource_email.toLowerCase();
  }
  
  return this.find(query).sort({ logged_on_date: -1 });
};

module.exports = mongoose.model('DatavantAssignment', DatavantAssignmentSchema);