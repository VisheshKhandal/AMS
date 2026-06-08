/**
 * Auth — register, login (Phase 2)
 */

const REMEMBERED_EMAIL_KEY = 'rememberedEmail';

function setAuthView(mode, { animate = true } = {}) {
  const loginView = document.getElementById('loginView');
  const registerView = document.getElementById('registerView');
  const tabLogin = document.getElementById('tabLogin');
  const tabRegister = document.getElementById('tabRegister');
  const authCard = document.getElementById('authCard');
  const authViews = document.getElementById('authViews');

  if (!loginView || !registerView) return;

  const isRegister = mode === 'register';
  const current = loginView.classList.contains('is-active') ? 'login' : 'register';

  if (current === mode) return;

  const hideError = (el) => {
    if (el) el.hidden = true;
  };
  hideError(document.getElementById('authError'));
  hideError(document.getElementById('registerError'));

  tabLogin?.classList.toggle('is-active', !isRegister);
  tabRegister?.classList.toggle('is-active', isRegister);
  tabLogin?.setAttribute('aria-selected', String(!isRegister));
  tabRegister?.setAttribute('aria-selected', String(isRegister));

  const outgoing = isRegister ? loginView : registerView;
  const incoming = isRegister ? registerView : loginView;

  const applyView = () => {
    loginView.classList.toggle('is-active', !isRegister);
    registerView.classList.toggle('is-active', isRegister);
    loginView.hidden = isRegister;
    registerView.hidden = !isRegister;
    authCard?.classList.toggle('is-register', isRegister);
    document.title = isRegister ? 'Create account — AttendanceHub' : 'Sign in — AttendanceHub';
    if (isRegister) history.replaceState(null, '', '#register');
    else history.replaceState(null, '', 'login.html');
    requestAnimationFrame(() => window.syncAuthViewsHeight?.());
  };

  if (!animate) {
    applyView();
    window.syncAuthViewsHeight?.();
    return;
  }

  authViews?.classList.add('is-transitioning');
  outgoing.classList.remove('is-active');
  outgoing.classList.add('is-exiting');
  incoming.hidden = false;
  incoming.classList.remove('is-active');

  requestAnimationFrame(() => {
    incoming.classList.add('is-active');
    window.syncAuthViewsHeight?.();
  });

  setTimeout(() => {
    outgoing.classList.remove('is-exiting');
    outgoing.hidden = true;
    authCard?.classList.toggle('is-register', isRegister);
    authViews?.classList.remove('is-transitioning');

    document.title = isRegister ? 'Create account — AttendanceHub' : 'Sign in — AttendanceHub';
    if (isRegister) history.replaceState(null, '', '#register');
    else history.replaceState(null, '', 'login.html');

    window.syncAuthViewsHeight?.();
    (isRegister ? document.getElementById('registerUsername') : document.getElementById('loginEmail'))?.focus();
  }, 420);
}

document.addEventListener('DOMContentLoaded', async () => {
  await requireAuth();

  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const authError = document.getElementById('authError');
  const registerError = document.getElementById('registerError');
  const rememberMe = document.getElementById('rememberMe');
  const forgotPassword = document.getElementById('forgotPassword');

  const showLoginError = (msg) => {
    if (authError) {
      authError.textContent = msg;
      authError.hidden = false;
      authError.classList.add('auth-error-shake');
      setTimeout(() => authError.classList.remove('auth-error-shake'), 500);
    } else {
      Toast.error(msg);
    }
  };

  const showRegisterError = (msg) => {
    if (registerError) {
      registerError.textContent = msg;
      registerError.hidden = false;
      registerError.classList.add('auth-error-shake');
      setTimeout(() => registerError.classList.remove('auth-error-shake'), 500);
    } else {
      Toast.error(msg);
    }
  };

  const savedEmail = localStorage.getItem(REMEMBERED_EMAIL_KEY);
  if (savedEmail) {
    const emailInput = document.getElementById('loginEmail');
    if (emailInput) emailInput.value = savedEmail;
    if (rememberMe) rememberMe.checked = true;
  }

  const initialMode = window.location.hash === '#register' ? 'register' : 'login';
  setAuthView(initialMode, { animate: false });

  document.getElementById('showRegister')?.addEventListener('click', (e) => {
    e.preventDefault();
    setAuthView('register');
  });

  document.getElementById('showLogin')?.addEventListener('click', (e) => {
    e.preventDefault();
    setAuthView('login');
  });

  document.getElementById('tabLogin')?.addEventListener('click', () => setAuthView('login'));
  document.getElementById('tabRegister')?.addEventListener('click', () => setAuthView('register'));

  window.addEventListener('hashchange', () => {
    setAuthView(window.location.hash === '#register' ? 'register' : 'login', { animate: false });
  });

  forgotPassword?.addEventListener('click', (e) => {
    e.preventDefault();
    Toast.info('Password reset is coming soon. Contact your administrator for help.');
  });

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    authError && (authError.hidden = true);

    const email = document.getElementById('loginEmail')?.value.trim();
    const password = document.getElementById('loginPassword')?.value;
    const submitBtn = loginForm.querySelector('[type="submit"]');

    if (!email || !password) {
      showLoginError('Email and password are required.');
      return;
    }

    setButtonLoading(submitBtn, true, 'Signing in…');

    try {
      const res = await API.auth.login({ email, password });
      persistAuthFromResponse(res.data);

      if (rememberMe?.checked) {
        localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
      } else {
        localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      }

      Toast.success(res.message || 'Logged in successfully');
      window.location.href = 'dashboard.html';
    } catch (err) {
      showLoginError(err.message);
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });

  registerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    registerError && (registerError.hidden = true);

    const username = document.getElementById('registerUsername')?.value.trim();
    const email = document.getElementById('registerEmail')?.value.trim();
    const password = document.getElementById('registerPassword')?.value;
    const submitBtn = registerForm.querySelector('[type="submit"]');

    if (!username || !email || !password) {
      showRegisterError('All fields are required.');
      return;
    }

    setButtonLoading(submitBtn, true, 'Creating account…');

    try {
      const res = await API.auth.register({ username, email, password });
      persistAuthFromResponse(res.data);
      Toast.success(res.message || 'Account created');
      window.location.href = 'dashboard.html';
    } catch (err) {
      showRegisterError(err.message);
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });
});
