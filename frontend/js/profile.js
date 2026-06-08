/**
 * Teacher profile — view mode + slide-in edit + tabs
 */

let profileUser = null;
let profileStats = null;
let pendingImage = null;
let savedFormSnapshot = null;
let activeTab = 'overview';
let activityFilter = 'all';
let activityItemsCache = [];
let securityLoaded = false;

document.addEventListener('DOMContentLoaded', async () => {
  await AppLayout.init('profile');
  bindProfileEvents();
  syncPreferenceControlsFromStorage();
  applyAttendancePrefsFromStorage();
  bindSecurityAccordions();
  bindPreferenceControls();
  await loadProfile();
  handleInitialHash();
});

function bindProfileEvents() {
  document.getElementById('openEditPanelBtn')?.addEventListener('click', openEditPanel);
  document.getElementById('avatarEditTrigger')?.addEventListener('click', openEditPanel);
  document.getElementById('closeEditPanelBtn')?.addEventListener('click', closeEditPanel);
  document.getElementById('editPanelBackdrop')?.addEventListener('click', closeEditPanel);
  document.getElementById('viewAllActivityBtn')?.addEventListener('click', () => switchTab('activity'));

  document.getElementById('discardEditBtn')?.addEventListener('click', discardEdit);
  document.getElementById('saveProfileBtn')?.addEventListener('click', () => {
    document.getElementById('profileForm')?.requestSubmit();
  });

  document.getElementById('profileForm')?.addEventListener('submit', saveProfile);
  document.getElementById('profileImageInput')?.addEventListener('change', handleImageSelect);

  document.querySelectorAll('.profile-tab').forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  document.querySelectorAll('[data-goto-tab]').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.gotoTab));
  });

  document.getElementById('passwordForm')?.addEventListener('submit', changePassword);
  document.getElementById('logoutAllBtn')?.addEventListener('click', logoutAllDevices);

  document.getElementById('themeToggle')?.addEventListener('change', onThemeToggle);
  document.getElementById('compactSidebarPref')?.addEventListener('change', onCompactSidebarPref);
  document.getElementById('twoFactorToggle')?.addEventListener('change', onTwoFactorToggle);

  document.querySelectorAll('.activity-filter').forEach((btn) => {
    btn.addEventListener('click', () => {
      activityFilter = btn.dataset.activityFilter || 'all';
      document.querySelectorAll('.activity-filter').forEach((b) => {
        b.classList.toggle('active', b === btn);
      });
      renderActivityFeed(document.getElementById('activityFeed'), false);
    });
  });

  const form = document.getElementById('profileForm');
  form?.querySelectorAll('input, select, textarea').forEach((el) => {
    el.addEventListener('input', checkFormDirty);
    el.addEventListener('change', checkFormDirty);
  });

  document.getElementById('profileBioInput')?.addEventListener('input', updateBioCount);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeEditPanel();
  });
}

function handleInitialHash() {
  const hash = window.location.hash.replace('#', '');
  if (hash === 'edit') openEditPanel();
  else if (['security', 'preferences', 'activity', 'overview'].includes(hash)) {
    switchTab(hash);
  }
}

async function loadProfile() {
  setProfileLoading(true);
  try {
    const res = await API.profile.get();
    profileUser = res.data?.user ?? res.data;
    profileStats = res.data?.stats ?? {};

    Auth.setUser(profileUser);
    applyUserToLayout(profileUser);
    renderProfileView(profileUser, profileStats);
    renderOverviewGrid(profileUser);
    renderCompleteness(profileUser);
    fillEditForm(profileUser);
    savedFormSnapshot = getFormSnapshot();

    document.getElementById('profileContent')?.removeAttribute('hidden');

    loadActivityPreview();

    if (activeTab === 'activity') loadActivity();
    if (activeTab === 'security') loadSecurity();
  } catch (err) {
    Toast.error(err.message || 'Could not load profile');
  } finally {
    setProfileLoading(false);
  }
}

