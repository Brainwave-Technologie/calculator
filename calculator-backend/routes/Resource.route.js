// routes/resource.routes.js - Resource routes with date-filtered locations and login activity
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const Resource = require('../models/Resource');
const Geography = require('../models/Geography');
const Client = require('../models/Client');
const Project = require('../models/Project');
const Subproject = require('../models/Subproject');
const ActivityLog = require('../models/ActivityLog');

const { authenticateResource, authenticateUser, authenticateAny } = require('../middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// ═══════════════════════════════════════════════════════════════
// RESOURCE AUTH ROUTES
// ═══════════════════════════════════════════════════════════════

// POST: Request OTP
router.post('/request-otp', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }
    
    const resource = await Resource.findByEmail(email);
    
    if (!resource) {
      return res.status(404).json({ message: 'Resource not found. Please contact admin.' });
    }
    
    if (resource.status !== 'active' || !resource.is_active) {
      return res.status(403).json({ message: 'Account is inactive. Please contact admin.' });
    }
    
    // Rate limiting: 1 OTP per minute
    if (resource.otp_last_sent && (Date.now() - resource.otp_last_sent.getTime()) < 60000) {
      const waitTime = Math.ceil((60000 - (Date.now() - resource.otp_last_sent.getTime())) / 1000);
      return res.status(429).json({ message: `Please wait ${waitTime} seconds before requesting another OTP` });
    }
    
    // Generate 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    
    resource.otp = otp;
    resource.otp_expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    resource.otp_attempts = 0;
    resource.otp_last_sent = new Date();
    
    await resource.save();
    
    // TODO: Send OTP via email
    // For development, log to console
    console.log(`[DEV] OTP for ${email}: ${otp}`);
    
    // Record activity
    try {
      await ActivityLog.create({
        activity_type: 'LOGIN',
        actor_type: 'resource',
        actor_email: email,
        details: { action: 'otp_requested' }
      });
    } catch (logErr) {}
    
    res.json({ 
      success: true, 
      message: 'OTP sent to your email',
      // Remove in production:
      dev_otp: process.env.NODE_ENV === 'development' ? otp : undefined
    });
    
  } catch (error) {
    console.error('Request OTP error:', error);
    res.status(500).json({ message: error.message });
  }
});

// POST: Verify OTP
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    
    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }
    
    const resource = await Resource.findByEmail(email);
    
    if (!resource) {
      return res.status(404).json({ message: 'Resource not found' });
    }
    
    // Check max attempts
    if (resource.otp_attempts >= 3) {
      resource.otp = undefined;
      resource.otp_expires = undefined;
      await resource.save();
      return res.status(403).json({ message: 'Too many attempts. Please request a new OTP.' });
    }
    
    // Increment attempts
    resource.otp_attempts += 1;
    
    // Check OTP validity
    if (!resource.otp || resource.otp !== otp) {
      await resource.save();
      return res.status(401).json({ message: 'Invalid OTP' });
    }
    
    // Check expiry
    if (!resource.otp_expires || resource.otp_expires < new Date()) {
      await resource.save();
      return res.status(401).json({ message: 'OTP has expired. Please request a new one.' });
    }
    
    // OTP verified - clear it
    resource.otp = undefined;
    resource.otp_expires = undefined;
    resource.otp_attempts = 0;
    
    // Generate JWT token
    const token = jwt.sign(
      { 
        id: resource._id, 
        email: resource.email_normalized, 
        type: 'resource',
        name: resource.name
      },
      JWT_SECRET,
      { expiresIn: '12h' }
    );
    
    // Update session
    resource.current_session_token = token;
    resource.session_expires = new Date(Date.now() + 12 * 60 * 60 * 1000);
    resource.last_activity = new Date();
    
    await resource.save();
    
    // Record login
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    await resource.recordLogin(ip, userAgent, 'Web Browser', 'success');
    
    res.json({
      success: true,
      message: 'Login successful',
      token,
      resource: {
        id: resource._id,
        name: resource.name,
        email: resource.email,
        role: resource.role,
        assignments: resource.assignments
      }
    });
    
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ message: error.message });
  }
});

