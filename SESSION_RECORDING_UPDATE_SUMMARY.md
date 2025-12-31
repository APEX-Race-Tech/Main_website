# Session Recording Policy Updates - Summary

## ✅ Documents Updated

All legal documents have been updated to support **OPTIONAL session recording (opt-in only, disabled by default)** with **14-day retention**.

---

## 📄 Files Modified

1. **RACE_Insight_Privacy_Policy_Final.md**
2. **RACE_Insight_EULA_Final.md**
3. **EULA.txt**

---

## 🔄 Key Changes Made

### 1. Privacy Policy Updates

#### Section 1 (Introduction)
- ✅ Updated to state: "Session recording is OPTIONAL and requires explicit opt-in (disabled by default)"

#### Section G (Manual Event Tracking)
- ✅ Changed from "We do not use session recording" to "Session recording is OPTIONAL and requires explicit opt-in"
- ✅ Updated PostHog configuration description

#### NEW Section H (Session Recording)
- ✅ Added comprehensive section covering:
  - Opt-in requirement (disabled by default)
  - What is recorded (screen interactions, mouse movements, navigation patterns)
  - What is NOT recorded (telemetry data, passwords, personal info, file contents)
  - 14-day retention period
  - Opt-out mechanism
  - Data location and encryption
  - Sensitive data masking

#### Section D (Feature Usage Events)
- ✅ Added new event types:
  - `app_opened` / `session_started`
  - `feature_viewed` (with feature_name)
  - `user_action_completed` (with action_type)
  - Clarified `feature_used` duration (execution time, not UI interaction time)

#### NEW Section D.1 (Value and Conversion Signals)
- ✅ Added events: `first_value_achieved`, `milestone_reached`, `goal_completed`, `success_event`
- ✅ Added conversion events: `pricing_viewed`, `upgrade_clicked`, `limit_reached`, `paywall_shown`, `payment_initiated`

#### NEW Section D.2 (Collaboration Signals)
- ✅ Added events: `invite_sent`, `team_member_added`, `content_shared`, `collaboration_action`

#### NEW Section D.3 (Risk and Error Signals)
- ✅ Added events: `error_encountered`, `session_abandoned`, `feature_failed`, `frustration_detected`

#### Section 2.3 (Summary)
- ✅ Updated: "Session recordings (OPTIONAL, opt-in only, disabled by default)"

#### Section 5.1 (PostHog Configuration)
- ✅ Updated to reflect optional session recording
- ✅ Added 14-day retention for session recordings
- ✅ Updated data shared description

#### Section 7.4 (Right to Withdraw Consent)
- ✅ Added session recording opt-out instructions

#### Section 9.1 (Security Measures)
- ✅ Added session recording security details
- ✅ Added sensitive data masking information

#### Section 9.2 (What We Do Not Have)
- ✅ Updated to reflect optional session recording

#### Version
- ✅ Updated to Version 2.1
- ✅ Updated Last Updated date to January 2026

---

### 2. EULA Updates

#### Section 5.1 (Automatic Event Tracking)
- ✅ Updated to mention session recording is optional

#### Section 5.2 (Opting Out)
- ✅ Renamed to "Opting Out of Analytics and Session Recording"
- ✅ Added session recording opt-out instructions
- ✅ Added 14-day retention information

#### Section 5.3 (PostHog Configuration)
- ✅ Updated to reflect optional session recording
- ✅ Added 14-day retention period
- ✅ Added reference to Privacy Policy Section H

#### Version
- ✅ Updated to Version 2.1
- ✅ Updated Last Updated date to January 2026

---

### 3. EULA.txt Updates

#### Section 5.1
- ✅ Updated to mention session recording is optional

#### Section 5.2
- ✅ Updated opt-out section with session recording instructions

#### Section 5.3
- ✅ Updated PostHog configuration details

---

## ✅ Compliance Features

### Session Recording
- ✅ **Opt-in only** (disabled by default)
- ✅ **14-day retention** (automatically deleted)
- ✅ **Sensitive data masking** (passwords, personal info, file contents)
- ✅ **Encrypted** (in transit and at rest)
- ✅ **Opt-out anytime** (immediate effect)
- ✅ **Clear disclosure** of what is recorded

### Event Tracking
- ✅ All new event types documented
- ✅ Duration tracking clarified (execution time, not UI time)
- ✅ Privacy-first approach maintained
- ✅ Manual tracking only (no autocapture)

---

## 📋 Implementation Checklist

Before enabling session recording in PostHog:

- [ ] Update PostHog configuration to support opt-in session recording
- [ ] Implement Settings UI for session recording toggle
- [ ] Add consent dialog for first-time opt-in
- [ ] Configure PostHog to mask sensitive fields
- [ ] Set retention period to 14 days in PostHog
- [ ] Test opt-in/opt-out functionality
- [ ] Verify recordings are encrypted
- [ ] Update in-app privacy notices
- [ ] Deploy updated legal documents to website

---

## 🎯 Next Steps

1. **Review** the updated documents
2. **Implement** the opt-in mechanism in the application
3. **Configure** PostHog with the new settings
4. **Test** the session recording functionality
5. **Deploy** the updated legal documents to the website

---

## 📝 Notes

- All changes maintain the privacy-first approach
- Session recording is completely optional
- Users have full control (opt-in/opt-out)
- Retention is limited to 14 days
- Sensitive data is automatically masked
- All new event types are now documented and compliant
