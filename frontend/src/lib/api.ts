// PLOS API client — uses EXPO_PUBLIC_BACKEND_URL with JWT token from secure storage.
import { storage } from "@/src/utils/storage";

const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const TOKEN_KEY = "plos_auth_token";

export interface AuthUser {
  token: string;
  user_id: string;
  email: string;
  full_name: string;
}

async function getToken(): Promise<string | null> {
  return await storage.secureGet<string>(TOKEN_KEY, "");
}

export async function setToken(token: string): Promise<void> {
  await storage.secureSet(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await storage.secureRemove(TOKEN_KEY);
}

async function request<T = any>(
  path: string,
  options: { method?: string; body?: any; auth?: boolean } = {}
): Promise<T> {
  const { method = "GET", body, auth = true } = options;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (auth) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE_URL}/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = data.detail || detail;
    } catch {}
    throw new Error(detail);
  }
  return res.json();
}

// ----------------- Auth -----------------
export const authApi = {
  register: (email: string, password: string, full_name: string) =>
    request<AuthUser>("/auth/register", {
      method: "POST",
      body: { email, password, full_name },
      auth: false,
    }),
  login: (email: string, password: string) =>
    request<AuthUser>("/auth/login", {
      method: "POST",
      body: { email, password },
      auth: false,
    }),
  me: () => request<any>("/auth/me"),
};

// ----------------- Dashboard -----------------
export const dashboardApi = {
  get: () => request<any>("/dashboard"),
};

// ----------------- Finance -----------------
export const financeApi = {
  listIncome: () => request<any[]>("/income"),
  createIncome: (data: any) =>
    request<any>("/income", { method: "POST", body: data }),
  updateIncome: (id: string, data: any) =>
    request<any>(`/income/${id}`, { method: "PUT", body: data }),
  deleteIncome: (id: string) =>
    request(`/income/${id}`, { method: "DELETE" }),
  listExpenses: () => request<any[]>("/expenses"),
  createExpense: (data: any) =>
    request<any>("/expenses", { method: "POST", body: data }),
  updateExpense: (id: string, data: any) =>
    request<any>(`/expenses/${id}`, { method: "PUT", body: data }),
  deleteExpense: (id: string) =>
    request(`/expenses/${id}`, { method: "DELETE" }),
  listDebts: () => request<any[]>("/debts"),
  createDebt: (data: any) =>
    request<any>("/debts", { method: "POST", body: data }),
  updateDebt: (id: string, data: any) =>
    request<any>(`/debts/${id}`, { method: "PUT", body: data }),
  deleteDebt: (id: string) =>
    request(`/debts/${id}`, { method: "DELETE" }),
  payoffPlan: (strategy: string, extra_monthly: number) =>
    request<any>("/finance/payoff-plan", {
      method: "POST",
      body: { strategy, extra_monthly },
    }),
  debtStrategy: (strategy: string, extra_monthly: number) =>
    request<any>("/ai/debt-strategy", {
      method: "POST",
      body: { strategy, extra_monthly },
    }),
  mortgageScenarios: (extra_payment = 200, refinance_apr?: number) =>
    request<any>("/finance/mortgage-scenarios", {
      method: "POST",
      body: { extra_payment, refinance_apr },
    }),
  generateReport: (data: {
    report_type: "statement_income" | "statement_expenses" | "snapshot" | "detailed";
    format: "pdf" | "docx" | "csv";
    start_date: string;
    end_date: string;
  }) =>
    request<{
      filename: string;
      mime_type: string;
      content_base64: string;
      size_bytes: number;
    }>("/finance/reports/generate", { method: "POST", body: data }),
};

// ----------------- Assets / Investments -----------------
export const assetsApi = {
  list: () => request<any[]>("/assets"),
  create: (data: any) => request<any>("/assets", { method: "POST", body: data }),
  delete: (id: string) => request(`/assets/${id}`, { method: "DELETE" }),
};

