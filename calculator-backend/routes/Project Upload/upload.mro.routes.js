// routes/upload-mro.routes.js - MRO-specific Bulk Upload with UPSERT logic (preserves IDs)
const express = require("express");
const router = express.Router();
const multer = require("multer");
const csv = require("csv-parser");
const fs = require("fs");
const { Parser } = require("json2csv");
const mongoose = require("mongoose");

const Geography = require("../../models/Geography");
const Client = require("../../models/Client");
const Project = require("../../models/Project");
const Subproject = require("../../models/Subproject");
const SubprojectRequestType = require("../../models/SubprojectRequestType");
const SubprojectRequestorType = require("../../models/SubprojectRequestorType");
const Resource = require("../../models/Resource");

const upload = multer({ dest: "uploads/" });

const norm = (s) => (typeof s === "string" ? s.trim() : "");

function normalizeName(name) {
  return name.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

// Helper to escape regex special characters
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================
// MRO CONSTANTS
// ============================================
const MRO_PROCESS_TYPES = ['Processing', 'Logging', 'MRO Payer Project'];

const MRO_REQUEST_TYPES = [
  'Batch', 'DDS', 'E-link', 'E-Request', 'Follow up', 'New Request'
];

const MRO_REQUESTOR_TYPES = [
  'NRS-NO Records',
  'Manual',
  'Other Processing (Canceled/Released By Other)',
  'Processed',
  'Processed through File Drop'
];

const MRO_DEFAULT_PRICING = {
  'Processing': {
    'NRS-NO Records': 2.25,
    'Other Processing (Canceled/Released By Other)': 0,
    'Processed': 0,
    'Processed through File Drop': 0,
    'Manual': 3.00
  },
  'Logging': {
    'flatrate': 1.08
  },
  'MRO Payer Project': {
    'flatrate': 0
  }
};

// ============================================
// HELPER: Generate business key
// ============================================
function generateBusinessKey(clientName, projectName, subprojectName) {
  return [
    (clientName || '').toLowerCase().trim(),
    (projectName || '').toLowerCase().trim(),
    (subprojectName || '').toLowerCase().trim()
  ].join('|');
}

// =============================================
// MRO BULK UPLOAD - UPSERT MODE
// Preserves existing IDs, updates rates/assignments
// =============================================
router.post("/mro-bulk-upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const filePath = req.file.path;
  const rows = [];

  try {
    console.log("⏱️ MRO Bulk Upload (UPSERT mode) started...");

    // 1. Read CSV
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(
          csv({
            mapHeaders: ({ header }) => {
              const h = header.toLowerCase().trim();
              if (h.includes("geography")) return "geography";
              if (h.includes("client")) return "client";
              if (h.includes("location") || h.includes("subproject")) return "location";
              if (h.includes("process") && h.includes("type")) return "process_type";
              if (h.includes("nrs") && h.includes("rate")) return "nrs_rate";
              if (h.includes("other") && h.includes("rate")) return "other_processing_rate";
              if (h === "processed rate" || h === "processed_rate") return "processed_rate";
              if (h.includes("file drop") && h.includes("rate")) return "file_drop_rate";
              if (h.includes("manual") && h.includes("rate")) return "manual_rate";
              if (h === "payout_rate" || h === "payout rate") return "payout_rate";
              if (h === "flatrate" || h === "flat rate" || h === "billing_rate" || h === "billing rate" || (h.includes("logging") && h.includes("rate"))) return "flatrate";
              return header;
            },
          })
        )
        .on("data", (row) => {
          if (Object.values(row).every((v) => !v)) return;
          rows.push(row);
        })
        .on("end", resolve)
        .on("error", reject);
    });

    console.log(`📄 Read ${rows.length} rows from CSV`);

    // 2. Validate rows
    const errors = [];
    const validRows = [];
    const csvDuplicateCheck = new Set();

    rows.forEach((r, idx) => {
      const geography = norm(r.geography) || "US";
      const client = norm(r.client) || "MRO";
      const location = norm(r.location);
      let process_type = norm(r.process_type);

      const nrs_rate = parseFloat(r.nrs_rate) || MRO_DEFAULT_PRICING.Processing['NRS-NO Records'];
      const other_processing_rate = parseFloat(r.other_processing_rate) || 0;
      const processed_rate = parseFloat(r.processed_rate) || 0;
      const file_drop_rate = parseFloat(r.file_drop_rate) || 0;
      const manual_rate = parseFloat(r.manual_rate) || MRO_DEFAULT_PRICING.Processing['Manual'];
      const payout_rate = parseFloat(r.payout_rate) || 0;
      const flatrate = parseFloat(r.flatrate) || MRO_DEFAULT_PRICING.Logging.flatrate;

      const rowOut = {
        __row: idx + 1,
        geography,
        client,
        location,
        process_type,
        nrs_rate,
        other_processing_rate,
        processed_rate,
        file_drop_rate,
        manual_rate,
        payout_rate,
        flatrate,
      };

      const rowErrors = [];

      if (!location) rowErrors.push("Location required");
      if (!process_type) rowErrors.push("Process Type required");

      const matchedProcessType = MRO_PROCESS_TYPES.find(
        (t) => t.toLowerCase() === process_type.toLowerCase()
      );
      if (!matchedProcessType && process_type) {
        rowErrors.push(`Invalid Process Type "${process_type}". Allowed: ${MRO_PROCESS_TYPES.join(", ")}`);
      } else if (matchedProcessType) {
        rowOut.process_type = matchedProcessType;
      }

      const uniqueKey = `${normalizeName(geography)}|${normalizeName(client)}|${normalizeName(process_type)}|${normalizeName(location)}`;
      if (csvDuplicateCheck.has(uniqueKey)) {
        rowErrors.push("Duplicate entry in CSV");
      } else {
        csvDuplicateCheck.add(uniqueKey);
      }

      if (rowErrors.length > 0) {
        errors.push({ ...rowOut, errors: rowErrors.join("; ") });
      } else {
        validRows.push(rowOut);
      }
    });

    if (errors.length > 0) {
      return sendErrorCsv(res, filePath, errors);
    }

    if (validRows.length === 0) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: "CSV contains no valid data rows" });
    }

    console.log(`✅ Validated ${validRows.length} rows`);

    // 3. Group data by hierarchy
    const geographyMap = new Map();

    for (const r of validRows) {
      const geoKey = normalizeName(r.geography);
      const clientKey = normalizeName(r.client);
      const projKey = normalizeName(r.process_type);
      const subKey = normalizeName(r.location);

      if (!geographyMap.has(geoKey)) {
        geographyMap.set(geoKey, { name: r.geography, clients: new Map() });
      }

      const geography = geographyMap.get(geoKey);

      if (!geography.clients.has(clientKey)) {
        geography.clients.set(clientKey, { name: r.client, projects: new Map() });
      }

      const clientData = geography.clients.get(clientKey);

      if (!clientData.projects.has(projKey)) {
        clientData.projects.set(projKey, { name: r.process_type, subprojects: new Map() });
      }

      const project = clientData.projects.get(projKey);

      if (!project.subprojects.has(subKey)) {
        project.subprojects.set(subKey, {
          name: r.location,
          nrs_rate: r.nrs_rate,
          other_processing_rate: r.other_processing_rate,
          processed_rate: r.processed_rate,
          file_drop_rate: r.file_drop_rate,
          manual_rate: r.manual_rate,
          payout_rate: r.payout_rate,
          flatrate: r.flatrate
        });
      }
    }

    console.log(`📊 Found ${geographyMap.size} unique geographies`);

    // 4. UPSERT hierarchy - Preserves IDs!
    const stats = {
      geographies: { created: 0, existing: 0 },
      clients: { created: 0, existing: 0 },
      projects: { created: 0, existing: 0 },
      subprojects: { created: 0, updated: 0 },
      requestTypes: 0,
      requestorTypes: 0
    };

    const processedBusinessKeys = [];
    const processedSubprojectIds = []; // Track for assignment sync

    for (const [geoKey, geoData] of geographyMap) {
      // UPSERT Geography
      let geography = await Geography.findOne({
        name: { $regex: new RegExp(`^${escapeRegex(geoData.name)}$`, 'i') }
      });

      if (!geography) {
        geography = await Geography.create({
          name: geoData.name,
          description: "Created via MRO Bulk Upload",
          status: "active"
        });
        stats.geographies.created++;
        console.log(`✅ Created geography: ${geoData.name}`);
      } else {
        stats.geographies.existing++;
      }

      // Process each client from CSV
      for (const [clientKey, clientData] of geoData.clients) {
        // UPSERT Client
        let mroClient = await Client.findOne({
          geography_id: geography._id,
          name: { $regex: new RegExp(`^${escapeRegex(clientData.name)}$`, 'i') }
        });

        if (!mroClient) {
          mroClient = await Client.create({
            name: clientData.name,
            geography_id: geography._id,
            geography_name: geography.name,
            description: "MRO Client - Created via Bulk Upload",
            status: "active"
          });
          stats.clients.created++;
          console.log(`✅ Created client: ${clientData.name} under ${geography.name}`);
        } else {
          stats.clients.existing++;
        }

        // Process each project (Processing/Logging/MRO Payer Project)
        for (const [projKey, projData] of clientData.projects) {
        // UPSERT Project
        let project = await Project.findOne({
          client_id: mroClient._id,
          name: { $regex: new RegExp(`^${escapeRegex(projData.name)}$`, 'i') }
        });

        if (!project) {
          project = await Project.create({
            name: projData.name,
            geography_id: geography._id,
            geography_name: geography.name,
            client_id: mroClient._id,
            client_name: mroClient.name,
            description: `MRO ${projData.name} - Created via Bulk Upload`,
            status: "active",
            visibility: "visible"
          });
          stats.projects.created++;
          console.log(`✅ Created project: ${projData.name}`);
        } else {
          stats.projects.existing++;
        }

        // Process each subproject (location)
        for (const [subKey, subData] of projData.subprojects) {
          // Generate business key
          const businessKey = generateBusinessKey(mroClient.name, project.name, subData.name);
          processedBusinessKeys.push(businessKey);

          // Determine flatrate based on process type
          let flatrate = 0;
          if (projData.name === 'Logging') {
            flatrate = subData.flatrate || MRO_DEFAULT_PRICING.Logging.flatrate;
          } else if (projData.name === 'MRO Payer Project') {
            flatrate = subData.flatrate || 0;
          } else if (projData.name === 'Processing') {
            flatrate = subData.payout_rate || 0;
          }

          // Build billing_rates array
          const billingRates = [];
          if (projData.name === 'Processing') {
            billingRates.push({ requestor_type: 'NRS-NO Records', rate: subData.nrs_rate });
            billingRates.push({ requestor_type: 'Manual', rate: subData.manual_rate });
            billingRates.push({ requestor_type: 'Other Processing (Canceled/Released By Other)', rate: subData.other_processing_rate });
            billingRates.push({ requestor_type: 'Processed', rate: subData.processed_rate });
            billingRates.push({ requestor_type: 'Processed through File Drop', rate: subData.file_drop_rate });
          }

          // UPSERT Subproject using business key
          let subproject = await Subproject.findOne({ business_key: businessKey });

          if (!subproject) {
            // Try finding by project_id + name
            subproject = await Subproject.findOne({
              project_id: project._id,
              name: { $regex: new RegExp(`^${escapeRegex(subData.name)}$`, 'i') }
            });
          }

          if (subproject) {
            // UPDATE existing - preserve _id!
            subproject.business_key = businessKey;
            subproject.client_name = mroClient.name;
            subproject.project_name = project.name;
            subproject.geography_name = geography.name;
            subproject.flatrate = flatrate;
            subproject.status = 'active';
            subproject.deactivated_at = null;
            if (billingRates.length > 0) {
              subproject.billing_rates = billingRates;
            }
            await subproject.save();
            stats.subprojects.updated++;
            console.log(`  📝 Updated: ${subData.name} (ID preserved: ${subproject._id})`);
          } else {
            // CREATE new
            subproject = await Subproject.create({
              name: subData.name,
              geography_id: geography._id,
              geography_name: geography.name,
              client_id: mroClient._id,
              client_name: mroClient.name,
              project_id: project._id,
              project_name: project.name,
              business_key: businessKey,
              description: "Created via MRO Bulk Upload",
              status: "active",
              flatrate: flatrate,
              billing_rates: billingRates
            });
            stats.subprojects.created++;
            console.log(`  ✅ Created: ${subData.name} (ID: ${subproject._id})`);
          }

          // Track for assignment sync
          processedSubprojectIds.push({
            subproject_id: subproject._id,
            subproject_name: subproject.name,
            subproject_key: businessKey,
            geography_id: geography._id,
            geography_name: geography.name,
            client_id: mroClient._id,
            client_name: mroClient.name,
            project_id: project._id,
            project_name: project.name
          });

          // UPSERT Request Types (all 6 for each subproject)
          for (const reqType of MRO_REQUEST_TYPES) {
            await SubprojectRequestType.findOneAndUpdate(
              { subproject_id: subproject._id, name: reqType },
              {
                $setOnInsert: {
                  geography_id: geography._id,
                  client_id: mroClient._id,
                  project_id: project._id,
                  name: reqType,
                  rate: 0
                }
              },
              { upsert: true, new: true }
            );
            stats.requestTypes++;
          }

          // UPSERT Requestor Types with rates (for Processing)
          if (projData.name === 'Processing') {
            const requestorRates = [
              { name: 'NRS-NO Records', rate: subData.nrs_rate },
              { name: 'Manual', rate: subData.manual_rate },
              { name: 'Other Processing (Canceled/Released By Other)', rate: subData.other_processing_rate },
              { name: 'Processed', rate: subData.processed_rate },
              { name: 'Processed through File Drop', rate: subData.file_drop_rate }
            ];

            for (const rt of requestorRates) {
              await SubprojectRequestorType.findOneAndUpdate(
                { subproject_id: subproject._id, name: rt.name },
                {
                  $set: { rate: rt.rate },
                  $setOnInsert: {
                    geography_id: geography._id,
                    client_id: mroClient._id,
                    project_id: project._id,
                    name: rt.name
                  }
                },
                { upsert: true, new: true }
              );
              stats.requestorTypes++;
            }
          }
        }

        console.log(`  📦 Processed ${projData.subprojects.size} locations under ${projData.name}`);
        }
      }
    }

    // =============================================
    // 5. SYNC RESOURCE ASSIGNMENTS
    // =============================================
    let assignmentsSynced = 0;
    try {
      const subIdList = processedSubprojectIds.map(s => s.subproject_id);
      const affectedResources = await Resource.find({
        'assignments.subprojects.subproject_id': { $in: subIdList }
      });

      for (const resource of affectedResources) {
        let changed = false;
        for (const assignment of resource.assignments) {
          for (const sp of assignment.subprojects) {
            const match = processedSubprojectIds.find(
              p => p.subproject_id.toString() === sp.subproject_id?.toString()
            );
            if (match) {
              sp.subproject_name = match.subproject_name;
              sp.subproject_key = match.subproject_key;
              assignment.geography_id = match.geography_id;
              assignment.geography_name = match.geography_name;
              assignment.client_id = match.client_id;
              assignment.client_name = match.client_name;
              assignment.project_id = match.project_id;
              assignment.project_name = match.project_name;
              changed = true;
            }
          }
        }
        if (changed) {
          await resource.save();
          assignmentsSynced++;
        }
      }
      console.log(`🔄 Synced assignments for ${assignmentsSynced} resources`);
    } catch (syncErr) {
      console.error("Assignment sync warning:", syncErr.message);
    }

    fs.unlinkSync(filePath);

    console.log(`\n🎉 MRO Bulk Upload completed!`);

    return res.json({
      status: "success",
      message: "MRO bulk upload completed successfully",
      summary: { ...stats, assignmentsSynced },
      rowsProcessed: validRows.length,
      note: "Existing subprojects updated with preserved IDs, new ones created with business keys"
    });

  } catch (err) {
    console.error("MRO Bulk upload error:", err);
    try { fs.unlinkSync(filePath); } catch {}
    return res.status(500).json({ error: "Failed to process CSV: " + err.message });
  }
});

