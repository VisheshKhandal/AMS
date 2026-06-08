/**
 * API client — full-stack integration (Phases 2–6)
 */

const API_BASE_URL = (() => {
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    return 'http://localhost:5000/api';
  }
  return 'https://attendance-management-system-xm2e.onrender.com/api';
})();

const Auth = {
  getToken() {
    return localStorage.getItem('accessToken');
  },
  setToken(token) {
    if (token) localStorage.setItem('accessToken', token);
    else localStorage.removeItem('accessToken');
  },
  getUser() {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  },
  setUser(user) {
    if (user) localStorage.setItem('user', JSON.stringify(user));
    else localStorage.removeItem('user');
  },
  clear() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('user');
  },
  isAuthenticated() {
    return Boolean(this.getToken());
  },
};

class ApiClientError extends Error {
  constructor(message, statusCode, payload) {
    super(message);
    this.name = 'ApiClientError';
    this.statusCode = statusCode;
    this.payload = payload;
  }
}

const Toast = {
  container: null,

  ensureContainer() {
    if (this.container) return this.container;
    this.container = document.createElement('div');
    this.container.className = 'toast-container';
    this.container.setAttribute('aria-live', 'polite');
    document.body.appendChild(this.container);
    return this.container;
  },

  show(message, type = 'info', duration = 4000) {
    const root = this.ensureContainer();
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('visible'));
    setTimeout(() => {
      el.classList.remove('visible');
      setTimeout(() => el.remove(), 300);
    }, duration);
  },

  success(msg) {
    this.show(msg, 'success');
  },
  error(msg) {
    this.show(msg, 'error', 5500);
  },
  info(msg) {
    this.show(msg, 'info');
  },
};

const API = {
  baseUrl: API_BASE_URL,

  async request(endpoint, options = {}) {
    const { method = 'GET', body, headers = {}, skipAuth = false } = options;

    const finalHeaders = { 'Content-Type': 'application/json', ...headers };

    if (!skipAuth) {
      const token = Auth.getToken();
      if (token) finalHeaders.Authorization = `Bearer ${token}`;
    }

    const config = {
      method,
      headers: finalHeaders,
      credentials: 'include',
    };

    if (body !== undefined && method !== 'GET') {
      config.body = JSON.stringify(body);
    }

    let response;
    try {
      response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    } catch {
      throw new ApiClientError(
        'Backend server is waking up. Please wait a few seconds and try again.',
        0
      );
    }

    let data;
    try {
      data = await response.json();
    } catch {
      throw new ApiClientError('Invalid response from server', response.status);
    }

    if (!response.ok) {
      throw new ApiClientError(
        data.message || 'Request failed',
        response.status,
        data
      );
    }

    return data;
  },

  auth: {
    register(payload) {
      return API.request('/auth/register', { method: 'POST', body: payload, skipAuth: true });
    },
    login(payload) {
      return API.request('/auth/login', { method: 'POST', body: payload, skipAuth: true });
    },
    logout() {
      return API.request('/auth/logout', { method: 'POST' });
    },
    getCurrentUser() {
      return API.request('/auth/current-user');
    },
  },

  dashboard: {
    getStats() {
      return API.request('/dashboard/stats');
    },
  },

  classes: {
    list() {
      return API.request('/classes');
    },
    create(payload) {
      return API.request('/classes/create', { method: 'POST', body: payload });
    },
    delete(id) {
      return API.request(`/classes/${id}`, { method: 'DELETE' });
    },
  },

  students: {
    byClass(classId) {
      return API.request(`/students/class/${classId}`);
    },
    create(payload) {
      return API.request('/students', { method: 'POST', body: payload });
    },
    update(id, payload) {
      return API.request(`/students/${id}`, { method: 'PUT', body: payload });
    },
    delete(id) {
      return API.request(`/students/${id}`, { method: 'DELETE' });
    },
  },

  profile: {
    get() {
      return API.request('/profile');
    },
    update(payload) {
      return API.request('/profile', { method: 'PUT', body: payload });
    },
    activity() {
      return API.request('/profile/activity');
    },
    security() {
      return API.request('/profile/security');
    },
    updateTwoFactor(enabled) {
      return API.request('/profile/two-factor', { method: 'PUT', body: { enabled } });
    },
    changePassword(payload) {
      return API.request('/profile/password', { method: 'PUT', body: payload });
    },
    logoutAllDevices() {
      return API.request('/profile/logout-all', { method: 'POST' });
    },
  },

  attendance: {
    mark(payload) {
      return API.request('/attendance/mark', { method: 'POST', body: payload });
    },
    byClass(classId, date) {
      const q = date ? `?date=${encodeURIComponent(date)}` : '';
      return API.request(`/attendance/class/${classId}${q}`);
    },
    byStudent(studentId) {
      return API.request(`/attendance/student/${studentId}`);
    },
    percentage(studentId) {
      return API.request(`/attendance/student/${studentId}/percentage`);
    },
  },
};