// POST: Logout
router.post('/logout', authenticateResource, async (req, res) => {
  try {
    const resource = req.resource;
    
    resource.current_session_token = undefined;
    resource.session_expires = undefined;
    await resource.save();
    
    res.json({ success: true, message: 'Logged out successfully' });
    
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// RESOURCE DATA ROUTES
// ═══════════════════════════════════════════════════════════════

// GET: Current resource info
router.get('/me', authenticateResource, async (req, res) => {
  try {
    const resource = req.resource;
    
    res.json({
      success: true,
      resource: {
        id: resource._id,
        name: resource.name,
        email: resource.email,
        role: resource.role,
        status: resource.status,
        last_login: resource.last_login,
        assignments: resource.assignments
      }
    });
    
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET: Locations for a specific client and date
//
// LOGIC: Returns ALL active locations assigned to the resource for the given client.
// No assigned_date restriction - resource can log for any date in the current month.
// The only restriction is that future dates are blocked.
// ═══════════════════════════════════════════════════════════════
router.get('/locations', authenticateResource, async (req, res) => {
  try {
    const { client, date } = req.query;
    const resource = req.resource;

    if (!client) {
      return res.status(400).json({ message: 'Client parameter is required' });
    }

    // Default to today if no date provided
    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Cannot get locations for future dates
    if (targetDate > today) {
      return res.status(400).json({
        message: 'Cannot view locations for future dates',
        locations: []
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // Build locations list: all active locations for this client
    // No assigned_date restriction - resource can log for any date in current month
    // ═══════════════════════════════════════════════════════════════
    const locations = [];

    for (const assignment of resource.assignments) {
      if (assignment.client_name?.toLowerCase() !== client.toLowerCase()) {
        continue;
      }

      const filteredSubprojects = [];

      for (const sp of assignment.subprojects || []) {
        if (sp.status && sp.status !== 'active') continue;

        filteredSubprojects.push({
          subproject_id: sp.subproject_id,
          subproject_name: sp.subproject_name,
          subproject_key: sp.subproject_key,
          assigned_date: sp.assigned_date || null
        });
      }

      if (filteredSubprojects.length > 0) {
        locations.push({
          geography_id: assignment.geography_id,
          geography_name: assignment.geography_name,
          client_id: assignment.client_id,
          client_name: assignment.client_name,
          project_id: assignment.project_id,
          project_name: assignment.project_name,
          subprojects: filteredSubprojects
        });
      }
    }

    res.json({
      success: true,
      target_date: targetDate.toISOString().split('T')[0],
      count: locations.reduce((sum, l) => sum + l.subprojects.length, 0),
      locations
    });
    
  } catch (error) {
    console.error('Get locations error:', error);
    res.status(500).json({ message: error.message });
  }
});

// GET: Resource's Accessible Locations (backward compatible - returns ALL active locations)
// Use /locations?client=X&date=Y for date-filtered locations
router.get('/me/locations', authenticateResource, async (req, res) => {
  try {
    const resource = req.resource;
    const { client, date } = req.query;
    
    // If date is provided, filter by assigned_date
    const targetDate = date ? new Date(date) : null;
    if (targetDate) targetDate.setHours(0, 0, 0, 0);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // If date is in future, return empty
    if (targetDate && targetDate > today) {
      return res.json([]);
    }
    
    const expandedAssignments = [];
    
    for (const assignment of resource.assignments || []) {
      // Filter by client if provided
      if (client && assignment.client_name?.toLowerCase() !== client.toLowerCase()) {
        continue;
      }
      
      const subprojectDetails = [];
      
      for (const sp of assignment.subprojects || []) {
        // Skip inactive/removed
        if (sp.status && sp.status !== 'active') continue;
        
        // If date filter is provided, check assigned_date
        if (targetDate && sp.assigned_date) {
          const assignedDate = new Date(sp.assigned_date);
          assignedDate.setHours(0, 0, 0, 0);
          if (assignedDate > targetDate) continue;
        }
        
        // Optionally fetch fresh subproject data
        const subproject = await Subproject.findById(sp.subproject_id);
        if (subproject) {
          subprojectDetails.push({
            subproject_id: subproject._id,
            subproject_name: subproject.name,
            subproject_key: sp.subproject_key,
            assigned_date: sp.assigned_date,
            status: subproject.status
          });
        } else {
          // Use cached data if subproject not found
          subprojectDetails.push({
            subproject_id: sp.subproject_id,
            subproject_name: sp.subproject_name,
            subproject_key: sp.subproject_key,
            assigned_date: sp.assigned_date,
            status: 'active'
          });
        }
      }
      
      if (subprojectDetails.length > 0) {
        expandedAssignments.push({
          geography_id: assignment.geography_id,
          geography_name: assignment.geography_name,
          client_id: assignment.client_id,
          client_name: assignment.client_name,
          project_id: assignment.project_id,
          project_name: assignment.project_name,
          subprojects: subprojectDetails
        });
      }
    }
    
    res.json(expandedAssignments);
  } catch (error) {
    console.error('Error fetching locations:', error);
    res.status(500).json({ message: 'Error fetching locations', error: error.message });
  }
});

// GET: Resource's Own Profile
router.get('/me/profile', authenticateResource, async (req, res) => {
  try {
    const resource = await Resource.findById(req.resource._id)
      .select('-otp -otp_expires -current_session_token')
      .lean();
    
    res.json({ success: true, resource });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ message: 'Error fetching profile', error: error.message });
  }
});

// GET: Check session validity
router.get('/session-check', authenticateResource, async (req, res) => {
  try {
    res.json({
      success: true,
      valid: true,
      resource: {
        id: req.resource._id,
        name: req.resource.name,
        email: req.resource.email
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST: Refresh session
router.post('/session-refresh', authenticateResource, async (req, res) => {
  try {
    const resource = req.resource;
    resource.last_activity = new Date();
    await resource.save();
    
    res.json({ success: true, message: 'Session refreshed' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// ADMIN ROUTES FOR RESOURCE MANAGEMENT
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// ADMIN ROUTES FOR RESOURCE MANAGEMENT (FIXED PAGINATION)
// ═══════════════════════════════════════════════════════════════

// GET: All resources (Admin) - FIXED PAGINATION

router.get('/', authenticateUser, async (req, res) => {
  try {
    // ✅ FIXED: Extract geography and project filters
    const { status, geography, client, project, search, page = 1, limit = 10 } = req.query;
    
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 10));
    
    const query = {};
    
    if (status) query.status = status;
    
    // ✅ FIXED: Add geography filter (by ID, exact match)
    if (geography && geography.trim()) {
      query['assignments.geography_id'] = geography;
    }
    
    // ✅ FIXED: Change from client_name to client_id (exact match)
    if (client && client.trim()) {
      query['assignments.client_id'] = client;
    }
    
    // ✅ FIXED: Add project filter (by ID, exact match)
    if (project && project.trim()) {
      query['assignments.project_id'] = project;
    }
    
    // ✅ FIXED: Search only applies to name/email
    if (search && search.trim()) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Get counts and calculate pages
    const totalCount = await Resource.countDocuments(query);
    const totalPages = Math.ceil(totalCount / limitNum);
    const validPage = Math.min(pageNum, Math.max(1, totalPages));
    
    // Fetch resources with pagination
    const resources = await Resource.find(query)
      .select('-otp -otp_expires -current_session_token')
      .sort({ name: 1 })
      .skip((validPage - 1) * limitNum)
      .limit(limitNum)
      .lean();
    
    // Calculate indices for display
    const startIndex = totalCount === 0 ? 0 : (validPage - 1) * limitNum + 1;
    const endIndex = Math.min(validPage * limitNum, totalCount);
    
    // ✅ Return proper pagination structure
    res.json({
      success: true,
      resources,
      pagination: {
        total: totalCount,
        page: validPage,
        limit: limitNum,
        pages: totalPages,
        hasNextPage: validPage < totalPages,
        hasPrevPage: validPage > 1,
        startIndex,
        endIndex
      }
    });
    
  } catch (error) {
    console.error('Get resources error:', error);
    res.status(500).json({ message: error.message });
  }
});
// ═══════════════════════════════════════════════════════════════
// POST: Create resource (Admin) 
// UPDATED: If resource already exists, don't error - proceed to assign locations
// ═══════════════════════════════════════════════════════════════
router.post('/', authenticateUser, async (req, res) => {
  try {
    const { name, email, role, employee_id, assignments } = req.body;
    
    if (!name || !email) {
      return res.status(400).json({ message: 'Name and email are required' });
    }
    
    const normalizedEmail = email.toLowerCase().trim();
    
    // Check if email already exists
    let resource = await Resource.findByEmail(normalizedEmail);
    let isExisting = false;
    
    if (resource) {
      // ═══════════════════════════════════════════════════════════════
      // RESOURCE EXISTS - Don't error, just return it for location assignment
      // ═══════════════════════════════════════════════════════════════
      isExisting = true;
      
      // Optionally update name/role/employee_id if provided
      if (name && name !== resource.name) resource.name = name;
      if (role && role !== resource.role) resource.role = role;
      if (employee_id && employee_id !== resource.employee_id) resource.employee_id = employee_id;
      
      // Ensure resource is active
      resource.status = 'active';
      resource.is_active = true;
      resource.updated_by = req.user?.email || 'admin';
      
      await resource.save();
    } else {
      // Create new resource
      resource = new Resource({
        name,
        email: normalizedEmail,
        email_normalized: normalizedEmail,
        role: role || 'associate',
        employee_id: employee_id || '',
        status: 'active',
        is_active: true,
        assignments: [],
        created_by: req.user?.email || 'admin'
      });
      
      await resource.save();
    }
    
    // Process assignments if provided (for both new and existing)
    if (assignments && Array.isArray(assignments) && assignments.length > 0) {
      const assignedDate = new Date();
      const adminEmail = req.user?.email || 'admin';
      
      for (const assignment of assignments) {
        for (const sp of assignment.subprojects || []) {
          try {
            await Resource.addAssignment(normalizedEmail, {
              geography_id: assignment.geography_id,
              geography_name: assignment.geography_name,
              client_id: assignment.client_id,
              client_name: assignment.client_name,
              project_id: assignment.project_id,
              project_name: assignment.project_name,
              subproject_id: sp.subproject_id,
              subproject_name: sp.subproject_name,
              subproject_key: sp.subproject_key,
              assigned_date: sp.assigned_date || assignedDate
            }, adminEmail);
          } catch (assignErr) {
            console.log('Assignment error (non-fatal):', assignErr.message);
          }
        }
      }
      
      // Refresh resource data after assignments
      resource = await Resource.findByEmail(normalizedEmail);
    }
    
    res.status(isExisting ? 200 : 201).json({
      success: true,
      message: isExisting 
        ? 'Resource already exists. You can assign locations.' 
        : 'Resource created successfully',
      is_existing: isExisting,
      resource
    });
    
  } catch (error) {
    console.error('Create resource error:', error);
    res.status(500).json({ message: error.message });
  }
});

// GET: Login activity (Admin)
router.get('/login-activity', authenticateUser, async (req, res) => {
  try {
    const { sort_by = 'last_login', sort_order = 'desc', page = 1, limit = 50 } = req.query;
    
    const sortOptions = {};
    sortOptions[sort_by] = sort_order === 'asc' ? 1 : -1;
    
    const total = await Resource.countDocuments({});
    const resources = await Resource.find({})
      .select('name email role status total_logins login_count last_login login_history monthly_logins')
      .sort(sortOptions)
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .lean();
    
    res.json({ 
      success: true,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      resources 
    });
  } catch (error) {
    console.error('Error fetching login activity:', error);
    res.status(500).json({ message: 'Error fetching login activity', error: error.message });
  }
});

// GET: Single Resource Login Activity (Admin)
router.get('/login-activity/:id', authenticateUser, async (req, res) => {
  try {
    const resource = await Resource.findById(req.params.id)
      .select('name email role status total_logins login_count last_login login_history monthly_logins')
      .lean();
    
    if (!resource) {
      return res.status(404).json({ message: 'Resource not found' });
    }
    
    res.json({ success: true, resource });
  } catch (error) {
    console.error('Error fetching resource activity:', error);
    res.status(500).json({ message: 'Error fetching resource activity', error: error.message });
  }
});
// DELETE: Remove resource (Admin)
router.delete('/:id', authenticateUser, async (req, res) => {
  try {
    const resourceId = req.params.id;
    
    if (!require('mongoose').Types.ObjectId.isValid(resourceId)) {
      return res.status(400).json({ message: 'Invalid resource ID' });
    }
    
    const resource = await Resource.findByIdAndDelete(resourceId);
    
    if (!resource) {
      return res.status(404).json({ message: 'Resource not found' });
    }
    
    res.json({ 
      success: true, 
      message: 'Resource deleted successfully',
      resource 
    });
    
  } catch (error) {
    console.error('Delete resource error:', error);
    res.status(500).json({ message: 'Error deleting resource', error: error.message });
  }
});
// GET: Single resource by ID (Admin)
router.get('/:id', authenticateUser, async (req, res) => {
  try {
    const resource = await Resource.findById(req.params.id)
      .select('-otp -otp_expires -current_session_token')
      .lean();
    
    if (!resource) {
      return res.status(404).json({ message: 'Resource not found' });
    }
    
    res.json({ success: true, resource });
    
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PUT: Update resource (Admin)
router.put('/:id', authenticateUser, async (req, res) => {
  try {
    const { name, role, status, is_active } = req.body;
    
    const resource = await Resource.findById(req.params.id);
    if (!resource) {
      return res.status(404).json({ message: 'Resource not found' });
    }
    
    if (name) resource.name = name;
    if (role) resource.role = role;
    if (status) resource.status = status;
    if (is_active !== undefined) resource.is_active = is_active;
    
    resource.updated_by = req.user?.email || 'admin';
    
    await resource.save();
    
    res.json({ success: true, message: 'Resource updated', resource });
    
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST: Add assignment to resource (Admin)
router.post('/:id/assignments', authenticateUser, async (req, res) => {
  try {
    const { 
      geography_id, geography_name,
      client_id, client_name,
      project_id, project_name,
      subproject_id, subproject_name, subproject_key,
      assigned_date
    } = req.body;
    
    const resource = await Resource.findById(req.params.id);
    if (!resource) {
      return res.status(404).json({ message: 'Resource not found' });
    }
    
    await Resource.addAssignment(resource.email, {
      geography_id, geography_name,
      client_id, client_name,
      project_id, project_name,
      subproject_id, subproject_name, subproject_key,
      assigned_date: assigned_date || new Date()
    }, req.user?.email || 'admin');
    
    const updated = await Resource.findById(req.params.id);
    
    res.json({ success: true, message: 'Assignment added', resource: updated });
    
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// DELETE: Remove assignment from resource (Admin)
router.delete('/:id/assignments/:subprojectId', authenticateUser, async (req, res) => {
  try {
    const resource = await Resource.findById(req.params.id);
    if (!resource) {
      return res.status(404).json({ message: 'Resource not found' });
    }
    
    await Resource.removeAssignment(resource.email, req.params.subprojectId, req.user?.email || 'admin');
    
    const updated = await Resource.findById(req.params.id);
    
    res.json({ success: true, message: 'Assignment removed', resource: updated });
    
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST: Bulk upload resources with assignments (Admin)
router.post('/bulk-upload', authenticateUser, async (req, res) => {
  try {
    const { resources, assigned_date } = req.body;
    
    if (!resources || !Array.isArray(resources)) {
      return res.status(400).json({ message: 'Resources array is required' });
    }
    
    const assignDate = assigned_date ? new Date(assigned_date) : new Date();
    const results = { created: 0, updated: 0, errors: [] };
    
    for (const resourceData of resources) {
      try {
        const { email, name, assignments } = resourceData;
        
        if (!email) {
          results.errors.push({ email: 'unknown', error: 'Email is required' });
          continue;
        }
        
        let resource = await Resource.findByEmail(email);
        
        if (!resource) {
          // Create new resource
          resource = new Resource({
            name: name || email.split('@')[0],
            email,
            email_normalized: email.toLowerCase().trim(),
            status: 'active',
            is_active: true,
            assignments: [],
            created_by: req.user?.email || 'admin'
          });
          await resource.save();
          results.created++;
        } else {
          results.updated++;
        }
        
        // Add assignments
        if (assignments && Array.isArray(assignments)) {
          for (const assignment of assignments) {
            for (const sp of assignment.subprojects || []) {
              await Resource.addAssignment(email, {
                geography_id: assignment.geography_id,
                geography_name: assignment.geography_name,
                client_id: assignment.client_id,
                client_name: assignment.client_name,
                project_id: assignment.project_id,
                project_name: assignment.project_name,
                subproject_id: sp.subproject_id,
                subproject_name: sp.subproject_name,
                subproject_key: sp.subproject_key,
                assigned_date: assignDate
              }, req.user?.email || 'admin');
            }
          }
        }
        
      } catch (err) {
        results.errors.push({ email: resourceData.email, error: err.message });
      }
    }
    
    res.json({
      success: true,
      message: `Processed ${resources.length} resources`,
      results
    });
    
  } catch (error) {
    console.error('Bulk upload error:', error);
    res.status(500).json({ message: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// ASSIGNMENT MANAGEMENT ROUTES (Admin)
// ═══════════════════════════════════════════════════════════════

// PUT: Update Resource Assignments with assigned_date (Admin)
router.put('/:id/assignments', authenticateUser, async (req, res) => {
  try {
    const { assignments, assigned_date } = req.body;
    
    const resource = await Resource.findById(req.params.id);
    if (!resource) {
      return res.status(404).json({ message: 'Resource not found' });
    }
    
    const assignDate = assigned_date ? new Date(assigned_date) : new Date();
    const adminEmail = req.user?.email || 'admin';
    
    // Validate and enrich assignments with names and assigned_date
    const enrichedAssignments = [];
    
    const keptAsIsAssignments = [];

    for (const assignment of assignments) {
      const geography = await Geography.findById(assignment.geography_id).catch(() => null);
      const client = await Client.findById(assignment.client_id).catch(() => null);
      const project = await Project.findById(assignment.project_id).catch(() => null);

      if (!geography || !client || !project) {
        // Check if this assignment already exists in the resource's current data.
        // If so, preserve it as-is (stale project reference from re-upload).
        const existingMatch = resource.assignments.find(ea =>
          ea.project_id?.toString() === assignment.project_id?.toString() &&
          ea.client_id?.toString() === assignment.client_id?.toString()
        );
        if (existingMatch) {
          enrichedAssignments.push(existingMatch);
          keptAsIsAssignments.push(`Kept existing assignment for ${existingMatch.project_name || assignment.project_id} (project reference stale)`);
          continue;
        }
        // Truly invalid (not in existing assignments either) - skip
        continue;
      }
      
      const subprojects = [];
      for (const sp of assignment.subprojects || []) {
        const subproject = await Subproject.findById(sp.subproject_id);
        if (subproject) {
          // Check if this subproject already exists in current assignments
          let existingAssignedDate = null;
          for (const existingAssignment of resource.assignments) {
            const existingSp = existingAssignment.subprojects?.find(
              s => s.subproject_id?.toString() === sp.subproject_id?.toString()
            );
            if (existingSp?.assigned_date) {
              existingAssignedDate = existingSp.assigned_date;
              break;
            }
          }
          
          subprojects.push({
            subproject_id: subproject._id,
            subproject_name: subproject.name,
            subproject_key: sp.subproject_key || `${client.name}|${project.name}|${subproject.name}`,
            // Keep existing assigned_date if it exists, otherwise use new date
            assigned_date: existingAssignedDate || sp.assigned_date || assignDate,
            assigned_by: sp.assigned_by || adminEmail,
            status: sp.status || 'active'
          });
        }
      }
      
      enrichedAssignments.push({
        geography_id: geography._id,
        geography_name: geography.name,
        client_id: client._id,
        client_name: client.name,
        project_id: project._id,
        project_name: project.name,
        subprojects
      });
    }
    
    resource.assignments = enrichedAssignments;
    resource.updated_by = adminEmail;
    await resource.save();

    res.json({
      success: true,
      message: keptAsIsAssignments.length > 0
        ? `Assignments updated. ${keptAsIsAssignments.length} assignment(s) with stale references were preserved.`
        : 'Assignments updated successfully',
      assignments: resource.assignments
    });
  } catch (error) {
    console.error('Error updating assignments:', error);
    res.status(500).json({ message: 'Error updating assignments', error: error.message });
  }
});

// POST: Add single assignment with assigned_date (Admin)
router.post('/:id/assignments/add', authenticateUser, async (req, res) => {
  try {
    const { 
      geography_id, geography_name,
      client_id, client_name,
      project_id, project_name,
      subproject_id, subproject_name, subproject_key,
      assigned_date
    } = req.body;
    
    const resource = await Resource.findById(req.params.id);
    if (!resource) {
      return res.status(404).json({ message: 'Resource not found' });
    }
    
    const adminEmail = req.user?.email || 'admin';
    const assignDate = assigned_date ? new Date(assigned_date) : new Date();
    
    // Find or create client-level assignment
    let clientAssignment = resource.assignments.find(
      a => a.client_id?.toString() === client_id?.toString() && 
           a.project_id?.toString() === project_id?.toString()
    );
    
    if (!clientAssignment) {
      clientAssignment = {
        geography_id,
        geography_name,
        client_id,
        client_name,
        project_id,
        project_name,
        subprojects: []
      };
      resource.assignments.push(clientAssignment);
      clientAssignment = resource.assignments[resource.assignments.length - 1];
    }
    
    // Check if subproject already exists
    const existingSubproject = clientAssignment.subprojects.find(
      sp => sp.subproject_id?.toString() === subproject_id?.toString()
    );
    
    if (existingSubproject) {
      if (existingSubproject.status === 'removed') {
        // Reactivate
        existingSubproject.status = 'active';
        existingSubproject.assigned_date = assignDate;
        existingSubproject.assigned_by = adminEmail;
        existingSubproject.removed_date = undefined;
        existingSubproject.removed_by = undefined;
      } else {
        return res.status(400).json({ message: 'Subproject already assigned to this resource' });
      }
    } else {
      clientAssignment.subprojects.push({
        subproject_id,
        subproject_name,
        subproject_key: subproject_key || `${client_name}|${project_name}|${subproject_name}`,
        assigned_date: assignDate,
        assigned_by: adminEmail,
        status: 'active'
      });
    }
    
    resource.updated_by = adminEmail;
    await resource.save();
    
    res.json({
      success: true,
      message: 'Assignment added successfully',
      resource
    });
  } catch (error) {
    console.error('Error adding assignment:', error);
    res.status(500).json({ message: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// BULK CREATE WITH ASSIGNED DATE (Admin)
// ═══════════════════════════════════════════════════════════════

// POST: Bulk Create Resources from CSV with assigned_date (Admin)
router.post('/bulk-create', authenticateUser, async (req, res) => {
  try {
    const { resources, assigned_date } = req.body;
    
    if (!Array.isArray(resources) || resources.length === 0) {
      return res.status(400).json({ message: 'Resources array is required' });
    }
    
    const assignDate = assigned_date ? new Date(assigned_date) : new Date();
    const adminEmail = req.user?.email || 'admin';
    
    const results = {
      created: [],
      updated: [],
      failed: []
    };
    
    for (const resourceData of resources) {
      try {
        const email = resourceData.email?.toLowerCase()?.trim();
        if (!email) {
          results.failed.push({ email: 'unknown', error: 'Email is required' });
          continue;
        }
        
        // Check if email already exists
        let existingResource = await Resource.findOne({ email_normalized: email });
        
        if (existingResource) {
          // Update assignments if resource exists
          const newAssignments = resourceData.assignments || [];
          
          for (const newAssignment of newAssignments) {
            // Find or create client-level assignment
            let clientAssignment = existingResource.assignments.find(
              a => a.client_id?.toString() === newAssignment.client_id?.toString() &&
                   a.project_id?.toString() === newAssignment.project_id?.toString()
            );
            
            if (!clientAssignment) {
              clientAssignment = {
                geography_id: newAssignment.geography_id,
                geography_name: newAssignment.geography_name,
                client_id: newAssignment.client_id,
                client_name: newAssignment.client_name,
                project_id: newAssignment.project_id,
                project_name: newAssignment.project_name,
                subprojects: []
              };
              existingResource.assignments.push(clientAssignment);
              clientAssignment = existingResource.assignments[existingResource.assignments.length - 1];
            }
            
            // Merge subprojects
            for (const newSp of newAssignment.subprojects || []) {
              const existingSp = clientAssignment.subprojects.find(
                sp => sp.subproject_id?.toString() === newSp.subproject_id?.toString()
              );
              
              if (existingSp) {
                // Reactivate if removed
                if (existingSp.status === 'removed') {
                  existingSp.status = 'active';
                  existingSp.assigned_date = assignDate;
                  existingSp.assigned_by = adminEmail;
                  existingSp.removed_date = undefined;
                  existingSp.removed_by = undefined;
                }
              } else {
                clientAssignment.subprojects.push({
                  subproject_id: newSp.subproject_id,
                  subproject_name: newSp.subproject_name,
                  subproject_key: newSp.subproject_key,
                  assigned_date: newSp.assigned_date || assignDate,
                  assigned_by: adminEmail,
                  status: 'active'
                });
              }
            }
          }
          
          existingResource.updated_by = adminEmail;
          await existingResource.save();
          
          results.updated.push({
            email,
            message: 'Updated existing resource assignments'
          });
          continue;
        }
        
        // Process assignments for new resource
        const processedAssignments = [];
        for (const assignment of resourceData.assignments || []) {
          const processedSubprojects = [];
          for (const sp of assignment.subprojects || []) {
            processedSubprojects.push({
              subproject_id: sp.subproject_id,
              subproject_name: sp.subproject_name,
              subproject_key: sp.subproject_key,
              assigned_date: sp.assigned_date || assignDate,
              assigned_by: adminEmail,
              status: 'active'
            });
          }
          processedAssignments.push({
            ...assignment,
            subprojects: processedSubprojects
          });
        }
        
        // Create new resource (no password needed - OTP based)
        const resource = new Resource({
          name: resourceData.name || email.split('@')[0],
          email,
          email_normalized: email,
          role: resourceData.role || 'associate',
          employee_id: resourceData.employee_id,
          status: 'active',
          is_active: true,
          assignments: processedAssignments,
          login_count: 0,
          total_logins: 0,
          created_by: adminEmail
        });
        
        await resource.save();
        results.created.push({
          id: resource._id,
          email: resource.email,
          name: resource.name
        });
        
      } catch (err) {
        results.failed.push({
          email: resourceData.email,
          error: err.message
        });
      }
    }
    
    res.json({
      success: true,
      message: 'Bulk operation completed',
      summary: {
        total: resources.length,
        created: results.created.length,
        updated: results.updated.length,
        failed: results.failed.length
      },
      results
    });
  } catch (error) {
    console.error('Error in bulk create:', error);
    res.status(500).json({ message: 'Error in bulk create', error: error.message });
  }
});

module.exports = router;