function setProfileLoading(loading) {
  const loader = document.getElementById('profileLoader');
  const content = document.getElementById('profileContent');
  if (loader) {
    loader.hidden = !loading;
    loader.setAttribute('aria-busy', String(loading));
  }
  if (content) content.hidden = loading;
  if (!loading && loader) {
    loader.remove();
  }
}

function renderProfileView(user, stats) {
  const displayName = getDisplayName(user);
  const classes = stats.totalClasses ?? 0;
  const students = stats.totalStudents ?? 0;

  setText('profileFullName', displayName);
  setText('profileEmail', user.email);
  setText('profileRole', user.role || 'Teacher');
  setText('profileSubtitle', user.bio?.trim() ? 'Educator' : 'Senior Teacher');
  setText('profileJoined', formatJoinDate(user.createdAt));
  setText(
    'profileSummary',
    `Managing ${classes} class${classes === 1 ? '' : 'es'} · ${students} student${students === 1 ? '' : 's'}`
  );
  setText('profileBioDisplay', user.bio?.trim() || 'No bio added yet.');

  setText('headerStatClasses', classes);
  setText('headerStatStudents', students);
  const ratePct = Math.round((stats.attendancePercentage ?? 0) * 10) / 10;
  setText('headerStatRate', `${ratePct}%`);
  setText('headerStatToday', stats.markedToday ?? 0);

  setText('asideStatClasses', classes);
  setText('asideStatStudents', students);
  setText('asideStatRate', `${ratePct}%`);
  setText('asideStatToday', stats.markedToday ?? 0);

  setAvatarEl('profileAvatarLarge', user.profileImage, displayName);
  setAvatarEl('asideMiniAvatar', user.profileImage, displayName);
  setText('asideMiniName', displayName);
  setText('asideMiniRole', user.role || 'Teacher');
}

function renderOverviewGrid(user) {
  const grid = document.getElementById('overviewInfoGrid');
  if (!grid) return;

  const rows = [
    ['Full name', user.fullName?.trim() || getDisplayName(user)],
    ['Username', user.username || '—'],
    ['Email', user.email || '—'],
    ['Phone', user.phoneNumber?.trim() || '—'],
    ['Gender', user.gender?.trim() || '—'],
    ['Address', user.address?.trim() || '—'],
    ['Bio', user.bio?.trim() || '—'],
  ];

  grid.innerHTML = rows
    .map(
      ([label, value]) => `
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value)}</dd>`
    )
    .join('');
}

function renderCompleteness(user) {
  const checks = [
    { ok: Boolean(user.fullName?.trim()), label: 'full name' },
    { ok: Boolean(user.profileImage), label: 'profile photo' },
    { ok: Boolean(user.bio?.trim()), label: 'bio' },
    { ok: Boolean(user.phoneNumber?.trim()), label: 'phone' },
    { ok: Boolean(user.address?.trim()), label: 'address' },
    { ok: Boolean(user.gender?.trim()), label: 'gender' },
  ];

  const done = checks.filter((c) => c.ok).length;
  const percent = Math.round((done / checks.length) * 100);
  const missing = checks.filter((c) => !c.ok).map((c) => c.label);

  setText('completenessPercent', `${percent}%`);
  setText('asideCompletenessPercent', `${percent}%`);

  const fill = document.getElementById('completenessFill');
  if (fill) fill.style.width = `${percent}%`;

  const hintText =
    percent === 100
      ? 'Your profile is complete.'
      : `Add: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}`;

  const hint = document.getElementById('completenessHint');
  if (hint) hint.textContent = hintText;

  const asideHint = document.getElementById('asideCompletenessHint');
  if (asideHint) asideHint.textContent = hintText;

  updateAsideRing(percent);
}

function updateAsideRing(percent) {
  const ring = document.getElementById('asideRingFill');
  if (!ring) return;
  const circumference = 2 * Math.PI * 15.5;
  ring.style.strokeDasharray = String(circumference);
  ring.style.strokeDashoffset = String(circumference - (percent / 100) * circumference);
}

