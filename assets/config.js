window.ABET_CONFIG = {
  firebase: {
    apiKey: "AIzaSyCwAIPfdT0QBVUMzwcJa6I9xSbu1A3tnjg",
    authDomain: "osuit-etde-abet-hub.firebaseapp.com",
    projectId: "osuit-etde-abet-hub",
    storageBucket: "osuit-etde-abet-hub.firebasestorage.app",
    messagingSenderId: "139370646600",
    appId: "1:139370646600:web:183b3e4cd82f5cecff5c7d"
  },
  workspaceId: "etde-main",
  // Used only until the approved-users list (Firestore "hubUsers") is set up. After that, roles come from hubUsers.
  adminEmails: ["michael.williams14@okstate.edu"],
  // Sign in with Microsoft (OSU Microsoft 365). tenant = OSU's Directory (tenant) ID or domain, e.g. "okstate.edu".
  // Leave tenant "" to allow any Microsoft account (not recommended). Set enabled:false to hide the button.
  microsoft: { enabled: true, tenant: "okstate.edu", loginHint: "" }
};
