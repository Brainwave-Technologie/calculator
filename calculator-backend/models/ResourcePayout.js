// models/ResourcePayout.js
const mongoose = require('mongoose');

const ResourcePayoutSchema = new mongoose.Schema({
  // Resource identification
  resource_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource', required: true },
  resource_name: { type: String, required: true },
  resource_email: { type: String },
  
  // Time period
  month: { type: Number, required: true },
  year: { type: Number, required: true },
  
  // ============ PROCESSING PAYOUT (Fixed Rate) ============
  // Verisma Processing
  verisma_processing_cases: { type: Number, default: 0 },
  verisma_processing_amount: { type: Number, default: 0 },
  verisma_processing_breakdown: [{
    subproject_id: mongoose.Schema.Types.ObjectId,
    subproject_name: String,
    location_name: String,
    cases: Number,
    rate: Number,
    amount: Number
  }],
  
  // MRO Processing
  mro_processing_cases: { type: Number, default: 0 },
  mro_processing_amount: { type: Number, default: 0 },
  mro_processing_breakdown: [{
    subproject_id: mongoose.Schema.Types.ObjectId,
    subproject_name: String,
    location_name: String,
    cases: Number,
    rate: Number,
    amount: Number
  }],
  
  // Datavant Processing
  datavant_processing_cases: { type: Number, default: 0 },
  datavant_processing_amount: { type: Number, default: 0 },
  datavant_processing_breakdown: [{
    subproject_id: mongoose.Schema.Types.ObjectId,
    subproject_name: String,
    location_name: String,
    cases: Number,
    rate: Number,
    amount: Number
  }],
  
  // ============ LOGGING PAYOUT (Slab-based) ============
  // Combined logging from Verisma + MRO
  total_logging_cases: { type: Number, default: 0 },
  total_logging_hours: { type: Number, default: 0 },
  total_working_days: { type: Number, default: 0 },
  avg_cases_per_hour: { type: Number, default: 0 },
  
  // Slab determination
  logging_slab_min: { type: Number },
  logging_slab_max: { type: Number },
  logging_rate_per_case: { type: Number, default: 0 },
  logging_base_amount: { type: Number, default: 0 },
  
  // Logging breakdown by client
  verisma_logging_cases: { type: Number, default: 0 },
  mro_logging_cases: { type: Number, default: 0 },
  datavant_logging_cases: { type: Number, default: 0 },
  
  // ============ COMPLETE LOGGING BONUS ============
  // Complete logging cases are already counted in logging, but get bonus
  complete_logging_cases: { type: Number, default: 0 },
  complete_logging_bonus_rate: { type: Number, default: 0 }, // 0.65 - slab_rate
  complete_logging_bonus_amount: { type: Number, default: 0 },
  
  // ============ TOTALS ============
  total_processing_amount: { type: Number, default: 0 },
  total_logging_amount: { type: Number, default: 0 },
  total_bonus_amount: { type: Number, default: 0 },
  grand_total_payout: { type: Number, default: 0 },
  
  // ============ DAY-WISE BREAKDOWN ============
  // For generating the day-wise report
  daily_breakdown: [{
    date: Date,
    day_name: String,
    verisma_cases: { type: Number, default: 0 },
    mro_cases: { type: Number, default: 0 },
    datavant_cases: { type: Number, default: 0 },
    hours_worked: { type: Number, default: 0 },
    total_cases: { type: Number, default: 0 }
  }],
  
  // Status
  status: { 
    type: String, 
    enum: ['draft', 'calculated', 'approved', 'paid'],
    default: 'calculated'
  },
  calculated_at: { type: Date, default: Date.now },
  approved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approved_at: { type: Date },
  
  notes: { type: String }
  
}, { timestamps: true });

// Unique constraint - one payout record per resource per month
ResourcePayoutSchema.index(
  { resource_id: 1, month: 1, year: 1 },
  { unique: true }
);

// Query indexes
ResourcePayoutSchema.index({ month: 1, year: 1, status: 1 });
ResourcePayoutSchema.index({ grand_total_payout: -1 });

module.exports = mongoose.model('ResourcePayout', ResourcePayoutSchema);