// =============================================
// MRO BULK UPLOAD - REPLACE MODE
// Soft-deletes subprojects not in upload, upserts rest
// Still preserves IDs for subprojects in the upload!
// =============================================
router.post("/mro-bulk-upload-replace", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const filePath = req.file.path;
  const rows = [];

  try {
    console.log("⏱️ MRO Bulk Upload (REPLACE mode) started...");

    // 1. Read CSV
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(
          csv({
            mapHeaders: ({ header }) => {
              const h = header.toLowerCase().trim();
              if (h.includes("geography")) return "geography";
              if (h.includes("client")) return "client";
              if (h.includes("location") || h.includes("subproject")) return "location";
              if (h.includes("process") && h.includes("type")) return "process_type";
              if (h.includes("nrs") && h.includes("rate")) return "nrs_rate";
              if (h.includes("other") && h.includes("rate")) return "other_processing_rate";
              if (h === "processed rate" || h === "processed_rate") return "processed_rate";
              if (h.includes("file drop") && h.includes("rate")) return "file_drop_rate";
              if (h.includes("manual") && h.includes("rate")) return "manual_rate";
              if (h === "payout_rate" || h === "payout rate") return "payout_rate";
              if (h === "flatrate" || h === "flat rate" || h === "billing_rate" || h === "billing rate" || (h.includes("logging") && h.includes("rate"))) return "flatrate";
              return header;
            },
          })
        )
        .on("data", (row) => {
          if (Object.values(row).every((v) => !v)) return;
          rows.push(row);
        })
        .on("end", resolve)
        .on("error", reject);
    });

    console.log(`📄 Read ${rows.length} rows from CSV`);

    // 2. Validate rows (same as upsert mode)
    const errors = [];
    const validRows = [];
    const csvDuplicateCheck = new Set();

    rows.forEach((r, idx) => {
      const geography = norm(r.geography) || "US";
      const client = norm(r.client) || "MRO";
      const location = norm(r.location);
      let process_type = norm(r.process_type);

      const nrs_rate = parseFloat(r.nrs_rate) || MRO_DEFAULT_PRICING.Processing['NRS-NO Records'];
      const other_processing_rate = parseFloat(r.other_processing_rate) || 0;
      const processed_rate = parseFloat(r.processed_rate) || 0;
      const file_drop_rate = parseFloat(r.file_drop_rate) || 0;
      const manual_rate = parseFloat(r.manual_rate) || MRO_DEFAULT_PRICING.Processing['Manual'];
      const payout_rate = parseFloat(r.payout_rate) || 0;
      const flatrate = parseFloat(r.flatrate) || MRO_DEFAULT_PRICING.Logging.flatrate;

      const rowOut = {
        __row: idx + 1,
        geography,
        client,
        location,
        process_type,
        nrs_rate,
        other_processing_rate,
        processed_rate,
        file_drop_rate,
        manual_rate,
        payout_rate,
        flatrate,
      };

      const rowErrors = [];

      if (!location) rowErrors.push("Location required");
      if (!process_type) rowErrors.push("Process Type required");

      const matchedProcessType = MRO_PROCESS_TYPES.find(
        (t) => t.toLowerCase() === process_type.toLowerCase()
      );
      if (!matchedProcessType && process_type) {
        rowErrors.push(`Invalid Process Type. Allowed: ${MRO_PROCESS_TYPES.join(", ")}`);
      } else if (matchedProcessType) {
        rowOut.process_type = matchedProcessType;
      }

      const uniqueKey = `${normalizeName(geography)}|${normalizeName(client)}|${normalizeName(process_type)}|${normalizeName(location)}`;
      if (csvDuplicateCheck.has(uniqueKey)) {
        rowErrors.push("Duplicate entry in CSV");
      } else {
        csvDuplicateCheck.add(uniqueKey);
      }

      if (rowErrors.length > 0) {
        errors.push({ ...rowOut, errors: rowErrors.join("; ") });
      } else {
        validRows.push(rowOut);
      }
    });

    if (errors.length > 0) {
      return sendErrorCsv(res, filePath, errors);
    }

    if (validRows.length === 0) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: "CSV contains no valid data rows" });
    }

    // 3. Process (same grouping as upsert)
    const geographyMap = new Map();
    const processedBusinessKeys = [];
    const processedProjectIds = new Set(); // Track which projects are in the CSV
    const processedSubprojectIds = []; // Track for assignment sync

    for (const r of validRows) {
      const geoKey = normalizeName(r.geography);
      const clientKey = normalizeName(r.client);
      const projKey = normalizeName(r.process_type);
      const subKey = normalizeName(r.location);

      if (!geographyMap.has(geoKey)) {
        geographyMap.set(geoKey, { name: r.geography, clients: new Map() });
      }

      const geography = geographyMap.get(geoKey);

      if (!geography.clients.has(clientKey)) {
        geography.clients.set(clientKey, { name: r.client, projects: new Map() });
      }

      const clientData = geography.clients.get(clientKey);

      if (!clientData.projects.has(projKey)) {
        clientData.projects.set(projKey, { name: r.process_type, subprojects: new Map() });
      }

      const project = clientData.projects.get(projKey);

      if (!project.subprojects.has(subKey)) {
        project.subprojects.set(subKey, {
          name: r.location,
          nrs_rate: r.nrs_rate,
          other_processing_rate: r.other_processing_rate,
          processed_rate: r.processed_rate,
          file_drop_rate: r.file_drop_rate,
          manual_rate: r.manual_rate,
          payout_rate: r.payout_rate,
          flatrate: r.flatrate
        });
      }
    }

    const stats = {
      geographies: { created: 0, existing: 0 },
      clients: { created: 0, existing: 0 },
      projects: { created: 0, existing: 0 },
      subprojects: { created: 0, updated: 0, deactivated: 0 },
      requestTypes: 0,
      requestorTypes: 0
    };

    // 4. UPSERT (same as incremental, but track business keys)
    for (const [geoKey, geoData] of geographyMap) {
      let geography = await Geography.findOne({
        name: { $regex: new RegExp(`^${escapeRegex(geoData.name)}$`, 'i') }
      });

      if (!geography) {
        geography = await Geography.create({
          name: geoData.name,
          description: "Created via MRO Bulk Upload",
          status: "active"
        });
        stats.geographies.created++;
      } else {
        stats.geographies.existing++;
      }

      for (const [clientKey, clientData] of geoData.clients) {
        let mroClient = await Client.findOne({
          geography_id: geography._id,
          name: { $regex: new RegExp(`^${escapeRegex(clientData.name)}$`, 'i') }
        });

        if (!mroClient) {
          mroClient = await Client.create({
            name: clientData.name,
            geography_id: geography._id,
            geography_name: geography.name,
            description: "MRO Client - Created via Bulk Upload",
            status: "active"
          });
          stats.clients.created++;
        } else {
          stats.clients.existing++;
        }

        for (const [projKey, projData] of clientData.projects) {
          let project = await Project.findOne({
            client_id: mroClient._id,
            name: { $regex: new RegExp(`^${escapeRegex(projData.name)}$`, 'i') }
          });

          if (!project) {
            project = await Project.create({
              name: projData.name,
              geography_id: geography._id,
              geography_name: geography.name,
              client_id: mroClient._id,
              client_name: mroClient.name,
              status: "active",
              visibility: "visible"
            });
            stats.projects.created++;
          } else {
            stats.projects.existing++;
          }

          // Track which projects (process types) are in the CSV
          processedProjectIds.add(project._id.toString());

          for (const [subKey, subData] of projData.subprojects) {
            const businessKey = generateBusinessKey(mroClient.name, project.name, subData.name);
            processedBusinessKeys.push(businessKey);

            let flatrate = 0;
            if (projData.name === 'Logging') {
              flatrate = subData.flatrate || MRO_DEFAULT_PRICING.Logging.flatrate;
            } else if (projData.name === 'Processing') {
              flatrate = subData.payout_rate || 0;
            }

            const billingRates = [];
            if (projData.name === 'Processing') {
              billingRates.push({ requestor_type: 'NRS-NO Records', rate: subData.nrs_rate });
              billingRates.push({ requestor_type: 'Manual', rate: subData.manual_rate });
              billingRates.push({ requestor_type: 'Other Processing (Canceled/Released By Other)', rate: subData.other_processing_rate });
              billingRates.push({ requestor_type: 'Processed', rate: subData.processed_rate });
              billingRates.push({ requestor_type: 'Processed through File Drop', rate: subData.file_drop_rate });
            }

            let subproject = await Subproject.findOne({ business_key: businessKey });

            if (!subproject) {
              subproject = await Subproject.findOne({
                project_id: project._id,
                name: { $regex: new RegExp(`^${escapeRegex(subData.name)}$`, 'i') }
              });
            }

            if (subproject) {
              subproject.business_key = businessKey;
              subproject.client_name = mroClient.name;
              subproject.project_name = project.name;
              subproject.geography_name = geography.name;
              subproject.flatrate = flatrate;
              subproject.status = 'active';
              subproject.deactivated_at = null;
              if (billingRates.length > 0) {
                subproject.billing_rates = billingRates;
              }
              await subproject.save();
              stats.subprojects.updated++;
            } else {
              subproject = await Subproject.create({
                name: subData.name,
                geography_id: geography._id,
                geography_name: geography.name,
                client_id: mroClient._id,
                client_name: mroClient.name,
                project_id: project._id,
                project_name: project.name,
                business_key: businessKey,
                status: "active",
                flatrate: flatrate,
                billing_rates: billingRates
              });
              stats.subprojects.created++;
            }

            // Track for assignment sync
            processedSubprojectIds.push({
              subproject_id: subproject._id,
              subproject_name: subproject.name,
              subproject_key: businessKey,
              geography_id: geography._id,
              geography_name: geography.name,
              client_id: mroClient._id,
              client_name: mroClient.name,
              project_id: project._id,
              project_name: project.name
            });

            // Request Types
            for (const reqType of MRO_REQUEST_TYPES) {
              await SubprojectRequestType.findOneAndUpdate(
                { subproject_id: subproject._id, name: reqType },
                {
                  $setOnInsert: {
                    geography_id: geography._id,
                    client_id: mroClient._id,
                    project_id: project._id,
                    name: reqType,
                    rate: 0
                  }
                },
                { upsert: true }
              );
              stats.requestTypes++;
            }

            // Requestor Types for Processing
            if (projData.name === 'Processing') {
              const requestorRates = [
                { name: 'NRS-NO Records', rate: subData.nrs_rate },
                { name: 'Manual', rate: subData.manual_rate },
                { name: 'Other Processing (Canceled/Released By Other)', rate: subData.other_processing_rate },
                { name: 'Processed', rate: subData.processed_rate },
                { name: 'Processed through File Drop', rate: subData.file_drop_rate }
              ];

              for (const rt of requestorRates) {
                await SubprojectRequestorType.findOneAndUpdate(
                  { subproject_id: subproject._id, name: rt.name },
                  {
                    $set: { rate: rt.rate },
                    $setOnInsert: {
                      geography_id: geography._id,
                      client_id: mroClient._id,
                      project_id: project._id,
                      name: rt.name
                    }
                  },
                  { upsert: true }
                );
                stats.requestorTypes++;
              }
            }
          }
        }
      }
    }

    // 5. SOFT DELETE subprojects not in upload
    // CRITICAL: Only affect subprojects under projects (process types) in the CSV
    // This ensures uploading Processing data does NOT soft-delete Logging locations
    const projectIdsArray = Array.from(processedProjectIds).map(id => new mongoose.Types.ObjectId(id));
    console.log(`[REPLACE] Projects in CSV: ${projectIdsArray.length} project(s)`);

    const deactivateResult = await Subproject.updateMany(
      {
        project_id: { $in: projectIdsArray },  // Only under projects in CSV
        business_key: { $nin: processedBusinessKeys },
        status: 'active'
      },
      {
        $set: {
          status: 'inactive',
          deactivated_at: new Date()
        }
      }
    );
    stats.subprojects.deactivated = deactivateResult.modifiedCount || 0;

    console.log(`[REPLACE] Soft-deleted ${stats.subprojects.deactivated} MRO subprojects not in upload`);

    // =============================================
    // 6. SYNC RESOURCE ASSIGNMENTS
    // =============================================
    let assignmentsSynced = 0;
    try {
      const subIdList = processedSubprojectIds.map(s => s.subproject_id);
      const affectedResources = await Resource.find({
        'assignments.subprojects.subproject_id': { $in: subIdList }
      });

      for (const resource of affectedResources) {
        let changed = false;
        for (const assignment of resource.assignments) {
          for (const sp of assignment.subprojects) {
            const match = processedSubprojectIds.find(
              p => p.subproject_id.toString() === sp.subproject_id?.toString()
            );
            if (match) {
              sp.subproject_name = match.subproject_name;
              sp.subproject_key = match.subproject_key;
              assignment.geography_id = match.geography_id;
              assignment.geography_name = match.geography_name;
              assignment.client_id = match.client_id;
              assignment.client_name = match.client_name;
              assignment.project_id = match.project_id;
              assignment.project_name = match.project_name;
              changed = true;
            }
          }
        }
        if (changed) {
          await resource.save();
          assignmentsSynced++;
        }
      }
      console.log(`🔄 Synced assignments for ${assignmentsSynced} resources`);
    } catch (syncErr) {
      console.error("Assignment sync warning:", syncErr.message);
    }

    fs.unlinkSync(filePath);

    return res.json({
      status: "success",
      message: "MRO bulk upload (replace mode) completed",
      summary: { ...stats, assignmentsSynced },
      rowsProcessed: validRows.length,
      note: "Only projects (process types) in CSV affected. Other projects are preserved."
    });

  } catch (err) {
    console.error("MRO Bulk upload error:", err);
    try { fs.unlinkSync(filePath); } catch {}
    return res.status(500).json({ error: "Failed to process CSV: " + err.message });
  }
});

