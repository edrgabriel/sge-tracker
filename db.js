const { createClient } = require('@supabase/supabase-js');

// Using the same credentials provided in public/js/supabase.js
// For a production app, you should use environment variables like process.env.SUPABASE_URL
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nikrcdkgqqfmiigmaaya.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_13I7wz7owCKZXZhM8V79lQ_6inllWwF';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

module.exports = supabase;