function getInitials(name) {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function getDisplayName(user) {
  if (!user) return 'Teacher';
  return user.fullName?.trim() || user.username || user.email || 'Teacher';
}

function applyUserToLayout(user) {
  if (!user) return;
  const display = getDisplayName(user);
  document.querySelectorAll('.teacher-name').forEach((el) => {
    el.textContent = display;
  });
  document.querySelectorAll('.teacher-avatar').forEach((el) => {
    if (user.profileImage) {
      el.style.backgroundImage = `url(${user.profileImage})`;
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
      el.textContent = '';
    } else {
      el.style.backgroundImage = '';
      el.textContent = getInitials(display);
    }
  });
  const welcome = document.getElementById('welcomeName');
  if (welcome) welcome.textContent = display;
}

const ConfirmModal = {
  overlay: null,

  ensure() {
    if (this.overlay) return this.overlay;
    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay';
    this.overlay.id = 'confirmModal';
    this.overlay.innerHTML = `
      <div class="modal confirm-modal">
        <h3 class="confirm-title">Confirm</h3>
        <p class="confirm-message"></p>
        <div class="confirm-actions">
          <button type="button" class="btn btn-secondary" data-confirm-cancel>Cancel</button>
          <button type="button" class="btn btn-danger" data-confirm-ok>Confirm</button>
        </div>
      </div>`;
    document.body.appendChild(this.overlay);
    return this.overlay;
  },

  ask(message, { title = 'Are you sure?', confirmLabel = 'Confirm', danger = true } = {}) {
    const root = this.ensure();
    root.querySelector('.confirm-title').textContent = title;
    root.querySelector('.confirm-message').textContent = message;
    const okBtn = root.querySelector('[data-confirm-ok]');
    okBtn.textContent = confirmLabel;
    okBtn.className = danger ? 'btn btn-danger' : 'btn btn-primary';

    return new Promise((resolve) => {
      const cleanup = (result) => {
        root.classList.remove('open');
        cancelBtn.removeEventListener('click', onCancel);
        okBtn.removeEventListener('click', onOk);
        root.removeEventListener('click', onBackdrop);
        resolve(result);
      };
      const onCancel = () => cleanup(false);
      const onOk = () => cleanup(true);
      const onBackdrop = (e) => {
        if (e.target === root) onCancel();
      };
      const cancelBtn = root.querySelector('[data-confirm-cancel]');
      cancelBtn.addEventListener('click', onCancel);
      okBtn.addEventListener('click', onOk);
      root.addEventListener('click', onBackdrop);
      root.classList.add('open');
    });
  },
};

function setButtonLoading(btn, loading, label = 'Please wait…') {
  if (!btn) return;
  if (loading) {
    btn.dataset.originalText = btn.textContent;
    btn.disabled = true;
    btn.classList.add('is-loading');
    btn.textContent = label;
  } else {
    btn.disabled = false;
    btn.classList.remove('is-loading');
    btn.textContent = btn.dataset.originalText || btn.textContent;
  }
}

async function handleLogout(e) {
  e?.preventDefault();
  try {
    await API.auth.logout();
  } catch {
    /* clear local session even if server call fails */
  }
  Auth.clear();
  window.location.href = 'login.html';
}

function wireLogoutLinks() {
  document.querySelectorAll('#logoutLink, [data-logout]').forEach((el) => {
    el.addEventListener('click', handleLogout);
  });
}

async function requireAuth() {
  const page = document.body.dataset.page;
  const publicPages = new Set(['login', 'register']);

  if (publicPages.has(page)) {
    if (Auth.isAuthenticated()) {
      try {
        const res = await API.auth.getCurrentUser();
        Auth.setUser(res.data);
        window.location.href = 'dashboard.html';
        return null;
      } catch {
        Auth.clear();
      }
    }
    return null;
  }

  if (!page) return null;

  if (!Auth.isAuthenticated()) {
    window.location.href = 'login.html';
    return null;
  }

  try {
    const res = await API.auth.getCurrentUser();
    Auth.setUser(res.data);
    applyUserToLayout(res.data);
    wireLogoutLinks();
    return res.data;
  } catch (err) {
    Auth.clear();
    window.location.href = 'login.html';
    return null;
  }
}

function persistAuthFromResponse(data) {
  if (data?.accessToken) Auth.setToken(data.accessToken);
  if (data?.user) Auth.setUser(data.user);
}

function setupNavbarProfile() {
  const isProfilePage = document.body.dataset.page === 'profile';

  document.querySelectorAll('.navbar-right').forEach((navRight) => {
    navRight.querySelector('.profile-dropdown')?.remove();

    if (navRight.querySelector('.navbar-profile-link')) return;

    const existing = navRight.querySelector('.teacher-profile');
    const profileLink = document.createElement('a');
    profileLink.href = 'profile.html';
    profileLink.className = 'navbar-profile-link';
    profileLink.setAttribute('aria-label', 'Go to my profile');
    if (isProfilePage) profileLink.setAttribute('aria-current', 'page');
    profileLink.innerHTML = `
      <div class="teacher-avatar"></div>
      <span class="teacher-name">Teacher</span>`;

    if (existing) {
      const avatar = existing.querySelector('.teacher-avatar');
      const name = existing.querySelector('.teacher-name');
      if (avatar) {
        profileLink.querySelector('.teacher-avatar').replaceWith(avatar.cloneNode(true));
      }
      if (name) {
        profileLink.querySelector('.teacher-name').textContent = name.textContent;
      }
      existing.replaceWith(profileLink);
    } else {
      navRight.prepend(profileLink);
    }

  });

  const user = Auth.getUser();
  if (user) applyUserToLayout(user);
  wireLogoutLinks();
}

function setupSidebarIndicator() {
  const nav = document.querySelector('.sidebar-nav');
  if (!nav) return;

  let indicator = nav.querySelector('.sidebar-active-indicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.className = 'sidebar-active-indicator';
    indicator.setAttribute('aria-hidden', 'true');
    nav.prepend(indicator);
  }

  const moveIndicator = () => {
    const active = nav.querySelector('.sidebar-link.active');
    if (!active || !indicator) return;
    indicator.style.transform = `translateY(${active.offsetTop}px)`;
    indicator.style.height = `${active.offsetHeight}px`;
    indicator.style.opacity = '1';
  };

  moveIndicator();
  requestAnimationFrame(moveIndicator);
  window.addEventListener('resize', moveIndicator);
}

function setupSidebarCollapse() {
  const sidebar = document.getElementById('sidebar');
  const layout = document.querySelector('.app-layout');
  if (!sidebar || !layout) return;

  if (!document.getElementById('sidebarCollapse')) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'sidebarCollapse';
    btn.className = 'sidebar-collapse-btn';
    btn.setAttribute('aria-label', 'Collapse sidebar');
    btn.textContent = '‹';
    sidebar.querySelector('.sidebar-logo')?.appendChild(btn);
  }

  const collapseBtn = document.getElementById('sidebarCollapse');
  const stored = localStorage.getItem('sidebarCollapsed') === 'true';
  if (stored && window.innerWidth > 768) {
    layout.classList.add('sidebar-collapsed');
    collapseBtn.textContent = '›';
  }

  collapseBtn?.addEventListener('click', () => {
    const collapsed = layout.classList.toggle('sidebar-collapsed');
    localStorage.setItem('sidebarCollapsed', String(collapsed));
    collapseBtn.textContent = collapsed ? '›' : '‹';
    collapseBtn.setAttribute(
      'aria-label',
      collapsed ? 'Expand sidebar' : 'Collapse sidebar'
    );
  });

  if (!sidebar.querySelector('[data-nav="profile"]')) {
    const profileLink = document.createElement('a');
    profileLink.href = 'profile.html';
    profileLink.className = 'sidebar-link';
    profileLink.dataset.nav = 'profile';
    profileLink.innerHTML = `
      <span class="sidebar-link-icon">👤</span>
      Profile`;
    const nav = sidebar.querySelector('.sidebar-nav');
    const historyLink = nav?.querySelector('[data-nav="history"]');
    historyLink?.after(profileLink);
  }
}

const AppLayout = {
  async init(activePage) {
    if (typeof UserPreferences !== 'undefined') {
      UserPreferences.applyAll();
    }

    await requireAuth();

    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const menuToggle = document.getElementById('menuToggle');

    document.querySelectorAll('.sidebar-link[data-nav]').forEach((link) => {
      link.classList.toggle('active', link.dataset.nav === activePage);
    });

    setupNavbarProfile();
    setupSidebarCollapse();
    setupSidebarIndicator();

    const closeSidebar = () => {
      sidebar?.classList.remove('open');
      overlay?.classList.remove('visible');
    };

    menuToggle?.addEventListener('click', () => {
      sidebar?.classList.toggle('open');
      overlay?.classList.toggle('visible');
    });

    overlay?.addEventListener('click', closeSidebar);

    window.addEventListener('resize', () => {
      if (window.innerWidth > 768) closeSidebar();
    });
  },
};
