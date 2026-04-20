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

async function handleLogout() {
    await window.supabaseClient.auth.signOut();
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