function bindSecurityAccordions() {
  document.querySelectorAll('[data-accordion]').forEach((accordion) => {
    const trigger = accordion.querySelector('.security-accordion-trigger');
    const panel = accordion.querySelector('.security-accordion-panel');
    if (!trigger || !panel) return;

    trigger.addEventListener('click', () => {
      const isOpen = accordion.classList.contains('open');
      document.querySelectorAll('[data-accordion].open').forEach((other) => {
        if (other === accordion) return;
        other.classList.remove('open');
        const t = other.querySelector('.security-accordion-trigger');
        const p = other.querySelector('.security-accordion-panel');
        if (t) t.setAttribute('aria-expanded', 'false');
        if (p) p.hidden = true;
      });

      accordion.classList.toggle('open', !isOpen);
      trigger.setAttribute('aria-expanded', String(!isOpen));
      panel.hidden = isOpen;
    });
  });
}

function bindPreferenceControls() {
  document.querySelectorAll('.accent-swatch').forEach((btn) => {
    btn.addEventListener('click', () => {
      const accent = btn.dataset.accent || 'blue';
      UserPreferences.setAccent(accent);
      document.querySelectorAll('.accent-swatch').forEach((s) => {
        s.classList.toggle('active', s === btn);
      });
      Toast.info('Accent color updated');
    });
  });

  ['attPrefDefaultMode', 'attPrefEditPast', 'attPrefAutoSave', 'attPrefConfirmPopup'].forEach(
    (id) => {
      document.getElementById(id)?.addEventListener('change', saveAttendancePrefs);
    }
  );
}

function syncPreferenceControlsFromStorage() {
  UserPreferences.applyAll();
  const theme = UserPreferences.applyTheme();
  const toggle = document.getElementById('themeToggle');
  const label = document.getElementById('themeLabel');
  if (toggle) toggle.checked = theme === 'light';
  if (label) label.textContent = theme === 'light' ? 'Light' : 'Dark';

  const accent = UserPreferences.applyAccent();
  document.querySelectorAll('.accent-swatch').forEach((s) => {
    s.classList.toggle('active', s.dataset.accent === accent);
  });

  const compact = localStorage.getItem('sidebarCollapsed') === 'true';
  const compactPref = document.getElementById('compactSidebarPref');
  if (compactPref) compactPref.checked = compact;
}

function applyAttendancePrefsFromStorage() {
  const prefs = JSON.parse(localStorage.getItem('attendancePrefs') || '{}');
  setValue('attPrefDefaultMode', prefs.defaultMode || 'present');
  const editPast = document.getElementById('attPrefEditPast');
  if (editPast) editPast.checked = Boolean(prefs.editPast);
  const autoSave = document.getElementById('attPrefAutoSave');
  if (autoSave) autoSave.checked = prefs.autoSave !== false;
  const confirm = document.getElementById('attPrefConfirmPopup');
  if (confirm) confirm.checked = prefs.confirmPopup !== false;
}

function saveAttendancePrefs() {
  const prefs = {
    defaultMode: document.getElementById('attPrefDefaultMode')?.value || 'present',
    editPast: document.getElementById('attPrefEditPast')?.checked ?? false,
    autoSave: document.getElementById('attPrefAutoSave')?.checked ?? true,
    confirmPopup: document.getElementById('attPrefConfirmPopup')?.checked ?? true,
  };
  localStorage.setItem('attendancePrefs', JSON.stringify(prefs));
}

async function loadSecurity() {
  const sessionList = document.getElementById('sessionList');
  const historyList = document.getElementById('loginHistoryList');
  if (!sessionList || !historyList) return;

  sessionList.innerHTML = '<li class="session-item text-muted">Loading…</li>';
  historyList.innerHTML = '<li class="login-history-item text-muted">Loading…</li>';

  try {
    const res = await API.profile.security();
    const data = res.data || {};
    securityLoaded = true;

    renderSessionList(data);
    renderLoginHistory(data.loginHistory || []);

    const toggle = document.getElementById('twoFactorToggle');
    const badge = document.getElementById('twoFactorBadge');
    if (toggle) toggle.checked = Boolean(data.twoFactorEnabled);
    if (badge) {
      badge.textContent = data.twoFactorEnabled ? 'On' : 'Off';
      badge.classList.toggle('on', Boolean(data.twoFactorEnabled));
    }
  } catch (err) {
    sessionList.innerHTML = `<li class="session-item">${escapeHtml(err.message)}</li>`;
    historyList.innerHTML = `<li class="login-history-item">${escapeHtml(err.message)}</li>`;
  }
}