// Helper function to send error CSV
function sendErrorCsv(res, filePath, errors) {
  try {
    const fields = [
      "__row",
      "geography",
      "client",
      "location",
      "process_type",
      "nrs_rate",
      "other_processing_rate",
      "processed_rate",
      "file_drop_rate",
      "manual_rate",
      "payout_rate",
      "flatrate",
      "errors"
    ];
    const parser = new Parser({ fields });
    const csvOut = parser.parse(errors);

    fs.unlinkSync(filePath);
    res.setHeader("Content-Disposition", "attachment; filename=mro-upload-errors.csv");
    res.setHeader("Content-Type", "text/csv");
    return res.status(400).send(csvOut);
  } catch (err) {
    fs.unlinkSync(filePath);
    return res.status(500).json({ error: "Error generating error report" });
  }
}

// =============================================
// MRO EXPORT - Download all MRO project data as CSV
// =============================================
router.get("/mro-export", async (req, res) => {
  try {
    // Find all MRO clients (case-insensitive)
    const mroClients = await Client.find({
      name: { $regex: /mro/i }
    }).lean();

    if (mroClients.length === 0) {
      return res.status(404).json({ error: "No MRO client found" });
    }

    const clientIds = mroClients.map(c => c._id);

    // Get all active subprojects under MRO clients
    const subprojects = await Subproject.find({
      client_id: { $in: clientIds },
      status: 'active'
    }).lean();

    if (subprojects.length === 0) {
      return res.status(404).json({ error: "No active MRO locations found" });
    }

    const subprojectIds = subprojects.map(sp => sp._id);

    // Get all requestor types for these subprojects
    const requestorTypes = await SubprojectRequestorType.find({
      subproject_id: { $in: subprojectIds }
    }).lean();

    // Build lookup: subproject_id -> { requestorTypeName: rate }
    const requestorRateMap = {};
    requestorTypes.forEach(rt => {
      const spId = rt.subproject_id.toString();
      if (!requestorRateMap[spId]) requestorRateMap[spId] = {};
      requestorRateMap[spId][rt.name] = rt.rate || 0;
    });

    // Build CSV rows
    const csvRows = [];
    for (const sp of subprojects) {
      const spId = sp._id.toString();
      const rates = requestorRateMap[spId] || {};

      csvRows.push({
        geography: sp.geography_name || '',
        client: sp.client_name || '',
        location: sp.name || '',
        process_type: sp.project_name || '',
        nrs_rate: rates['NRS-NO Records'] || 0,
        other_processing_rate: rates['Other Processing (Canceled/Released By Other)'] || 0,
        processed_rate: rates['Processed'] || 0,
        file_drop_rate: rates['Processed through File Drop'] || 0,
        manual_rate: rates['Manual'] || 0,
        payout_rate: sp.flatrate || 0,
        billing_rate: sp.billing_rate || 0
      });
    }

    const parser = new Parser({
      fields: ['geography', 'client', 'location', 'process_type', 'nrs_rate', 'other_processing_rate', 'processed_rate', 'file_drop_rate', 'manual_rate', 'payout_rate', 'billing_rate']
    });
    const csvOut = parser.parse(csvRows);

    res.setHeader("Content-Disposition", "attachment; filename=mro-project-export.csv");
    res.setHeader("Content-Type", "text/csv");
    return res.send(csvOut);
  } catch (err) {
    console.error("MRO export error:", err);
    return res.status(500).json({ error: "Failed to export MRO data: " + err.message });
  }
});

module.exports = router;