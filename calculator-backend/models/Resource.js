// models/Resource.js - Updated with business keys, OTP auth, login tracking, session timeout, and assigned_date
const mongoose = require('mongoose');

// Login activity subdocument
const LoginActivitySchema = new mongoose.Schema({
  login_time: { type: Date, default: Date.now },
  ip_address: { type: String },
  user_agent: { type: String },
  device_info: { type: String },
  location: { type: String },
  status: { type: String, enum: ['success', 'failed', 'otp_sent'], default: 'success' }
}, { _id: false });

// Subproject assignment with assigned_date
const SubprojectAssignmentSchema = new mongoose.Schema({
  subproject_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Subproject' },
  subproject_name: { type: String },
  // Business key for data persistence across re-uploads
  subproject_key: { type: String }, // Format: "client|project|subproject" lowercase
  // ═══════════════════════════════════════════════════════════════
  // ASSIGNED DATE - When this location was assigned to the resource
  // Resource can only log entries for dates >= assigned_date
  // ═══════════════════════════════════════════════════════════════
  assigned_date: { type: Date },
  assigned_by: { type: String }, // Email of admin who assigned
  status: { type: String, enum: ['active', 'inactive', 'removed'], default: 'active' },
  removed_date: { type: Date },
  removed_by: { type: String }
}, { _id: false });

// Assignment subdocument - defines what a resource can access
const AssignmentSchema = new mongoose.Schema({
  geography_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Geography', required: true },
  geography_name: { type: String },
  client_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  client_name: { type: String },
  project_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  project_name: { type: String },
  // Array of subprojects/locations this resource can access
  subprojects: [SubprojectAssignmentSchema]
}, { _id: false });

const ResourceSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  
  // ═══════════════════════════════════════════════════════════════
  // BUSINESS KEY - Normalized email for consistent matching
  // This survives re-uploads and is used for linking DailyAllocations
  // ═══════════════════════════════════════════════════════════════
  email_normalized: { 
    type: String, 
    lowercase: true, 
    trim: true,
    index: true 
  },
  
  // OTP Authentication fields
  otp: { type: String },
  otp_expires: { type: Date },
  otp_attempts: { type: Number, default: 0 },
  otp_last_sent: { type: Date },
  
  // Role within the system
  role: { 
    type: String, 
    enum: ['associate', 'senior_associate', 'team_lead', 'manager'],
    default: 'associate'
  },
  
  // Status - supports soft delete
  status: { 
    type: String, 
    enum: ['active', 'inactive', 'pending'],
    default: 'active',
    index: true
  },
  
  // Track when resource was deactivated (for soft delete)
  deactivated_at: { type: Date },
  deactivated_reason: { type: String },
  
  // Assignments - what this resource can access
  assignments: [AssignmentSchema],
  
  // Additional info
  employee_id: { type: String },
  phone: { type: String },
  avatar_url: { type: String },
  
  // Login tracking
  last_login: { type: Date },
  login_count: { type: Number, default: 0 },
  total_logins: { type: Number, default: 0 },
  
  // Login activity history (last 50 logins)
  login_history: {
    type: [LoginActivitySchema],
    default: []
  },
  
  // Monthly login stats
  monthly_logins: [{
    month: Number,
    year: Number,
    count: { type: Number, default: 0 },
    first_login: Date,
    last_login: Date
  }],
  
  // Session management with activity tracking
  current_session_token: { type: String },
  session_expires: { type: Date },
  last_activity: { type: Date },
  session_timeout_minutes: { type: Number, default: 10 },
  
  // Metadata
  created_by: { type: String },
  updated_by: { type: String }
  
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// ═══════════════════════════════════════════════════════════════
// INDEXES
// ═══════════════════════════════════════════════════════════════
ResourceSchema.index({ email: 1 }, { unique: true });
ResourceSchema.index({ email_normalized: 1 }, { unique: true, sparse: true });
ResourceSchema.index({ status: 1 });
ResourceSchema.index({ 'assignments.client_id': 1 });
ResourceSchema.index({ 'assignments.subprojects.subproject_id': 1 });
ResourceSchema.index({ 'assignments.subprojects.subproject_key': 1 });
ResourceSchema.index({ 'assignments.subprojects.assigned_date': 1 });
ResourceSchema.index({ otp: 1, otp_expires: 1 });
ResourceSchema.index({ current_session_token: 1 });
ResourceSchema.index({ last_activity: 1 });