function renderSessionList(data) {
  const list = document.getElementById('sessionList');
  if (!list) return;

  const session = data.currentSession || {};
  const device = session.device || `${getOsLabel()} • ${getBrowserLabel()}`;
  const lastLogin = data.lastLoginAt ? formatRelativeTime(data.lastLoginAt) : '—';

  list.innerHTML = `
    <li class="session-item current">
      <div class="session-item-head">
        <span class="session-item-device">${escapeHtml(device)}</span>
        <span class="session-badge">This device</span>
      </div>
      <p class="session-item-meta">Last login ${escapeHtml(lastLogin)} · Active now</p>
    </li>
    <li class="session-item">
      <p class="session-item-device">Other devices</p>
      <p class="session-item-meta">Use “Log out all other devices” to end remote sessions.</p>
    </li>`;
}

function renderLoginHistory(events) {
  const list = document.getElementById('loginHistoryList');
  if (!list) return;

  if (!events.length) {
    list.innerHTML =
      '<li class="login-history-item empty-feed">No login history yet. Sign in again to record activity.</li>';
    return;
  }

  const icons = {
    login: '🔑',
    password_change: '🔒',
    profile_update: '✏️',
    logout_all: '🚪',
  };

  list.innerHTML = events
    .slice(0, 12)
    .map((e) => {
      const icon = icons[e.type] || '•';
      const device = e.meta?.device ? ` · ${e.meta.device}` : '';
      return `
        <li class="login-history-item">
          <span class="login-history-icon">${icon}</span>
          <span class="login-history-text">${escapeHtml(e.description)}</span>
          <span class="login-history-meta">${formatActivityDate(e.at)}${escapeHtml(device)}</span>
        </li>`;
    })
    .join('');
}

async function onTwoFactorToggle(e) {
  const enabled = e.target.checked;
  try {
    await API.profile.updateTwoFactor(enabled);
    const badge = document.getElementById('twoFactorBadge');
    if (badge) {
      badge.textContent = enabled ? 'On' : 'Off';
      badge.classList.toggle('on', enabled);
    }
    Toast.success(enabled ? '2FA enabled (demo)' : '2FA disabled');
    if (securityLoaded) loadSecurity();
  } catch (err) {
    e.target.checked = !enabled;
    Toast.error(err.message);
  }
}

function getBrowserLabel() {
  const ua = navigator.userAgent;
  if (ua.includes('Edg/')) return 'Edge';
  if (ua.includes('Chrome/')) return 'Chrome';
  if (ua.includes('Firefox/')) return 'Firefox';
  if (ua.includes('Safari/') && !ua.includes('Chrome')) return 'Safari';
  return 'Browser';
}

function getOsLabel() {
  const ua = navigator.userAgent;
  if (ua.includes('Windows')) return 'Windows';
  if (ua.includes('Mac OS')) return 'macOS';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
  if (ua.includes('Linux')) return 'Linux';
  return 'Device';
}

