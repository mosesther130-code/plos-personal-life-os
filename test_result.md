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
        Enhancement 7 — Safety & Local implementation complete.

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