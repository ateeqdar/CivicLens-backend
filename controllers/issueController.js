const { supabase, supabaseAdmin } = require('../config/supabase');
const { classifyIssue } = require('../services/gemini');

/**
 * POST /issues
 * Role: citizen
 */
exports.createIssue = async (req, res) => {
  console.log('--- CREATE ISSUE REQUEST ---');
  console.log('User:', req.user ? { id: req.user.id, email: req.user.email, role: req.user.role } : 'No User');
  console.log('Body:', req.body);
  
  try {
    const { image_url, description, location_lat, location_lng, manual_department, manual_issue_type, is_manual_submission } = req.body;
    
    // 1. Validation
    if (!image_url) return res.status(400).json({ error: 'Missing field: image_url' });
    if (!description) return res.status(400).json({ error: 'Missing field: description' });
    if (location_lat === undefined || location_lat === null) return res.status(400).json({ error: 'Missing field: location_lat' });
    if (location_lng === undefined || location_lng === null) return res.status(400).json({ error: 'Missing field: location_lng' });

    const citizen_id = req.user?.id;
    if (!citizen_id) {
      console.error('Validation Error: No citizen_id in req.user');
      return res.status(401).json({ error: 'User session invalid' });
    }

    // 1. Run AI Classification (Blocking)
    console.log('Running AI Classification...');
    const aiResult = await classifyIssue(image_url, description);
    console.log('AI Result:', aiResult);

    // If AI determines it's not a civic issue, return an error
    if (aiResult.error) {
      console.log('AI determined not a civic issue:', aiResult.error);
      return res.status(400).json({ 
        error: 'Submission not related to civic issues',
        details: aiResult.error
      });
    }

    // 2. Override with manual department if provided
    const finalDepartment = manual_department || aiResult.assigned_authority;
    const finalIssueType = manual_issue_type || aiResult.issue_type;

    // 3. Save Issue to DB (Using supabaseAdmin to bypass RLS for backend service)
    // Check if it's a manual report - be very explicit
    const isManual = Boolean(
      is_manual_submission === true ||
      (manual_department && String(manual_department).trim() !== '') || 
      (manual_issue_type && String(manual_issue_type).trim() !== '')
    );
    
    console.log('Final Manual Status Check:', {
      manual_department,
      manual_issue_type,
      isManual
    });

    const issueData = {
      citizen_id,
      image_url,
      description,
      location_lat: Number(location_lat),
      location_lng: Number(location_lng),
      issue_type: finalIssueType,
      assigned_authority: finalDepartment,
      department: finalDepartment,
      ai_analysis: {
        ...aiResult,
        is_manual: isManual
      },
      status: 'reported'
    };

    console.log('Inserting into DB:', issueData);

    const { data: issue, error: issueError } = await supabaseAdmin
      .from('issues')
      .insert([issueData])
      .select('*');

    if (issueError) {
      console.error('Supabase Insert Error:', issueError);
      return res.status(400).json({ 
        error: 'Database insert failed',
        details: issueError.message,
        hint: issueError.hint,
        code: issueError.code
      });
    }

    if (!issue || issue.length === 0) {
      throw new Error('Failed to save issue - no data returned');
    }

    res.status(201).json(issue[0]);
  } catch (error) {
    console.error('--- CREATE ISSUE ERROR ---');
    console.error(error);
    res.status(error.status || 500).json({ 
      error: 'Failed to report issue',
      details: error.message || 'Internal Server Error',
      hint: error.hint,
      code: error.code
    });
  }
};

/**
 * GET /issues/my
 * Role: citizen
 */