export const investmentsApi = {
  list: () => request<any[]>("/investments"),
  create: (data: any) =>
    request<any>("/investments", { method: "POST", body: data }),
  update: (id: string, data: any) =>
    request<any>(`/investments/${id}`, { method: "PUT", body: data }),
  delete: (id: string) => request(`/investments/${id}`, { method: "DELETE" }),
  portfolio: () => request<any>("/investments/portfolio"),
  summary: () => request<any>("/investments/summary"),
  contributionOptimizer: () =>
    request<any>("/investments/contribution-optimizer", { method: "POST" }),
  readinessGate: () => request<any>("/investments/readiness-gate"),
  opportunities: () =>
    request<any>("/investments/opportunities", { method: "POST" }),
  marketReadiness: () => request<any>("/investments/market-readiness"),
  socialSecurity: (data: {
    current_age: number;
    current_salary: number;
    years_of_contributions: number;
    life_expectancy: number;
  }) =>
    request<any>("/investments/social-security", { method: "POST", body: data }),
  setRiskTolerance: (risk_tolerance: number) =>
    request<any>("/profile/risk-tolerance", {
      method: "PUT",
      body: { risk_tolerance },
    }),
};

// ----------------- Career -----------------
export const careerApi = {
  get: () => request<any>("/career"),
  update: (data: any) => request<any>("/career", { method: "PUT", body: data }),
  listApplications: () => request<any[]>("/job-applications"),
  createApplication: (data: any) =>
    request<any>("/job-applications", { method: "POST", body: data }),
  updateApplication: (id: string, data: any) =>
    request<any>(`/job-applications/${id}`, { method: "PUT", body: data }),
  deleteApplication: (id: string) =>
    request(`/job-applications/${id}`, { method: "DELETE" }),
  pipeline: () => request<any>("/career/pipeline"),
  resumeAnalyze: (resume_text?: string) =>
    request<any>("/career/resume-analyze", {
      method: "POST",
      body: { resume_text },
    }),
  generate: (data: {
    application_id?: string;
    role_title: string;
    employer: string;
    job_description: string;
  }) => request<any>("/career/generate", { method: "POST", body: data }),
  pathAdvisor: () =>
    request<{ paths: any[] }>("/career/path-advisor", { method: "POST" }),
};

// ----------------- AI -----------------
export const aiApi = {
  decisions: () => request<any[]>("/ai-decisions"),
  ackDecision: (id: string) =>
    request(`/ai-decisions/${id}/ack`, { method: "POST" }),
  advice: (module: string, hint?: string) =>
    request<any>("/ai/advice", {
      method: "POST",
      body: { module, context_hint: hint },
    }),
  dailyAdvice: (force = false, deep = false) =>
    request<{
      summary: string;
      items: string[];
      deep_analysis?: string | null;
      generated_at: string;
      date: string;
    }>("/ai/daily-advice", { method: "POST", body: { force, deep } }),
  chat: (message: string, session_id?: string, mode?: string) =>
    request<{ response: string; session_id: string }>("/chat", {
      method: "POST",
      body: { message, session_id, mode },
    }),
  chatHistory: (session_id?: string) =>
    request<any[]>(`/chat/history${session_id ? `?session_id=${session_id}` : ""}`),
  conversations: () => request<{ conversations: any[] }>("/chatbot/conversations"),
  deleteConversation: (session_id: string) =>
    request<any>(`/chatbot/conversations/${encodeURIComponent(session_id)}`, { method: "DELETE" }),
  clearAllConversations: () => request<any>("/chatbot/conversations", { method: "DELETE" }),
  searchMessages: (q: string) => request<{ results: any[] }>(`/chatbot/search?q=${encodeURIComponent(q)}`),
  quickActions: () => request<{ prompts: string[] }>("/chatbot/quick-actions"),
};

// ----------------- Alerts -----------------
export const alertsApi = {
  list: () =>
    request<{ alerts: any[]; count: number }>("/alerts"),
};

