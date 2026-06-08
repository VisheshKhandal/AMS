/**
 * Global user preferences — theme, accent, attendance workflow
 * Loaded in <head> so appearance applies before first paint.
 */
const UserPreferences = {
  applyAll() {
    this.applyTheme();
    this.applyAccent();
  },

  applyTheme() {
    const theme = localStorage.getItem('appTheme') || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    return theme;
  },

  setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('appTheme', theme);
    window.dispatchEvent(new CustomEvent('preferences:theme', { detail: { theme } }));
  },

  applyAccent() {
    const accent = localStorage.getItem('appAccent') || 'blue';
    document.documentElement.setAttribute('data-accent', accent);
    return accent;
  },

  setAccent(accent) {
    document.documentElement.setAttribute('data-accent', accent);
    localStorage.setItem('appAccent', accent);
    window.dispatchEvent(new CustomEvent('preferences:accent', { detail: { accent } }));
  },

  getAttendancePrefs() {
    try {
      return JSON.parse(localStorage.getItem('attendancePrefs') || '{}');
    } catch {
      return {};
    }
  },

  getAttendancePrefsWithDefaults() {
    const prefs = this.getAttendancePrefs();
    return {
      defaultMode: prefs.defaultMode || 'present',
      editPast: Boolean(prefs.editPast),
      autoSave: prefs.autoSave !== false,
      confirmPopup: prefs.confirmPopup !== false,
    };
  },
};

(function applyPreferencesEarly() {
  UserPreferences.applyAll();
})();

window.addEventListener('storage', (e) => {
  if (e.key === 'appTheme' || e.key === 'appAccent') {
    UserPreferences.applyAll();
  }
});
