// routes/upload-datavant.routes.js - Datavant-specific Bulk Upload with UPSERT logic (preserves IDs)
const express = require("express");
const router = express.Router();
const multer = require("multer");
const csv = require("csv-parser");
const fs = require("fs");
const { Parser } = require("json2csv");

const Geography = require("../../models/Geography");
const Client = require("../../models/Client");
const Project = require("../../models/Project");
const Subproject = require("../../models/Subproject");
const SubprojectRequestType = require("../../models/SubprojectRequestType");

const upload = multer({ dest: "uploads/" });

const norm = (s) => (typeof s === "string" ? s.trim() : "");

function normalizeName(name) {
  return name.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

// ============================================
// DATAVANT CONSTANTS
// ============================================
const DATAVANT_REQUEST_TYPES = ['New Request', 'Follow up'];
const DATAVANT_TASK_TYPES = ['Data Entry', 'QA', 'Verification', 'Processing', 'Other'];

// ============================================
// HELPER: Generate business key for Datavant
// ============================================
function generateBusinessKey(clientName, projectName, subprojectName) {
  return [
    (clientName || '').toLowerCase().trim(),
    (projectName || '').toLowerCase().trim(),
    (subprojectName || '').toLowerCase().trim()
  ].join('|');
}

// =============================================
// DATAVANT BULK UPLOAD - UPSERT MODE
// Only affects Datavant client data, preserves MRO, Verisma and other clients
// =============================================
router.post("/datavant-bulk-upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const filePath = req.file.path;
  const rows = [];

  try {
    console.log("⏱️ Datavant Bulk Upload (UPSERT mode) started...");

    // 1. Read CSV
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(
          csv({
            mapHeaders: ({ header }) => {
              const h = header.toLowerCase().trim();
              if (h.includes("geography")) return "geography";
              if (h.includes("client")) return "client";
              if (h.includes("process") && h.includes("type")) return "process_type";
              if (h.includes("location") || h.includes("subproject")) return "location";
              if (h.includes("request") && h.includes("type")) return "request_type";
              if (h.includes("rate") || h.includes("costing")) return "rate";
              if (h.includes("flat") && h.includes("rate")) return "flatrate";
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
      const location = norm(r.location);
      let process_type = norm(r.process_type);
      let request_type = norm(r.request_type);
      
      const rate = parseFloat(r.rate) || 0;
      const flatrate = parseFloat(r.flatrate) || 0;

      const rowOut = {
        __row: idx + 1,
        geography,
        location,
        process_type,
        request_type,
        rate,
        flatrate,
      };

      const rowErrors = [];

      if (!location) rowErrors.push("Location required");
      if (!process_type) rowErrors.push("Process Type required");

      // Request type is optional for Datavant
      if (request_type) {
        const matchedRequestType = DATAVANT_REQUEST_TYPES.find(
          (t) => t.toLowerCase() === request_type.toLowerCase()
        );
        if (matchedRequestType) {
          rowOut.request_type = matchedRequestType;
        }
      }

      const uniqueKey = `${normalizeName(geography)}|${normalizeName(process_type)}|${normalizeName(location)}`;
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
      const projKey = normalizeName(r.process_type);
      const subKey = normalizeName(r.location);

      if (!geographyMap.has(geoKey)) {
        geographyMap.set(geoKey, { name: r.geography, projects: new Map() });
      }

      const geography = geographyMap.get(geoKey);

      if (!geography.projects.has(projKey)) {
        geography.projects.set(projKey, { name: r.process_type, subprojects: new Map() });
      }

      const project = geography.projects.get(projKey);

      if (!project.subprojects.has(subKey)) {
        project.subprojects.set(subKey, {
          name: r.location,
          flatrate: r.flatrate,
          rates: new Map()
        });
      }

      const subproject = project.subprojects.get(subKey);
      if (r.request_type) {
        subproject.rates.set(r.request_type, r.rate);
      }
      
      if (r.flatrate > subproject.flatrate) {
        subproject.flatrate = r.flatrate;
      }
    }

    console.log(`📊 Found ${geographyMap.size} unique geographies`);

    // 4. UPSERT hierarchy - Only affects Datavant!
    const stats = {
      geographies: { created: 0, existing: 0 },
      clients: { created: 0, existing: 0 },
      projects: { created: 0, existing: 0 },
      subprojects: { created: 0, updated: 0 },
      requestTypes: 0
    };

    const processedBusinessKeys = [];

    for (const [geoKey, geoData] of geographyMap) {
      // UPSERT Geography
      let geography = await Geography.findOne({ 
        name: { $regex: new RegExp(`^${geoData.name}$`, 'i') }
      });
      
      if (!geography) {
        geography = await Geography.create({
          name: geoData.name,
          description: "Created via Datavant Bulk Upload",
          status: "active"
        });
        stats.geographies.created++;
        console.log(`✅ Created geography: ${geoData.name}`);
      } else {
        stats.geographies.existing++;
      }

      // UPSERT Datavant Client only!
      let datavantClient = await Client.findOne({
        geography_id: geography._id,
        name: { $regex: /^Datavant$/i }
      });

      if (!datavantClient) {
        datavantClient = await Client.create({
          name: "Datavant",
          geography_id: geography._id,
          geography_name: geography.name,
          description: "Datavant Client - Created via Bulk Upload",
          status: "active"
        });
        stats.clients.created++;
        console.log(`✅ Created Datavant client under ${geography.name}`);
      } else {
        stats.clients.existing++;
      }

      // Process each project
      for (const [projKey, projData] of geoData.projects) {
        let project = await Project.findOne({
          client_id: datavantClient._id,
          name: { $regex: new RegExp(`^${projData.name}$`, 'i') }
        });

        if (!project) {
          project = await Project.create({
            name: projData.name,
            geography_id: geography._id,
            geography_name: geography.name,
            client_id: datavantClient._id,
            client_name: datavantClient.name,
            description: `Datavant ${projData.name} - Created via Bulk Upload`,
            status: "active",
            visibility: "visible"
          });
          stats.projects.created++;
          console.log(`✅ Created project: ${projData.name}`);
        } else {
          stats.projects.existing++;
        }

        // Process each subproject
        for (const [subKey, subData] of projData.subprojects) {
          const businessKey = generateBusinessKey(datavantClient.name, project.name, subData.name);
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
            subproject.client_name = datavantClient.name;
            subproject.project_name = project.name;
            subproject.geography_name = geography.name;
            subproject.flatrate = subData.flatrate || 0;
            subproject.status = 'active';
            subproject.deactivated_at = null;
            await subproject.save();
            stats.subprojects.updated++;
            console.log(`  📝 Updated: ${subData.name} (ID preserved: ${subproject._id})`);
          } else {
            subproject = await Subproject.create({
              name: subData.name,
              geography_id: geography._id,
              geography_name: geography.name,
              client_id: datavantClient._id,
              client_name: datavantClient.name,
              project_id: project._id,
              project_name: project.name,
              business_key: businessKey,
              description: "Created via Datavant Bulk Upload",
              status: "active",
              flatrate: subData.flatrate || 0
            });
            stats.subprojects.created++;
            console.log(`  ✅ Created: ${subData.name} (ID: ${subproject._id})`);
          }

          // UPSERT Request Types
          for (const reqType of DATAVANT_REQUEST_TYPES) {
            const rate = subData.rates.get(reqType) || 0;
            
            await SubprojectRequestType.findOneAndUpdate(
              { subproject_id: subproject._id, name: reqType },
              {
                $set: { rate: rate },
                $setOnInsert: {
                  geography_id: geography._id,
                  client_id: datavantClient._id,
                  project_id: project._id,
                  name: reqType
                }
              },
              { upsert: true, new: true }
            );
            stats.requestTypes++;
          }
        }

        console.log(`  📦 Processed ${projData.subprojects.size} locations under ${projData.name}`);
      }
    }

    fs.unlinkSync(filePath);

    console.log(`\n🎉 Datavant Bulk Upload completed!`);

    return res.json({
      status: "success",
      message: "Datavant bulk upload completed successfully",
      summary: stats,
      rowsProcessed: validRows.length,
      note: "Only Datavant data affected. MRO, Verisma and other clients preserved."
    });

  } catch (err) {
    console.error("Datavant Bulk upload error:", err);
    try { fs.unlinkSync(filePath); } catch {}
    return res.status(500).json({ error: "Failed to process CSV: " + err.message });
  }
});

// =============================================
// DATAVANT BULK UPLOAD - REPLACE MODE
// =============================================
router.post("/datavant-bulk-upload-replace", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const filePath = req.file.path;
  const rows = [];

  try {
    console.log("⏱️ Datavant Bulk Upload (REPLACE mode) started...");

    // Read and validate CSV (same as upsert mode)
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(
          csv({
            mapHeaders: ({ header }) => {
              const h = header.toLowerCase().trim();
              if (h.includes("geography")) return "geography";
              if (h.includes("process") && h.includes("type")) return "process_type";
              if (h.includes("location") || h.includes("subproject")) return "location";
              if (h.includes("request") && h.includes("type")) return "request_type";
              if (h.includes("rate") || h.includes("costing")) return "rate";
              if (h.includes("flat") && h.includes("rate")) return "flatrate";
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

    // Validate
    const validRows = [];
    const csvDuplicateCheck = new Set();

    for (const r of rows) {
      const geography = norm(r.geography) || "US";
      const location = norm(r.location);
      const process_type = norm(r.process_type);
      const request_type = norm(r.request_type);
      const rate = parseFloat(r.rate) || 0;
      const flatrate = parseFloat(r.flatrate) || 0;

      if (!location || !process_type) continue;

      const uniqueKey = `${normalizeName(geography)}|${normalizeName(process_type)}|${normalizeName(location)}`;
      if (csvDuplicateCheck.has(uniqueKey)) continue;
      csvDuplicateCheck.add(uniqueKey);

      validRows.push({ geography, location, process_type, request_type, rate, flatrate });
    }

    if (validRows.length === 0) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: "CSV contains no valid data rows" });
    }

    // Group data
    const geographyMap = new Map();
    const processedBusinessKeys = [];

    for (const r of validRows) {
      const geoKey = normalizeName(r.geography);
      const projKey = normalizeName(r.process_type);
      const subKey = normalizeName(r.location);

      if (!geographyMap.has(geoKey)) {
        geographyMap.set(geoKey, { name: r.geography, projects: new Map() });
      }
      const geography = geographyMap.get(geoKey);

      if (!geography.projects.has(projKey)) {
        geography.projects.set(projKey, { name: r.process_type, subprojects: new Map() });
      }
      const project = geography.projects.get(projKey);

      if (!project.subprojects.has(subKey)) {
        project.subprojects.set(subKey, { name: r.location, flatrate: r.flatrate, rates: new Map() });
      }
      const subproject = project.subprojects.get(subKey);
      if (r.request_type) subproject.rates.set(r.request_type, r.rate);
      if (r.flatrate > subproject.flatrate) subproject.flatrate = r.flatrate;
    }

    const stats = {
      geographies: { created: 0, existing: 0 },
      clients: { created: 0, existing: 0 },
      projects: { created: 0, existing: 0 },
      subprojects: { created: 0, updated: 0, deactivated: 0 },
      requestTypes: 0
    };

    // UPSERT
    for (const [geoKey, geoData] of geographyMap) {
      let geography = await Geography.findOne({ name: { $regex: new RegExp(`^${geoData.name}$`, 'i') } });
      if (!geography) {
        geography = await Geography.create({ name: geoData.name, status: "active" });
        stats.geographies.created++;
      } else {
        stats.geographies.existing++;
      }

      let datavantClient = await Client.findOne({ geography_id: geography._id, name: { $regex: /^Datavant$/i } });
      if (!datavantClient) {
        datavantClient = await Client.create({ name: "Datavant", geography_id: geography._id, geography_name: geography.name, status: "active" });
        stats.clients.created++;
      } else {
        stats.clients.existing++;
      }

      for (const [projKey, projData] of geoData.projects) {
        let project = await Project.findOne({ client_id: datavantClient._id, name: { $regex: new RegExp(`^${projData.name}$`, 'i') } });
        if (!project) {
          project = await Project.create({ name: projData.name, geography_id: geography._id, geography_name: geography.name, client_id: datavantClient._id, client_name: datavantClient.name, status: "active", visibility: "visible" });
          stats.projects.created++;
        } else {
          stats.projects.existing++;
        }

        for (const [subKey, subData] of projData.subprojects) {
          const businessKey = generateBusinessKey(datavantClient.name, project.name, subData.name);
          processedBusinessKeys.push(businessKey);

          let subproject = await Subproject.findOne({ business_key: businessKey });
          if (!subproject) {
            subproject = await Subproject.findOne({ project_id: project._id, name: { $regex: new RegExp(`^${subData.name}$`, 'i') } });
          }

          if (subproject) {
            subproject.business_key = businessKey;
            subproject.client_name = datavantClient.name;
            subproject.project_name = project.name;
            subproject.flatrate = subData.flatrate || 0;
            subproject.status = 'active';
            subproject.deactivated_at = null;
            await subproject.save();
            stats.subprojects.updated++;
          } else {
            subproject = await Subproject.create({
              name: subData.name, geography_id: geography._id, geography_name: geography.name,
              client_id: datavantClient._id, client_name: datavantClient.name,
              project_id: project._id, project_name: project.name,
              business_key: businessKey, status: "active", flatrate: subData.flatrate || 0
            });
            stats.subprojects.created++;
          }

          for (const reqType of DATAVANT_REQUEST_TYPES) {
            const rate = subData.rates.get(reqType) || 0;
            await SubprojectRequestType.findOneAndUpdate(
              { subproject_id: subproject._id, name: reqType },
              { $set: { rate }, $setOnInsert: { geography_id: geography._id, client_id: datavantClient._id, project_id: project._id, name: reqType } },
              { upsert: true }
            );
            stats.requestTypes++;
          }
        }
      }
    }

    // SOFT DELETE Datavant subprojects not in upload (ONLY Datavant!)
    const deactivateResult = await Subproject.updateMany(
      {
        business_key: { $nin: processedBusinessKeys },
        client_name: { $regex: /^Datavant$/i },
        status: 'active'
      },
      { $set: { status: 'inactive', deactivated_at: new Date() } }
    );
    stats.subprojects.deactivated = deactivateResult.modifiedCount || 0;

    fs.unlinkSync(filePath);

    return res.json({
      status: "success",
      message: "Datavant bulk upload (replace mode) completed",
      summary: stats,
      rowsProcessed: validRows.length,
      note: "Only Datavant data affected. MRO, Verisma and other clients preserved."
    });

  } catch (err) {
    console.error("Datavant Bulk upload error:", err);
    try { fs.unlinkSync(filePath); } catch {}
    return res.status(500).json({ error: "Failed to process CSV: " + err.message });
  }
});

// Helper
function sendErrorCsv(res, filePath, errors) {
  try {
    const fields = ["__row", "geography", "location", "process_type", "request_type", "rate", "flatrate", "errors"];
    const parser = new Parser({ fields });
    const csvOut = parser.parse(errors);
    fs.unlinkSync(filePath);
    res.setHeader("Content-Disposition", "attachment; filename=datavant-upload-errors.csv");
    res.setHeader("Content-Type", "text/csv");
    return res.status(400).send(csvOut);
  } catch (err) {
    fs.unlinkSync(filePath);
    return res.status(500).json({ error: "Error generating error report" });
  }
}

module.exports = router;