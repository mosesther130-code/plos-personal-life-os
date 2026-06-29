#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  Enhancement 6 — Identity & Security (PLOS Roadmap).
  - Replace the static "Monitoring" hero on the Breach Monitor screen with an editable
    "Monitored Accounts" list. Users can Add/Edit/Delete items (types: email, phone,
    username, ssn_last4). Sensitive identifiers (phone, ssn_last4) must be masked on
    return.
  - Dynamically render the "File a police report" step inside the Identity Theft Guide
    based on the user's home_county / home_state from user_profile.

backend:
  - task: "Monitored accounts CRUD (/api/security/monitored-accounts)"
    implemented: true
    working: "NA"
    file: "/app/backend/security_extras.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Implemented GET (auto-seeds primary email on first load, masks phone/ssn), POST (validates account_type), PUT, DELETE. Mounted via make_security_extras_router in server.py."
  - task: "Jurisdiction lookup (/api/security/jurisdiction & /identity-theft/police-step)"
    implemented: true
    working: "NA"
    file: "/app/backend/security_extras.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Module-level lookup_jurisdiction added. Returns directory entry (DeKalb, Fulton, Gwinnett, Cobb, Clayton, Henry GA) when matched, fallback otherwise."
  - task: "Identity Theft Guide police_report step dynamic rewrite"
    implemented: true
    working: "NA"
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: "/api/security/identity-theft-guide now merges jurisdiction data into the police_report step (title, description, links, jurisdiction object)."

frontend:
  - task: "Breach Monitor — Monitored Accounts CRUD UI"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/security/breach.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Hero card replaced with editable list. Add button opens EditModal. Tapping a row opens EditModal in edit mode with Delete confirmation. Wired to /api/security/monitored-accounts."

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 1
  run_ui: true

