const { createClient } = require('@supabase/supabase-js');

// Configurações do Supabase
// RECOMENDADO: Cadastre estas variáveis no painel do Vercel para maior segurança
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nikrcdkgqqfmiigmaaya.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'missing_key_configure_in_vercel';

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('ERRO CRITICO: SUPABASE_SERVICE_ROLE_KEY não encontrada! Configure no painel do Vercel.');
}

// Cliente principal usando Service Role para ignorar RLS eゲgerenciar usuários no backend
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

module.exports = supabase;
