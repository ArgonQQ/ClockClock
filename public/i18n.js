const translations = {
  en: {
    // Login
    loginUser: 'Username',
    loginPass: 'Password',
    loginBtn: 'Login',
    loginOidc: 'Login with SSO',

    // Header
    logout: 'Logout',

    // Tabs
    tabTracker: 'Tracker',
    tabEntries: 'Entries',
    tabReports: 'Reports',
    tabUsers: 'Users',
    tabCustomers: 'Customers',

    // Tracker
    start: 'Start',
    pause: 'Pause',
    resume: 'Resume',
    stop: 'Stop',
    customer: 'Customer',
    customerPh: 'Customer name',
    description: 'Description',
    descriptionPh: 'What are you working on?',
    miniTimer: 'Mini Timer',
    notifications: 'Desktop Notifications',

    // Entries
    allCustomers: 'All Customers',
    allTime: 'All Time',
    today: 'Today',
    thisWeek: 'This Week',
    thisMonth: 'This Month',
    custom: 'Custom',
    allUsers: 'All Users',
    apply: 'Apply',
    exportCsv: 'Export CSV',
    exportPdf: 'Export PDF',

    // Table headers
    thCustomer: 'Customer',
    thDate: 'Date',
    thFrom: 'From',
    thTo: 'To',
    thMinutes: 'Minutes',
    thDescription: 'Description',
    thUser: 'User',
    thActions: 'Actions',
    thEntries: 'Entries',
    thHours: 'Hours',
    thUsername: 'Username',
    thRole: 'Role',
    thCreated: 'Created',

    // Actions
    delete: 'Delete',
    edit: 'Edit',
    resetPw: 'Reset PW',

    // Reports
    totalEntries: 'Total Entries',
    totalMinutes: 'Total Minutes',
    totalHours: 'Total Hours',

    // Modals
    saveEntry: 'Save Entry',
    addEntry: 'Add Entry',
    editEntry: 'Edit Entry',
    sections: 'Sections',
    total: 'Total',
    save: 'Save',
    discard: 'Discard',
    cancel: 'Cancel',
    addUser: 'Add User',
    editUser: 'Edit User',
    password: 'Password',

    // Confirm
    confirmDelete: 'Delete this entry?',
    confirmDeleteUser: 'Delete this user and all their entries?',
    customerRequired: 'Customer name is required',
    notifEnabled: 'Notifications enabled',
    notifDenied: 'Notification permission denied',
    entrySaved: 'Time entry saved',

    // Customer management
    addCustomer: 'Add Customer',
    editCustomer: 'Edit Customer',
    selectCustomer: 'Select customer',
    contactPerson: 'Contact Person',
    email: 'Email',
    phone: 'Phone',
    address: 'Address',
    city: 'City',
    zip: 'ZIP',
    country: 'Country',
    notes: 'Notes',
    customerSelectRequired: 'Please select a customer',
    confirmDeleteCustomer: 'Delete this customer?',
    customerInUse: 'Cannot delete: customer has entries',
    customerName: 'Name',

    // CSV headers
    csvCustomer: 'Customer',
    csvDate: 'Date',
    csvFrom: 'From',
    csvTo: 'To',
    csvMinutes: 'Minutes',
    csvDescription: 'Description',
    csvUser: 'User',

    // Account & password recovery
    account: 'Account',
    changeEmail: 'Change Email',
    changePassword: 'Change Password',
    currentPassword: 'Current Password',
    newPassword: 'New Password',
    confirmPassword: 'Confirm Password',
    currentEmail: 'Current Email',
    newEmail: 'New Email',
    forgotPassword: 'Forgot password?',
    sendResetLink: 'Send Reset Link',
    resetSent: 'If an account with that email exists, a reset link has been sent.',
    resetPassword: 'Reset Password',
    invalidToken: 'This reset link is invalid or has expired.',
    tokenExpired: 'This reset link has expired.',
    passwordChanged: 'Password changed successfully.',
    emailChanged: 'Email address updated.',
    ssoManaged: 'Your account is managed via SSO. Password and email changes are not available here.',
    passwordsDontMatch: 'Passwords do not match.',
    passwordTooShort: 'Password must be at least 10 characters.',
    passwordSameAsUsername: 'Password cannot be the same as your username.',
    emailInvalid: 'Please enter a valid email address.',
    emailTaken: 'This email address is already in use.',
    emailRequiredTitle: 'Email Required',
    emailRequiredBody: 'Please set your email address to enable account recovery.',

    theme: 'Theme',
    themeLight: 'Light',
    themeDark: 'Dark',
    themeTerminal: 'Terminal',
  },
  de: {
    loginUser: 'Benutzername',
    loginPass: 'Passwort',
    loginBtn: 'Anmelden',
    loginOidc: 'Mit SSO anmelden',

    logout: 'Abmelden',

    tabTracker: 'Tracker',
    tabEntries: 'Einträge',
    tabReports: 'Berichte',
    tabUsers: 'Benutzer',
    tabCustomers: 'Kunden',

    start: 'Start',
    pause: 'Pause',
    resume: 'Fortsetzen',
    stop: 'Stopp',
    customer: 'Kunde',
    customerPh: 'Kundenname',
    description: 'Beschreibung',
    descriptionPh: 'Woran arbeitest du?',
    miniTimer: 'Mini Timer',
    notifications: 'Desktop-Benachrichtigungen',

    allCustomers: 'Alle Kunden',
    allTime: 'Gesamter Zeitraum',
    today: 'Heute',
    thisWeek: 'Diese Woche',
    thisMonth: 'Dieser Monat',
    custom: 'Benutzerdefiniert',
    allUsers: 'Alle Benutzer',
    apply: 'Anwenden',
    exportCsv: 'CSV Export',
    exportPdf: 'PDF Export',

    thCustomer: 'Kunde',
    thDate: 'Datum',
    thFrom: 'Von',
    thTo: 'Bis',
    thMinutes: 'Minuten',
    thDescription: 'Beschreibung',
    thUser: 'Benutzer',
    thActions: 'Aktionen',
    thEntries: 'Einträge',
    thHours: 'Stunden',
    thUsername: 'Benutzername',
    thRole: 'Rolle',
    thCreated: 'Erstellt',

    delete: 'Löschen',
    edit: 'Bearbeiten',
    resetPw: 'PW zurücksetzen',

    totalEntries: 'Gesamteinträge',
    totalMinutes: 'Gesamtminuten',
    totalHours: 'Gesamtstunden',

    saveEntry: 'Eintrag speichern',
    addEntry: 'Eintrag hinzufügen',
    editEntry: 'Eintrag bearbeiten',
    sections: 'Abschnitte',
    total: 'Gesamt',
    save: 'Speichern',
    discard: 'Verwerfen',
    cancel: 'Abbrechen',
    addUser: 'Benutzer hinzufügen',
    editUser: 'Benutzer bearbeiten',
    password: 'Passwort',

    confirmDelete: 'Diesen Eintrag löschen?',
    confirmDeleteUser: 'Diesen Benutzer und alle Einträge löschen?',
    customerRequired: 'Kundenname ist erforderlich',
    notifEnabled: 'Benachrichtigungen aktiviert',
    notifDenied: 'Benachrichtigungsberechtigung verweigert',
    entrySaved: 'Zeiteintrag gespeichert',

    addCustomer: 'Kunde hinzufügen',
    editCustomer: 'Kunde bearbeiten',
    selectCustomer: 'Kunde auswählen',
    contactPerson: 'Ansprechpartner',
    email: 'E-Mail',
    phone: 'Telefon',
    address: 'Adresse',
    city: 'Stadt',
    zip: 'PLZ',
    country: 'Land',
    notes: 'Notizen',
    customerSelectRequired: 'Bitte wählen Sie einen Kunden',
    confirmDeleteCustomer: 'Diesen Kunden löschen?',
    customerInUse: 'Löschen nicht möglich: Kunde hat Einträge',
    customerName: 'Name',

    csvCustomer: 'Kunde',
    csvDate: 'Datum',
    csvFrom: 'Von',
    csvTo: 'Bis',
    csvMinutes: 'Minuten',
    csvDescription: 'Beschreibung',
    csvUser: 'Benutzer',

    // Account & password recovery
    account: 'Konto',
    changeEmail: 'E-Mail ändern',
    changePassword: 'Passwort ändern',
    currentPassword: 'Aktuelles Passwort',
    newPassword: 'Neues Passwort',
    confirmPassword: 'Passwort bestätigen',
    currentEmail: 'Aktuelle E-Mail',
    newEmail: 'Neue E-Mail',
    forgotPassword: 'Passwort vergessen?',
    sendResetLink: 'Link zum Zurücksetzen senden',
    resetSent: 'Falls ein Konto mit dieser E-Mail existiert, wurde ein Link gesendet.',
    resetPassword: 'Passwort zurücksetzen',
    invalidToken: 'Dieser Link ist ungültig oder abgelaufen.',
    tokenExpired: 'Dieser Link ist abgelaufen.',
    passwordChanged: 'Passwort erfolgreich geändert.',
    emailChanged: 'E-Mail-Adresse aktualisiert.',
    ssoManaged: 'Dein Konto wird über SSO verwaltet. Passwort- und E-Mail-Änderungen sind hier nicht möglich.',
    passwordsDontMatch: 'Die Passwörter stimmen nicht überein.',
    passwordTooShort: 'Das Passwort muss mindestens 10 Zeichen lang sein.',
    passwordSameAsUsername: 'Das Passwort darf nicht mit dem Benutzernamen übereinstimmen.',
    emailInvalid: 'Bitte gib eine gültige E-Mail-Adresse ein.',
    emailTaken: 'Diese E-Mail-Adresse wird bereits verwendet.',
    emailRequiredTitle: 'E-Mail erforderlich',
    emailRequiredBody: 'Bitte hinterlege deine E-Mail-Adresse für die Kontowiederherstellung.',

    theme: 'Design',
    themeLight: 'Hell',
    themeDark: 'Dunkel',
    themeTerminal: 'Terminal',
  }
};

let currentLang = localStorage.getItem('tt_lang') || 'en';

function t(key) {
  return (translations[currentLang] && translations[currentLang][key]) || translations.en[key] || key;
}

function setLang(lang) {
  currentLang = lang;
  localStorage.setItem('tt_lang', lang);
  applyTranslations();
  document.querySelectorAll('[data-lang-btn]').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-lang-btn') === lang);
  });
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => {
    el.placeholder = t(el.getAttribute('data-i18n-ph'));
  });
}
