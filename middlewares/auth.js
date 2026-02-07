const { supabase, supabaseAdmin } = require('../config/supabase');

/**
 * Middleware to verify Supabase JWT and attach user profile to request
 */
const authenticate = async (req, res, next) => {
  console.log(`Auth Middleware: ${req.method} ${req.originalUrl}`);
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'No authorization header provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    // 1. Verify the token with Supabase
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      console.error('Auth Middleware: Token verification failed:', authError?.message || 'No user found');
      return res.status(401).json({ 
        error: 'Invalid or expired token',
        details: authError?.message 
      });
    }

    // 2. Fetch the user's role and details from our profiles table
    // Use supabaseAdmin to bypass RLS and ensure we get the profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      console.error('Auth Middleware: Profile fetch error:', profileError);
    }

    // 3. Construct the user object with normalized role
    const normalizeRole = (role) => {
      if (!role) return 'citizen';
      const r = role.toLowerCase().replace(/[-_ ]/g, '').trim();
      if (r === 'headauthority' || r === 'authorityhead' || r === 'admin') return 'head_authority';
      return 'citizen';
    };

    let finalRole = 'citizen';
    let userDepartment = null;

    if (profile && profile.role) {
      finalRole = normalizeRole(profile.role);
      userDepartment = profile.department;
    } else {
      // Fallback to metadata if profile not found or role is missing
      const metadata = user.user_metadata || {};
      finalRole = normalizeRole(metadata.role);
      userDepartment = metadata.department || null;
    }

    // Sync metadata if it's different or missing
    const metadata = user.user_metadata || {};
    if (metadata.role !== finalRole || metadata.department !== userDepartment) {
      supabaseAdmin.auth.admin.updateUserById(user.id, {
        user_metadata: { ...metadata, role: finalRole, department: userDepartment }
      }).catch(() => {});
    }

    // Attach user and profile to the request object
    req.user = { 
      ...user, 
      ...profile, 
      role: finalRole,
      department: userDepartment 
    };
    
    console.log(`Auth Success: User=${user.email}, Role=${finalRole}, Dept=${userDepartment}`);
    next();
  } catch (error) {
    console.error('Auth Middleware Error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

/**
 * Middleware to authorize based on user roles
 * @param {string[]} allowedRoles - Array of roles allowed to access the route
 */
const authorize = (allowedRoles) => {
  return (req, res, next) => {
    console.log(`Authorize: User Role: ${req.user?.role}, Allowed: ${allowedRoles}`);
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: `Unauthorized: Role '${req.user?.role || 'unknown'}' does not have access.` 
      });
    }
    next();
  };
};

module.exports = { authenticate, authorize };