test_plan:
  current_focus:
    - "Monitored accounts CRUD (/api/security/monitored-accounts)"
    - "Jurisdiction lookup (/api/security/jurisdiction & /identity-theft/police-step)"
    - "Identity Theft Guide police_report step dynamic rewrite"
    - "Breach Monitor — Monitored Accounts CRUD UI"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
    - agent: "main"
      message: |
        Enhancement 6 implementation complete. Please verify:
        1. POST /api/security/monitored-accounts with each account_type (email, phone, username, ssn_last4)
        2. GET should mask phone/ssn_last4 (no raw identifier returned for those types)
        3. PUT/DELETE round-trip
        4. /api/security/identity-theft-guide should return a police_report step whose
           title/links reflect either the matched county (set test1's home_county="DeKalb"
           home_state="GA") or the fallback message when not set.
        5. Frontend: Breach Monitor page should show the Monitored Accounts card with
           an Add button. Verify the EditModal opens, saves, and edits items (use testID
           "add-monitored" and "monitored-{id}").
        Auth: test1@plos.app / test123

    - agent: "main"
      message: |
        Enhancement 12 — AI Document Summarizer implementation complete.
        FINAL enhancement in the 12-step roadmap.

        NEW backend (/app/backend/doc_summarizer.py — mounted in server.py):
        1. GET /api/doc-summarizer/focuses → 7 focus presets (general, financial,
           medical, legal, technical, academic, action_items) with full
           instruction text.
        2. POST /api/doc-summarizer/summarize (multipart):
           - file: PDF | image (jpg/png/heic) | DOCX | TXT
           - focus: one of the 7 preset values
           - save: "true"/"false" — whether to persist to history
           - Text extraction: pypdf for PDFs, python-docx for DOCX, raw read for
             TXT, Claude vision for images.
           - Returns {summary_id, tldr, summary, key_points[], action_items[],
             flags[], topics[], saved, ...}
           - Max 12 MB. Empty/invalid focus/unsupported MIME → 400.
           - AI failure → 503 with friendly detail.
        3. GET /api/doc-summarizer/history → list saved (no full text in list)
        4. GET /api/doc-summarizer/history/{id} → fetch one
        5. DELETE /api/doc-summarizer/history/{id} → remove

        Frontend (/app/frontend/app/tools/doc-summarizer.tsx — NEW screen):
        - Upload drop area (testID ds-pick) using expo-document-picker
        - 7 focus pills (testID ds-focus-{value}) with active state and
          live-updating instruction caption
        - Save toggle (testID ds-save-toggle)
        - Summarize button (testID ds-summarize) calls Claude
        - Result panel (testID ds-result) shows: tldr badge, summary text,
          topics chips, key points checklist, action items with priority
          color, flags with severity color
        - History list at bottom (testID prefix ds-hist-{id}; per-row open
          ds-hist-open-{id} and delete ds-hist-delete-{id})

        Discovery: Added a "AI Doc Summarizer" tile in the More tab
        (route /tools/doc-summarizer).

        docSummarizerApi added to /app/frontend/src/lib/api.ts with
        multipart upload via fetch + FormData.

        Please test BOTH backend (focuses, history CRUD, multipart upload of
        a small TXT and a small PDF, error paths) and frontend (pick file,
        choose focus, summarize, save toggle, history open + delete).
        Auth: test1@plos.app / test123. AI calls may be skipped if LLM key
        budget is exhausted (acceptable — verify backend returns 503 cleanly).

        NEW backend (/app/backend/account_mgmt.py — mounted in server.py):
        1. POST /api/auth/change-password {current_password, new_password}
           - verifies current via verify_password
           - enforces new_password >=8 chars, letters+numbers
           - rejects if new == current
           - writes audit_logs entries on success/failure
           - sets password_changed_at on user record
        2. POST /api/auth/delete-account {password, confirm_text}
           - confirm_text must equal "DELETE" (Pydantic validator → 422)
           - verifies password
           - cascade-deletes from EVERY user-scoped collection in the DB
             (dynamic list_collection_names sweep, except audit_logs)
           - returns {ok, collections_cleared, total_records}
           - writes audit_logs entry with email + cleared counts

        Frontend (/app/frontend/app/settings.tsx) fully rebuilt:
        - Profile card now shows location info and has an edit pencil
          (testID edit-profile-btn) → EditModal with full_name, dob, street,
          city, state, zip, county.
        - Account section: testID open-change-password opens a 3-field bottom
          sheet (pw-current, pw-new, pw-confirm, pw-submit) with client-side
          validation matching backend rules.
        - Danger Zone card with testID open-delete-account opens a 2-step
          modal:
            * Step 1: type "DELETE" (testID del-confirm-text, button del-next)
            * Step 2: enter password (testID del-password, button del-submit,
              back button del-back). On success, signs out + replaces to login.
        - Sign Out + Load Demo Data preserved.

        accountApi added to /app/frontend/src/lib/api.ts:
        me(), updateProfile(), changePassword(), deleteAccount().

        Please test both backend (positive + negative paths) and frontend
        (edit profile, change password, 2-step delete confirmation).
        Auth: test1@plos.app / test123.

        ⚠️ IMPORTANT: For the delete-account end-to-end test, register a
        TEMPORARY user (e.g., temp_e11@plos.app) instead of test1, so the
        main account stays intact for subsequent enhancements. After
        deletion verify that login fails.

        Existing Health module already had CRUD for Insurance / Medications /
        Appointments. The missing piece was Medical Documents — now added.

        NEW backend (/app/backend/medical_docs.py — mounted in server.py):
        1. GET /api/health/medical-docs/types → 10 doc types (lab_result, imaging,
           prescription, etc.)
        2. GET /api/health/medical-docs[?doc_type=...] → list user docs (no raw
           content_b64 in list view)
        3. GET /api/health/medical-docs/{id} → metadata
        4. GET /api/health/medical-docs/{id}/download → returns
           {filename, mime_type, content_base64, size_bytes}
        5. POST /api/health/medical-docs/upload → multipart upload with form
           fields title, doc_type, doc_date, provider, notes
        6. PUT /api/health/medical-docs/{id} → update metadata
        7. DELETE /api/health/medical-docs/{id} → delete

        Frontend (/app/frontend/app/health/index.tsx):
        - New "Medical Documents" card with upload button (testID doc-upload),
          list of docs (testID prefix doc-{id}), per-row download
          (doc-download-{id}), tap row → edit metadata via EditModal
          (Title / Type select / Date / Provider / Notes / Delete).
        - Existing Insurance / Meds / Appointments CRUD continues to work
          (regression check needed).

        Please test backend (all 7 endpoints including multipart upload of a small
        PDF/TXT) and frontend (upload via doc picker, edit metadata, download,
        delete + no regression on Meds/Appts/Insurance).

        Auth: test1@plos.app / test123. Existing Meds CRUD endpoints are
        /api/health/medications, Appts /api/health/appointments, Insurance
        /api/health/insurance.

        NEW backend (/app/backend/deal_finder.py — mounted in server.py):
        1. GET /api/shopping/deal-finder/retailers → 16 common US retailers
        2. GET /api/shopping/deal-finder/searches → autoseeds 1 search on first
           call (65-inch 4K OLED TV) and returns all saved.
        3. POST/PUT/DELETE /api/shopping/deal-finder/searches → CRUD
        4. POST /api/shopping/deal-finder/find → ad-hoc Claude AI call,
           returns {deals: [...], summary, ran_at}. Each deal has
           retailer, model, est_price_usd, original_price_usd, savings_pct,
           pros, cons, confidence, buy_url_hint.
        5. POST /api/shopping/deal-finder/searches/{id}/refresh → re-runs AI
           for a saved search and persists last_results/last_summary/last_run_at.

        Frontend (/app/frontend/app/shopping/deal-finder.tsx — NEW):
        - Form: Product description, Max/Target price, Urgency pills (4),
          Quality pills (3), Retailers pills (16, multi-select), Notes
        - Buttons: "Find Deals Now" (testID df-find) and "Save Search" (df-save)
        - Results section (testID df-results) displays AI summary + ranked
          deal cards (testID prefix df-deal-) with price, savings %, confidence
          pill, pros/cons, and tap-to-open URL hint.
        - Saved Searches section (testID prefix saved-) with re-run
          (saved-run-{id}) and delete (saved-delete-{id}) actions.

        Hub: added "AI Deal Finder" tile to /shopping (testID hub-deal-finder).

        Please test both backend (CRUD + AI + refresh) and frontend (form fill,
        find, save, run-saved, delete-saved). Auth: test1@plos.app / test123.

        NEW backend (/app/backend/world_clock.py — mounted in server.py):
        1. GET /api/world-clock/directory → curated list of cities + IANA timezones
        2. GET /api/world-clock/clocks → autoseeds 3 clocks (Atlanta, Manila, London)
           on first call; returns local_time/local_date/utc_offset_hours per clock.
        3. POST/PUT/DELETE /api/world-clock/clocks → CRUD.
        4. POST /api/world-clock/convert → convert source_datetime+tz to many targets
        5. POST /api/world-clock/best-meeting-time → Claude-powered. Generates 24 UTC
           candidate slots, scores by in-hours count, sends top 6 to Claude for the
           final pick + reasoning.

        Frontend (/app/frontend/app/global/world-clock.tsx — NEW screen):
        - Section 1 YOUR CLOCKS with Add button (testID add-clock), tap-to-edit
          (testID clock-{id}). Local time updates live every 30s using browser
          Intl.DateTimeFormat.
        - Section 2 TIME ZONE CONVERTER: From pills + HH:MM input + Convert button
          (testID convert-btn). Results show as resultRow per target.
        - Section 3 BEST MEETING TIME · AI: Participant pills (testIDs
          ai-participant-{tz}), Duration/Earliest/Latest hour inputs, "Find Best
          Meeting Time" button (testID run-best-meeting). Result card (testID
          ai-result) shows recommended UTC slot, per-participant local times with
          ⚠ for out-of-hours, plus Claude's reasoning + tradeoffs.

        Also: Added a "World Clock" tile to the Global Tools hub at /global
        (testID hub-world-clock).

        Please test both backend (CRUD, convert, AI) and frontend (full Add/Edit/
        Delete flow + Convert + AI meeting pick). Auth: test1@plos.app / test123.

        NEW backend (/app/backend/safety_local.py — mounted in server.py):
        1. Offline Maps CRUD at /api/local/offline-maps (GET autoseeds Georgia + Bulacan
           on first call, POST, PUT, DELETE).
        2. Live Travel Map at /api/local/travel-map → finds the nearest upcoming trip
           and returns {trip, origin, destination, distance_miles} using a tiny city
           gazetteer.
        3. GPS Alerts:
           - GET/PUT /api/local/gps-alerts/settings
           - POST /api/local/gps-alerts/check {lat, lon} → returns dynamic alerts list
        4. Local Media at /api/local/media?lat=&lon=  → returns local TV + radio
           streams for GA/NY/CA bboxes, national fallback otherwise.

        Frontend (/app/frontend/app/safety-local/index.tsx):
        - Offline Maps section now CRUD with EditModal (testID "add-offline-region",
          row testID "offline-{id}")
        - New "Live Travel Map" section with SVG mini-map (testID "travel-map-card"
          or "travel-empty" when no trip)
        - New "GPS Navigation Alerts" section with 5 toggle switches
          (testIDs: gps-toggle-enabled, gps-toggle-weather, gps-toggle-crime,
           gps-toggle-advisories, gps-toggle-speed) and dynamic alerts banner
        - New "Local Media" section listing TV + radio stations (rows clickable to
          open stream URLs in browser)

        Please test BOTH backend & frontend for Enhancement 7. Auth still test1@plos.app
        / test123. test1 user already has a trip ("Manila & Bulacan") and DeKalb county
        from E6 testing, so the Live Travel Map should populate.