// ----------------- Identity & Security -----------------
export const securityApi = {
  overview: () => request<any>("/security/overview"),
  listBrokers: () => request<{ brokers: any[] }>("/security/brokers"),
  rescanBrokers: () =>
    request<any>("/security/brokers/rescan", { method: "POST" }),
  optOut: (broker_id: string) =>
    request<{ broker_id: string; letter: string; submitted_at: string }>(
      `/security/brokers/${broker_id}/opt-out`,
      { method: "POST" }
    ),
  optOutLetter: (broker_id: string) =>
    request<{ broker: string; letter: string }>(
      `/security/brokers/${broker_id}/opt-out-letter`
    ),
  credit: () => request<any>("/security/credit"),
  updateCredit: (scores: {
    equifax?: number;
    transunion?: number;
    experian?: number;
  }) => request<any>("/security/credit", { method: "PUT", body: scores }),
  refreshCreditTip: () =>
    request<any>("/security/credit/refresh-tip", { method: "POST" }),
  breaches: () => request<any>("/security/breach"),
  scanBreach: () =>
    request<any>("/security/breach/scan", { method: "POST" }),
  resolveBreach: (breach_id: string) =>
    request<any>(`/security/breach/${breach_id}/resolve`, { method: "POST" }),
  setHibpKey: (hibp_api_key: string) =>
    request<any>("/profile/hibp-key", {
      method: "PUT",
      body: { hibp_api_key },
    }),
  identityTheftGuide: () =>
    request<{ steps: any[] }>("/security/identity-theft-guide"),
  checkIdentityStep: (step_id: string, completed: boolean) =>
    request<any>("/security/identity-theft-guide/check", {
      method: "POST",
      body: { step_id, completed },
    }),
};

// ----------------- Local Intelligence & Safety -----------------
export const localApi = {
  weather: (lat?: number, lon?: number) =>
    request<any>(`/local/weather${lat && lon ? `?lat=${lat}&lon=${lon}` : ""}`),
  nearby: () => request<any>("/local/nearby"),
  gas: () => request<any>("/local/gas"),
  recallsFood: () => request<any>("/local/recalls/food"),
  recallsProducts: () => request<any>("/local/recalls/products"),
  recallsVehicle: (year: number, make: string, model: string, vin?: string) =>
    request<any>("/local/recalls/vehicle", {
      method: "POST",
      body: { year, make, model, vin },
    }),
  vehicles: () => request<{ vehicles: any[] }>("/local/vehicles"),
  family: () => request<any>("/local/family"),
  inviteFamily: (name: string) =>
    request<any>("/local/family/invite", { method: "POST", body: { name } }),
  pauseLocation: (paused: boolean) =>
    request<any>("/local/family/pause", { method: "PUT", body: { paused } }),
  satelliteStatus: () => request<any>("/local/satellite-status"),
  offlineMaps: () => request<any>("/local/offline-maps"),
  sos: (lat: number, lon: number, test_mode = false) =>
    request<any>("/local/sos", { method: "POST", body: { lat, lon, test_mode } }),
  updatePrefs: (data: {
    cuisine_preference?: string;
    google_places_api_key?: string;
  }) => request<any>("/local/preferences", { method: "PUT", body: data }),
};

// ----------------- Global Tools (Translator + Currency) -----------------
export const globalApi = {
  languages: () =>
    request<{ languages: string[]; quick_phrases: string[] }>("/global/languages"),
  translate: (text: string, target_language: string, source_language?: string) =>
    request<any>("/global/translate", {
      method: "POST",
      body: { text, target_language, source_language: source_language || "auto" },
    }),
  detect: (text: string) =>
    request<{ language: string }>("/global/detect-language", {
      method: "POST",
      body: { text },
    }),
  translations: () => request<{ translations: any[] }>("/global/translations"),
  clearTranslations: () =>
    request<any>("/global/translations", { method: "DELETE" }),
  phraseBook: () =>
    request<{ categories: string[]; phrase_book: Record<string, any[]> }>(
      "/global/phrase-book"
    ),
  currencies: () => request<{ currencies: any[] }>("/global/currencies"),
  rates: () => request<any>("/global/rates"),
  rateHistory: (base: string, target: string) =>
    request<any>(`/global/rate-history?base=${base}&target=${target}`),
  listAlerts: () => request<{ alerts: any[] }>("/global/alerts"),
  createAlert: (data: any) =>
    request<any>("/global/alerts", { method: "POST", body: data }),
  updateAlert: (id: string, data: any) =>
    request<any>(`/global/alerts/${id}`, { method: "PUT", body: data }),
  deleteAlert: (id: string) =>
    request<any>(`/global/alerts/${id}`, { method: "DELETE" }),
  checkAlerts: () =>
    request<any>("/global/alerts/check", { method: "POST" }),
  moneyTips: () => request<any>("/global/money-tips"),
  refreshMoneyTips: () =>
    request<any>("/global/money-tips/refresh", { method: "POST" }),
};

