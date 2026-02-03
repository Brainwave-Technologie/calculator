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
              if (cleanHeader.includes("costing rate") || cleanHeader === "rate") return "rate";
              if (cleanHeader.includes("flat rate")) return "flatrate";
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
      const flatrate = parseFloat(flatrateStr);

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
      if (isNaN(rate)) rowErrors.push("Rate must be a number");
      if (isNaN(flatrate)) rowErrors.push("Flat Rate must be a number");

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

    for (const [geoKey, geoData] of geographyMap) {
      // UPSERT Geography (shared across all clients, don't delete)
      let geography = await Geography.findOne({ 
        name: { $regex: new RegExp(`^${geoData.name}$`, 'i') }
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
          name: { $regex: new RegExp(`^${clientData.name}$`, 'i') }
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
            name: { $regex: new RegExp(`^${projData.name}$`, 'i') }
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
                name: { $regex: new RegExp(`^${subData.name}$`, 'i') }
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
              if (cleanHeader.includes("costing rate") || cleanHeader === "rate") return "rate";
              if (cleanHeader.includes("flat rate")) return "flatrate";
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
      const flatrate = parseFloat(flatrateStr);

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
      if (isNaN(rate)) rowErrors.push("Rate must be a number");
      if (isNaN(flatrate)) rowErrors.push("Flat Rate must be a number");

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
    const processedClientNames = new Set(); // Track which clients are in the CSV

    for (const [geoKey, geoData] of geographyMap) {
      let geography = await Geography.findOne({ 
        name: { $regex: new RegExp(`^${geoData.name}$`, 'i') }
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
        // Track which clients are in this CSV
        processedClientNames.add(clientData.name.toLowerCase().trim());
        
        let client = await Client.findOne({
          geography_id: geography._id,
          name: { $regex: new RegExp(`^${clientData.name}$`, 'i') }
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
            name: { $regex: new RegExp(`^${projData.name}$`, 'i') }
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

          for (const [subKey, subData] of projData.subprojects) {
            const businessKey = generateBusinessKey(client.name, project.name, subData.name);
            processedBusinessKeys.push(businessKey);

            let subproject = await Subproject.findOne({ business_key: businessKey });
            
            if (!subproject) {
              subproject = await Subproject.findOne({
                project_id: project._id,
                name: { $regex: new RegExp(`^${subData.name}$`, 'i') }
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
    // CRITICAL: Only affect clients that were IN THE CSV, NOT MRO or others!
    const clientNamesArray = Array.from(processedClientNames);
    console.log(`[REPLACE] Clients in CSV: ${clientNamesArray.join(', ')}`);
    
    // Build regex array for client names
    const clientRegexArray = clientNamesArray.map(name => new RegExp(`^${name}$`, 'i'));
    
    const deactivateResult = await Subproject.updateMany(
      {
        business_key: { $nin: processedBusinessKeys },
        client_name: { $in: clientRegexArray },  // ONLY clients in CSV!
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
        affectedClients: clientNamesArray,
        note: "Only clients in CSV affected. MRO and clients NOT in CSV are preserved."
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
      "flatrate", 
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

module.exports = router;