function switchTab(tabId) {
  if (tabId === activeTab) return;

  const currentPanel = document.querySelector('.tab-panel.active');
  const nextPanel = document.getElementById(`panel-${tabId}`);
  if (!nextPanel) return;

  const applyTabState = () => {
    activeTab = tabId;

    document.querySelectorAll('.profile-tab').forEach((t) => {
      const isActive = t.dataset.tab === tabId;
      t.classList.toggle('active', isActive);
      t.setAttribute('aria-selected', String(isActive));
    });

    document.querySelectorAll('.tab-panel').forEach((panel) => {
      const id = panel.id.replace('panel-', '');
      const show = id === tabId;
      panel.hidden = !show;
      panel.classList.toggle('active', show);
      panel.classList.remove('tab-enter', 'tab-exit');
    });

    if (tabId === 'activity') loadActivity();
    if (tabId === 'security') loadSecurity();

    const url = new URL(window.location);
    if (tabId === 'overview') url.hash = '';
    else url.hash = tabId;
    history.replaceState(null, '', url);
  };

  if (!currentPanel || currentPanel === nextPanel) {
    applyTabState();
    return;
  }

  currentPanel.classList.add('tab-exit');
  currentPanel.classList.remove('active');

  setTimeout(() => {
    currentPanel.hidden = true;
    currentPanel.classList.remove('tab-exit');

    nextPanel.hidden = false;
    nextPanel.classList.add('active', 'tab-enter');

    document.querySelectorAll('.profile-tab').forEach((t) => {
      const isActive = t.dataset.tab === tabId;
      t.classList.toggle('active', isActive);
      t.setAttribute('aria-selected', String(isActive));
    });

    activeTab = tabId;

    setTimeout(() => nextPanel.classList.remove('tab-enter'), 380);

    if (tabId === 'activity') loadActivity();
    if (tabId === 'security') loadSecurity();

    const url = new URL(window.location);
    if (tabId === 'overview') url.hash = '';
    else url.hash = tabId;
    history.replaceState(null, '', url);
  }, 260);
}

function getActivityCategory(item) {
  if (item.category) return item.category;
  if (['login', 'password_change', 'profile_update', 'logout_all'].includes(item.type)) {
    return 'account';
  }
  return 'teaching';
}

function filterActivityItems(items) {
  if (activityFilter === 'all') return items;
  return items.filter((item) => getActivityCategory(item) === activityFilter);
}

function renderActivityItems(items, compact = false) {
  const filtered = filterActivityItems(items);
  if (!filtered.length) {
    return '<li class="activity-feed-item empty-feed">No activity in this category yet.</li>';
  }

  const icons = {
    class: '📚',
    student: '👨‍🎓',
    attendance: '✅',
    login: '🔑',
    password_change: '🔒',
    profile_update: '✏️',
    logout_all: '🚪',
  };
  const slice = compact ? filtered.slice(0, 4) : filtered;

  return slice
    .map((item) => {
      const icon = icons[item.type] || '•';
      const category = getActivityCategory(item);
      const time = formatRelativeTime(item.at);
      const timeCell = compact
        ? ''
        : `<span class="activity-feed-time" title="${escapeHtml(formatDateTime(item.at))}">${time}</span>`;
      const badge = compact
        ? ''
        : `<span class="activity-category-badge ${category}">${category}</span>`;
      return `
        <li class="activity-feed-item" data-category="${category}">
          <span class="activity-feed-icon">${icon}</span>
          <span class="activity-feed-text">${escapeHtml(item.text)} ${badge}</span>
          ${timeCell}
        </li>`;
    })
    .join('');
}

function renderActivityFeed(feedEl, compact) {
  if (!feedEl) return;
  feedEl.innerHTML = renderActivityItems(activityItemsCache, compact);
}

async function fetchActivityItems() {
  const res = await API.profile.activity();
  return Array.isArray(res.data) ? res.data : [];
}

async function loadActivityPreview() {
  const preview = document.getElementById('activityPreview');
  if (!preview) return;

  preview.innerHTML = '<li class="activity-feed-item text-muted">Loading…</li>';

  try {
    activityItemsCache = await fetchActivityItems();
    preview.innerHTML = renderActivityItems(activityItemsCache, true);
  } catch {
    preview.innerHTML =
      '<li class="activity-feed-item empty-feed">Activity will appear here.</li>';
  }
}

async function loadActivity() {
  const feed = document.getElementById('activityFeed');
  if (!feed) return;

  feed.innerHTML = '<li class="activity-feed-item text-muted">Loading…</li>';

  try {
    activityItemsCache = await fetchActivityItems();
    renderActivityFeed(feed, false);
  } catch (err) {
    feed.innerHTML = `<li class="activity-feed-item error">${escapeHtml(err.message)}</li>`;
  }
}

