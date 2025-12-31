# PRIVACY POLICY

RACE Insight – Data Protection & Privacy Notice

Effective Date: December 26, 2025
Last Updated: January 2026


---

## 1. INTRODUCTION AND WHO WE ARE

Data Controller: APEX Race Technologies
Location: Chennai, Tamil Nadu, India
Contact Email: info.apexracetech@gmail.com
Website: https://www.apexracetech.com

This Privacy Policy explains how we collect, use, and protect your personal data and information when you use:

- The RACE Insight desktop application (Windows, macOS, Linux)
- The RACE Insight mobile applications (iOS, Android) - when released
- The RACE Insight website (https://www.apexracetech.com)

We are committed to transparency about data. RACE Insight is designed with privacy-first principles:

- Your telemetry data stays completely local on your device
- We do not upload your project files to our servers
- We use manual event tracking only (no automatic autocapture)
- Session recording is OPTIONAL and requires explicit opt-in (disabled by default)
- You can disable analytics and session recording completely

---

## 2. DATA WE COLLECT (LOCAL-ONLY BETA)

### 2.1 Desktop Application - What We Collect

RACE Insight is designed for local-only use. Most data remains on your device.

### 2.1.1 Data That Stays Local (NOT Sent to Us)

- Your telemetry project files (all imported race data, lap times, sensor readings, GPS data)
- Your saved analyses and reports
- Your exported data (CSV, JSON, PDF files you export)
- Application cache and temporary files
- Session configurations (stored locally in localStorage)

We do not automatically copy, sync, backup, or send this data to our servers or cloud storage.

### 2.1.2 Data We Collect (Sent From the App)

To improve the Software, we collect anonymous usage events via PostHog.

---

### A. AUTHENTICATION EVENTS

If you sign in with Google, when you sign in or out, we track:

- user_signed_in - Recorded when you successfully log in with Google (includes: Firebase UID, email, display name)
- user_signed_out - Recorded when you log out
- sign_in_attempted - When you attempt to sign in (with method: "firebase")
- sign_in_succeeded - When sign-in succeeds
- sign_in_failed - When sign-in fails (with error message)
- sign_out_attempted - When you attempt to log out
- sign_out_succeeded - When logout succeeds
- sign_out_failed - When logout fails (with error message)

What we do not collect: Your Google password (never sent to us), your password (only Google handles authentication), your profile picture or other Google profile data, your Google calendar, contacts, or email (we do not access these).

Storage: Firebase UID, email, and display name are stored by Google/Firebase and associated with PostHog analytics.

Why: To ensure authentication works correctly and troubleshoot sign-in issues.


---

### B. APPLICATION LIFECYCLE EVENTS

We track when you use the application:

- app_launched (also tracked as app_opened) - Recorded each time you open RACE Insight (includes: app version, provider name)
- session_started - Recorded when a new user session begins

What we do not collect: Your project data, file contents, or personal information.

Why: To understand app adoption, version distribution, and usage patterns.

---

### C. FILE IMPORT EVENTS

When you import telemetry data files into RACE Insight, we track:

- file_imported - Recorded when you successfully import a file
- file_type - The file extension (e.g., ".ibt", ".xrk", ".csv", ".log", ".vbo")
- file_size - The file size in bytes and megabytes (MB)

Supported File Formats:

- iRacing (.ibt)
- AiM Racing (.xrk, .drk)
- MoTeC (.ld)
- Generic CSV (.csv)
- Autosport Labs (.log)
- RaceLogic VBOX (.vbo)
- Under development: ECUMaster (.adulog), Race Technology (.run), MegaLogViewer (.mlg)

Maximum file size: 250MB backend limit. Files up to 1GB may trigger a performance warning but will still be processed.

What we do not collect: The actual file contents or data inside the file, file names or metadata beyond type and size, your telemetry readings (lap times, speeds, G-forces, sensor data), circuit information or driver data from the file, or any personal information in the file.

Why: To understand which file formats users work with and to prioritize format support.

---

### D. FEATURE USAGE EVENTS

When you use features in the application, we track:

- feature_used - Recorded when you use a feature (with feature name and custom properties)
  - May include: feature execution duration (time taken to process/complete the feature), not UI interaction time
  - Does NOT include: time spent viewing or interacting with UI elements
- screen_viewed - When you navigate to a different screen or section (with screen name)
- user_action_completed - When you complete a specific action (with action_type)
- feature_viewed - When you view a feature or section (with feature_name)

Features tracked: Visualization features (charts, graphs, map view), analysis features (lap comparison, sector analysis, delta calculations), export features (CSV, JSON, PDF export), and settings and preferences changes.

What we do not collect: Your actual analysis results or calculations, the data displayed on your screen, file names or project names, your telemetry data values or insights you generated, screenshots or screen content, or time spent viewing specific UI elements.

Why: To understand which features are popular, which need improvement, and to measure feature performance.

How long we keep it: Feature usage events are retained for 30 days, then deleted or aggregated into anonymous patterns.

Opt-out: You can disable feature tracking in the app: Settings > Analytics & Privacy > Disable Analytics & Telemetry

---

### D.1 VALUE AND CONVERSION SIGNALS

We track value indicators and conversion events to understand user success:

- first_value_achieved - When you first achieve value from using a feature
- milestone_reached - When you reach a milestone (with milestone_name)
- goal_completed - When you complete a goal (with goal_type)
- success_event - When a success event occurs (with success_type)
- pricing_viewed - When you view pricing information
- upgrade_clicked - When you click to upgrade
- limit_reached - When you hit a usage limit (with limit_type)
- paywall_shown - When a paywall is displayed (with blocked_feature)
- payment_initiated - When you initiate a payment

What we do not collect: Payment details, credit card information, or financial data (handled by payment processor).

Why: To understand user success, identify conversion opportunities, and improve product-market fit.

Retention: 30 days, then deleted or aggregated.

---

### D.2 COLLABORATION SIGNALS

We track collaboration features (if enabled):

- invite_sent - When you send an invitation
- team_member_added - When a team member is added
- content_shared - When you share content
- collaboration_action - When you perform a collaboration action (with action_type)

What we do not collect: The actual content shared, file contents, or personal information of collaborators beyond what is necessary for the collaboration feature.

Why: To understand collaboration usage and improve team features.

Retention: 30 days, then deleted or aggregated.

---

### D.3 RISK AND ERROR SIGNALS

We track risk indicators and errors:

- error_encountered - When an error occurs (see Section F for details)
- session_abandoned - When a session is abandoned
- feature_failed - When a feature fails to execute
- frustration_detected - When frustration indicators are detected (from session replay if enabled, or from error patterns)

What we do not collect: Your actual data or file contents, personal information, or sensitive details beyond what is necessary to diagnose the issue.

Why: To identify and fix issues, improve reliability, and enhance user experience.

Retention: Error events retained for 30 days. Frustration detection data retained for 14 days (if from session replay).

---

### E. USER SETTINGS AND PREFERENCES

We collect data about how you configure the application:

- UI preferences - Theme, layout, window size, sidebar preferences (light/dark mode, panel arrangement)
- Display settings - Font size, color schemes, zoom levels
- Feature toggles - Which optional features you enable or disable
- Analysis preferences - Your preferred chart types, default units, default views
- Workspace configuration - Dashboard layouts, widget arrangements, custom filters

What we do not collect: Your actual project data or analysis results, file contents or file names, your real name or email (unless you signed in with Google), or data about which files you opened.

Why: To understand user preferences and optimize default settings for better UX.

---

### F. ERROR AND CRASH EVENTS

When the application crashes or encounters an error, we automatically collect:

- error_occurred - Recorded when an error happens
- error_message - Human-readable description of what went wrong
- error_name - Technical error type
- error_stack - First 500 characters of the stack trace (for debugging)
- Timestamp - When the error occurred
- App version - Which version you were using
- Operating system - Windows 10/11, macOS version, Linux distribution
- Device type - Desktop, laptop

What we do not collect: Your project files or data, file contents, your name, email, or identity (unless you explicitly provided it in a support email), keystroke logs or screen content, or passwords or sensitive data.

Why: To identify and fix bugs, improve stability, and prioritize crash fixes.

---

### G. MANUAL EVENT TRACKING (Privacy-First Design)

We use manual event tracking for most analytics. This means:

- We explicitly code which events to track
- We do not use automatic click/button tracking (autocapture disabled)
- We do not record all interactions automatically
- We do not track keyboard input (except for error messages)
- We do not track how long you spend on specific UI elements (we may track feature execution duration, not UI interaction time)

PostHog Configuration: autocapture disabled, tracking mode is manual events only. Session recording is OPTIONAL and requires explicit opt-in (see Section H below).

Why: To minimize data collection and respect your privacy.

---

### H. SESSION RECORDING (OPTIONAL - OPT-IN ONLY)

Session recording is DISABLED by default. You must explicitly opt-in to enable it.

**If you choose to enable session recording** (Settings > Analytics & Privacy > Enable Session Recording), we may record:

- Screen interactions within the RACE Insight application window
- Mouse movements, clicks, and scrolls
- Navigation patterns and UI interactions
- Error states and application behavior
- Session flow and feature usage patterns
- Visual representation of your interactions (not actual data content)

**What we do NOT record:**

- Your telemetry data files or file contents
- Passwords or authentication credentials
- Personal information displayed on screen (we mask sensitive fields)
- Data outside the RACE Insight application window
- Keyboard input (except for error messages and non-sensitive form fields)
- Your actual analysis results or calculations displayed on screen
- File names or project names (these are masked in recordings)

**Purpose:** To improve user experience, identify usability issues, troubleshoot errors, and provide better support.

**Retention:** Session recordings are retained for 14 days, then automatically deleted.

**Opt-out:** You can disable session recording at any time in Settings > Analytics & Privacy > Disable Session Recording. Disabling will stop new recordings immediately.

**Default:** Session recording is DISABLED by default. You must explicitly opt-in.

**Data Location:** Session recordings are stored by PostHog (EU or US, depending on PostHog's configuration).

**Privacy:** Recordings are encrypted in transit and at rest. Only authorized APEX Race Technologies staff can access recordings for support and improvement purposes.

---

### H. ANONYMOUS USER IDENTIFICATION

For all events, we generate an anonymous User ID (UUID-style identifier) that:

- Is stored locally on your device (in localStorage)
- Is not tied to your personal identity unless you sign in with Google
- If you sign in, it is linked to your Firebase UID and email
- Can be reset by clearing your browser data or disabling analytics
- Does not track your real name or email unless you explicitly sign in

How it works:

1. When you open the app, a unique UUID is generated locally
2. This UUID is stored in your browser's localStorage
3. All events are tagged with this UUID
4. We can group events from the same user without knowing who you are

Changing your User ID: Clearing browser data/localStorage will generate a new UUID. Disabling analytics stops event collection entirely. Signing out removes the association with your Google account.

Why: To group events from the same user session for analysis, without identifying you personally.

---

### I. IN-APP FEEDBACK AND SUPPORT

If you click "Send Feedback" in the app, report a bug via in-app form, or contact support at info.apexracetech@gmail.com, we collect:

- Your message (feedback, bug report, or question)
- Your email address (if you provide it for a response)
- App version and operating system (for context)
- Any attachments (e.g., screenshots, crash dumps)

What we do not collect: Sensitive personal information you do not voluntarily provide, or your project files (only if you attach them).

Why: To respond to your inquiry and improve the Software.

How long we keep it: Support emails are kept for 12 months for record-keeping, then deleted or anonymized.

Your Control: You can choose not to contact us or provide personal information. Support is optional.

---

### 2.2 Website Analytics

On https://www.apexracetech.com, we collect via Google Analytics:

- Page views - Which pages you visit
- Time on page - How long you spend on each page
- Device type - Mobile, tablet, or desktop
- Geographic region - Country and city level (approximate, not exact address)
- Referral source - Where you came from (e.g., Google search, Reddit, Twitter)
- IP address - Anonymized after collection

What we do not collect: Your name or email, search queries you type into Google, passwords or sensitive information, or which links you click (not tracked).

Why: To improve the website experience and understand visitor behavior.

How long we keep it: 26 months (Google Analytics default).

Opt-out: You can disable cookies in your browser settings or install the Google Analytics Opt-out Browser Add-on at https://tools.google.com/dlpage/gaoptout

---

### 2.3 Summary: What We Do Not Collect (Privacy-First Design)

- Your telemetry data files (lap times, speeds, sensor readings)
- Cloud backup of your project files
- Remote sync across devices (currently)
- AI processing of your data
- Session recordings (OPTIONAL, opt-in only, disabled by default)
- Automatic click tracking (autocapture disabled)
- Keystroke logs (except for error messages)
- Location tracking or GPS data (only your imported telemetry data)
- Behavioral profiling or behavioral advertising
- Your real name or email (unless you voluntarily sign in with Google)
- File contents from your telemetry files
- Financial or payment information (beta is free)

---

## 3. HOW WE USE YOUR DATA

### 3.1 Purposes of Data Collection

We use the data we collect for:

1. Authentication and account management - Ensuring your sign-in works correctly and securely
2. Feature improvement - Understanding which features are popular and which need work
3. Bug fixes and stability - Identifying and fixing crashes
4. File format support - Understanding which telemetry formats to prioritize
5. Service optimization - Improving UI/UX based on user preferences
6. Support and communication - Responding to your feedback or issues
7. Compliance and legal - Retaining data required by law

### 3.2 What We Do Not Do

- Sell or rent your data to third parties
- Use data for marketing targeting (no behavioral advertising)
- Share with competitors or other race teams
- Use for purposes beyond those listed above
- Train AI models on your personal data (without explicit future consent)
- Automatically record sessions or interactions
- Create behavioral profiles of you
- Share with advertisers or marketing companies

---

## 4. LEGAL BASIS FOR DATA PROCESSING

### 4.1 India's Digital Personal Data Protection Act (DPDP), 2023

Under DPDP, we process your data for:

- Legitimate purpose (to provide the service and improve it)
- Consent (for optional features like analytics; you can opt-out anytime)

### 4.2 GDPR (If You Are in the EU)

If you are in the European Union:

- Legitimate interest (to improve the service, fix bugs, understand user behavior)
- Consent (for analytics; you can opt-out)
- Legal obligation (if required by law)

You have GDPR rights including access, correction, deletion, and data portability.

---

## 5. THIRD-PARTY SERVICES AND DATA SHARING

The Software uses the following third-party services.

### 5.1 PostHog (Analytics and Event Tracking)

- Service: Collects manual events (authentication, features, errors, file imports, settings) and optional session recordings (if you opt-in)
- Data shared: Anonymous user ID, event names and timestamps, error stack traces (first 500 characters), app version and operating system, file metadata (type and size only, NOT contents), email and display name (only if signed in), session recordings (only if you opt-in)
- Configuration: Session recording OPTIONAL (opt-in only, disabled by default), autocapture disabled, manual event tracking only
- Privacy Policy: https://posthog.com/privacy
- Data location: EU or US (depending on PostHog's configuration)
- Data retention: Event data: 30 days by default. Session recordings: 14 days (if enabled)
- Contact: support@posthog.com

Data Processing Agreement: PostHog provides a DPA for GDPR compliance.

---

### 5.2 Google (Firebase Authentication and Website Analytics)

Google Firebase (Authentication):
- Service: Handles Google Sign-In authentication
- Data shared: Firebase UID, email, display name (only if you sign in)
- How it works: When you click "Sign in with Google," Firebase securely connects you to Google's authentication service
- Privacy Policy: https://policies.google.com/privacy
- Data location: Google's servers (primarily US)

Google Analytics (Website Only):
- Service: Collects website visitor statistics
- Data shared: Page views, device type, geographic region, referral source, anonymized IP
- Privacy Policy: https://policies.google.com/privacy
- Data location: United States (Google's servers)
- Opt-out: https://tools.google.com/dlpage/gaoptout

---

### 5.3 Mapbox  (Map Tiles)

- Service: Provides map tiles for circuit visualization in RACE Insight
- Data shared: Your location (approximately, to load map tiles)
- Requires: Internet connection
- Privacy Policy: https://www.mapbox.com/legal/privacy




---

### 6.2 Your Right to Request Deletion

You can request deletion of personal data we hold about you (support emails, authentication records) by contacting:

Email: info.apexracetech@gmail.com
Subject: "Data Deletion Request"

Please include your email address (or the one associated with your Google sign-in), approximate date of your last interaction, and what data you want deleted.

Response time: We will respond within 30 days and delete your data within a reasonable timeframe (usually within 30-60 days).


---

## 7. YOUR DATA RIGHTS (DPDP and GDPR)

### 7.1 Right to Access

You have the right to request access to personal data we hold about you.

How to request: Email info.apexracetech@gmail.com with subject "Data Access Request"

What we provide: A copy of your data (support emails, authentication records, analytics summaries) within 30 days.

---

### 7.2 Right to Correction

If your personal data is inaccurate or incomplete, you can request correction.

How to request: Email info.apexracetech@gmail.com with subject "Data Correction Request" and include details of the inaccuracy.

---

### 7.3 Right to Erasure

You can request deletion of your personal data in most cases.

How to request: Email info.apexracetech@gmail.com with subject "Data Deletion Request"

Exceptions: We may retain data if required by law (e.g., tax records, legal disputes).

---

### 7.4 Right to Withdraw Consent

If we rely on your consent for analytics, feature tracking, or session recording:

- You can withdraw consent at any time
- Disable analytics in Settings > Analytics & Privacy > Disable Analytics & Telemetry
- Disable session recording in Settings > Analytics & Privacy > Disable Session Recording
- This will stop all PostHog event tracking and session recording (except Firebase authentication, which is essential for sign-in)
- Stop sending feedback emails or bug reports

Important: Disabling analytics or session recording stops new data collection but does not retroactively delete previously collected data. Session recordings are automatically deleted after 14 days.

---

### 7.5 Right to Data Portability (GDPR Only)

If you are in the EU and we process data based on consent or contract, you can request a copy in machine-readable format.

How to request: Email info.apexracetech@gmail.com with subject "Data Portability Request"

What we provide: A CSV or JSON file with your data within 30 days (if applicable).

---

### 7.6 Right to Restrict Processing

You can request that we restrict how we use your data (e.g., stop sending analytics but keep for legal purposes).

How to request: Email info.apexracetech@gmail.com with subject "Data Processing Restriction Request"

---

## 8. CHILDREN AND MINORS

RACE Insight is designed for motorsports professionals and enthusiasts, typically 18 and older.

- We do not knowingly collect data from children under 13
- If you are under 18, please obtain parental consent before using the Software
- If we discover we have collected data from a child under 13, we will delete it immediately

Contact: info.apexracetech@gmail.com if you have concerns about a child's data.

---

## 9. SECURITY AND DATA PROTECTION

### 9.1 Our Security Measures

We take reasonable steps to protect your data:

- Encryption in transit: Data sent from the app to PostHog uses HTTPS (encrypted)
- Encryption at rest: PostHog stores data encrypted on their servers
- Restricted access: Support emails are stored in a password-protected account. Session recordings (if enabled) are accessible only to authorized APEX Race Technologies staff
- Automatic deletion: Event logs are automatically deleted after 30 days. Session recordings are automatically deleted after 14 days
- Local storage only: Anonymous user IDs are stored locally on your device, not on our servers
- Session recording: OPTIONAL, opt-in only, disabled by default. If enabled, recordings are encrypted and retained for 14 days only
- No backup of local data: We do not back up your project files without your explicit consent
- Temporary file cleanup: Backend deletes temporary parsing files after processing
- Sensitive data masking: Session recordings automatically mask passwords, personal information, and file contents

---

### 9.2 What We Do Not Have

- Your project files (stored completely locally)
- Your telemetry data (never uploaded)
- Session recordings (OPTIONAL, opt-in only, disabled by default)
- Keystroke logs (disabled, except for error messages)
- Screen recordings (OPTIONAL, opt-in only, disabled by default)

---

### 9.3 Limitations and Risks

- No guarantee of absolute security: No system is 100% secure
- Your responsibility: Back up important data locally. Do not rely on cloud sync until officially provided
- Third-party risks: PostHog and Google may be subject to breaches
- Browser storage risk: Your anonymous user ID is stored in localStorage; clearing your browser cache will remove it
- Local data at risk: If your device is compromised, local files may be at risk (encrypt your device for additional protection)

---

### 9.4 Data Breach Notification

If we discover a breach of your personal data, we will:

- Notify you within 30 days via email (or earlier if required by law)
- Provide details: What happened, what data was affected, what steps you should take
- Report to authorities: If required by DPDP or GDPR

---

## 10. OFFLINE OPERATION AND DATA QUEUING

### 10.1 Offline Capability

RACE Insight works mostly offline:

- File import and analysis work offline (after initial sign-in)
- Telemetry visualization works offline
- First-time sign-in requires internet (Google authentication)
- Map tiles (Mapbox/OpenStreetMap) require internet
- PostHog events are queued locally if offline, sent when online

---

### 10.2 Event Queuing

When you are offline:

- Analytics events are stored in local storage (analytics_event_queue)
- Maximum queue size: 100 events
- Events are flushed (sent to PostHog) when you reconnect to the internet
- Events are timestamped with their original occurrence time

---

### 10.3 Local Data Caching

The app caches data locally for performance:

- Session configurations in localStorage
- Settings in localStorage
- Panel layouts and preferences in localStorage
- These survive offline operation and app restarts

---

## 11. FUTURE FEATURES AND UPDATES TO THIS POLICY

### 11.1 Current Scope (Local-Only Beta)

This Policy applies to the local-only, no cloud, no AI beta version with manual event tracking only.

### 11.2 Future Changes We May Make

When we introduce cloud synchronization, AI-powered features, subscription/account systems, team/collaborative features, or additional tracking, we will:

- Update this Privacy Policy with detailed sections on new data processing
- Notify you via email, in-app message, or website notice (at least 30 days in advance)
- Allow opt-out or modification: You can choose not to use new features, or continue with the existing version

### 11.3 How We Will Notify You

- Email to the address associated with your Google account (if signed in)
- In-app notification on next launch
- Website notice at https://www.apexracetech.com/privacy with an "Updated" date
- For major changes, we will provide 30 days' notice before implementation

---

## 12. INTERNATIONAL DATA TRANSFERS

### 12.1 Where Your Data Is Stored

Desktop/App Data (Local): Stored on your device, in India or wherever you are located. Not transferred internationally unless you explicitly use future cloud features. Under your complete control.

PostHog Analytics Event Data: Processed by PostHog (EU or US, depending on their configuration). May be transferred outside your country.

Google Firebase (If You Sign In): Processed by Google (US servers primarily). Email, display name, and authentication data stored by Google.

Website Analytics: Processed by Google Analytics (US servers).

### 12.2 India-to-EU/US Transfer (GDPR)

If you are in the EU and data is transferred from India to the US or EU:

- We rely on Standard Contractual Clauses (SCCs) with third parties (PostHog, Google)
- These clauses provide GDPR-equivalent protections during the transfer
- PostHog and Google have their own compliance certifications (Data Processing Agreements available)

### 12.3 Your Consent

By using RACE Insight, you consent to:

- Processing of your data in the locations described above
- International transfers as necessary to provide the service
- If analytics are disabled, only essential authentication data (if signed in) will be processed

---

## 13. CONTACT AND SUPPORT

For questions or requests regarding this Privacy Policy, contact:

Email: info.apexracetech@gmail.com
Address: Chennai, Tamil Nadu, India
Website: https://www.apexracetech.com/support

---

## 14. COMPLAINTS AND ESCALATION

### 14.1 Complaint Process

If you believe we are mishandling your data:

1. Contact us first at info.apexracetech@gmail.com with description of the issue, when it occurred, and what outcome you are seeking
2. We will respond within 30 days with investigation results and remedial action (if applicable)

### 14.2 Regulatory Complaints

If you are not satisfied with our response, you can file a complaint with:

India (DPDP Act): Data Protection Board of India (once operational) or the Ministry of Electronics and Information Technology (MeitY)

EU (GDPR): Your national data protection authority (DPA). See https://edpb.ec.europa.eu/about-edpb/board/members_en

UK (UK-GDPR): Information Commissioner's Office (ICO) at https://ico.org.uk

US (State Privacy Laws): Depending on your state's privacy law (CCPA, VCCPA, etc.), you may have additional rights.

---

## 15. COOKIES AND TRACKING TECHNOLOGIES

### 15.1 Cookies

Desktop App: The RACE Insight desktop application does not use cookies (Electron app, not web-based).

Website: The RACE Insight website (https://www.apexracetech.com) uses Google Analytics (analytics cookies) and essential cookies (session, security).

You can disable cookies in your browser settings or use the Google Analytics opt-out browser add-on.

### 15.2 Local Storage

The desktop app uses localStorage for:

- Anonymous user ID (UUID)
- Session configurations
- Settings and preferences
- Analytics event queue (offline)

You can clear localStorage by going to Settings > Privacy > Clear Local Data or by clearing your browser data.

---

## 16. THIRD-PARTY LINKS AND SERVICES

RACE Insight may contain links to external websites or services (e.g., GitHub, documentation, tutorials).

- We are not responsible for third-party privacy practices
- Review their privacy policies before providing information
- This Privacy Policy applies only to RACE Insight, not to external sites

---

## 17. CHANGES TO THIS PRIVACY POLICY

APEX Race Technologies may update this Policy at any time. Changes will be posted at https://www.apexracetech.com/privacy

- Latest update: December 26, 2025
- Significant changes will be announced via email (if you signed in) or in-app notification
- Continued use of RACE Insight after changes are posted constitutes your acceptance of the updated policy

---

## 18. RELATED DOCUMENTS

End User License Agreement (EULA): https://www.apexracetech.com/eula
Terms of Service: https://www.apexracetech.com/terms
Third-Party Licenses: https://www.apexracetech.com/third-party-licenses
Help & Documentation: https://www.apexracetech.com/help


---

Copyright 2025 APEX Race Technologies. All rights reserved.

Last Updated: January 2026

Version: 2.1 (Beta - Updated for Session Recording Support)
