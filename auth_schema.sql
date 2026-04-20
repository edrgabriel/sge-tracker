-- 1. Tabela de Perfis (User Roles)
CREATE TABLE IF NOT EXISTS public.perfis (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('master', 'gerente', 'operador', 'visualizador')) DEFAULT 'visualizador',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabela de Logs de Auditoria
CREATE TABLE IF NOT EXISTS public.logs_auditoria (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_email TEXT,
    acao TEXT NOT NULL, -- CADASTRAR, EDITAR, EXCLUIR, MOVIMENTAR
    tabela_alvo TEXT,
    item_id TEXT,
    dados_antigos JSONB,
    dados_novos JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Função para criar perfil automaticamente ao cadastrar novo usuário
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.perfis (id, email, role)
  VALUES (
    NEW.id, 
    NEW.email, 
    CASE 
      WHEN NEW.email = 'edergabrielpaixao27@gmail.com' THEN 'master' 
      ELSE 'visualizador' 
    END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para o Auth
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Função para atualizar timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_perfis_updated_at
BEFORE UPDATE ON public.perfis
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. Se o usuário já existir, inserir o perfil manualmente:
INSERT INTO public.perfis (id, email, role)
SELECT id, email, 'master' FROM auth.users WHERE email = 'edergabrielpaixao27@gmail.com'
ON CONFLICT (id) DO UPDATE SET role = 'master';