// ═══════════════════════════════════════════════════════════════
// PRE-SAVE: Normalize email
// ═══════════════════════════════════════════════════════════════
ResourceSchema.pre('save', function(next) {
  if (this.email) {
    this.email_normalized = this.email.toLowerCase().trim();
  }
  next();
});

// ═══════════════════════════════════════════════════════════════
// STATIC: Upsert by email (main method for CSV uploads)
// Preserves ObjectId for existing resources
// ═══════════════════════════════════════════════════════════════
ResourceSchema.statics.upsertByEmail = async function(email, updateData) {
  const normalizedEmail = email.toLowerCase().trim();
  
  const result = await this.findOneAndUpdate(
    { email_normalized: normalizedEmail },
    { 
      $set: { 
        ...updateData, 
        email: normalizedEmail,
        email_normalized: normalizedEmail,
        status: 'active',
        deactivated_at: null,
        deactivated_reason: null
      } 
    },
    { 
      upsert: true, 
      new: true, 
      runValidators: true,
      setDefaultsOnInsert: true
    }
  );
  
  return result;
};

// ═══════════════════════════════════════════════════════════════
// STATIC: Find by normalized email
// ═══════════════════════════════════════════════════════════════
ResourceSchema.statics.findByEmail = async function(email) {
  const normalizedEmail = email.toLowerCase().trim();
  return this.findOne({ email_normalized: normalizedEmail });
};

// ═══════════════════════════════════════════════════════════════
// STATIC: Soft delete resources not in the upload list
// ═══════════════════════════════════════════════════════════════
ResourceSchema.statics.softDeleteNotInList = async function(emailList, reason = 'Not in latest upload') {
  const normalizedEmails = emailList.map(e => e.toLowerCase().trim());
  
  const result = await this.updateMany(
    { 
      email_normalized: { $nin: normalizedEmails },
      status: 'active'
    },
    { 
      $set: { 
        status: 'inactive',
        deactivated_at: new Date(),
        deactivated_reason: reason
      } 
    }
  );
  
  return result;
};

// ═══════════════════════════════════════════════════════════════
// STATIC: Get locations for a specific date
// Only returns locations assigned ON or BEFORE the target date
// ═══════════════════════════════════════════════════════════════
ResourceSchema.statics.getLocationsForDate = async function(resourceEmail, clientName, targetDate) {
  const resource = await this.findByEmail(resourceEmail);
  if (!resource) return [];
  
  const targetDateObj = new Date(targetDate);
  targetDateObj.setHours(0, 0, 0, 0);
  
  const locations = [];
  
  for (const assignment of resource.assignments) {
    if (clientName && assignment.client_name?.toLowerCase() !== clientName.toLowerCase()) {
      continue;
    }
    
    for (const sp of assignment.subprojects || []) {
      // Skip inactive/removed
      if (sp.status && sp.status !== 'active') continue;
      
      // If no assigned_date, allow access (backward compatibility)
      if (!sp.assigned_date) {
        locations.push({
          subproject_id: sp.subproject_id,
          subproject_name: sp.subproject_name,
          subproject_key: sp.subproject_key,
          assigned_date: null,
          project_id: assignment.project_id,
          project_name: assignment.project_name,
          client_id: assignment.client_id,
          client_name: assignment.client_name,
          geography_id: assignment.geography_id,
          geography_name: assignment.geography_name
        });
        continue;
      }
      
      const assignedDate = new Date(sp.assigned_date);
      assignedDate.setHours(0, 0, 0, 0);
      
      // Only include if assigned_date <= targetDate
      if (assignedDate <= targetDateObj) {
        locations.push({
          subproject_id: sp.subproject_id,
          subproject_name: sp.subproject_name,
          subproject_key: sp.subproject_key,
          assigned_date: sp.assigned_date,
          project_id: assignment.project_id,
          project_name: assignment.project_name,
          client_id: assignment.client_id,
          client_name: assignment.client_name,
          geography_id: assignment.geography_id,
          geography_name: assignment.geography_name
        });
      }
    }
  }
  
  return locations;
};