exports.getMyIssues = async (req, res) => {
  try {
    // Using supabaseAdmin to fetch issues to bypass any RLS that might be hiding them
    const { data: issues, error } = await supabaseAdmin
      .from('issues')
      .select('*')
      .eq('citizen_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }
    
    res.json(issues);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch issues' });
  }
};

/**
 * GET /issues/authority
 * Role: head_authority
 */
exports.getAuthorityIssues = async (req, res) => {
  try {
    const { limit } = req.query;
    
    let selectFields = '*';
    
    let query = supabaseAdmin
      .from('issues')
      .select(selectFields);

    if (limit && !isNaN(parseInt(limit))) {
      query = query.limit(parseInt(limit));
    }

    const { data: issues, error } = await query.order('created_at', { ascending: false });

    if (error) {
      throw error;
    }
    
    res.json(issues);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch issues' });
  }
};

/**
 * PATCH /issues/:id/status
 * Role: head_authority
 */
exports.updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, resolved_image_url } = req.body;
    const changed_by = req.user.id;

    if (!['reported', 'in_progress', 'resolved'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    // 1. Get old status (Using Admin)
    const { data: oldIssue, error: fetchError } = await supabaseAdmin
      .from('issues')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !oldIssue) {
      return res.status(404).json({ error: 'Issue not found' });
    }

    // 2. Update status and resolved_image_url if provided (Using Admin)
    const updateData = { status };
    
    if (status === 'resolved' && resolved_image_url) {
      updateData.resolved_image_url = resolved_image_url;
      updateData.resolved_at = new Date().toISOString();
    }

    const { data: updatedIssue, error: updateError } = await supabaseAdmin
      .from('issues')
      .update(updateData)
      .eq('id', id)
      .select('*');

    if (updateError) {
      return res.status(500).json({ 
        error: 'Database update failed', 
        message: updateError.message
      });
    }

    if (!updatedIssue || updatedIssue.length === 0) {
      return res.status(404).json({ error: 'Issue not found' });
    }

    const finalResult = updatedIssue[0];

    // 3. Log the change (Using Admin)
    try {
      const logData = {
        issue_id: id,
        old_status: oldIssue.status,
        new_status: status,
        changed_by
      };
      if (status === 'resolved' && resolved_image_url) {
        logData.resolved_image_url = resolved_image_url;
      }
      await supabaseAdmin.from('issue_logs').insert([logData]);
    } catch (logErr) {
      // Non-fatal logging exception
    }

    res.json(finalResult);
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to update status',
      details: error.message || 'Internal Server Error'
    });
  }
};

/**
 * PATCH /issues/:id/reassign
 * Role: head_authority
 */
exports.reassignIssue = async (req, res) => {
  try {
    const { id } = req.params;
    const { assigned_authority } = req.body;

    const { data: updatedIssue, error } = await supabaseAdmin
      .from('issues')
      .update({ 
        assigned_authority, 
        department: assigned_authority // Update both columns
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw error;
    }
    res.json(updatedIssue);
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to reassign issue',
      details: error.message || 'Internal Server Error'
    });
  }
};

/**
 * GET /issues/public
 * Role: public (anyone can view the transparency wall)
 */
exports.getAllIssues = async (req, res) => {
  try {
    const { data: issues, error } = await supabaseAdmin
      .from('issues')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }
    
    res.json(issues);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch transparency wall issues' });
  }
};

/**
 * GET /issues/:id
 * Role: any authenticated user
 */
exports.getIssueById = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Using select() and then checking length instead of .single() to avoid PGRST116 error noise
    const { data: issues, error } = await supabaseAdmin
      .from('issues')
      .select('*')
      .eq('id', id);

    if (error) {
      return res.status(500).json({ 
        error: 'Database error',
        details: error.message 
      });
    }

    if (!issues || issues.length === 0) {
      return res.status(404).json({ error: 'Issue not found' });
    }

    res.json(issues[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch issue details' });
  }
};

/**
 * DELETE /issues/:id
 * Role: head_authority
 */
exports.deleteIssue = async (req, res) => {
  console.log('--- DELETE ISSUE REQUEST ---');
  console.log('User:', req.user ? { id: req.user.id, email: req.user.email, role: req.user.role } : 'No User');
  console.log('Deleting issue with ID:', req.params.id);
  try {
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from('issues')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Supabase Delete Error:', error);
      return res.status(500).json({ 
        error: 'Database error',
        details: error.message 
      });
    }

    console.log(`Issue ${id} deleted successfully.`);
    res.status(204).send(); // No Content
  } catch (error) {
    console.error('--- DELETE ISSUE CATCH ERROR ---');
    console.error(error);
    res.status(500).json({ error: 'Failed to delete issue' });
  }
};

/**
 * POST /issues/bulk-delete
 * Role: head_authority
 */
exports.bulkDeleteIssues = async (req, res) => {
  console.log('--- BULK DELETE ISSUES REQUEST ---');
  console.log('User:', req.user ? { id: req.user.id, email: req.user.email, role: req.user.role } : 'No User');
  console.log('Body:', req.body);
  try {
    const { issueIds } = req.body;

    if (!Array.isArray(issueIds) || issueIds.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty array of issue IDs provided' });
    }

    const { error } = await supabaseAdmin
      .from('issues')
      .delete()
      .in('id', issueIds);

    if (error) {
      console.error('Supabase Bulk Delete Error:', error);
      return res.status(500).json({ 
        error: 'Database error',
        details: error.message 
      });
    }

    console.log(`${issueIds.length} issues deleted successfully.`);
    res.status(204).send(); // No Content
  } catch (error) {
    console.error('--- BULK DELETE ISSUES CATCH ERROR ---');
    console.error(error);
    res.status(500).json({ error: 'Failed to bulk delete issues' });
  }
};