function openEditPanel() {
  if (profileUser) {
    fillEditForm(profileUser);
    pendingImage = null;
    savedFormSnapshot = getFormSnapshot();
  }

  document.getElementById('editPanelBackdrop')?.removeAttribute('hidden');
  const panel = document.getElementById('editPanel');
  panel?.classList.add('open');
  panel?.setAttribute('aria-hidden', 'false');
  document.body.classList.add('edit-panel-open');
  checkFormDirty();
}

function closeEditPanel() {
  if (isFormDirty()) {
    ConfirmModal.ask('Discard unsaved changes?', {
      title: 'Unsaved changes',
      confirmLabel: 'Discard',
      danger: true,
    }).then((ok) => {
      if (ok) {
        discardEdit();
        hideEditPanel();
      }
    });
    return;
  }
  hideEditPanel();
}

function hideEditPanel() {
  document.getElementById('editPanelBackdrop')?.setAttribute('hidden', '');
  const panel = document.getElementById('editPanel');
  panel?.classList.remove('open');
  panel?.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('edit-panel-open');
}

function discardEdit() {
  if (profileUser) {
    fillEditForm(profileUser);
    pendingImage = null;
    setAvatarEl('editAvatarPreview', profileUser.profileImage, getDisplayName(profileUser));
    savedFormSnapshot = getFormSnapshot();
  }
  checkFormDirty();
  hideEditPanel();
}

function fillEditForm(user) {
  setValue('profileFullNameInput', user.fullName?.trim() || getDisplayName(user));
  setValue('profileUsername', user.username || '');
  setValue('profileEmailInput', user.email || '');
  setValue('profilePhone', user.phoneNumber || '');
  setValue('profileGender', user.gender || '');
  setValue('profileAddress', user.address || '');
  setValue('profileBioInput', user.bio || '');
  setAvatarEl('editAvatarPreview', user.profileImage, getDisplayName(user));
  updateBioCount();
}

function getFormSnapshot() {
  return JSON.stringify({
    ...getFormPayload(),
    image: pendingImage ?? profileUser?.profileImage ?? null,
  });
}

function isFormDirty() {
  return getFormSnapshot() !== savedFormSnapshot;
}

function checkFormDirty() {
  const dirty = isFormDirty();
  const saveBtn = document.getElementById('saveProfileBtn');
  const discardBtn = document.getElementById('discardEditBtn');
  if (saveBtn) saveBtn.disabled = !dirty;
  if (discardBtn) discardBtn.disabled = !dirty;
}

async function handleImageSelect(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    Toast.error('Please choose an image file');
    return;
  }

  const avatarWrap = document.getElementById('avatarEditTrigger');
  avatarWrap?.classList.add('is-uploading');

  try {
    pendingImage = await compressImage(file);
    setAvatarEl('editAvatarPreview', pendingImage, getDisplayName(profileUser));
    checkFormDirty();
  } catch {
    Toast.error('Could not process image');
  } finally {
    avatarWrap?.classList.remove('is-uploading');
    e.target.value = '';
  }
}

async function compressImage(file, maxBytes = 120_000) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const img = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });

  const maxDim = 256;
  let { width, height } = img;
  if (width > height && width > maxDim) {
    height = Math.round((height * maxDim) / width);
    width = maxDim;
  } else if (height > maxDim) {
    width = Math.round((width * maxDim) / height);
    height = maxDim;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(img, 0, 0, width, height);

  let quality = 0.82;
  let result = canvas.toDataURL('image/jpeg', quality);
  while (result.length > maxBytes && quality > 0.45) {
    quality -= 0.08;
    result = canvas.toDataURL('image/jpeg', quality);
  }
  return result;
}

function getFormPayload() {
  return {
    fullName: document.getElementById('profileFullNameInput')?.value.trim() ?? '',
    username: document.getElementById('profileUsername')?.value.trim() ?? '',
    email: document.getElementById('profileEmailInput')?.value.trim() ?? '',
    phoneNumber: document.getElementById('profilePhone')?.value.trim() ?? '',
    gender: document.getElementById('profileGender')?.value ?? '',
    address: document.getElementById('profileAddress')?.value.trim() ?? '',
    bio: document.getElementById('profileBioInput')?.value.trim() ?? '',
  };
}