// ═══════════════════════════════════════════════════════════════
// STATIC: Add assignment with assigned_date
// ═══════════════════════════════════════════════════════════════
ResourceSchema.statics.addAssignment = async function(resourceEmail, assignmentData, assignedBy) {
  const resource = await this.findByEmail(resourceEmail);
  if (!resource) throw new Error('Resource not found');
  
  const {
    geography_id, geography_name,
    client_id, client_name,
    project_id, project_name,
    subproject_id, subproject_name, subproject_key,
    assigned_date
  } = assignmentData;
  
  // Find or create client-level assignment
  let clientAssignment = resource.assignments.find(
    a => a.client_id?.toString() === client_id?.toString() && 
         a.project_id?.toString() === project_id?.toString()
  );
  
  if (!clientAssignment) {
    resource.assignments.push({
      geography_id,
      geography_name,
      client_id,
      client_name,
      project_id,
      project_name,
      subprojects: []
    });
    clientAssignment = resource.assignments[resource.assignments.length - 1];
  }
  
  // Check if subproject already exists
  const existingSubproject = clientAssignment.subprojects.find(
    sp => sp.subproject_id?.toString() === subproject_id?.toString()
  );
  
  if (existingSubproject) {
    // Reactivate if removed
    if (existingSubproject.status === 'removed') {
      existingSubproject.status = 'active';
      existingSubproject.assigned_date = assigned_date || new Date();
      existingSubproject.assigned_by = assignedBy;
      existingSubproject.removed_date = undefined;
      existingSubproject.removed_by = undefined;
    }
    // If already active, don't change assigned_date
  } else {
    // Add new subproject
    clientAssignment.subprojects.push({
      subproject_id,
      subproject_name,
      subproject_key,
      assigned_date: assigned_date || new Date(),
      assigned_by: assignedBy,
      status: 'active'
    });
  }
  
  resource.updated_by = assignedBy;
  await resource.save();
  
  return resource;
};

// ═══════════════════════════════════════════════════════════════
// STATIC: Remove assignment (soft delete)
// ═══════════════════════════════════════════════════════════════
ResourceSchema.statics.removeAssignment = async function(resourceEmail, subprojectId, removedBy) {
  const resource = await this.findByEmail(resourceEmail);
  if (!resource) throw new Error('Resource not found');
  
  for (const assignment of resource.assignments) {
    const sp = assignment.subprojects.find(
      s => s.subproject_id?.toString() === subprojectId?.toString()
    );
    
    if (sp) {
      sp.status = 'removed';
      sp.removed_date = new Date();
      sp.removed_by = removedBy;
      break;
    }
  }
  
  resource.updated_by = removedBy;
  await resource.save();
  
  return resource;
};

// Static method to check if can send OTP
ResourceSchema.statics.canSendOTP = function (resource) {
  if (!resource.otp_last_sent) return true;

  const COOLDOWN_MS = 20 * 1000; // 🔥 20 seconds
  const now = Date.now();
  const lastSent = resource.otp_last_sent.getTime();

  // guard against future timestamps
  if (lastSent > now) return true;

  return now - lastSent >= COOLDOWN_MS;
};

// Static method to invalidate expired sessions
ResourceSchema.statics.invalidateExpiredSessions = async function() {
  const defaultTimeoutMinutes = 10;
  const cutoffTime = new Date(Date.now() - defaultTimeoutMinutes * 60 * 1000);
  
  const result = await this.updateMany(
    {
      last_activity: { $lt: cutoffTime },
      current_session_token: { $exists: true, $ne: null }
    },
    {
      $unset: {
        current_session_token: 1,
        session_expires: 1,
        last_activity: 1
      }
    }
  );
  
  return result;
};

// ═══════════════════════════════════════════════════════════════
// INSTANCE METHODS
// ═══════════════════════════════════════════════════════════════

