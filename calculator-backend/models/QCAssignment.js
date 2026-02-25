// models/QCAssignment.js - QC (Quality Control) assignment model
// Stores QC review tasks assigned to resources for reviewing another resource's logged cases
const mongoose = require('mongoose');

const QCAssignmentSchema = new mongoose.Schema({
  // ============ REFERENCE TO ORIGINAL CASE ============
  original_allocation_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  // Which allocation collection the original case lives in
  client_type: {
    type: String,
    enum: ['MRO', 'Verisma', 'Datavant'],
    required: true,
    index: true
  },

  // ============ ORIGINAL CASE SNAPSHOT (denormalized for display) ============
  sr_no: { type: Number },
  original_allocation_date: { type: Date, required: true },  // "Actual Date of logging"
  original_resource_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource' },
  original_resource_name: { type: String, required: true },  // "Assigner Name"
  original_resource_email: { type: String, required: true, lowercase: true },

  // Hierarchy from original case
  geography_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Geography' },
  geography_name: { type: String },
  client_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
  client_name: { type: String },
  project_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
  project_name: { type: String },
  subproject_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Subproject' },
  subproject_name: { type: String },  // "Location"

  // Original case fields
  request_id: { type: String, default: '' },
  request_type: { type: String, default: '' },
  requestor_type: { type: String, default: '' },
  process_type: { type: String, default: '' },  // "Process"
  facility_name: { type: String, default: '' },

  // Editable by resource during QC review
  duplicate_code: { type: String, default: '', index: true },

  // ============ QC ASSIGNMENT INFO ============
  assigned_to_resource_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Resource',
    required: true,
    index: true
  },
  assigned_to_resource_name: { type: String, required: true },
  assigned_to_resource_email: { type: String, required: true, lowercase: true, index: true },

  assigned_by_admin_id: { type: mongoose.Schema.Types.ObjectId },
  assigned_by_admin_email: { type: String },
  assigned_at: { type: Date, default: Date.now },

  // ============ QC RESULT FIELDS (filled by QC resource) ============
  qc_date: { type: Date },
  qc_done_by: { type: String, default: '' },

  qc_request_type: { type: String, default: '' },   // "Request Type" - Key / Duplicate (QC finding)
  qc_action_taken: { type: String, default: '' },    // "Action Taken"
  qc_error_type: { type: String, default: '' },      // "Type of Error"
  qc_remark: { type: String, default: '' },          // "Remark"
  qc_code: { type: String, default: '' },            // "Code"

  // ============ STATUS ============
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed'],
    default: 'pending',
    index: true
  },
  completed_at: { type: Date },

  // ============ MONTH/YEAR for querying ============
  month: { type: Number, min: 1, max: 12, index: true },
  year: { type: Number, index: true },

  is_deleted: { type: Boolean, default: false, index: true }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// ============ INDEXES ============
QCAssignmentSchema.index({ assigned_to_resource_email: 1, status: 1 });
QCAssignmentSchema.index({ assigned_to_resource_email: 1, client_type: 1 });
QCAssignmentSchema.index({ original_allocation_id: 1, assigned_to_resource_id: 1 }, { unique: true });
QCAssignmentSchema.index({ original_resource_email: 1, original_allocation_date: 1, client_type: 1 });
QCAssignmentSchema.index({ month: 1, year: 1 });

// ============ PRE-SAVE ============
QCAssignmentSchema.pre('save', function(next) {
  // Extract month/year from original allocation date
  if (this.original_allocation_date) {
    const d = new Date(this.original_allocation_date);
    this.month = d.getMonth() + 1;
    this.year = d.getFullYear();
  }

  next();
});

module.exports = mongoose.model('QCAssignment', QCAssignmentSchema);
