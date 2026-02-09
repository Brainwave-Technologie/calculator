// models/DailyAssignments/VerismaAssignment.js
// Track daily case assignments to resources for Verisma
// FIXED: Proper pending/logged status management
const mongoose = require('mongoose');

const VerismaAssignmentSchema = new mongoose.Schema({
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
  geography_type: { type: String, enum: ['onshore', 'offshore'] },
  client_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
  client_name: { type: String, default: 'Verisma' },
  project_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
  project_name: { type: String, required: true },
  subproject_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Subproject', required: true },
  subproject_name: { type: String, required: true },
  subproject_key: { type: String, index: true },
  
  // ============ ASSIGNMENT STATUS ============
  // CRITICAL: This determines if it shows in pending list
  status: {
    type: String,
    enum: ['pending', 'logged', 'skipped'],
    default: 'pending',
    index: true
  },
  
  // ============ LOGGING INFO ============
  logged_allocation_id: { type: mongoose.Schema.Types.ObjectId, ref: 'VerismaDailyAllocation' },
  logged_at: { type: Date },
  logged_on_date: { type: Date },
  is_late_log: { type: Boolean, default: false },
  days_late: { type: Number, default: 0 },
  
  // ============ SOURCE ============
  source: {
    type: String,
    enum: ['csv_upload', 'manual', 'auto_assign'],
    default: 'csv_upload'
  },
  
  // ============ UPLOAD TRACKING ============
  upload_batch_id: { type: String },
  uploaded_by: { type: String },
  uploaded_at: { type: Date },
  
  notes: { type: String }
  
}, { 
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// ============ INDEXES ============
// Unique: One assignment per resource per location per date
VerismaAssignmentSchema.index(
  { resource_email: 1, assignment_date: 1, subproject_id: 1 }, 
  { unique: true }
);
VerismaAssignmentSchema.index({ resource_email: 1, status: 1 });
VerismaAssignmentSchema.index({ month: 1, year: 1, status: 1 });

// ============ PRE-SAVE HOOK ============
VerismaAssignmentSchema.pre('save', function(next) {
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

/**
 * GET PENDING ASSIGNMENTS FOR RESOURCE
 * 
 * LOGIC:
 * 1. First check for ANY pending assignments from PREVIOUS days (before today)
 * 2. If previous pending exist → return ONLY those (block today's assignments)
 * 3. If no previous pending → return today's pending assignments
 * 
 * This ensures resources complete old work before getting new assignments
 */
VerismaAssignmentSchema.statics.getPendingAssignments = async function(resourceEmail) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const todayEnd = new Date(today);
  todayEnd.setHours(23, 59, 59, 999);
  
  // Step 1: Check for pending assignments from BEFORE today
  const previousPending = await this.find({
    resource_email: resourceEmail.toLowerCase(),
    status: 'pending', // Only pending, not logged
    assignment_date: { $lt: today } // Before today
  }).sort({ assignment_date: 1, subproject_name: 1 });
  
  // Step 2: If previous pending exist, return ONLY those
  if (previousPending.length > 0) {
    return {
      assignments: previousPending,
      has_previous_pending: true,
      previous_pending_count: previousPending.length,
      blocked_message: `You have ${previousPending.length} pending assignment(s) from previous days. Please complete them first before today's assignments become available.`
    };
  }
  
  // Step 3: No previous pending, get today's pending assignments
  const todaysPending = await this.find({
    resource_email: resourceEmail.toLowerCase(),
    status: 'pending',
    assignment_date: { $gte: today, $lte: todayEnd }
  }).sort({ subproject_name: 1 });
  
  return {
    assignments: todaysPending,
    has_previous_pending: false,
    previous_pending_count: 0,
    blocked_message: null
  };
};

/**
 * MARK ASSIGNMENT AS LOGGED
 * Called when resource submits an entry for this assignment
 * 
 * CRITICAL: This removes it from the pending list
 */
VerismaAssignmentSchema.statics.markAsLogged = async function(assignmentId, allocationId) {
  const assignment = await this.findById(assignmentId);
  if (!assignment) {
    console.log(`[VerismaAssignment] Assignment not found: ${assignmentId}`);
    return null;
  }
  
  // Already logged? Skip
  if (assignment.status === 'logged') {
    console.log(`[VerismaAssignment] Already logged: ${assignmentId}`);
    return assignment;
  }
  
  const now = new Date();
  const assignDate = new Date(assignment.assignment_date);
  assignDate.setHours(0, 0, 0, 0);
  const logDate = new Date(now);
  logDate.setHours(0, 0, 0, 0);
  
  const isLate = logDate > assignDate;
  const daysLate = isLate ? Math.floor((logDate - assignDate) / (1000 * 60 * 60 * 24)) : 0;
  
  // Update assignment status to LOGGED
  assignment.status = 'logged';
  assignment.logged_allocation_id = allocationId;
  assignment.logged_at = now;
  assignment.logged_on_date = now;
  assignment.is_late_log = isLate;
  assignment.days_late = daysLate;
  
  await assignment.save();
  
  console.log(`[VerismaAssignment] Marked as logged: ${assignmentId}, allocation: ${allocationId}`);
  return assignment;
};

/**
 * FIND ASSIGNMENT BY RESOURCE, DATE, AND LOCATION
 * Used to link allocation entries to their assignments
 */
VerismaAssignmentSchema.statics.findAssignmentForEntry = async function(resourceEmail, assignmentDate, subprojectId) {
  const startOfDay = new Date(assignmentDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(assignmentDate);
  endOfDay.setHours(23, 59, 59, 999);
  
  return this.findOne({
    resource_email: resourceEmail.toLowerCase(),
    assignment_date: { $gte: startOfDay, $lte: endOfDay },
    subproject_id: subprojectId,
    status: 'pending' // Only find pending ones
  });
};

/**
 * GET ASSIGNMENT STATS FOR RESOURCE
 */
VerismaAssignmentSchema.statics.getResourceStats = async function(resourceEmail, month, year) {
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

/**
 * GET PENDING SUMMARY BY DATE
 */
VerismaAssignmentSchema.statics.getPendingSummary = async function(resourceEmail) {
  return this.aggregate([
    {
      $match: {
        resource_email: resourceEmail.toLowerCase(),
        status: 'pending'
      }
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$assignment_date' } },
        count: { $sum: 1 },
        locations: { $push: '$subproject_name' }
      }
    },
    { $sort: { _id: 1 } }
  ]);
};

/**
 * HIDE EXPIRED ASSIGNMENTS (for month-end cleanup)
 */
VerismaAssignmentSchema.statics.markExpiredAsSkipped = async function() {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  
  // Last day of previous month
  const lastDayPrevMonth = new Date(currentYear, currentMonth, 0);
  
  const result = await this.updateMany(
    {
      status: 'pending',
      assignment_date: { $lt: lastDayPrevMonth }
    },
    {
      $set: {
        status: 'skipped'
      }
    }
  );
  
  return result;
};

module.exports = mongoose.model('VerismaAssignment', VerismaAssignmentSchema);