// ----------------- Business Ideas + Shopping -----------------
export const businessApi = {
  listIdeas: () => request<any>("/business/ideas"),
  generateIdeas: () => request<any>("/business/ideas/generate", { method: "POST" }),
  createIdea: (d: any) => request<any>("/business/ideas", { method: "POST", body: d }),
  updateIdea: (id: string, d: any) => request<any>(`/business/ideas/${id}`, { method: "PUT", body: d }),
  deleteIdea: (id: string) => request<any>(`/business/ideas/${id}`, { method: "DELETE" }),
  buildPlan: (id: string) => request<any>(`/business/ideas/${id}/plan`, { method: "POST" }),
  edenHeights: () => request<any>("/business/eden-heights"),
  updateEdenHeights: (data: any) => request<any>("/business/eden-heights", { method: "PUT", body: data }),
  deleteEdenHeights: () => request<any>("/business/eden-heights", { method: "DELETE" }),
};

export const shoppingApi = {
  deals: () => request<any>("/shopping/deals"),
  dismissDeal: (id: string) => request<any>(`/shopping/deals/${id}/dismiss`, { method: "POST" }),
  preferences: () => request<any>("/shopping/preferences"),
  updatePreferences: (d: any) => request<any>("/shopping/preferences", { method: "PUT", body: d }),
  utilities: () => request<any>("/shopping/utilities"),
  findBetterRate: (id: string) => request<any>(`/shopping/utilities/${id}/find-better`, { method: "POST" }),
  registered: () => request<any>("/shopping/registered-products"),
  registerProduct: (d: any) => request<any>("/shopping/registered-products", { method: "POST", body: d }),
  unregisterProduct: (id: string) => request<any>(`/shopping/registered-products/${id}`, { method: "DELETE" }),
};

// ----------------- Student Loans (Enhancement 2) -----------------
export const studentLoansApi = {
  listLoans: () => request<{ loans: any[]; totals: any }>("/student-loans/list"),
  listServicers: () => request<{ servicers: any[] }>("/student-loans/servicers"),
  createServicer: (d: any) =>
    request<any>("/student-loans/servicers", { method: "POST", body: d }),
  updateServicer: (id: string, d: any) =>
    request<any>(`/student-loans/servicers/${id}`, { method: "PUT", body: d }),
  deleteServicer: (id: string) =>
    request<any>(`/student-loans/servicers/${id}`, { method: "DELETE" }),
  seedFederalServicers: () =>
    request<any>("/student-loans/servicers/seed-federal", { method: "POST" }),
  getExtras: (debt_id: string) =>
    request<any>(`/student-loans/extras/${debt_id}`),
  updateExtras: (
    debt_id: string,
    d: { deferment_active: boolean; deferment_end_date?: string | null }
  ) => request<any>(`/student-loans/extras/${debt_id}`, { method: "PUT", body: d }),
  repaymentPlans: (debt_id: string) =>
    request<any>("/student-loans/repayment-plans", { method: "POST", body: { debt_id } }),
  forgiveness: (debt_id: string) =>
    request<any>("/student-loans/forgiveness", { method: "POST", body: { debt_id } }),
  dailyTip: () => request<any>("/student-loans/daily-tip"),
};

// ----------------- Mortgage (Enhancement 3) -----------------
export const mortgageApi = {
  listServicers: () =>
    request<{ servicers: any[]; non_bank_templates: any[]; bank_templates: any[] }>(
      "/mortgage/servicers"
    ),
  createServicer: (d: any) =>
    request<any>("/mortgage/servicers", { method: "POST", body: d }),
  updateServicer: (id: string, d: any) =>
    request<any>(`/mortgage/servicers/${id}`, { method: "PUT", body: d }),
  deleteServicer: (id: string) =>
    request<any>(`/mortgage/servicers/${id}`, { method: "DELETE" }),
  intelligence: () =>
    request<any>("/mortgage/intelligence", { method: "POST", body: {} }),
  dailyTip: () => request<any>("/mortgage/daily-tip"),
};