async function saveProfile(e) {
  e.preventDefault();

  const btn = document.getElementById('saveProfileBtn');
  const payload = getFormPayload();

  if (!payload.fullName || !payload.username || !payload.email) {
    Toast.error('Full name, username, and email are required.');
    return;
  }

  if (pendingImage !== null) {
    payload.profileImage = pendingImage;
  }

  setButtonLoading(btn, true, 'Saving…');

  try {
    const res = await API.profile.update(payload);
    profileUser = res.data?.user ?? res.data;
    pendingImage = null;

    Auth.setUser(profileUser);
    applyUserToLayout(profileUser);

    await loadProfile();
    savedFormSnapshot = getFormSnapshot();
    checkFormDirty();
    hideEditPanel();

    Toast.success('Profile saved successfully');
  } catch (err) {
    Toast.error(err.message || 'Could not save profile');
  } finally {
    setButtonLoading(btn, false);
  }
}

async function changePassword(e) {
  e.preventDefault();
  const btn = document.getElementById('changePasswordBtn');
  const current = document.getElementById('currentPassword')?.value;
  const next = document.getElementById('newPassword')?.value;
  const confirm = document.getElementById('confirmPassword')?.value;

  if (next !== confirm) {
    Toast.error('New passwords do not match');
    return;
  }

  setButtonLoading(btn, true, 'Updating…');
  try {
    await API.profile.changePassword({ currentPassword: current, newPassword: next });
    e.target.reset();
    securityLoaded = false;
    loadSecurity();
    Toast.success('Password updated successfully');
  } catch (err) {
    Toast.error(err.message);
  } finally {
    setButtonLoading(btn, false);
  }
}

async function logoutAllDevices() {
  const ok = await ConfirmModal.ask(
    'This will sign you out on other browsers and devices. Continue?',
    { title: 'Log out all devices', confirmLabel: 'Log out all' }
  );
  if (!ok) return;

  try {
    await API.profile.logoutAllDevices();
    securityLoaded = false;
    loadSecurity();
    Toast.success('Other sessions have been signed out');
  } catch (err) {
    Toast.error(err.message);
  }
}

function onThemeToggle(e) {
  const theme = e.target.checked ? 'light' : 'dark';
  UserPreferences.setTheme(theme);
  const label = document.getElementById('themeLabel');
  if (label) label.textContent = theme === 'light' ? 'Light' : 'Dark';
  Toast.info(`${theme === 'light' ? 'Light' : 'Dark'} theme applied`);
}

function onCompactSidebarPref(e) {
  localStorage.setItem('sidebarCollapsed', String(e.target.checked));
  const layout = document.querySelector('.app-layout');
  if (layout && window.innerWidth > 768) {
    layout.classList.toggle('sidebar-collapsed', e.target.checked);
  }
  Toast.info('Sidebar preference saved');
}

function setAvatarEl(id, imageUrl, fallbackName) {
  const el = document.getElementById(id);
  if (!el) return;
  if (imageUrl) {
    el.style.backgroundImage = `url(${imageUrl})`;
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center';
    el.textContent = '';
  } else {
    el.style.backgroundImage = '';
    el.textContent = getInitials(fallbackName || 'T');
  }
}

function updateBioCount() {
  const bio = document.getElementById('profileBioInput')?.value ?? '';
  const counter = document.getElementById('bioCharCount');
  if (counter) counter.textContent = String(bio.length);
}

function formatJoinDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function formatDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function formatActivityDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
}

function formatRelativeTime(d) {
  if (!d) return '';
  const date = new Date(d);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);

  let relative;
  if (mins < 1) relative = 'Just now';
  else if (mins < 60) relative = `${mins}m ago`;
  else {
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) relative = `${hrs}h ago`;
    else {
      const days = Math.floor(hrs / 24);
      if (days < 7) relative = `${days}d ago`;
      else return formatDateTime(d);
    }
  }

  if (date >= startOfToday) return `Today · ${relative}`;
  if (date >= startOfYesterday) return `Yesterday · ${relative}`;
  return relative;
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function escapeHtml(str) {
  const el = document.createElement('div');
  el.textContent = str ?? '';
  return el.innerHTML;
}
