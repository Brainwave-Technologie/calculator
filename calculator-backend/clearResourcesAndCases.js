// scripts/clearResourcesAndCases.js
// Script to clear resources and old logged cases from database
// Usage: node scripts/clearResourcesAndCases.js [options]
//
// Options:
//   --resources    Clear all resources
//   --mro          Clear MRO daily allocations
//   --verisma      Clear Verisma daily allocations
//   --datavant     Clear Datavant daily allocations
//   --assignments  Clear all assignments
//   --activity     Clear activity logs
//   --all          Clear everything
//   --dry-run      Show what would be deleted without actually deleting
//
// Examples:
//   node scripts/clearResourcesAndCases.js --all
//   node scripts/clearResourcesAndCases.js --resources --mro
//   node scripts/clearResourcesAndCases.js --all --dry-run

const mongoose = require('mongoose');
require('dotenv').config();

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/billing_dashboard';

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  resources: args.includes('--resources') || args.includes('--all'),
  mro: args.includes('--mro') || args.includes('--all'),
  verisma: args.includes('--verisma') || args.includes('--all'),
  datavant: args.includes('--datavant') || args.includes('--all'),
  assignments: args.includes('--assignments') || args.includes('--all'),
  activity: args.includes('--activity') || args.includes('--all'),
  dryRun: args.includes('--dry-run')
};

// Check if any option is selected
const hasOption = Object.values(options).some(v => v === true);

