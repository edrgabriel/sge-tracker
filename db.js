const { createClient } = require('@supabase/supabase-js');

// Configurações do Supabase
// RECOMENDADO: Cadastre estas variáveis no painel do Vercel para maior segurança
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nikrcdkgqqfmiigmaaya.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5pa3JjZGtncXFmbWlpZ21hYXlhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjYxNTY3OSwiZXhwIjoyMDkyMTkxNjc5fQ.U5qYQvH9ZsXq_jFw5womi5LeoL7E2aqaAmfI0XdjYIw';

// Cliente principal usando Service Role para ignorar RLS eゲgerenciar usuários no backend
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

module.exports = supabase;
