# Guia de Deploy - STOKI Asset Tracker (v0.dev + Vercel)

Este guia ensina como colocar o STOKI (Controle de Estoque de Ativos) online de forma rápida e gratuita usando a dupla **v0.dev** e **Vercel**.

## 1. Como Exportar o Projeto do Antigravity
Você não precisa realizar um "export" complexo. Todo o código do seu aplicativo já está salvo localmente na pasta `C:\Users\Usuario\Music\SGE\`.
1. Acesse essa pasta pelo Windows Explorer.
2. Selecione todos os arquivos e compacte-os em um arquivo `.zip` (botão direito > Enviar para > Pasta compactada).
*Dica: caso tenha a pasta `node_modules`, você não precisa incluí-la no arquivo zip.*

## 2. Como Abrir o Projeto no v0.dev
A ferramenta v0.dev pode ser conectada perfeitamente com a plataforma Vercel para gerenciar e fazer o deploy de componentes e interfaces.
1. Acesse [v0.dev](https://v0.dev) e crie ou faça login na sua conta.
2. Como este projeto conta com um backend customizado (Express/SQLite) e não apenas front-end puro, a melhor rota para subir a aplicação sem adaptar arquivos é conectando-a diretamente na **Vercel** via integração com GitHub. (O v0.dev atua mais como um construtor de componentes React/Next.js conectados à Vercel).
3. **Passo alternativo (Recomendado):** Vá diretamente ao [Vercel.com](https://vercel.com), faça login usando a mesma conta que usa no v0.dev.

## 3. Como Fazer Deploy na Vercel (Em Poucos Cliques)
1. Crie uma conta no **GitHub** (https://github.com) se não tiver uma, e suba todo o conteúdo da sua pasta SGE para lá criando um repositório chamado `sge-tracker`.
2. Em seguida, entre na [Vercel](https://vercel.com/dashboard).
3. Clique no botão preto **"Add New"** > **"Project"**.
4. Importe o repositório `sge-tracker` diretamente da sua conta do GitHub conectada.
5. Em "Framework Preset", caso não detecte, deixe como `Other` ou `Node.js`.

## 4. Como Configurar as Variáveis de Ambiente do Supabase no Vercel
Durante a mesma tela de criação do projeto (antes de clicar em Deploy), abra a seção **"Environment Variables"**.
Você deve configurar as chaves do Supabase utilizadas no seu Auth:

* **Name:** `SUPABASE_URL`
* **Value:** `https://nikrcdkgqqfmiigmaaya.supabase.co`

* **Name:** `SUPABASE_ANON_KEY`
* **Value:** `(Sua Chave Publica que começa com sb_publishable...)`

Clique no botão "Add" para cada variável fixada.

## 5. Como Iniciar o Deploy (Aperte o Botão Mágico)
1. Verifique se as variáveis foram inseridas corretamente.
2. Aperte o botão **"Deploy"**.
3. A Vercel vai instalar, compilar e subir o STOKI. Dentro de cerca de 1 a 2 minutos, sua plataforma de estoque estará no ar recebendo uma URL estilo: `https://sge-tracker.vercel.app`.

## 6. Como Adicionar um Domínio Próprio (Opcional)
Se quiser usar um nome como `seunegocio.com.br`:
1. No painel principal da Vercel, clique no seu projeto SGE.
2. Navegue até a aba **"Settings"** e depois em **"Domains"**.
3. Digite o domínio que você possui (ex: `estoque.minhaempresa.com.br`) e clique em **Add**.
4. A Vercel mostrará instruções (chaves NS / CNAME / A) que você deve copiar e colar dentro da configuração DNS do lugar onde comprou o domínio (Registro.br, HostGator, GoDaddy, etc.). Após propagação, o site abrirá normalmente pelo mundo afora com esse endereço limpo.

## 7. Como Atualizar o Aplicativo Depois
O poder dessa ferramenta em nuvem é a integração contínua (CI/CD):
1. Sempre que você modificar o código desta pasta (SGE) através do Antigravity (eu!) ou manualmente.
2. Basta você "Comitar" e fazer o "Push" dessas novas alterações para o GitHub. (Se precisar de ajuda para empurrar pro git localmente, me peça nas conversas).
3. **Mágica:** A Vercel reconhecerá essa atualização silenciosamente, processará tudo por trás das cortinas e a versão atualizada estará no seu site oficial num tempo estimado de 30 segundos, sem você precisar clicar em mais nada!
