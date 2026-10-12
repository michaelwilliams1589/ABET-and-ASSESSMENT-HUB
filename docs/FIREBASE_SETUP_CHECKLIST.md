# Firebase setup checklist (Michael, do these in order)

These steps happen in the Firebase console (console.firebase.google.com → project **osuit-etde-abet-hub**) or need OSU IT. The website code alone can't do them. Steps 1–5 are safe in any order. Steps 6–8 must happen in the order shown.

**1. Publish the v5.3 site code** (merge `firebase-hardening` into `main`). It works with the old rules and the new ones, and with the old storage and the new.

**2. Turn off self sign-up.** Authentication → Settings → User actions → **uncheck "Enable create (sign-up)"**. Leave "Enable delete" unchecked.
   Keep **Email enumeration protection ON**: it hides whether an email has an account, and the Hub's "Forgot password" message is written for it.

**3. Add yourself as the first admin.** Firestore → Start collection `hubUsers` → Document ID `michael.williams14@okstate.edu` (all lowercase) → fields: `role` (string) `admin`, `active` (boolean) `true`, `name` (string) `Michael Williams`.
   After the rules are deployed, add everyone else from **Administration → Approved Users** in the Hub.

**4. Verify every password account.** The new rules only accept password accounts whose email is verified. For each faculty member, yourself included: Authentication → Users → ⋮ → *Reset password*, or have them click **Forgot password?** on the sign-in page. Setting a password from that email marks the address as verified. Anyone who uses "Sign in with Microsoft" can skip this.

**5. Microsoft sign-in.** You'll likely need OSU IT for this.
   a. In Azure (Entra ID), create an app registration: single tenant (OSU). Redirect URI (Web): `https://osuit-etde-abet-hub.firebaseapp.com/__/auth/handler`. Create a client secret and note the **Application (client) ID**, the **secret value**, and the **Directory (tenant) ID**. IT may need to grant admin consent for `openid`, `email`, `profile`, `User.Read`.
   b. Firebase → Authentication → Sign-in method → Add provider → **Microsoft** → paste the client ID and secret → Save.
   c. Authentication → Settings → **Authorized domains** → add `michaelwilliams1589.github.io`.
   d. In `assets/config.js`, set `microsoft.tenant` to OSU's Directory (tenant) ID if `okstate.edu` doesn't work.
   e. If someone already has a password account with the same email, Firebase may ask them to sign in with the password first. That's normal.

**6. Deploy the security rules.** Firestore → Rules → paste the whole of `FIRESTORE_RULES.txt` → **Publish**. Or, from the repo folder: `firebase deploy --only firestore:rules`. Before this, make sure step 3 is done and that you can sign in with a verified account (step 4) or Microsoft (step 5).
   Then check: sign in as yourself and open the Dashboard. Ask one instructor to sign in too. Someone who isn't on the list should see "not on the approved list".

**7. Back up.** In the Hub, open System Health → **Download Workspace Backup** and save the file in OneDrive.

**8. Run the storage upgrade.** System Health → **Storage Upgrade → Back Up and Migrate**. Do it at a quiet time and ask faculty not to save for a few minutes.
   The upgrade downloads a second backup automatically, copies every record, checks the counts, and only then switches the Hub over. The old record stays as a read-only copy. If the check fails, nothing is switched and the Hub keeps working as before.
   Afterwards, open **ABET Assignment Mapping** once as admin and click save. This stores the official mappings in the new layout, so instructors never see the "only an administrator can change" notice.

**Undo, if ever needed:** delete the document `abetHubs/etde-main/meta/_structure` in the console. The Hub goes back to reading the old record (frozen at migration time). You can restore anything newer from your backups.
