document.addEventListener('DOMContentLoaded', async () => {
    // Only check session if supabase is loaded
    if (!window.supabaseClient) return;

    const { data: { session } } = await window.supabaseClient.auth.getSession();
    const currentPage = window.location.pathname;

    if (!session) {
        if (currentPage.includes('dashboard.html')) {
            window.location.href = 'index.html';
        }
    } else {
        // Obter papel (role) do usuário logado
        await syncUserRole(session.access_token);

        if (currentPage.includes('index.html') || currentPage.endsWith('/') || currentPage === '') {
            window.location.href = 'dashboard.html';
        }
    }

    // Bind Forms
    const lf = document.getElementById('form-login');
    if(lf) lf.addEventListener('submit', handleLogin);

    const rf = document.getElementById('form-register');
    if(rf) rf.addEventListener('submit', handleRegister);
});

// Setup auth listener for logout changes
if (window.supabaseClient) {
    window.supabaseClient.auth.onAuthStateChange((event, session) => {
        const currentPage = window.location.pathname;
        if (event === 'SIGNED_OUT') {
            if (currentPage.includes('dashboard.html')) {
                window.location.href = 'index.html';
            }
        } else if (event === 'SIGNED_IN') {
            if (currentPage.includes('index.html') || currentPage.endsWith('/') || currentPage === '') {
                window.location.href = 'dashboard.html';
            }
        }
    });
}

// Real functions for Login, Register
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-pass').value;
    
    // UI Feedback
    const btn = document.getElementById('login-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Entrando...';
    btn.disabled = true;

    const { data, error } = await window.supabaseClient.auth.signInWithPassword({
        email, password
    });

    if (error) {
        btn.innerHTML = originalText;
        btn.disabled = false;
        Swal.fire({
            icon: 'error',
            title: 'Ops! Falha no Login',
            text: error.message,
            customClass: { popup: 'premium-swal' }
        });
    } else {
        // Forçar sincronização de role logo após o login
        await syncUserRole(data.session.access_token);
        window.location.href = 'dashboard.html';
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-pass').value;
    const passConfirm = document.getElementById('reg-pass-confirm').value;

    if (password !== passConfirm) {
        return Swal.fire({
            icon: 'warning', 
            title: 'As senhas não coincidem.', 
            customClass: { popup: 'premium-swal' }
        });
    }

    const btn = document.getElementById('reg-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Criando...';
    btn.disabled = true;

    const { data, error } = await window.supabaseClient.auth.signUp({
        email, password
    });

    if (error) {
        btn.innerHTML = originalText;
        btn.disabled = false;
        Swal.fire({
            icon: 'error',
            title: 'Erro ao Registrar',
            text: error.message,
            customClass: { popup: 'premium-swal' }
        });
    } else {
        Swal.fire({
            icon: 'success',
            title: 'Bem-vindo!',
            text: 'Conta criada com sucesso. Você será redirecionado...',
            customClass: { popup: 'premium-swal' }
        });
        // Wait redirect
    }
}

async function handleResetPassword() {
    const { value: email } = await Swal.fire({
        title: 'Recuperar Senha',
        input: 'email',
        inputLabel: 'Qual é o seu e-mail de registro?',
        inputPlaceholder: 'email@exemplo.com',
        showCancelButton: true,
        confirmButtonText: 'Enviar Link',
        cancelButtonText: 'Cancelar',
        customClass: { popup: 'premium-swal' }
    });

    if (email) {
        const { error } = await window.supabaseClient.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + '/index.html',
        });
        if (error) {
            Swal.fire({
                icon:'error', 
                title:'Erro', 
                text: error.message,
                customClass: { popup: 'premium-swal' }
            });
        } else {
            Swal.fire({
                icon:'success', 
                title:'E-mail enviado!', 
                text: 'Verifique sua caixa de entrada e spam.',
                customClass: { popup: 'premium-swal' }
            });
        }
    }
}

async function syncUserRole(token) {
    console.log('Iniciando sincronização de cargo...');
    try {
        const res = await fetch('/api/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const data = await res.json();
            console.log('Cargo recebido do servidor:', data.role);
            localStorage.setItem('stoki_role', data.role);
            localStorage.setItem('stoki_email', data.email);
        } else {
            console.error('Falha na resposta do servidor /api/me:', res.status);
        }
    } catch (e) {
        console.error('Erro ao sincronizar papel do usuário:', e);
    }
}

// Utilitário global para Fetch autenticado
async function apiFetch(endpoint, options = {}) {
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    if (!session) {
        window.location.href = 'index.html';
        return;
    }

    const headers = {
        ...options.headers,
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
    };

    const response = await fetch(endpoint, { ...options, headers });
    
    if (response.status === 401 || response.status === 403) {
        const err = await response.json();
        Swal.fire('Acesso Negado', err.error || 'Você não tem permissão', 'error');
        if (response.status === 401) window.location.href = 'index.html';
        throw new Error(err.error);
    }

    return response;
}

async function handleLogout() {
    await window.supabaseClient.auth.signOut();
    localStorage.removeItem('stoki_role');
    localStorage.removeItem('stoki_email');
    window.location.href = 'index.html';
}

function toggleAuthMode(mode) {
    const loginForm = document.getElementById('form-login-wrapper');
    const regForm = document.getElementById('form-register-wrapper');
    if (mode === 'register') {
        loginForm.classList.remove('active');
        regForm.classList.add('active');
    } else {
        regForm.classList.remove('active');
        loginForm.classList.add('active');
    }
}

// Bind to window to be accessible from html
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.handleResetPassword = handleResetPassword;
window.handleLogout = handleLogout;
window.toggleAuthMode = toggleAuthMode;
window.apiFetch = apiFetch;
