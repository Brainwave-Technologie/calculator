// routes/upload-verisma.routes.js - Verisma-specific Bulk Upload
// Uses EXACT same parsing as original upload.js but ONLY affects Verisma data
// Preserves MRO and other client data
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
const Billing = require("../../models/Billing");
const Resource = require("../../models/Resource");
const upload = multer({ dest: "uploads/" });

// Helper to clean strings
const norm = (s) => (typeof s === "string" ? s.trim() : "");

// Helper to normalize names for comparison
function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Helper to escape regex special characters
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// All 3 request types for Verisma
const ALL_REQUEST_TYPES = ["New Request", "Key", "Duplicate"];

// Batch size for bulk operations
const BATCH_SIZE = 500;

// Helper to generate business key
function generateBusinessKey(clientName, projectName, subprojectName) {
  return [
    (clientName || '').toLowerCase().trim(),
    (projectName || '').toLowerCase().trim(),
    (subprojectName || '').toLowerCase().trim()
  ].join('|');
}

// =============================================
// VERISMA BULK UPLOAD - UPSERT MODE
// Only affects Verisma client, preserves MRO and others
// =============================================
router.post("/verisma-bulk-upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const filePath = req.file.path;
  const rows = [];

  try {
    console.log("⏱️ Verisma Bulk Upload started...");

    // 1. Read CSV and Map Headers (EXACT same as original upload.js)
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(
          csv({
            mapHeaders: ({ header }) => {
              const cleanHeader = header.toLowerCase().trim();
              if (cleanHeader.includes("geography")) return "geography";
              if (cleanHeader.includes("client")) return "client";
              if (cleanHeader.includes("process type")) return "project_name";
              if (cleanHeader.includes("location")) return "subproject_name";
              if (cleanHeader.includes("request type")) return "request_type";
              if (cleanHeader.includes("request rate") || cleanHeader === "request_rate") return "rate";
              if (cleanHeader.includes("costing rate") || cleanHeader === "rate") return "rate";
              if (cleanHeader.includes("payout rate") || cleanHeader === "payout_rate" || cleanHeader.includes("flat rate")) return "flatrate";
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

    const errors = [];
    const validRows = [];
    const csvDuplicateCheck = new Set();

    // 2. Validate rows (EXACT same validation as original)
    rows.forEach((r, idx) => {
      const geography = norm(r.geography);
      const client = norm(r.client);
      const project_name = norm(r.project_name);
      const subproject_name = norm(r.subproject_name);
      let request_type = norm(r.request_type);

      const rateStr = r.rate !== undefined ? String(r.rate).trim() : "0";
      const rate = parseFloat(rateStr);

      const flatrateStr = r.flatrate !== undefined ? String(r.flatrate).trim() : "0";
      const flatrate = isNaN(parseFloat(flatrateStr)) ? 0 : parseFloat(flatrateStr);

      const rowOut = {
        __row: idx + 1,
        geography,
        client,
        project_name,
        subproject_name,
        request_type,
        rate,
        flatrate,
      };

      const rowErrors = [];

      if (!geography) rowErrors.push("Geography required");
      if (!client) rowErrors.push("Client required");
      if (!project_name) rowErrors.push("Process Type required");
      if (!subproject_name) rowErrors.push("Location required");
      if (!request_type) rowErrors.push("Request Type required");
      if (isNaN(rate)) rowErrors.push("Payout Rate must be a number");

      const matchedType = ALL_REQUEST_TYPES.find(
        (t) => t.toLowerCase() === request_type.toLowerCase()
      );
      if (!matchedType && request_type) {
        rowErrors.push(`Invalid Request Type. Allowed: ${ALL_REQUEST_TYPES.join(", ")}`);
      } else if (matchedType) {
        rowOut.request_type = matchedType;
      }

      const uniqueKey = `${normalizeName(geography)}|${normalizeName(client)}|${normalizeName(project_name)}|${normalizeName(subproject_name)}|${normalizeName(request_type)}`;
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

    // =============================================
    // 3. Group data by hierarchy (EXACT same as original)
    // =============================================
    const geographyMap = new Map();

    for (const r of validRows) {
      const geoKey = normalizeName(r.geography);
      const clientKey = normalizeName(r.client);
      const projKey = normalizeName(r.project_name);
      const subKey = normalizeName(r.subproject_name);

      if (!geographyMap.has(geoKey)) {
        geographyMap.set(geoKey, {
          name: r.geography,
          clients: new Map()
        });
      }

      const geography = geographyMap.get(geoKey);
      
      if (!geography.clients.has(clientKey)) {
        geography.clients.set(clientKey, {
          name: r.client,
          projects: new Map()
        });
      }

      const client = geography.clients.get(clientKey);

      if (!client.projects.has(projKey)) {
        client.projects.set(projKey, {
          name: r.project_name,
          subprojects: new Map()
        });
      }

      const project = client.projects.get(projKey);
      
      if (!project.subprojects.has(subKey)) {
        project.subprojects.set(subKey, {
          name: r.subproject_name,
          flatrate: r.flatrate,
          rates: new Map()
        });
      }

      const subproject = project.subprojects.get(subKey);
      subproject.rates.set(r.request_type, r.rate);
      
      if (r.flatrate > subproject.flatrate) {
        subproject.flatrate = r.flatrate;
      }
    }

    console.log(`📊 Found ${geographyMap.size} unique geographies`);

    // =============================================
    // 4. UPSERT DATA - Only affects clients in CSV, preserves MRO!
    // =============================================
    const stats = {
      geographies: { created: 0, existing: 0 },
      clients: { created: 0, existing: 0 },
      projects: { created: 0, existing: 0 },
      subprojects: { created: 0, updated: 0 },
      requestTypes: { created: 0, updated: 0 }
    };

    const processedBusinessKeys = [];

    const processedSubprojectIds = []; // Track for assignment sync

    for (const [geoKey, geoData] of geographyMap) {
      // UPSERT Geography (shared across all clients, don't delete)
      let geography = await Geography.findOne({
        name: { $regex: new RegExp(`^${escapeRegex(geoData.name)}$`, 'i') }
      });

      if (!geography) {
        geography = await Geography.create({
          name: geoData.name,
          description: "Imported via Verisma Bulk Upload",
          status: "active"
        });
        stats.geographies.created++;
        console.log(`✅ Created geography: ${geoData.name}`);
      } else {
        stats.geographies.existing++;
      }

      // Process each client from CSV (could be Verisma or any other client in the CSV)
      for (const [clientKey, clientData] of geoData.clients) {
        // UPSERT Client (only this client from CSV, doesn't touch MRO if not in CSV)
        let client = await Client.findOne({
          geography_id: geography._id,
          name: { $regex: new RegExp(`^${escapeRegex(clientData.name)}$`, 'i') }
        });

        if (!client) {
          client = await Client.create({
            name: clientData.name,
            geography_id: geography._id,
            geography_name: geography.name,
            description: "Imported via Verisma Bulk Upload",
            status: "active"
          });
          stats.clients.created++;
          console.log(`✅ Created client: ${clientData.name}`);
        } else {
          stats.clients.existing++;
        }

        // Process each project
        for (const [projKey, projData] of clientData.projects) {
          // UPSERT Project (under this client only)
          let project = await Project.findOne({
            client_id: client._id,
            name: { $regex: new RegExp(`^${escapeRegex(projData.name)}$`, 'i') }
          });

          if (!project) {
            project = await Project.create({
              name: projData.name,
              geography_id: geography._id,
              geography_name: geography.name,
              client_id: client._id,
              client_name: client.name,
              description: "Imported via Verisma Bulk Upload",
              status: "active",
              visibility: "visible"
            });
            stats.projects.created++;
            console.log(`  ✅ Created project: ${projData.name}`);
          } else {
            stats.projects.existing++;
          }

          // Process each subproject (location)
          for (const [subKey, subData] of projData.subprojects) {
            const businessKey = generateBusinessKey(client.name, project.name, subData.name);
            processedBusinessKeys.push(businessKey);

            // UPSERT Subproject
            let subproject = await Subproject.findOne({ business_key: businessKey });

            if (!subproject) {
              subproject = await Subproject.findOne({
                project_id: project._id,
                name: { $regex: new RegExp(`^${escapeRegex(subData.name)}$`, 'i') }
              });
            }

            if (subproject) {
              // UPDATE existing - preserve _id!
              subproject.business_key = businessKey;
              subproject.client_name = client.name;
              subproject.project_name = project.name;
              subproject.geography_name = geography.name;
              subproject.flatrate = subData.flatrate;
              subproject.status = 'active';
              subproject.deactivated_at = null;
              await subproject.save();
              stats.subprojects.updated++;
            } else {
              // CREATE new
              subproject = await Subproject.create({
                name: subData.name,
                geography_id: geography._id,
                geography_name: geography.name,
                client_id: client._id,
                client_name: client.name,
                project_id: project._id,
                project_name: project.name,
                business_key: businessKey,
                description: "Imported via Verisma Bulk Upload",
                status: "active",
                flatrate: subData.flatrate
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
              client_id: client._id,
              client_name: client.name,
              project_id: project._id,
              project_name: project.name
            });

            // UPSERT Request Types with rates from CSV
            for (const reqType of ALL_REQUEST_TYPES) {
              const rate = subData.rates.get(reqType) || 0;
              
              const existingReqType = await SubprojectRequestType.findOne({
                subproject_id: subproject._id,
                name: reqType
              });

              if (existingReqType) {
                existingReqType.rate = rate;
                await existingReqType.save();
                stats.requestTypes.updated++;
              } else {
                await SubprojectRequestType.create({
                  geography_id: geography._id,
                  client_id: client._id,
                  project_id: project._id,
                  subproject_id: subproject._id,
                  name: reqType,
                  rate: rate
                });
                stats.requestTypes.created++;
              }
            }
          }

          console.log(`    📦 Processed ${projData.subprojects.size} locations under ${projData.name}`);
        }
      }
    }

    // =============================================
    // 5. SYNC RESOURCE ASSIGNMENTS
    // Update any resource assignments that reference these subprojects
    // so that denormalized names/IDs stay consistent
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
              // Sync subproject-level fields
              sp.subproject_name = match.subproject_name;
              sp.subproject_key = match.subproject_key;
              // Sync assignment-level fields (geography, client, project)
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

    // Cleanup
    fs.unlinkSync(filePath);

    console.log(`\n🎉 Verisma Bulk Upload completed!`);

    return res.json({
      status: "success",
      message: "Verisma bulk upload completed successfully.",
      summary: {
        geographies: stats.geographies,
        clients: stats.clients,
        projects: stats.projects,
        subprojects: stats.subprojects,
        requestTypes: stats.requestTypes,
        assignmentsSynced,
        note: "Only clients in CSV affected. MRO and other clients NOT in CSV are preserved."
      },
      rowsProcessed: validRows.length,
    });

  } catch (err) {
    console.error("Verisma Bulk upload error:", err);
    try { fs.unlinkSync(filePath); } catch {}
    return res.status(500).json({ error: "Failed to process CSV: " + err.message });
  }
});

// =============================================
// VERISMA BULK UPLOAD - REPLACE MODE
// Soft-deletes subprojects not in upload for clients IN THE CSV
// Only affects clients in CSV, preserves MRO if not in CSV!
// =============================================
router.post("/verisma-bulk-upload-replace", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const filePath = req.file.path;
  const rows = [];

  try {
    console.log("⏱️ Verisma Bulk Upload (REPLACE mode) started...");

    // 1. Read CSV (same header mapping)
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(
          csv({
            mapHeaders: ({ header }) => {
              const cleanHeader = header.toLowerCase().trim();
              if (cleanHeader.includes("geography")) return "geography";
              if (cleanHeader.includes("client")) return "client";
              if (cleanHeader.includes("process type")) return "project_name";
              if (cleanHeader.includes("location")) return "subproject_name";
              if (cleanHeader.includes("request type")) return "request_type";
              if (cleanHeader.includes("request rate") || cleanHeader === "request_rate") return "rate";
              if (cleanHeader.includes("costing rate") || cleanHeader === "rate") return "rate";
              if (cleanHeader.includes("payout rate") || cleanHeader === "payout_rate" || cleanHeader.includes("flat rate")) return "flatrate";
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
      const geography = norm(r.geography);
      const client = norm(r.client);
      const project_name = norm(r.project_name);
      const subproject_name = norm(r.subproject_name);
      let request_type = norm(r.request_type);
      
      const rateStr = r.rate !== undefined ? String(r.rate).trim() : "0";
      const rate = parseFloat(rateStr);

      const flatrateStr = r.flatrate !== undefined ? String(r.flatrate).trim() : "0";
      const flatrate = isNaN(parseFloat(flatrateStr)) ? 0 : parseFloat(flatrateStr);

      const rowOut = {
        __row: idx + 1,
        geography,
        client,
        project_name,
        subproject_name,
        request_type,
        rate,
        flatrate,
      };

      const rowErrors = [];

      if (!geography) rowErrors.push("Geography required");
      if (!client) rowErrors.push("Client required");
      if (!project_name) rowErrors.push("Process Type required");
      if (!subproject_name) rowErrors.push("Location required");
      if (!request_type) rowErrors.push("Request Type required");
      if (isNaN(rate)) rowErrors.push("Payout Rate must be a number");

      const matchedType = ALL_REQUEST_TYPES.find(
        (t) => t.toLowerCase() === request_type.toLowerCase()
      );
      if (!matchedType && request_type) {
        rowErrors.push(`Invalid Request Type. Allowed: ${ALL_REQUEST_TYPES.join(", ")}`);
      } else if (matchedType) {
        rowOut.request_type = matchedType;
      }

      const uniqueKey = `${normalizeName(geography)}|${normalizeName(client)}|${normalizeName(project_name)}|${normalizeName(subproject_name)}|${normalizeName(request_type)}`;
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
      const projKey = normalizeName(r.project_name);
      const subKey = normalizeName(r.subproject_name);

      if (!geographyMap.has(geoKey)) {
        geographyMap.set(geoKey, {
          name: r.geography,
          clients: new Map()
        });
      }

      const geography = geographyMap.get(geoKey);
      
      if (!geography.clients.has(clientKey)) {
        geography.clients.set(clientKey, {
          name: r.client,
          projects: new Map()
        });
      }

      const client = geography.clients.get(clientKey);

      if (!client.projects.has(projKey)) {
        client.projects.set(projKey, {
          name: r.project_name,
          subprojects: new Map()
        });
      }

      const project = client.projects.get(projKey);
      
      if (!project.subprojects.has(subKey)) {
        project.subprojects.set(subKey, {
          name: r.subproject_name,
          flatrate: r.flatrate,
          rates: new Map()
        });
      }

      const subproject = project.subprojects.get(subKey);
      subproject.rates.set(r.request_type, r.rate);
      
      if (r.flatrate > subproject.flatrate) {
        subproject.flatrate = r.flatrate;
      }
    }

    // 4. UPSERT (same as incremental)
    const stats = {
      geographies: { created: 0, existing: 0 },
      clients: { created: 0, existing: 0 },
      projects: { created: 0, existing: 0 },
      subprojects: { created: 0, updated: 0, deactivated: 0 },
      requestTypes: { created: 0, updated: 0 }
    };

    const processedBusinessKeys = [];
    const processedProjectIds = new Set(); // Track which projects are in the CSV
    const processedSubprojectIds = []; // Track for assignment sync

    for (const [geoKey, geoData] of geographyMap) {
      let geography = await Geography.findOne({
        name: { $regex: new RegExp(`^${escapeRegex(geoData.name)}$`, 'i') }
      });

      if (!geography) {
        geography = await Geography.create({
          name: geoData.name,
          description: "Imported via Verisma Bulk Upload",
          status: "active"
        });
        stats.geographies.created++;
      } else {
        stats.geographies.existing++;
      }

      for (const [clientKey, clientData] of geoData.clients) {
        let client = await Client.findOne({
          geography_id: geography._id,
          name: { $regex: new RegExp(`^${escapeRegex(clientData.name)}$`, 'i') }
        });

        if (!client) {
          client = await Client.create({
            name: clientData.name,
            geography_id: geography._id,
            geography_name: geography.name,
            description: "Imported via Verisma Bulk Upload",
            status: "active"
          });
          stats.clients.created++;
        } else {
          stats.clients.existing++;
        }

        for (const [projKey, projData] of clientData.projects) {
          let project = await Project.findOne({
            client_id: client._id,
            name: { $regex: new RegExp(`^${escapeRegex(projData.name)}$`, 'i') }
          });

          if (!project) {
            project = await Project.create({
              name: projData.name,
              geography_id: geography._id,
              geography_name: geography.name,
              client_id: client._id,
              client_name: client.name,
              description: "Imported via Verisma Bulk Upload",
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
            const businessKey = generateBusinessKey(client.name, project.name, subData.name);
            processedBusinessKeys.push(businessKey);

            let subproject = await Subproject.findOne({ business_key: businessKey });

            if (!subproject) {
              subproject = await Subproject.findOne({
                project_id: project._id,
                name: { $regex: new RegExp(`^${escapeRegex(subData.name)}$`, 'i') }
              });
            }

            if (subproject) {
              subproject.business_key = businessKey;
              subproject.client_name = client.name;
              subproject.project_name = project.name;
              subproject.geography_name = geography.name;
              subproject.flatrate = subData.flatrate;
              subproject.status = 'active';
              subproject.deactivated_at = null;
              await subproject.save();
              stats.subprojects.updated++;
            } else {
              subproject = await Subproject.create({
                name: subData.name,
                geography_id: geography._id,
                geography_name: geography.name,
                client_id: client._id,
                client_name: client.name,
                project_id: project._id,
                project_name: project.name,
                business_key: businessKey,
                description: "Imported via Verisma Bulk Upload",
                status: "active",
                flatrate: subData.flatrate
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
              client_id: client._id,
              client_name: client.name,
              project_id: project._id,
              project_name: project.name
            });

            // Request Types with rates
            for (const reqType of ALL_REQUEST_TYPES) {
              const rate = subData.rates.get(reqType) || 0;

              const existingReqType = await SubprojectRequestType.findOne({
                subproject_id: subproject._id,
                name: reqType
              });

              if (existingReqType) {
                existingReqType.rate = rate;
                await existingReqType.save();
                stats.requestTypes.updated++;
              } else {
                await SubprojectRequestType.create({
                  geography_id: geography._id,
                  client_id: client._id,
                  project_id: project._id,
                  subproject_id: subproject._id,
                  name: reqType,
                  rate: rate
                });
                stats.requestTypes.created++;
              }
            }
          }
        }
      }
    }

    // 5. SOFT DELETE subprojects not in upload
    // CRITICAL: Only affect subprojects under projects (process types) that were IN THE CSV
    // This ensures uploading Processing data does NOT soft-delete Indexing locations
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

    console.log(`[REPLACE] Soft-deleted ${stats.subprojects.deactivated} subprojects not in upload`);

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
      message: "Verisma bulk upload (replace mode) completed.",
      summary: {
        geographies: stats.geographies,
        clients: stats.clients,
        projects: stats.projects,
        subprojects: stats.subprojects,
        requestTypes: stats.requestTypes,
        assignmentsSynced,
        note: "Only projects (process types) in CSV affected. Other projects are preserved."
      },
      rowsProcessed: validRows.length,
    });

  } catch (err) {
    console.error("Verisma Bulk upload error:", err);
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
      "project_name",
      "subproject_name",
      "request_type",
      "rate",
      "errors"
    ];
    const parser = new Parser({ fields });
    const csvOut = parser.parse(errors);

    fs.unlinkSync(filePath);
    res.setHeader("Content-Disposition", "attachment; filename=verisma-upload-errors.csv");
    res.setHeader("Content-Type", "text/csv");
    return res.status(400).send(csvOut);
  } catch (err) {
    return res.status(500).json({ error: "Error generating error report" });
  }
}

// =============================================
// VERISMA EXPORT - Download all Verisma project data as CSV
// =============================================
router.get("/verisma-export", async (req, res) => {
  try {
    // Find all Verisma clients (case-insensitive)
    const verismaClients = await Client.find({
      name: { $regex: /^verisma$/i }
    }).lean();

    if (verismaClients.length === 0) {
      return res.status(404).json({ error: "No Verisma client found" });
    }

    const clientIds = verismaClients.map(c => c._id);

    // Find ALL projects under Verisma clients
    const projects = await Project.find({
      client_id: { $in: clientIds }
    }).lean();

    if (projects.length === 0) {
      return res.status(404).json({ error: "No Verisma projects found" });
    }

    const projectIds = projects.map(p => p._id);

    // Get ALL active subprojects under those projects (query by project_id, not client_id)
    const subprojects = await Subproject.find({
      project_id: { $in: projectIds },
      status: 'active'
    }).lean();

    if (subprojects.length === 0) {
      return res.status(404).json({ error: "No active Verisma locations found" });
    }

    // Build project lookup for names
    const projectMap = {};
    projects.forEach(p => { projectMap[p._id.toString()] = p; });

    // Build client lookup for names
    const clientMap = {};
    verismaClients.forEach(c => { clientMap[c._id.toString()] = c; });

    const subprojectIds = subprojects.map(sp => sp._id);

    // Get all request types for these subprojects
    const requestTypes = await SubprojectRequestType.find({
      subproject_id: { $in: subprojectIds }
    }).lean();

    // Build a lookup: subproject_id -> { requestTypeName: rate }
    const rateMap = {};
    requestTypes.forEach(rt => {
      const spId = rt.subproject_id.toString();
      if (!rateMap[spId]) rateMap[spId] = {};
      rateMap[spId][rt.name] = rt.rate || 0;
    });

    // Build CSV rows - one row per subproject per request type
    const csvRows = [];
    for (const sp of subprojects) {
      const spId = sp._id.toString();
      const rates = rateMap[spId] || {};
      const proj = projectMap[sp.project_id?.toString()] || {};
      const cli = clientMap[sp.client_id?.toString()] || {};

      for (const reqType of ALL_REQUEST_TYPES) {
        csvRows.push({
          geography: sp.geography_name || '',
          client: sp.client_name || cli.name || '',
          'process type': sp.project_name || proj.name || '',
          location: sp.name || '',
          'request type': reqType,
          'request rate': rates[reqType] || 0,
          'payout rate': sp.flatrate || 0
        });
      }
    }

    const parser = new Parser({
      fields: ['geography', 'client', 'process type', 'location', 'request type', 'request rate', 'payout rate']
    });
    const csvOut = parser.parse(csvRows);

    res.setHeader("Content-Disposition", "attachment; filename=verisma-project-export.csv");
    res.setHeader("Content-Type", "text/csv");
    return res.send(csvOut);
  } catch (err) {
    console.error("Verisma export error:", err);
    return res.status(500).json({ error: "Failed to export Verisma data: " + err.message });
  }
});

module.exports = router;