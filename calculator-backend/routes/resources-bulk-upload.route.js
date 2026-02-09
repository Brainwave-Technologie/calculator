// routes/upload-resource.routes.js - Resource CSV Upload with UPSERT logic + Daily Assignments
const express = require("express");
const router = express.Router();
const multer = require("multer");
const csv = require("csv-parser");
const fs = require("fs");
const { Parser } = require("json2csv");

const Resource = require("../models/Resource");
const Geography = require("../models/Geography");
const Client = require("../models/Client");
const Project = require("../models/Project");
const Subproject = require("../models/Subproject");
const ActivityLog = require("../models/ActivityLog");

// Daily Assignment Models
const VerismaAssignment = require("../models/DailyAssignments/VerismaAssignment");
const MROAssignment = require("../models/DailyAssignments/MROAssignment");

const upload = multer({ dest: "uploads/" });

const norm = (s) => (typeof s === "string" ? s.trim() : "");

// =============================================
// HELPER: Generate subproject business key
// =============================================
function generateSubprojectKey(clientName, projectName, subprojectName) {
  return [
    (clientName || '').toLowerCase().trim(),
    (projectName || '').toLowerCase().trim(),
    (subprojectName || '').toLowerCase().trim()
  ].join('|');
}

// =============================================
// RESOURCE BULK UPLOAD - UPSERT MODE
// Preserves existing resource IDs, updates assignments
// =============================================
router.post("/bulk", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const filePath = req.file.path;
  const rows = [];

  try {
    console.log("⏱️ Resource Bulk Upload (UPSERT mode) started...");

    // 1. Read CSV
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(
          csv({
            mapHeaders: ({ header }) => {
              const h = header.toLowerCase().trim();
              if (h === "name" || h === "resource name" || h === "resource" || h === "assigner name") return "name";
              if (h === "location" || h === "subproject" || h === "sub-project" || h === "sub project") return "location";
              if (h === "process type" || h === "process_type" || h === "processtype" || h === "project" || h === "process") return "process_type";
              if (h === "client" || h === "client name" || h === "client_name") return "client";
              if (h === "geography" || h === "geo" || h === "region") return "geography";
              if (h === "email" || h === "email id" || h === "email_id" || h === "emailid") return "email";
              if (h === "role") return "role";
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

    for (let idx = 0; idx < rows.length; idx++) {
      const r = rows[idx];
      const rowNum = idx + 2;

      const name = norm(r.name);
      const location = norm(r.location);
      const processType = norm(r.process_type);
      const clientName = norm(r.client);
      const geographyName = norm(r.geography) || "US";
      const email = norm(r.email);
      const role = norm(r.role) || "associate";

      const rowErrors = [];

      if (!name) rowErrors.push("Name is required");
      if (!email) rowErrors.push("Email is required");
      if (!location) rowErrors.push("Location is required");
      if (!processType) rowErrors.push("Process Type is required");
      if (!clientName) rowErrors.push("Client is required");

      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        rowErrors.push("Invalid email format");
      }

      if (rowErrors.length > 0) {
        errors.push({
          row: rowNum,
          name,
          location,
          process_type: processType,
          client: clientName,
          geography: geographyName,
          email,
          errors: rowErrors.join("; "),
        });
      } else {
        validRows.push({
          rowNum,
          name,
          location,
          processType,
          clientName,
          geographyName,
          email: email.toLowerCase().trim(),
          role,
        });
      }
    }

    console.log(`✅ Validated: ${validRows.length} valid, ${errors.length} errors`);

    // 3. Process valid rows - Group by resource email
    const resourceMap = new Map();

    for (const row of validRows) {
      // Find Geography
      const geography = await Geography.findOne({
        name: { $regex: new RegExp(`^${row.geographyName}$`, "i") },
      }).lean();

      if (!geography) {
        errors.push({
          row: row.rowNum,
          name: row.name,
          location: row.location,
          process_type: row.processType,
          client: row.clientName,
          geography: row.geographyName,
          email: row.email,
          errors: `Geography "${row.geographyName}" not found`,
        });
        continue;
      }

      // Find Client
      const client = await Client.findOne({
        geography_id: geography._id,
        name: { $regex: new RegExp(`^${row.clientName}$`, "i") },
      }).lean();

      if (!client) {
        errors.push({
          row: row.rowNum,
          name: row.name,
          location: row.location,
          process_type: row.processType,
          client: row.clientName,
          geography: row.geographyName,
          email: row.email,
          errors: `Client "${row.clientName}" not found under geography "${row.geographyName}"`,
        });
        continue;
      }

      // Find Project (Process Type)
      let project = await Project.findOne({
        client_id: client._id,
        name: { $regex: new RegExp(`^${row.processType}$`, "i") },
      }).lean();

      // Try partial match if exact match not found
      if (!project) {
        const processTypeWords = row.processType.toLowerCase().split(/\s+/);
        const lastWord = processTypeWords[processTypeWords.length - 1];
        
        project = await Project.findOne({
          client_id: client._id,
          name: { $regex: new RegExp(lastWord, "i") },
        }).lean();
      }

      if (!project) {
        errors.push({
          row: row.rowNum,
          name: row.name,
          location: row.location,
          process_type: row.processType,
          client: row.clientName,
          geography: row.geographyName,
          email: row.email,
          errors: `Process Type "${row.processType}" not found under client "${row.clientName}"`,
        });
        continue;
      }

      // Find or Create Subproject using business key (UPSERT)
      const subprojectKey = generateSubprojectKey(client.name, project.name, row.location);
      
      let subproject = await Subproject.findOne({
        business_key: subprojectKey
      }).lean();
      
      // If not found by business key, try by project_id and name
      if (!subproject) {
        subproject = await Subproject.findOne({
          project_id: project._id,
          name: { $regex: new RegExp(`^${row.location}$`, "i") },
        }).lean();
        
        // Update with business key if found
        if (subproject && !subproject.business_key) {
          await Subproject.updateOne(
            { _id: subproject._id },
            { 
              $set: { 
                business_key: subprojectKey,
                client_name: client.name,
                project_name: project.name
              } 
            }
          );
          subproject.business_key = subprojectKey;
        }
      }

      if (!subproject) {
        errors.push({
          row: row.rowNum,
          name: row.name,
          location: row.location,
          process_type: row.processType,
          client: row.clientName,
          geography: row.geographyName,
          email: row.email,
          errors: `Location "${row.location}" not found under process type "${project.name}"`,
        });
        continue;
      }

      // Add to resource map with proper assignment structure
      const emailKey = row.email;
      if (!resourceMap.has(emailKey)) {
        resourceMap.set(emailKey, {
          name: row.name,
          email: row.email,
          role: row.role,
          assignmentsMap: new Map(),
        });
      }

      const resourceData = resourceMap.get(emailKey);
      
      // Create key for this assignment group (geography + client + project)
      const assignmentKey = `${geography._id}|${client._id}|${project._id}`;
      
      if (!resourceData.assignmentsMap.has(assignmentKey)) {
        resourceData.assignmentsMap.set(assignmentKey, {
          geography_id: geography._id,
          geography_name: geography.name,
          client_id: client._id,
          client_name: client.name,
          project_id: project._id,
          project_name: project.name,
          subprojectsMap: new Map(),
        });
      }

      // Add subproject to this assignment
      const assignment = resourceData.assignmentsMap.get(assignmentKey);
      const spIdStr = subproject._id.toString();
      if (!assignment.subprojectsMap.has(spIdStr)) {
        assignment.subprojectsMap.set(spIdStr, {
          subproject_id: subproject._id,
          subproject_name: subproject.name,
          subproject_key: subprojectKey // Store business key!
        });
      }
    }

    // 4. UPSERT Resources - Preserve existing IDs!
    const stats = {
      created: 0,
      updated: 0,
      assignments: 0,
      assignmentsAdded: 0,
      assignmentsRemoved: 0
    };

    for (const [email, data] of resourceMap) {
      // Convert maps to arrays for the assignments
      const newAssignments = [];
      for (const [, assignmentData] of data.assignmentsMap) {
        const subprojects = Array.from(assignmentData.subprojectsMap.values());
        newAssignments.push({
          geography_id: assignmentData.geography_id,
          geography_name: assignmentData.geography_name,
          client_id: assignmentData.client_id,
          client_name: assignmentData.client_name,
          project_id: assignmentData.project_id,
          project_name: assignmentData.project_name,
          subprojects: subprojects,
        });
        stats.assignments += subprojects.length;
      }

      // Check if resource exists using normalized email
      let resource = await Resource.findOne({ 
        $or: [
          { email_normalized: email },
          { email: { $regex: new RegExp(`^${email}$`, "i") } }
        ]
      });

      if (resource) {
        // Track assignment changes for activity log
        const oldAssignmentKeys = new Set();
        const newAssignmentKeys = new Set();
        
        for (const assignment of resource.assignments || []) {
          for (const sp of assignment.subprojects || []) {
            if (sp.subproject_key) {
              oldAssignmentKeys.add(sp.subproject_key);
            }
          }
        }
        
        for (const assignment of newAssignments) {
          for (const sp of assignment.subprojects || []) {
            if (sp.subproject_key) {
              newAssignmentKeys.add(sp.subproject_key);
            }
          }
        }
        
        const addedKeys = [...newAssignmentKeys].filter(k => !oldAssignmentKeys.has(k));
        const removedKeys = [...oldAssignmentKeys].filter(k => !newAssignmentKeys.has(k));
        
        // Merge new assignments with existing ones
        for (const newAssignment of newAssignments) {
          const existingAssignmentIndex = resource.assignments.findIndex(
            (a) =>
              a.geography_id?.toString() === newAssignment.geography_id.toString() &&
              a.client_id?.toString() === newAssignment.client_id.toString() &&
              a.project_id?.toString() === newAssignment.project_id.toString()
          );

          if (existingAssignmentIndex >= 0) {
            // Merge subprojects into existing assignment
            const existingAssignment = resource.assignments[existingAssignmentIndex];
            for (const newSp of newAssignment.subprojects) {
              const spExists = existingAssignment.subprojects?.some(
                (sp) => sp.subproject_id?.toString() === newSp.subproject_id.toString()
              );
              if (!spExists) {
                if (!existingAssignment.subprojects) {
                  existingAssignment.subprojects = [];
                }
                existingAssignment.subprojects.push(newSp);
              }
            }
          } else {
            // Add new assignment
            resource.assignments.push(newAssignment);
          }
        }

        resource.name = data.name;
        resource.role = data.role;
        resource.email_normalized = email; // Ensure normalized email is set
        resource.status = 'active'; // Reactivate if was inactive
        resource.deactivated_at = null;
        resource.deactivated_reason = null;
        
        await resource.save();
        stats.updated++;
        stats.assignmentsAdded += addedKeys.length;
        
        // Log activity for added assignments
        if (ActivityLog && addedKeys.length > 0) {
          try {
            for (const key of addedKeys) {
              await ActivityLog.create({
                activity_type: 'ASSIGNMENT_ADDED',
                actor_type: 'system',
                actor_email: 'csv_upload',
                resource_id: resource._id,
                resource_email: resource.email,
                resource_name: resource.name,
                subproject_key: key,
                details: { added_via: 'csv_bulk_upload' }
              });
            }
          } catch (logErr) {
            console.log('Activity log error (non-fatal):', logErr.message);
          }
        }
        
        console.log(`[UPSERT] Updated: ${email} (ID: ${resource._id}, +${addedKeys.length} assignments)`);
      } else {
        // Create new resource
        resource = new Resource({
          name: data.name,
          email: email,
          email_normalized: email,
          role: data.role,
          status: "active",
          assignments: newAssignments,
          login_count: 0,
          total_logins: 0,
          otp_attempts: 0,
        });

        await resource.save();
        stats.created++;
        
        console.log(`[UPSERT] Created: ${email} (ID: ${resource._id})`);
      }
    }

    // Clean up
    fs.unlinkSync(filePath);

    // Return results
    if (errors.length > 0) {
      const fields = ["row", "name", "location", "process_type", "client", "geography", "email", "errors"];
      const parser = new Parser({ fields });
      const csvOut = parser.parse(errors);

      res.setHeader("Content-Disposition", "attachment; filename=resource-upload-errors.csv");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("X-Has-Errors", "true");
      res.setHeader("X-Stats", JSON.stringify(stats));
      return res.status(207).send(csvOut);
    }

    console.log(`\n🎉 Resource Bulk Upload completed!`);
    console.log(`   Created: ${stats.created}, Updated: ${stats.updated}, Assignments: ${stats.assignments}`);

    return res.json({
      status: "success",
      message: `Successfully processed ${resourceMap.size} resources`,
      stats,
    });
  } catch (err) {
    console.error("Resource Bulk upload error:", err);
    try {
      fs.unlinkSync(filePath);
    } catch {}
    return res.status(500).json({ error: "Failed to process CSV: " + err.message });
  }
});

// =============================================
// DAILY ASSIGNMENT UPLOAD - Creates pending assignments for resources
// CSV Format: assignment_date, resource_email, location, client, process_type
// =============================================
router.post("/daily-assignments", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const filePath = req.file.path;
  const rows = [];

  try {
    console.log("⏱️ Daily Assignment Upload started...");

    // 1. Read CSV
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(
          csv({
            mapHeaders: ({ header }) => {
              const h = header.toLowerCase().trim();
              if (h === "date" || h === "assignment_date" || h === "assignment date") return "assignment_date";
              if (h === "name" || h === "resource name" || h === "resource" || h === "assigner name") return "name";
              if (h === "location" || h === "subproject" || h === "sub-project" || h === "sub project") return "location";
              if (h === "process type" || h === "process_type" || h === "processtype" || h === "project" || h === "process") return "process_type";
              if (h === "client" || h === "client name" || h === "client_name") return "client";
              if (h === "geography" || h === "geo" || h === "region") return "geography";
              if (h === "email" || h === "email id" || h === "email_id" || h === "emailid") return "email";
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

    // 2. Validate and process rows
    const errors = [];
    const stats = {
      total_rows: rows.length,
      created: 0,
      skipped: 0,
      errors: 0
    };

    const batchId = `daily_assign_${Date.now()}`;
    const adminEmail = req.user?.email || req.admin?.email || 'system';

    for (let idx = 0; idx < rows.length; idx++) {
      const r = rows[idx];
      const rowNum = idx + 2;

      try {
        const assignmentDate = norm(r.assignment_date);
        const name = norm(r.name);
        const location = norm(r.location);
        const processType = norm(r.process_type);
        const clientName = norm(r.client);
        const geographyName = norm(r.geography) || "US";
        const email = norm(r.email)?.toLowerCase();

        // Validate required fields
        if (!assignmentDate || !email || !location || !clientName) {
          errors.push({
            row: rowNum,
            email,
            location,
            client: clientName,
            error: "Missing required fields (date, email, location, client)"
          });
          stats.errors++;
          continue;
        }

        // Parse date
        const parsedDate = new Date(assignmentDate);
        if (isNaN(parsedDate.getTime())) {
          errors.push({ row: rowNum, email, location, error: `Invalid date: ${assignmentDate}` });
          stats.errors++;
          continue;
        }
        parsedDate.setHours(0, 0, 0, 0);

        // Find resource
        const resource = await Resource.findOne({
          $or: [
            { email_normalized: email },
            { email: { $regex: new RegExp(`^${email}$`, "i") } }
          ]
        });

        if (!resource) {
          errors.push({ row: rowNum, email, location, error: `Resource not found: ${email}` });
          stats.errors++;
          continue;
        }

        // Find Geography
        const geography = await Geography.findOne({
          name: { $regex: new RegExp(`^${geographyName}$`, "i") },
        }).lean();

        if (!geography) {
          errors.push({ row: rowNum, email, location, error: `Geography not found: ${geographyName}` });
          stats.errors++;
          continue;
        }

        // Find Client
        const client = await Client.findOne({
          geography_id: geography._id,
          name: { $regex: new RegExp(`^${clientName}$`, "i") },
        }).lean();

        if (!client) {
          errors.push({ row: rowNum, email, location, error: `Client not found: ${clientName}` });
          stats.errors++;
          continue;
        }

        // Find Project (if provided)
        let project = null;
        if (processType) {
          project = await Project.findOne({
            client_id: client._id,
            name: { $regex: new RegExp(`^${processType}$`, "i") },
          }).lean();

          if (!project) {
            // Try partial match
            const lastWord = processType.toLowerCase().split(/\s+/).pop();
            project = await Project.findOne({
              client_id: client._id,
              name: { $regex: new RegExp(lastWord, "i") },
            }).lean();
          }
        }

        // Find Subproject
        const subprojectKey = generateSubprojectKey(client.name, project?.name || '', location);
        
        let subproject = await Subproject.findOne({
          business_key: subprojectKey
        }).lean();

        if (!subproject && project) {
          subproject = await Subproject.findOne({
            project_id: project._id,
            name: { $regex: new RegExp(`^${location}$`, "i") },
          }).lean();
        }

        if (!subproject) {
          // Try to find by name only under the client
          subproject = await Subproject.findOne({
            client_name: { $regex: new RegExp(`^${clientName}$`, "i") },
            name: { $regex: new RegExp(`^${location}$`, "i") },
          }).lean();
        }

        if (!subproject) {
          errors.push({ row: rowNum, email, location, error: `Location not found: ${location}` });
          stats.errors++;
          continue;
        }

        // Check if resource has access to this location
        let hasAccess = false;
        let assignmentInfo = null;

        for (const assignment of resource.assignments || []) {
          if (assignment.client_name?.toLowerCase() !== clientName.toLowerCase()) continue;
          
          for (const sp of assignment.subprojects || []) {
            if (sp.subproject_id?.toString() === subproject._id.toString() && 
                (!sp.status || sp.status === 'active')) {
              hasAccess = true;
              assignmentInfo = {
                geography_id: assignment.geography_id,
                geography_name: assignment.geography_name,
                geography_type: assignment.geography_type,
                client_id: assignment.client_id,
                client_name: assignment.client_name,
                project_id: assignment.project_id,
                project_name: assignment.project_name,
                subproject_id: sp.subproject_id,
                subproject_name: sp.subproject_name,
                subproject_key: sp.subproject_key || subprojectKey
              };
              break;
            }
          }
          if (hasAccess) break;
        }

        if (!hasAccess) {
          errors.push({ row: rowNum, email, location, error: `Resource ${email} not assigned to location: ${location}` });
          stats.errors++;
          continue;
        }

        // Create daily assignment based on client type
        const clientLower = clientName.toLowerCase();
        
        if (clientLower === 'verisma') {
          // Check if already exists
          const existing = await VerismaAssignment.findOne({
            resource_email: email,
            assignment_date: parsedDate,
            subproject_id: subproject._id
          });

          if (existing) {
            stats.skipped++;
            continue;
          }

          await VerismaAssignment.create({
            assignment_date: parsedDate,
            resource_id: resource._id,
            resource_name: resource.name,
            resource_email: email,
            geography_id: assignmentInfo.geography_id,
            geography_name: assignmentInfo.geography_name,
            geography_type: assignmentInfo.geography_type,
            client_id: assignmentInfo.client_id,
            client_name: 'Verisma',
            project_id: assignmentInfo.project_id,
            project_name: assignmentInfo.project_name,
            subproject_id: assignmentInfo.subproject_id,
            subproject_name: assignmentInfo.subproject_name,
            subproject_key: assignmentInfo.subproject_key,
            status: 'pending',
            source: 'csv_upload',
            upload_batch_id: batchId,
            uploaded_by: adminEmail,
            uploaded_at: new Date()
          });

          stats.created++;
          console.log(`[ASSIGNMENT] Created Verisma: ${email} → ${location} for ${assignmentDate}`);

        } else if (clientLower === 'mro') {
          // Check if already exists
          const existing = await MROAssignment.findOne({
            resource_email: email,
            assignment_date: parsedDate,
            subproject_id: subproject._id
          });

          if (existing) {
            stats.skipped++;
            continue;
          }

          await MROAssignment.create({
            assignment_date: parsedDate,
            resource_id: resource._id,
            resource_name: resource.name,
            resource_email: email,
            geography_id: assignmentInfo.geography_id,
            geography_name: assignmentInfo.geography_name,
            client_id: assignmentInfo.client_id,
            client_name: 'MRO',
            project_id: assignmentInfo.project_id,
            project_name: assignmentInfo.project_name,
            subproject_id: assignmentInfo.subproject_id,
            subproject_name: assignmentInfo.subproject_name,
            subproject_key: assignmentInfo.subproject_key,
            status: 'pending',
            is_visible: true,
            source: 'csv_upload',
            upload_batch_id: batchId,
            uploaded_by: adminEmail,
            uploaded_at: new Date()
          });

          stats.created++;
          console.log(`[ASSIGNMENT] Created MRO: ${email} → ${location} for ${assignmentDate}`);

        } else {
          errors.push({ row: rowNum, email, location, error: `Unsupported client for daily assignments: ${clientName}` });
          stats.errors++;
        }

      } catch (err) {
        if (err.code === 11000) {
          stats.skipped++;
        } else {
          errors.push({ row: rowNum, error: err.message });
          stats.errors++;
        }
      }
    }

    // Cleanup
    fs.unlinkSync(filePath);

    // Return results
    if (errors.length > 0) {
      const fields = ["row", "email", "location", "client", "error"];
      const parser = new Parser({ fields });
      const csvOut = parser.parse(errors);

      res.setHeader("Content-Disposition", "attachment; filename=daily-assignment-errors.csv");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("X-Has-Errors", "true");
      res.setHeader("X-Stats", JSON.stringify(stats));
      return res.status(207).send(csvOut);
    }

    console.log(`\n🎉 Daily Assignment Upload completed!`);
    console.log(`   Created: ${stats.created}, Skipped: ${stats.skipped}, Errors: ${stats.errors}`);

    return res.json({
      status: "success",
      message: `Created ${stats.created} daily assignments, skipped ${stats.skipped} duplicates`,
      stats
    });

  } catch (err) {
    console.error("Daily Assignment upload error:", err);
    try { fs.unlinkSync(filePath); } catch {}
    return res.status(500).json({ error: "Failed to process CSV: " + err.message });
  }
});

// =============================================
// GET DAILY ASSIGNMENT TEMPLATE
// =============================================
router.get("/daily-assignments/template", (req, res) => {
  const template = `Assignment Date,Email,Location,Client,Process Type,Geography
2026-02-06,john@example.com,Location A,Verisma,Data Processing,US
2026-02-06,john@example.com,Location B,Verisma,Data Processing,US
2026-02-06,jane@example.com,Location A,Verisma,Data Processing,US
2026-02-07,john@example.com,Location A,Verisma,Data Processing,US`;
  
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=Daily_Assignment_Template.csv");
  res.send(template);
});

// =============================================
// RESOURCE BULK UPLOAD - REPLACE MODE
// Replaces all assignments but PRESERVES resource IDs
// Soft-deletes resources not in upload
// =============================================
router.post("/bulk-replace", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const filePath = req.file.path;
  const rows = [];

  try {
    console.log("⏱️ Resource Bulk Upload (REPLACE mode) started...");

    // 1. Read CSV
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(
          csv({
            mapHeaders: ({ header }) => {
              const h = header.toLowerCase().trim();
              if (h === "name" || h === "resource name" || h === "resource" || h === "assigner name") return "name";
              if (h === "location" || h === "subproject" || h === "sub-project" || h === "sub project") return "location";
              if (h === "process type" || h === "process_type" || h === "processtype" || h === "project" || h === "process") return "process_type";
              if (h === "client" || h === "client name" || h === "client_name") return "client";
              if (h === "geography" || h === "geo" || h === "region") return "geography";
              if (h === "email" || h === "email id" || h === "email_id" || h === "emailid") return "email";
              if (h === "role") return "role";
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

    for (let idx = 0; idx < rows.length; idx++) {
      const r = rows[idx];
      const rowNum = idx + 2;

      const name = norm(r.name);
      const location = norm(r.location);
      const processType = norm(r.process_type);
      const clientName = norm(r.client);
      const geographyName = norm(r.geography) || "US";
      const email = norm(r.email);
      const role = norm(r.role) || "associate";

      const rowErrors = [];

      if (!name) rowErrors.push("Name is required");
      if (!email) rowErrors.push("Email is required");
      if (!location) rowErrors.push("Location is required");
      if (!processType) rowErrors.push("Process Type is required");
      if (!clientName) rowErrors.push("Client is required");

      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        rowErrors.push("Invalid email format");
      }

      if (rowErrors.length > 0) {
        errors.push({
          row: rowNum,
          name,
          location,
          process_type: processType,
          client: clientName,
          geography: geographyName,
          email,
          errors: rowErrors.join("; "),
        });
      } else {
        validRows.push({
          rowNum,
          name,
          location,
          processType,
          clientName,
          geographyName,
          email: email.toLowerCase().trim(),
          role,
        });
      }
    }

    // 3. Process valid rows
    const resourceMap = new Map();
    const processedEmails = new Set();

    for (const row of validRows) {
      const geography = await Geography.findOne({
        name: { $regex: new RegExp(`^${row.geographyName}$`, "i") },
      }).lean();

      if (!geography) {
        errors.push({
          row: row.rowNum,
          name: row.name,
          location: row.location,
          process_type: row.processType,
          client: row.clientName,
          geography: row.geographyName,
          email: row.email,
          errors: `Geography "${row.geographyName}" not found`,
        });
        continue;
      }

      const client = await Client.findOne({
        geography_id: geography._id,
        name: { $regex: new RegExp(`^${row.clientName}$`, "i") },
      }).lean();

      if (!client) {
        errors.push({
          row: row.rowNum,
          name: row.name,
          location: row.location,
          process_type: row.processType,
          client: row.clientName,
          geography: row.geographyName,
          email: row.email,
          errors: `Client "${row.clientName}" not found`,
        });
        continue;
      }

      let project = await Project.findOne({
        client_id: client._id,
        name: { $regex: new RegExp(`^${row.processType}$`, "i") },
      }).lean();

      if (!project) {
        const processTypeWords = row.processType.toLowerCase().split(/\s+/);
        const lastWord = processTypeWords[processTypeWords.length - 1];
        
        project = await Project.findOne({
          client_id: client._id,
          name: { $regex: new RegExp(lastWord, "i") },
        }).lean();
      }

      if (!project) {
        errors.push({
          row: row.rowNum,
          name: row.name,
          location: row.location,
          process_type: row.processType,
          client: row.clientName,
          geography: row.geographyName,
          email: row.email,
          errors: `Process Type "${row.processType}" not found`,
        });
        continue;
      }

      const subprojectKey = generateSubprojectKey(client.name, project.name, row.location);
      
      let subproject = await Subproject.findOne({
        business_key: subprojectKey
      }).lean();
      
      if (!subproject) {
        subproject = await Subproject.findOne({
          project_id: project._id,
          name: { $regex: new RegExp(`^${row.location}$`, "i") },
        }).lean();
        
        if (subproject && !subproject.business_key) {
          await Subproject.updateOne(
            { _id: subproject._id },
            { 
              $set: { 
                business_key: subprojectKey,
                client_name: client.name,
                project_name: project.name
              } 
            }
          );
          subproject.business_key = subprojectKey;
        }
      }

      if (!subproject) {
        errors.push({
          row: row.rowNum,
          name: row.name,
          location: row.location,
          process_type: row.processType,
          client: row.clientName,
          geography: row.geographyName,
          email: row.email,
          errors: `Location "${row.location}" not found`,
        });
        continue;
      }

      const emailKey = row.email;
      processedEmails.add(emailKey);
      
      if (!resourceMap.has(emailKey)) {
        resourceMap.set(emailKey, {
          name: row.name,
          email: row.email,
          role: row.role,
          assignmentsMap: new Map(),
        });
      }

      const resourceData = resourceMap.get(emailKey);
      const assignmentKey = `${geography._id}|${client._id}|${project._id}`;
      
      if (!resourceData.assignmentsMap.has(assignmentKey)) {
        resourceData.assignmentsMap.set(assignmentKey, {
          geography_id: geography._id,
          geography_name: geography.name,
          client_id: client._id,
          client_name: client.name,
          project_id: project._id,
          project_name: project.name,
          subprojectsMap: new Map(),
        });
      }

      const assignment = resourceData.assignmentsMap.get(assignmentKey);
      const spIdStr = subproject._id.toString();
      if (!assignment.subprojectsMap.has(spIdStr)) {
        assignment.subprojectsMap.set(spIdStr, {
          subproject_id: subproject._id,
          subproject_name: subproject.name,
          subproject_key: subprojectKey
        });
      }
    }

    // 4. UPSERT Resources (Replace mode - completely replace assignments)
    const stats = {
      created: 0,
      updated: 0,
      deactivated: 0,
      assignments: 0,
    };

    for (const [email, data] of resourceMap) {
      const newAssignments = [];
      for (const [, assignmentData] of data.assignmentsMap) {
        const subprojects = Array.from(assignmentData.subprojectsMap.values());
        newAssignments.push({
          geography_id: assignmentData.geography_id,
          geography_name: assignmentData.geography_name,
          client_id: assignmentData.client_id,
          client_name: assignmentData.client_name,
          project_id: assignmentData.project_id,
          project_name: assignmentData.project_name,
          subprojects: subprojects,
        });
        stats.assignments += subprojects.length;
      }

      let resource = await Resource.findOne({ 
        $or: [
          { email_normalized: email },
          { email: { $regex: new RegExp(`^${email}$`, "i") } }
        ]
      });

      if (resource) {
        // Replace mode: completely replace assignments (but KEEP the ID!)
        resource.name = data.name;
        resource.role = data.role;
        resource.email_normalized = email;
        resource.assignments = newAssignments;
        resource.status = 'active';
        resource.deactivated_at = null;
        resource.deactivated_reason = null;
        
        await resource.save();
        stats.updated++;
        
        console.log(`[REPLACE] Updated: ${email} (ID preserved: ${resource._id})`);
      } else {
        resource = new Resource({
          name: data.name,
          email: email,
          email_normalized: email,
          role: data.role,
          status: "active",
          assignments: newAssignments,
          login_count: 0,
          total_logins: 0,
          otp_attempts: 0,
        });

        await resource.save();
        stats.created++;
        
        console.log(`[REPLACE] Created: ${email} (ID: ${resource._id})`);
      }
    }

    // 5. SOFT DELETE resources not in the upload
    const deactivateResult = await Resource.updateMany(
      { 
        email_normalized: { $nin: Array.from(processedEmails) },
        status: 'active'
      },
      { 
        $set: { 
          status: 'inactive',
          deactivated_at: new Date(),
          deactivated_reason: 'Not included in bulk-replace upload'
        } 
      }
    );
    stats.deactivated = deactivateResult.modifiedCount || 0;
    
    console.log(`[REPLACE] Soft-deleted ${stats.deactivated} resources not in upload`);

    fs.unlinkSync(filePath);

    if (errors.length > 0) {
      const fields = ["row", "name", "location", "process_type", "client", "geography", "email", "errors"];
      const parser = new Parser({ fields });
      const csvOut = parser.parse(errors);

      res.setHeader("Content-Disposition", "attachment; filename=resource-upload-errors.csv");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("X-Has-Errors", "true");
      res.setHeader("X-Stats", JSON.stringify(stats));
      return res.status(207).send(csvOut);
    }

    console.log(`\n🎉 Resource Bulk Upload (Replace) completed!`);

    return res.json({
      status: "success",
      message: `Successfully processed ${resourceMap.size} resources`,
      stats,
    });
  } catch (err) {
    console.error("Resource Bulk upload error:", err);
    try {
      fs.unlinkSync(filePath);
    } catch {}
    return res.status(500).json({ error: "Failed to process CSV: " + err.message });
  }
});

// =============================================
// REFRESH LINKS - Re-link DailyAllocations after upload
// =============================================
router.post("/refresh-links", async (req, res) => {
  try {
    const { month, year, client } = req.body;
    
    if (!month || !year) {
      return res.status(400).json({ message: 'Month and year are required' });
    }
    
    const results = {};
    
    // Refresh MRO allocations
    try {
      const MRODailyAllocation = require('../models/MRODailyAllocation');
      results.mro = await MRODailyAllocation.refreshObjectIdReferences(
        parseInt(month), 
        parseInt(year)
      );
    } catch (e) {
      results.mro = { error: e.message };
    }
    
    // Refresh Verisma allocations
    try {
      const VerismaDailyAllocation = require('../models/VerismaDailyAllocation');
      results.verisma = await VerismaDailyAllocation.refreshObjectIdReferences(
        parseInt(month), 
        parseInt(year)
      );
    } catch (e) {
      results.verisma = { error: e.message };
    }
    
    res.json({
      success: true,
      message: 'ObjectId references refreshed',
      results
    });
    
  } catch (error) {
    console.error('Refresh links error:', error);
    res.status(500).json({ message: error.message });
  }
});

// =============================================
// GET TEMPLATE
// =============================================
router.get("/template", (req, res) => {
  const template = `Name,Location,Process Type,Client,Geography,Email ID
Rashmi Kottachery,Christus Health,Complete logging,MRO,US,rashmi@valerionhealth.us
Rashmi Kottachery,Banner Health,Processing,MRO,US,rashmi@valerionhealth.us`;
  
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=Resource_Upload_Template.csv");
  res.send(template);
});

module.exports = router;