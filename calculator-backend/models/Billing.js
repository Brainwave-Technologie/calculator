// models/Billing.js
// Updated Billing model that integrates with VerismaDailyAllocation and MRODailyAllocation
// Used by Costing/Billing dashboards

const mongoose = require('mongoose');

const BillingSchema = new mongoose.Schema({
  // ═══════════════════════════════════════════════════════════════
  // HIERARCHY IDs
  // ═══════════════════════════════════════════════════════════════
  geography_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Geography' },
  client_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
  project_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
  subproject_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Subproject', required: true },
  
  // Denormalized names for quick display
  geography_name: { type: String, default: '' },
  client_name: { type: String, required: true }, // 'Verisma', 'MRO', 'Datavant'
  project_name: { type: String, default: '' },   // 'Processing', 'Logging', etc.
  subproject_name: { type: String, default: '' }, // Location name
  
  // ═══════════════════════════════════════════════════════════════
  // RESOURCE INFORMATION
  // ═══════════════════════════════════════════════════════════════
  resource_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource', required: true },
  resource_name: { type: String, required: true },
  resource_email: { type: String },
  resource_role: { type: String, default: 'Associate' },
  
  // ═══════════════════════════════════════════════════════════════
  // REQUEST/PROCESS TYPES
  // ═══════════════════════════════════════════════════════════════
  request_type: { 
    type: String,
    enum: ['New Request', 'Key', 'Duplicate', 'Follow up', 'Batch', 'DDS', 'E-link', 'E-Request', null],
    default: null
  },
  requestor_type: { type: String, default: '' }, // MRO specific: 'NRS-NO Records', 'Manual', etc.
  process_type: { type: String, default: '' },   // 'Processing', 'Logging', 'Complete_logging'
  
  // ═══════════════════════════════════════════════════════════════
  // CASE COUNTS & HOURS (FROM ALLOCATIONS)
  // ═══════════════════════════════════════════════════════════════
  cases: { type: Number, default: 0 },           // Total cases logged
  hours: { type: Number, default: 0 },           // Hours worked (editable by admin)
  working_days: { type: Number, default: 0 },    // Days with entries
  
  // ═══════════════════════════════════════════════════════════════
  // FINANCIAL FIELDS
  // ═══════════════════════════════════════════════════════════════
  // Cost side (what we pay resource)
  rate: { type: Number, default: 0 },            // Cost rate per hour
  costing: { type: Number, default: 0 },         // hours × rate
  productivity_level: { 
    type: String, 
    enum: ['Low', 'Medium', 'High', 'Best'],
    default: 'Medium' 
  },
  
  // Revenue side (what client pays us)
  flatrate: { type: Number, default: 0 },        // Billing rate per case
  billing_rate: { type: Number, default: 0 },    // Same as flatrate (for compatibility)
  total_amount: { type: Number, default: 0 },    // cases × flatrate (revenue)
  
  // Profit
  profit: { type: Number, default: 0 },          // total_amount - costing
  
  // ═══════════════════════════════════════════════════════════════
  // BILLABLE STATUS
  // ═══════════════════════════════════════════════════════════════
  billable_status: { 
    type: String, 
    enum: ['Billable', 'Non-Billable'], 
    default: 'Billable' 
  },
  description: { type: String, default: '' },
  
  // ═══════════════════════════════════════════════════════════════
  // TIME PERIOD
  // ═══════════════════════════════════════════════════════════════
  month: { type: Number, required: true, min: 1, max: 12 },
  year: { type: Number, required: true },
  
  // ═══════════════════════════════════════════════════════════════
  // SYNC METADATA (for tracking allocation integration)
  // ═══════════════════════════════════════════════════════════════
  sync_source: { 
    type: String, 
    enum: ['verisma_daily_allocation', 'mro_daily_allocation', 'datavant_daily_allocation', 'manual'],
    default: 'manual'
  },
  last_synced_at: { type: Date },
  allocation_entry_count: { type: Number, default: 0 }, // Number of allocation entries
  
  // ═══════════════════════════════════════════════════════════════
  // INVOICE TRACKING
  // ═══════════════════════════════════════════════════════════════
  invoice_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },
  invoiced_at: { type: Date },
  is_invoiced: { type: Boolean, default: false }
  
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ═══════════════════════════════════════════════════════════════
// INDEXES
// ═══════════════════════════════════════════════════════════════

// Unique constraint: one billing record per resource-subproject-requesttype-month-year
BillingSchema.index(
  { 
    resource_id: 1,
    subproject_id: 1, 
    request_type: 1,
    month: 1, 
    year: 1
  }, 
  { 
    unique: true,
    name: 'billing_unique_key',
    partialFilterExpression: { request_type: { $ne: null } }
  }
);

// Query indexes
BillingSchema.index({ client_name: 1, month: 1, year: 1 });
BillingSchema.index({ client_id: 1, month: 1, year: 1 });
BillingSchema.index({ project_id: 1, month: 1, year: 1 });
BillingSchema.index({ resource_id: 1, month: 1, year: 1 });
BillingSchema.index({ subproject_id: 1, month: 1, year: 1 });
BillingSchema.index({ billable_status: 1 });

// ═══════════════════════════════════════════════════════════════
// VIRTUALS
// ═══════════════════════════════════════════════════════════════

BillingSchema.virtual('is_billable').get(function() {
  return this.billable_status === 'Billable';
});

BillingSchema.virtual('margin_percent').get(function() {
  if (this.total_amount === 0) return 0;
  return ((this.total_amount - this.costing) / this.total_amount * 100).toFixed(2);
});

// ═══════════════════════════════════════════════════════════════
// PRE-SAVE MIDDLEWARE
// ═══════════════════════════════════════════════════════════════

BillingSchema.pre('save', function(next) {
  // Calculate costing
  this.costing = (this.hours || 0) * (this.rate || 0);
  
  // Calculate revenue (total_amount)
  if (this.cases > 0 && this.flatrate > 0) {
    this.total_amount = this.cases * this.flatrate;
  }
  
  // Calculate profit
  this.profit = (this.total_amount || 0) - (this.costing || 0);
  
  // Sync billing_rate with flatrate
  this.billing_rate = this.flatrate;
  
  next();
});

// ═══════════════════════════════════════════════════════════════
// STATIC METHODS
// ═══════════════════════════════════════════════════════════════

/**
 * Get billing summary for a client
 */
BillingSchema.statics.getClientSummary = async function(clientName, month, year) {
  return this.aggregate([
    {
      $match: {
        client_name: clientName,
        month: month,
        year: year,
        billable_status: 'Billable'
      }
    },
    {
      $group: {
        _id: null,
        total_cases: { $sum: '$cases' },
        total_hours: { $sum: '$hours' },
        total_costing: { $sum: '$costing' },
        total_revenue: { $sum: '$total_amount' },
        total_profit: { $sum: '$profit' },
        resource_count: { $addToSet: '$resource_id' }
      }
    },
    {
      $project: {
        _id: 0,
        total_cases: 1,
        total_hours: 1,
        total_costing: 1,
        total_revenue: 1,
        total_profit: 1,
        resource_count: { $size: '$resource_count' }
      }
    }
  ]);
};

/**
 * Get billing by resource for a month
 */
BillingSchema.statics.getByResource = async function(resourceId, month, year) {
  return this.find({
    resource_id: resourceId,
    month: month,
    year: year
  }).sort({ subproject_name: 1 });
};

module.exports = mongoose.model('Billing', BillingSchema);