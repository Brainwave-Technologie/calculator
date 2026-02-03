// models/ActivityLog.js - Track resource activity and assignment changes
const mongoose = require('mongoose');

const ActivityLogSchema = new mongoose.Schema({
  // What type of activity
  activity_type: {
    type: String,
    enum: [
      'CASE_LOGGED',           // Resource logged a case
      'CASE_UPDATED',          // Resource updated a case
      'CASE_DELETED',          // Resource deleted a case
      'ASSIGNMENT_ADDED',      // New location assigned to resource
      'ASSIGNMENT_REMOVED',    // Location removed from resource
      'RESOURCE_ACTIVATED',    // Resource activated/created
      'RESOURCE_DEACTIVATED',  // Resource deactivated
      'LOGIN',                 // Resource logged in
      'LOGOUT'                 // Resource logged out
    ],
    required: true,
    index: true
  },
  
  // Who performed the action
  actor_type: {
    type: String,
    enum: ['resource', 'admin', 'system'],
    required: true
  },
  actor_id: { type: mongoose.Schema.Types.ObjectId },
  actor_email: { type: String, lowercase: true, index: true },
  actor_name: { type: String },
  
  // Resource being affected
  resource_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource' },
  resource_email: { type: String, lowercase: true, index: true },
  resource_name: { type: String },
  
  // Location/Assignment details
  client_name: { type: String },
  project_name: { type: String },
  subproject_name: { type: String },
  subproject_key: { type: String, index: true },
  
  // For CASE_LOGGED activities
  allocation_id: { type: mongoose.Schema.Types.ObjectId },
  allocation_date: { type: Date },
  request_type: { type: String },
  requestor_type: { type: String },
  
  // Date components
  log_date: { type: Date, default: Date.now, index: true },
  month: { type: Number, index: true },
  year: { type: Number, index: true },
  
  // Additional context
  details: { type: mongoose.Schema.Types.Mixed },
  ip_address: { type: String },
  user_agent: { type: String }
  
}, { 
  timestamps: { createdAt: 'created_at' }
});

// Pre-save: Extract date components
ActivityLogSchema.pre('save', function(next) {
  if (this.log_date) {
    const date = new Date(this.log_date);
    this.month = date.getMonth() + 1;
    this.year = date.getFullYear();
  }
  next();
});

// Log a case entry activity
ActivityLogSchema.statics.logCaseEntry = async function(allocation, resource, actorType = 'resource') {
  return this.create({
    activity_type: 'CASE_LOGGED',
    actor_type: actorType,
    actor_id: resource._id,
    actor_email: resource.email,
    actor_name: resource.name,
    resource_id: resource._id,
    resource_email: resource.email,
    resource_name: resource.name,
    client_name: allocation.client_name,
    project_name: allocation.project_name,
    subproject_name: allocation.subproject_name,
    subproject_key: allocation.subproject_key,
    allocation_id: allocation._id,
    allocation_date: allocation.allocation_date,
    request_type: allocation.request_type,
    requestor_type: allocation.requestor_type
  });
};

// Get assignment fill status
ActivityLogSchema.statics.getAssignmentFillStatus = async function(resourceEmail, month, year) {
  const Resource = mongoose.model('Resource');
  
  // Get resource's current assignments
  const resource = await Resource.findOne({ 
    email_normalized: resourceEmail.toLowerCase() 
  });
  
  if (!resource) return { error: 'Resource not found' };
  
  // Get all assigned subproject keys
  const assignedKeys = [];
  for (const assignment of resource.assignments || []) {
    for (const sp of assignment.subprojects || []) {
      assignedKeys.push({
        subproject_key: sp.subproject_key,
        subproject_name: sp.subproject_name,
        client_name: assignment.client_name,
        project_name: assignment.project_name
      });
    }
  }
  
  // Try MRODailyAllocation first, then VerismaDailyAllocation
  let loggedSubprojects = [];
  
  try {
    const MRODailyAllocation = mongoose.model('MRODailyAllocation');
    const mroLogs = await MRODailyAllocation.aggregate([
      {
        $match: {
          resource_email: resourceEmail.toLowerCase(),
          month: month,
          year: year
        }
      },
      {
        $group: {
          _id: '$subproject_key',
          subproject_name: { $first: '$subproject_name' },
          total_cases: { $sum: 1 },
          last_logged: { $max: '$allocation_date' }
        }
      }
    ]);
    loggedSubprojects = loggedSubprojects.concat(mroLogs);
  } catch (e) {}
  
  try {
    const VerismaDailyAllocation = mongoose.model('VerismaDailyAllocation');
    const verismaLogs = await VerismaDailyAllocation.aggregate([
      {
        $match: {
          resource_email: resourceEmail.toLowerCase(),
          month: month,
          year: year
        }
      },
      {
        $group: {
          _id: '$subproject_key',
          subproject_name: { $first: '$subproject_name' },
          total_cases: { $sum: '$count' },
          last_logged: { $max: '$allocation_date' }
        }
      }
    ]);
    loggedSubprojects = loggedSubprojects.concat(verismaLogs);
  } catch (e) {}
  
  // Create a map of logged subprojects
  const loggedMap = new Map();
  for (const log of loggedSubprojects) {
    loggedMap.set(log._id, log);
  }
  
  // Build status for each assignment
  const status = assignedKeys.map(assignment => {
    const logged = loggedMap.get(assignment.subproject_key);
    return {
      ...assignment,
      status: logged ? 'LOGGED' : 'PENDING',
      total_cases: logged?.total_cases || 0,
      last_logged: logged?.last_logged || null
    };
  });
  
  return {
    resource_email: resourceEmail,
    resource_name: resource.name,
    month,
    year,
    total_assignments: assignedKeys.length,
    logged_count: status.filter(s => s.status === 'LOGGED').length,
    pending_count: status.filter(s => s.status === 'PENDING').length,
    assignments: status
  };
};

// Indexes
ActivityLogSchema.index({ resource_email: 1, month: 1, year: 1 });
ActivityLogSchema.index({ subproject_key: 1, month: 1, year: 1 });
ActivityLogSchema.index({ activity_type: 1, log_date: 1 });

module.exports = mongoose.model('ActivityLog', ActivityLogSchema);