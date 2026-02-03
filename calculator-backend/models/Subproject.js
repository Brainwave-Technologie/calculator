// models/Subproject.js - Updated with business key for data persistence
const mongoose = require('mongoose');

const SubprojectSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String },
  status: { 
    type: String, 
    enum: ['active', 'inactive'],
    default: 'active',
    index: true
  },
  
  // Track when subproject was deactivated (for soft delete)
  deactivated_at: { type: Date },
  
  // Hierarchical references (ObjectIds for joins)
  project_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  client_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
  geography_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Geography', required: true },
  
  // Denormalized fields for queries without joins
  project_name: { type: String },
  client_name: { type: String },
  geography_name: { type: String },
  
  // ═══════════════════════════════════════════════════════════════
  // BUSINESS KEY - Unique identifier that survives re-uploads
  // Format: "clientname|projectname|subprojectname" (all lowercase)
  // This is the STABLE key used for linking DailyAllocations
  // ═══════════════════════════════════════════════════════════════
  business_key: { 
    type: String, 
    unique: true, 
    sparse: true,
    index: true 
  },
  
  // Billing - flat rate (for Logging, Verisma, etc.)
  flatrate: { type: Number, default: 0 },
  
  // MRO-specific: Requestor type rates stored here for quick access
  // These are also stored in SubprojectRequestorType collection
  billing_rates: [{
    requestor_type: { type: String },
    rate: { type: Number, default: 0 }
  }]
  
}, { timestamps: { createdAt: 'created_on', updatedAt: 'updated_at' } });

// ═══════════════════════════════════════════════════════════════
// INDEXES
// ═══════════════════════════════════════════════════════════════
SubprojectSchema.index({ project_id: 1, name: 1 }, { unique: true });
SubprojectSchema.index({ business_key: 1 }, { unique: true, sparse: true });
SubprojectSchema.index({ client_id: 1, status: 1 });

// ═══════════════════════════════════════════════════════════════
// STATIC: Generate business key from names
// ═══════════════════════════════════════════════════════════════
SubprojectSchema.statics.generateBusinessKey = function(clientName, projectName, subprojectName) {
  return [
    (clientName || '').toLowerCase().trim(),
    (projectName || '').toLowerCase().trim(),
    (subprojectName || '').toLowerCase().trim()
  ].join('|');
};

// ═══════════════════════════════════════════════════════════════
// PRE-SAVE: Auto-generate business key
// ═══════════════════════════════════════════════════════════════
SubprojectSchema.pre('save', function(next) {
  if (this.client_name && this.project_name && this.name) {
    this.business_key = [
      this.client_name.toLowerCase().trim(),
      this.project_name.toLowerCase().trim(),
      this.name.toLowerCase().trim()
    ].join('|');
  }
  next();
});

// ═══════════════════════════════════════════════════════════════
// STATIC: Upsert by business key (main method for CSV uploads)
// Preserves ObjectId for existing subprojects
// ═══════════════════════════════════════════════════════════════
SubprojectSchema.statics.upsertByBusinessKey = async function(
  clientName, 
  projectName, 
  subprojectName, 
  additionalData = {}
) {
  const businessKey = this.generateBusinessKey(clientName, projectName, subprojectName);
  
  const result = await this.findOneAndUpdate(
    { business_key: businessKey },
    { 
      $set: { 
        name: subprojectName.trim(),
        client_name: clientName.trim(),
        project_name: projectName.trim(),
        business_key: businessKey,
        status: 'active',
        deactivated_at: null,
        ...additionalData
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
// STATIC: Find by business key
// ═══════════════════════════════════════════════════════════════
SubprojectSchema.statics.findByBusinessKey = async function(clientName, projectName, subprojectName) {
  const businessKey = this.generateBusinessKey(clientName, projectName, subprojectName);
  return this.findOne({ business_key: businessKey });
};

// ═══════════════════════════════════════════════════════════════
// STATIC: Soft delete subprojects not in upload list
// ═══════════════════════════════════════════════════════════════
SubprojectSchema.statics.softDeleteNotInList = async function(businessKeyList, clientName = null) {
  const query = {
    business_key: { $nin: businessKeyList },
    status: 'active'
  };
  
  // Optionally scope to a specific client
  if (clientName) {
    query.client_name = { $regex: new RegExp(`^${clientName}$`, 'i') };
  }
  
  const result = await this.updateMany(
    query,
    { 
      $set: { 
        status: 'inactive',
        deactivated_at: new Date()
      } 
    }
  );
  
  return result;
};

// ═══════════════════════════════════════════════════════════════
// STATIC: Get rate for a requestor type
// ═══════════════════════════════════════════════════════════════
SubprojectSchema.statics.getRate = async function(subprojectId, requestorType) {
  const subproject = await this.findById(subprojectId);
  if (!subproject) return 0;
  
  // Check billing_rates array first
  const rateEntry = subproject.billing_rates?.find(r => r.requestor_type === requestorType);
  if (rateEntry) return rateEntry.rate;
  
  // Fall back to flatrate for Logging
  if (requestorType === 'Logging' || !requestorType) {
    return subproject.flatrate || 0;
  }
  
  return 0;
};

// ═══════════════════════════════════════════════════════════════
// STATIC: Get rate by business key
// ═══════════════════════════════════════════════════════════════
SubprojectSchema.statics.getRateByBusinessKey = async function(businessKey, requestorType) {
  const subproject = await this.findOne({ business_key: businessKey });
  if (!subproject) return 0;
  
  const rateEntry = subproject.billing_rates?.find(r => r.requestor_type === requestorType);
  if (rateEntry) return rateEntry.rate;
  
  return subproject.flatrate || 0;
};

// ═══════════════════════════════════════════════════════════════
// INSTANCE: Update billing rate
// ═══════════════════════════════════════════════════════════════
SubprojectSchema.methods.updateBillingRate = async function(requestorType, rate) {
  const existingIndex = this.billing_rates.findIndex(r => r.requestor_type === requestorType);
  
  if (existingIndex >= 0) {
    this.billing_rates[existingIndex].rate = rate;
  } else {
    this.billing_rates.push({ requestor_type: requestorType, rate });
  }
  
  return this.save();
};

module.exports = mongoose.model('Subproject', SubprojectSchema);