// Method to generate OTP
ResourceSchema.methods.generateOTP = function() {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  this.otp = otp;
  this.otp_expires = new Date(Date.now() + 10 * 60 * 1000);
  this.otp_attempts = 0;
  this.otp_last_sent = new Date();
  return otp;
};

// Method to verify OTP
ResourceSchema.methods.verifyOTP = function(inputOTP) {
  if (!this.otp || !this.otp_expires) {
    return { valid: false, message: 'No OTP requested. Please request a new OTP.' };
  }
  
  if (new Date() > this.otp_expires) {
    return { valid: false, message: 'OTP has expired. Please request a new OTP.' };
  }
  
  if (this.otp_attempts >= 3) {
    return { valid: false, message: 'Too many failed attempts. Please request a new OTP.' };
  }
  
  if (this.otp !== inputOTP) {
    this.otp_attempts += 1;
    return { valid: false, message: `Invalid OTP. ${3 - this.otp_attempts} attempts remaining.` };
  }
  
  this.otp = undefined;
  this.otp_expires = undefined;
  this.otp_attempts = 0;
  
  return { valid: true, message: 'OTP verified successfully' };
};

// Method to record login activity
ResourceSchema.methods.recordLogin = function(loginData = {}) {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  
  this.login_count += 1;
  this.total_logins += 1;
  this.last_login = now;
  this.last_activity = now;
  
  const loginEntry = {
    login_time: now,
    ip_address: loginData.ip_address || 'unknown',
    user_agent: loginData.user_agent || 'unknown',
    device_info: loginData.device_info || 'unknown',
    location: loginData.location || 'unknown',
    status: 'success'
  };
  
  this.login_history.unshift(loginEntry);
  if (this.login_history.length > 50) {
    this.login_history = this.login_history.slice(0, 50);
  }
  
  const monthlyIndex = this.monthly_logins.findIndex(
    m => m.month === currentMonth && m.year === currentYear
  );
  
  if (monthlyIndex >= 0) {
    this.monthly_logins[monthlyIndex].count += 1;
    this.monthly_logins[monthlyIndex].last_login = now;
  } else {
    this.monthly_logins.push({
      month: currentMonth,
      year: currentYear,
      count: 1,
      first_login: now,
      last_login: now
    });
  }
  
  if (this.monthly_logins.length > 12) {
    this.monthly_logins = this.monthly_logins.slice(-12);
  }
};

// Method to update last activity
ResourceSchema.methods.updateActivity = function() {
  this.last_activity = new Date();
};

// Method to check if session is still valid
ResourceSchema.methods.isSessionValid = function() {
  if (!this.last_activity) {
    return false;
  }
  
  const now = new Date();
  const timeoutMs = (this.session_timeout_minutes || 10) * 60 * 1000;
  const timeSinceActivity = now.getTime() - this.last_activity.getTime();
  
  return timeSinceActivity < timeoutMs;
};

// Method to get remaining session time in seconds
ResourceSchema.methods.getRemainingSessionTime = function() {
  if (!this.last_activity) {
    return 0;
  }
  
  const now = new Date();
  const timeoutMs = (this.session_timeout_minutes || 10) * 60 * 1000;
  const timeSinceActivity = now.getTime() - this.last_activity.getTime();
  const remainingMs = timeoutMs - timeSinceActivity;
  
  return Math.max(0, Math.floor(remainingMs / 1000));
};

// Method to invalidate session
ResourceSchema.methods.invalidateSession = function() {
  this.current_session_token = undefined;
  this.session_expires = undefined;
  this.last_activity = undefined;
};

// Method to check if resource has access to a specific subproject
ResourceSchema.methods.hasAccessToSubproject = function(subprojectId) {
  const subprojectIdStr = subprojectId.toString();
  return this.assignments.some(assignment => 
    assignment.subprojects.some(sp => 
      sp.subproject_id && 
      sp.subproject_id.toString() === subprojectIdStr &&
      sp.status !== 'removed'
    )
  );
};