if (!hasOption) {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║           DATABASE CLEANUP SCRIPT                              ║
╠════════════════════════════════════════════════════════════════╣
║  Usage: node scripts/clearResourcesAndCases.js [options]       ║
║                                                                ║
║  Options:                                                      ║
║    --resources    Clear all resources                          ║
║    --mro          Clear MRO daily allocations                  ║
║    --verisma      Clear Verisma daily allocations              ║
║    --datavant     Clear Datavant daily allocations             ║
║    --assignments  Clear all assignments (MRO/Verisma/Datavant) ║
║    --activity     Clear activity logs                          ║
║    --all          Clear everything                             ║
║    --dry-run      Preview without deleting                     ║
║                                                                ║
║  Examples:                                                     ║
║    node scripts/clearResourcesAndCases.js --all                ║
║    node scripts/clearResourcesAndCases.js --resources --mro    ║
║    node scripts/clearResourcesAndCases.js --all --dry-run      ║
╚════════════════════════════════════════════════════════════════╝
  `);
  process.exit(0);
}

// Colors for console
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  header: (msg) => console.log(`\n${colors.cyan}═══ ${msg} ═══${colors.reset}\n`)
};

// Define schemas inline to avoid import issues
const defineSchemas = () => {
  // Resource Schema
  const ResourceSchema = new mongoose.Schema({
    name: String,
    email: String,
    email_normalized: String,
    assignments: Array
  }, { collection: 'resources', strict: false });

  // MRO Daily Allocation Schema
  const MRODailyAllocationSchema = new mongoose.Schema({
    sr_no: Number,
    allocation_date: Date,
    resource_email: String
  }, { collection: 'mrodailyallocations', strict: false });

  // Verisma Daily Allocation Schema
  const VerismaDailyAllocationSchema = new mongoose.Schema({
    sr_no: Number,
    allocation_date: Date,
    resource_email: String
  }, { collection: 'verismadailyallocations', strict: false });

  // Datavant Daily Allocation Schema
  const DatavantDailyAllocationSchema = new mongoose.Schema({
    sr_no: Number,
    allocation_date: Date,
    resource_email: String
  }, { collection: 'datavantdailyallocations', strict: false });

  // MRO Assignment Schema
  const MROAssignmentSchema = new mongoose.Schema({
    resource_email: String,
    assignment_date: Date
  }, { collection: 'mroassignments', strict: false });

  // Verisma Assignment Schema
  const VerismaAssignmentSchema = new mongoose.Schema({
    resource_email: String,
    assignment_date: Date
  }, { collection: 'verismaassignments', strict: false });

  // Datavant Assignment Schema
  const DatavantAssignmentSchema = new mongoose.Schema({
    resource_email: String,
    assignment_date: Date
  }, { collection: 'datavantassignments', strict: false });

  // Activity Log Schema
  const ActivityLogSchema = new mongoose.Schema({
    activity_type: String,
    actor_email: String,
    log_date: Date
  }, { collection: 'activitylogs', strict: false });

  return {
    Resource: mongoose.model('Resource', ResourceSchema),
    MRODailyAllocation: mongoose.model('MRODailyAllocation', MRODailyAllocationSchema),
    VerismaDailyAllocation: mongoose.model('VerismaDailyAllocation', VerismaDailyAllocationSchema),
    DatavantDailyAllocation: mongoose.model('DatavantDailyAllocation', DatavantDailyAllocationSchema),
    MROAssignment: mongoose.model('MROAssignment', MROAssignmentSchema),
    VerismaAssignment: mongoose.model('VerismaAssignment', VerismaAssignmentSchema),
    DatavantAssignment: mongoose.model('DatavantAssignment', DatavantAssignmentSchema),
    ActivityLog: mongoose.model('ActivityLog', ActivityLogSchema)
  };
};

// Main cleanup function
async function cleanup() {
  log.header('DATABASE CLEANUP SCRIPT');
  
  if (options.dryRun) {
    log.warning('DRY RUN MODE - No data will be deleted');
  }
  
  console.log('Selected options:');
  if (options.resources) console.log('  • Resources');
  if (options.mro) console.log('  • MRO Daily Allocations');
  if (options.verisma) console.log('  • Verisma Daily Allocations');
  if (options.datavant) console.log('  • Datavant Daily Allocations');
  if (options.assignments) console.log('  • Assignments (All clients)');
  if (options.activity) console.log('  • Activity Logs');
  console.log('');

  try {
    // Connect to MongoDB
    log.info(`Connecting to MongoDB...`);
    await mongoose.connect(MONGODB_URI);
    log.success(`Connected to MongoDB`);

    const models = defineSchemas();
    const results = {
      resources: 0,
      mroAllocations: 0,
      verismaAllocations: 0,
      datavantAllocations: 0,
      mroAssignments: 0,
      verismaAssignments: 0,
      datavantAssignments: 0,
      activityLogs: 0
    };

    // Clear Resources
    if (options.resources) {
      log.header('CLEARING RESOURCES');
      const resourceCount = await models.Resource.countDocuments();
      log.info(`Found ${resourceCount} resources`);
      
      if (!options.dryRun && resourceCount > 0) {
        const result = await models.Resource.deleteMany({});
        results.resources = result.deletedCount;
        log.success(`Deleted ${result.deletedCount} resources`);
      } else if (options.dryRun) {
        results.resources = resourceCount;
        log.warning(`Would delete ${resourceCount} resources`);
      }
    }

    // Clear MRO Daily Allocations
    if (options.mro) {
      log.header('CLEARING MRO DAILY ALLOCATIONS');
      const mroCount = await models.MRODailyAllocation.countDocuments();
      log.info(`Found ${mroCount} MRO allocations`);
      
      if (!options.dryRun && mroCount > 0) {
        const result = await models.MRODailyAllocation.deleteMany({});
        results.mroAllocations = result.deletedCount;
        log.success(`Deleted ${result.deletedCount} MRO allocations`);
      } else if (options.dryRun) {
        results.mroAllocations = mroCount;
        log.warning(`Would delete ${mroCount} MRO allocations`);
      }
    }

    // Clear Verisma Daily Allocations
    if (options.verisma) {
      log.header('CLEARING VERISMA DAILY ALLOCATIONS');
      const verismaCount = await models.VerismaDailyAllocation.countDocuments();
      log.info(`Found ${verismaCount} Verisma allocations`);
      
      if (!options.dryRun && verismaCount > 0) {
        const result = await models.VerismaDailyAllocation.deleteMany({});
        results.verismaAllocations = result.deletedCount;
        log.success(`Deleted ${result.deletedCount} Verisma allocations`);
      } else if (options.dryRun) {
        results.verismaAllocations = verismaCount;
        log.warning(`Would delete ${verismaCount} Verisma allocations`);
      }
    }

    // Clear Datavant Daily Allocations
    if (options.datavant) {
      log.header('CLEARING DATAVANT DAILY ALLOCATIONS');
      const datavantCount = await models.DatavantDailyAllocation.countDocuments();
      log.info(`Found ${datavantCount} Datavant allocations`);
      
      if (!options.dryRun && datavantCount > 0) {
        const result = await models.DatavantDailyAllocation.deleteMany({});
        results.datavantAllocations = result.deletedCount;
        log.success(`Deleted ${result.deletedCount} Datavant allocations`);
      } else if (options.dryRun) {
        results.datavantAllocations = datavantCount;
        log.warning(`Would delete ${datavantCount} Datavant allocations`);
      }
    }

    // Clear Assignments
    if (options.assignments) {
      log.header('CLEARING ASSIGNMENTS');
      
      // MRO Assignments
      const mroAssignCount = await models.MROAssignment.countDocuments();
      log.info(`Found ${mroAssignCount} MRO assignments`);
      if (!options.dryRun && mroAssignCount > 0) {
        const result = await models.MROAssignment.deleteMany({});
        results.mroAssignments = result.deletedCount;
        log.success(`Deleted ${result.deletedCount} MRO assignments`);
      } else if (options.dryRun) {
        results.mroAssignments = mroAssignCount;
        log.warning(`Would delete ${mroAssignCount} MRO assignments`);
      }

      // Verisma Assignments
      const verismaAssignCount = await models.VerismaAssignment.countDocuments();
      log.info(`Found ${verismaAssignCount} Verisma assignments`);
      if (!options.dryRun && verismaAssignCount > 0) {
        const result = await models.VerismaAssignment.deleteMany({});
        results.verismaAssignments = result.deletedCount;
        log.success(`Deleted ${result.deletedCount} Verisma assignments`);
      } else if (options.dryRun) {
        results.verismaAssignments = verismaAssignCount;
        log.warning(`Would delete ${verismaAssignCount} Verisma assignments`);
      }

      // Datavant Assignments
      const datavantAssignCount = await models.DatavantAssignment.countDocuments();
      log.info(`Found ${datavantAssignCount} Datavant assignments`);
      if (!options.dryRun && datavantAssignCount > 0) {
        const result = await models.DatavantAssignment.deleteMany({});
        results.datavantAssignments = result.deletedCount;
        log.success(`Deleted ${result.deletedCount} Datavant assignments`);
      } else if (options.dryRun) {
        results.datavantAssignments = datavantAssignCount;
        log.warning(`Would delete ${datavantAssignCount} Datavant assignments`);
      }
    }

    // Clear Activity Logs
    if (options.activity) {
      log.header('CLEARING ACTIVITY LOGS');
      const activityCount = await models.ActivityLog.countDocuments();
      log.info(`Found ${activityCount} activity logs`);
      
      if (!options.dryRun && activityCount > 0) {
        const result = await models.ActivityLog.deleteMany({});
        results.activityLogs = result.deletedCount;
        log.success(`Deleted ${result.deletedCount} activity logs`);
      } else if (options.dryRun) {
        results.activityLogs = activityCount;
        log.warning(`Would delete ${activityCount} activity logs`);
      }
    }

    // Summary
    log.header('CLEANUP SUMMARY');
    console.log(`
┌────────────────────────────────┬──────────────┐
│ Collection                     │ ${options.dryRun ? 'Would Delete' : 'Deleted'}     │
├────────────────────────────────┼──────────────┤
│ Resources                      │ ${String(results.resources).padStart(10)} │
│ MRO Daily Allocations          │ ${String(results.mroAllocations).padStart(10)} │
│ Verisma Daily Allocations      │ ${String(results.verismaAllocations).padStart(10)} │
│ Datavant Daily Allocations     │ ${String(results.datavantAllocations).padStart(10)} │
│ MRO Assignments                │ ${String(results.mroAssignments).padStart(10)} │
│ Verisma Assignments            │ ${String(results.verismaAssignments).padStart(10)} │
│ Datavant Assignments           │ ${String(results.datavantAssignments).padStart(10)} │
│ Activity Logs                  │ ${String(results.activityLogs).padStart(10)} │
├────────────────────────────────┼──────────────┤
│ TOTAL                          │ ${String(
      results.resources + 
      results.mroAllocations + 
      results.verismaAllocations + 
      results.datavantAllocations +
      results.mroAssignments +
      results.verismaAssignments +
      results.datavantAssignments +
      results.activityLogs
    ).padStart(10)} │
└────────────────────────────────┴──────────────┘
    `);

    if (options.dryRun) {
      log.warning('This was a DRY RUN - No data was actually deleted');
      log.info('Remove --dry-run flag to perform actual deletion');
    } else {
      log.success('Cleanup completed successfully!');
    }

  } catch (error) {
    log.error(`Error during cleanup: ${error.message}`);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    log.info('Disconnected from MongoDB');
  }
}

// Confirmation prompt for non-dry-run
async function confirmAndRun() {
  if (options.dryRun) {
    await cleanup();
    return;
  }

  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log(`
${colors.red}╔════════════════════════════════════════════════════════════════╗
║                        ⚠ WARNING ⚠                              ║
║                                                                 ║
║  This will PERMANENTLY DELETE data from your database!          ║
║  This action cannot be undone.                                  ║
║                                                                 ║
║  Use --dry-run to preview what would be deleted.                ║
╚════════════════════════════════════════════════════════════════╝${colors.reset}
  `);

  rl.question(`${colors.yellow}Are you sure you want to proceed? (type 'yes' to confirm): ${colors.reset}`, async (answer) => {
    rl.close();
    
    if (answer.toLowerCase() === 'yes') {
      await cleanup();
    } else {
      log.info('Cleanup cancelled');
    }
    
    process.exit(0);
  });
}

// Run the script
confirmAndRun();