// ----------------- Seed -----------------
// ----------------- Travel Advisor -----------------
export const travelApi = {
  // Trips CRUD
  listTrips: () => request<any>("/travel/trips"),
  getTrip: (id: string) => request<any>(`/travel/trips/${id}`),
  createTrip: (d: any) => request<any>("/travel/trips", { method: "POST", body: d }),
  updateTrip: (id: string, d: any) => request<any>(`/travel/trips/${id}`, { method: "PUT", body: d }),
  deleteTrip: (id: string) => request<any>(`/travel/trips/${id}`, { method: "DELETE" }),
  // Insights (Claude consolidated)
  insights: (d: any) => request<any>("/travel/insights", { method: "POST", body: d }),
  // Reference data
  advisories: () => request<any>("/travel/advisories"),
  advisory: (code: string) => request<any>(`/travel/advisory/${code}`),
  deals: () => request<any>("/travel/deals"),
  flights: (origin = "ATL", destination = "MNL") => request<any>(`/travel/flights?origin=${origin}&destination=${destination}`),
  hotels: (city = "Manila") => request<any>(`/travel/hotels?city=${encodeURIComponent(city)}`),
  // Checklist
  checklist: (id: string) => request<any>(`/travel/checklist/${id}`),
  updateChecklist: (id: string, items: any[]) => request<any>(`/travel/checklist/${id}`, { method: "PUT", body: { items } }),
  // Cost estimate
  costEstimate: (id: string) => request<any>(`/travel/cost-estimate/${id}`),
  updateCostEstimate: (id: string, est: any) => request<any>(`/travel/cost-estimate/${id}`, { method: "PUT", body: est }),
  // Passport
  passport: () => request<any>("/travel/passport"),
  updatePassport: (d: any) => request<any>("/travel/passport", { method: "PUT", body: d }),
  // Philippines template
  philippinesTemplate: () => request<any>("/travel/philippines-template"),
};

// ----------------- Health & Wellbeing -----------------
export const healthApi = {
  // Legacy health-profile compatibility (used by app/module/[name].tsx)
  get: () => request<any>("/health-profile"),
  update: (d: any) => request<any>("/health-profile", { method: "PUT", body: d }),
  // Insurance + Medicaid
  insurance: () => request<any>("/health/insurance"),
  updateInsurance: (d: any) => request<any>("/health/insurance", { method: "PUT", body: d }),
  resources: () => request<any>("/health/medicaid-resources"),
  wellness: (days = 7) => request<any>(`/health/wellness?days=${days}`),
  logWellness: (d: any) => request<any>("/health/wellness", { method: "POST", body: d }),
  medications: () => request<any>("/health/medications"),
  createMed: (d: any) => request<any>("/health/medications", { method: "POST", body: d }),
  updateMed: (id: string, d: any) => request<any>(`/health/medications/${id}`, { method: "PUT", body: d }),
  deleteMed: (id: string) => request<any>(`/health/medications/${id}`, { method: "DELETE" }),
  appointments: () => request<any>("/health/appointments"),
  createAppt: (d: any) => request<any>("/health/appointments", { method: "POST", body: d }),
  updateAppt: (id: string, d: any) => request<any>(`/health/appointments/${id}`, { method: "PUT", body: d }),
  deleteAppt: (id: string) => request<any>(`/health/appointments/${id}`, { method: "DELETE" }),
  insights: () => request<any>("/health/insights", { method: "POST" }),
};

// ----------------- Legal Advisor -----------------
export const legalApi = {
  categories: () => request<any>("/legal/categories"),
  topic: (slug: string, force_refresh = false) =>
    request<any>(`/legal/topic/${slug}${force_refresh ? "?force_refresh=true" : ""}`, { method: "POST" }),
  documents: () => request<any>("/legal/documents"),
  createDoc: (d: any) => request<any>("/legal/documents", { method: "POST", body: d }),
  updateDoc: (id: string, d: any) => request<any>(`/legal/documents/${id}`, { method: "PUT", body: d }),
  deleteDoc: (id: string) => request<any>(`/legal/documents/${id}`, { method: "DELETE" }),
  debtRights: () => request<any>("/legal/debt-rights"),
};

export const seedDemo = () => request<any>("/seed-demo", { method: "POST" });