// ═══════════════════════════════════════════════════════════════
// METHOD: Check if resource has access to location FOR A SPECIFIC DATE
// ═══════════════════════════════════════════════════════════════
ResourceSchema.methods.hasAccessToSubprojectForDate = function(subprojectId, targetDate) {
  const subprojectIdStr = subprojectId.toString();
  const targetDateObj = new Date(targetDate);
  targetDateObj.setHours(0, 0, 0, 0);
  
  for (const assignment of this.assignments) {
    for (const sp of assignment.subprojects || []) {
      if (!sp.subproject_id || sp.subproject_id.toString() !== subprojectIdStr) continue;
      if (sp.status === 'removed') continue;
      
      // If no assigned_date, allow access (backward compatibility)
      if (!sp.assigned_date) return true;
      
      const assignedDate = new Date(sp.assigned_date);
      assignedDate.setHours(0, 0, 0, 0);
      
      // Can only access if assigned_date <= targetDate
      if (assignedDate <= targetDateObj) return true;
    }
  }
  
  return false;
};

// ═══════════════════════════════════════════════════════════════
// METHOD: Get assignment date for a subproject
// ═══════════════════════════════════════════════════════════════
ResourceSchema.methods.getAssignmentDate = function(subprojectId) {
  const subprojectIdStr = subprojectId.toString();
  
  for (const assignment of this.assignments) {
    for (const sp of assignment.subprojects || []) {
      if (sp.subproject_id && sp.subproject_id.toString() === subprojectIdStr) {
        return sp.assigned_date || null;
      }
    }
  }
  
  return null;
};

// Method to check access by subproject_key (business key)
ResourceSchema.methods.hasAccessToSubprojectByKey = function(subprojectKey) {
  return this.assignments.some(assignment => 
    assignment.subprojects.some(sp => 
      sp.subproject_key === subprojectKey && sp.status !== 'removed'
    )
  );
};

// Method to get all accessible subproject IDs
ResourceSchema.methods.getAccessibleSubprojectIds = function() {
  const ids = [];
  this.assignments.forEach(assignment => {
    assignment.subprojects.forEach(sp => {
      if (sp.subproject_id && sp.status !== 'removed') {
        ids.push(sp.subproject_id);
      }
    });
  });
  return ids;
};

// ═══════════════════════════════════════════════════════════════
// METHOD: Get accessible subprojects for a specific date
// ═══════════════════════════════════════════════════════════════
ResourceSchema.methods.getAccessibleSubprojectsForDate = function(targetDate, clientName = null) {
  const targetDateObj = new Date(targetDate);
  targetDateObj.setHours(0, 0, 0, 0);
  
  const subprojects = [];
  
  for (const assignment of this.assignments) {
    if (clientName && assignment.client_name?.toLowerCase() !== clientName.toLowerCase()) {
      continue;
    }
    
    for (const sp of assignment.subprojects || []) {
      if (sp.status === 'removed') continue;
      
      // If no assigned_date, include it (backward compatibility)
      if (!sp.assigned_date) {
        subprojects.push({
          subproject_id: sp.subproject_id,
          subproject_name: sp.subproject_name,
          subproject_key: sp.subproject_key,
          assigned_date: null,
          project_name: assignment.project_name,
          client_name: assignment.client_name
        });
        continue;
      }
      
      const assignedDate = new Date(sp.assigned_date);
      assignedDate.setHours(0, 0, 0, 0);
      
      if (assignedDate <= targetDateObj) {
        subprojects.push({
          subproject_id: sp.subproject_id,
          subproject_name: sp.subproject_name,
          subproject_key: sp.subproject_key,
          assigned_date: sp.assigned_date,
          project_name: assignment.project_name,
          client_name: assignment.client_name
        });
      }
    }
  }
  
  return subprojects;
};

// Method to get all accessible subproject keys
ResourceSchema.methods.getAccessibleSubprojectKeys = function() {
  const keys = [];
  this.assignments.forEach(assignment => {
    assignment.subprojects.forEach(sp => {
      if (sp.subproject_key && sp.status !== 'removed') {
        keys.push(sp.subproject_key);
      }
    });
  });
  return keys;
};

module.exports = mongoose.model('Resource', ResourceSchema);