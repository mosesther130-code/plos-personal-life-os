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

export async function request<T = any>(
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
  inviteFamily: (name: string, relation?: string, color?: string) =>
    request<any>("/local/family/invite", {
      method: "POST",
      body: { name, relation, color },
    }),
  updateFamilyMember: (
    member_id: string,
    data: { name?: string; relation?: string; color?: string }
  ) =>
    request<any>(`/local/family/members/${member_id}`, {
      method: "PUT",
      body: data,
    }),
  deleteFamilyMember: (member_id: string) =>
    request<any>(`/local/family/members/${member_id}`, { method: "DELETE" }),
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

// ----------------- Career Files (Enhancement 4a) -----------------
export const careerFilesApi = {
  listFiles: (kind?: "resume" | "job_description" | "other") =>
    request<{ files: any[] }>(`/career-files/list${kind ? `?kind=${kind}` : ""}`),
  getFileMeta: (file_id: string) =>
    request<any>(`/career-files/file/${file_id}`),
  downloadFile: (file_id: string) =>
    request<any>(`/career-files/file/${file_id}/download`),
  deleteFile: (file_id: string) =>
    request<any>(`/career-files/file/${file_id}`, { method: "DELETE" }),
  uploadFile: async (file: File | Blob, opts: { kind: string; label?: string; filename?: string }) => {
    const token = await getToken();
    const fd = new FormData();
    // Always include the filename explicitly — Blob.name is not preserved through FormData
    const name = opts.filename || (file as any).name || "upload.bin";
    fd.append("file", file as any, name);
    fd.append("kind", opts.kind);
    if (opts.label) fd.append("label", opts.label);
    const baseUrl = (process.env.EXPO_PUBLIC_BACKEND_URL || "") + "/api";
    const res = await fetch(`${baseUrl}/career-files/upload`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd as any,
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const j = await res.json();
        msg = j?.detail || msg;
      } catch {}
      throw new Error(msg);
    }
    return res.json();
  },
  getResumeDraft: () => request<{ draft: any | null }>("/career-files/resume-draft"),
  saveResumeDraft: (draft: any) =>
    request<any>("/career-files/resume-draft", { method: "PUT", body: { draft } }),
  polishResume: () =>
    request<any>("/career-files/resume-draft/polish", { method: "POST", body: {} }),
  downloadResume: (format: "pdf" | "docx") =>
    request<{ filename: string; mime_type: string; content_base64: string; size_bytes: number }>(
      "/career-files/resume-draft/download",
      { method: "POST", body: { format } }
    ),
};

// ----------------- Career Intelligence (Enhancements 4c, 4d, 4e) -----------------
export const careerIntelApi = {
  interviewPrep: (data: { application_id?: string; job_description_text?: string; job_description_file_id?: string }) =>
    request<any>("/career-intel/interview-prep", { method: "POST", body: data }),
  letter: (data: any) =>
    request<any>("/career-intel/letter", { method: "POST", body: data }),
  letterDownload: (data: { subject: string; body: string; format: "pdf" | "docx" }) =>
    request<any>("/career-intel/letter/download", { method: "POST", body: data }),
  jobSearch: (data: { refresh?: boolean; filters?: any }) =>
    request<any>("/career-intel/job-search", { method: "POST", body: data || {} }),
};

// ----------------- Investment Markets (Enhancement 5) -----------------
export const investmentMarketsApi = {
  list: () => request<{ markets: any[]; snapshot: any; risk_tolerance: number }>("/investment-markets/list"),
  create: (d: any) => request<any>("/investment-markets/", { method: "POST", body: d }),
  update: (id: string, d: any) =>
    request<any>(`/investment-markets/${id}`, { method: "PUT", body: d }),
  delete: (id: string) => request<any>(`/investment-markets/${id}`, { method: "DELETE" }),
};

// ----------------- Security Enhancements (Enhancement 6) -----------------
export const securityExtrasApi = {
  listMonitored: () => request<{ accounts: any[] }>("/security/monitored-accounts"),
  createMonitored: (d: any) =>
    request<any>("/security/monitored-accounts", { method: "POST", body: d }),
  updateMonitored: (id: string, d: any) =>
    request<any>(`/security/monitored-accounts/${id}`, { method: "PUT", body: d }),
  deleteMonitored: (id: string) =>
    request<any>(`/security/monitored-accounts/${id}`, { method: "DELETE" }),
  getJurisdiction: () => request<any>("/security/jurisdiction"),
  getPoliceStep: () => request<any>("/security/identity-theft/police-step"),
};

// ----------------- AI Document Summarizer (Enhancement 12) -----------------
export const integrationsApi = {
  mapsNearby: (lat: number, lon: number, type = "restaurant", radius = 1500) =>
    request<any>(`/maps/nearby?lat=${lat}&lon=${lon}&type=${type}&radius=${radius}`),
  mapsDirections: (origin: string, destination: string, mode = "driving") =>
    request<any>(`/maps/directions?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&mode=${mode}`),
  mapsGeocode: (address: string) =>
    request<any>(`/maps/geocode?address=${encodeURIComponent(address)}`),
  exchangeRates: () => request<any>("/exchange/rates"),
  weatherLive: (lat: number, lon: number) =>
    request<any>(`/weather/live?lat=${lat}&lon=${lon}`),
  alertsInbox: (unread = false) =>
    request<{ alerts: any[]; count: number }>(`/alerts/inbox${unread ? "?unread_only=true" : ""}`),
  markAlertRead: (id: string) =>
    request<any>(`/alerts/inbox/${id}/read`, { method: "POST" }),
  deleteAlert: (id: string) =>
    request<any>(`/alerts/inbox/${id}`, { method: "DELETE" }),
};

export const docSummarizerApi = {
  focuses: () =>
    request<{ focuses: { value: string; label: string; instruction: string }[] }>(
      "/doc-summarizer/focuses"
    ),
  history: () =>
    request<{ history: any[]; total: number }>("/doc-summarizer/history"),
  get: (id: string) => request<any>(`/doc-summarizer/history/${id}`),
  delete: (id: string) =>
    request<any>(`/doc-summarizer/history/${id}`, { method: "DELETE" }),
  summarize: async (
    file: File | Blob,
    opts: { focus?: string; save?: boolean; filename?: string }
  ) => {
    const token = await getToken();
    const fd = new FormData();
    const name = opts.filename || (file as any).name || "document.bin";
    fd.append("file", file as any, name);
    fd.append("focus", opts.focus || "general");
    fd.append("save", String(!!opts.save));
    const baseUrl = (process.env.EXPO_PUBLIC_BACKEND_URL || "") + "/api";
    const res = await fetch(`${baseUrl}/doc-summarizer/summarize`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd as any,
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const j = await res.json();
        msg = j?.detail || msg;
      } catch {
        // ignore
      }
      throw new Error(msg);
    }
    return res.json();
  },
};

// ----------------- Account Management (Enhancement 11) -----------------
export const accountApi = {
  me: () => request<any>("/auth/me"),
  updateProfile: (d: any) =>
    request<any>("/profile", { method: "PUT", body: d }),
  changePassword: (current_password: string, new_password: string) =>
    request<{ ok: boolean; password_changed_at: string }>("/auth/change-password", {
      method: "POST",
      body: { current_password, new_password },
    }),
  deleteAccount: (password: string, confirm_text: string) =>
    request<{ ok: boolean; total_records: number; collections_cleared: Record<string, number> }>(
      "/auth/delete-account",
      { method: "POST", body: { password, confirm_text } }
    ),
};

// ----------------- Medical Documents (Enhancement 10) -----------------
export const medicalDocsApi = {
  types: () => request<{ doc_types: string[] }>("/health/medical-docs/types"),
  list: (doc_type?: string) =>
    request<{ docs: any[]; total: number }>(
      `/health/medical-docs${doc_type ? `?doc_type=${doc_type}` : ""}`
    ),
  get: (id: string) => request<any>(`/health/medical-docs/${id}`),
  download: (id: string) =>
    request<{ filename: string; mime_type: string; content_base64: string; size_bytes: number }>(
      `/health/medical-docs/${id}/download`
    ),
  update: (id: string, d: any) =>
    request<any>(`/health/medical-docs/${id}`, { method: "PUT", body: d }),
  delete: (id: string) =>
    request<any>(`/health/medical-docs/${id}`, { method: "DELETE" }),
  upload: async (
    file: File | Blob,
    opts: {
      title?: string;
      doc_type?: string;
      doc_date?: string;
      provider?: string;
      notes?: string;
      filename?: string;
    }
  ) => {
    const token = await getToken();
    const fd = new FormData();
    const name = opts.filename || (file as any).name || "document.bin";
    fd.append("file", file as any, name);
    if (opts.title) fd.append("title", opts.title);
    fd.append("doc_type", opts.doc_type || "other");
    if (opts.doc_date) fd.append("doc_date", opts.doc_date);
    if (opts.provider) fd.append("provider", opts.provider);
    if (opts.notes) fd.append("notes", opts.notes);
    const baseUrl = (process.env.EXPO_PUBLIC_BACKEND_URL || "") + "/api";
    const res = await fetch(`${baseUrl}/health/medical-docs/upload`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd as any,
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const j = await res.json();
        msg = j?.detail || msg;
      } catch {
        // ignore
      }
      throw new Error(msg);
    }
    return res.json();
  },
};

// ----------------- Deal Finder (Enhancement 9) -----------------
export const dealFinderApi = {
  retailers: () => request<{ retailers: string[] }>("/shopping/deal-finder/retailers"),
  listSearches: () =>
    request<{ searches: any[] }>("/shopping/deal-finder/searches"),
  createSearch: (d: any) =>
    request<any>("/shopping/deal-finder/searches", { method: "POST", body: d }),
  updateSearch: (id: string, d: any) =>
    request<any>(`/shopping/deal-finder/searches/${id}`, {
      method: "PUT",
      body: d,
    }),
  deleteSearch: (id: string) =>
    request<any>(`/shopping/deal-finder/searches/${id}`, { method: "DELETE" }),
  find: (d: any) =>
    request<any>("/shopping/deal-finder/find", { method: "POST", body: d }),
  refresh: (id: string) =>
    request<any>(`/shopping/deal-finder/searches/${id}/refresh`, {
      method: "POST",
    }),
};

// ----------------- World Clock / Global Tools (Enhancement 8) -----------------
export const worldClockApi = {
  directory: () => request<{ timezones: any[] }>("/world-clock/directory"),
  listClocks: () =>
    request<{ clocks: any[]; now_utc: string }>("/world-clock/clocks"),
  createClock: (d: any) =>
    request<any>("/world-clock/clocks", { method: "POST", body: d }),
  updateClock: (id: string, d: any) =>
    request<any>(`/world-clock/clocks/${id}`, { method: "PUT", body: d }),
  deleteClock: (id: string) =>
    request<any>(`/world-clock/clocks/${id}`, { method: "DELETE" }),
  convert: (d: { source_tz: string; source_datetime: string; targets: string[] }) =>
    request<any>("/world-clock/convert", { method: "POST", body: d }),
  bestMeetingTime: (d: any) =>
    request<any>("/world-clock/best-meeting-time", { method: "POST", body: d }),
};
export const localExtrasApi = {
  // Offline Maps CRUD (overrides legacy /local/offline-maps)
  listOfflineMaps: () =>
    request<{ regions: any[]; total_size_mb: number; is_mocked: boolean }>(
      "/local/offline-maps"
    ),
  createOfflineMap: (d: any) =>
    request<any>("/local/offline-maps", { method: "POST", body: d }),
  updateOfflineMap: (id: string, d: any) =>
    request<any>(`/local/offline-maps/${id}`, { method: "PUT", body: d }),
  deleteOfflineMap: (id: string) =>
    request<any>(`/local/offline-maps/${id}`, { method: "DELETE" }),
  // Live Travel Map
  travelMap: () => request<any>("/local/travel-map"),
  // GPS Alerts
  gpsAlertSettings: () => request<any>("/local/gps-alerts/settings"),
  updateGpsAlertSettings: (d: any) =>
    request<any>("/local/gps-alerts/settings", { method: "PUT", body: d }),
  checkGpsAlerts: (lat: number, lon: number) =>
    request<any>("/local/gps-alerts/check", { method: "POST", body: { lat, lon } }),
  // Local Media
  media: (lat?: number, lon?: number) =>
    request<any>(
      `/local/media${lat != null && lon != null ? `?lat=${lat}&lon=${lon}` : ""}`
    ),
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
  pinTrip: (id: string, pinned: boolean) =>
    request<any>(`/travel/trips/${id}/pin`, { method: "PUT", body: { pinned } }),
  scanTrip: (id: string) => request<any>(`/travel/trips/${id}/scan`, { method: "POST", body: {} }),
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

// ----------------- Travel AI Search (Claude flights+hotels) --------------
export const travelSearchApi = {
  get: (trip_id: string) =>
    request<{ results: any; searched_at: string | null; stale: boolean; has_results: boolean }>(
      `/travel/trips/${trip_id}/search`
    ),
  run: (trip_id: string, force = false) =>
    request<any>(`/travel/trips/${trip_id}/search`, {
      method: "POST",
      body: { force },
    }),
  saveToBudget: (trip_id: string, total_usd: number, label?: string) =>
    request<{ ok: boolean; expense_id: string }>(
      `/travel/trips/${trip_id}/save-to-budget`,
      { method: "POST", body: { total_usd, label } }
    ),
};

// ---------- Travel LIVE Search (SerpApi Google Flights + Hotels) ----------
export const travelLiveApi = {
  serpapiStatus: () =>
    request<{
      configured: boolean;
      key_hint: string | null;
      last_error: null | {
        error: string; status_code?: number; kind: string; timestamp: string;
      };
    }>("/travel/serpapi-status"),
  deepLinks: (trip_id: string, one_way = false) =>
    request<any>(`/travel/trips/${trip_id}/deep-links?one_way=${one_way}`),
  searchLive: (trip_id: string, body: {
    refresh?: boolean; one_way?: boolean; cabin?: string; adults?: number;
  }) =>
    request<any>(`/travel/trips/${trip_id}/search-live`, {
      method: "POST",
      body: {
        refresh: !!body.refresh,
        one_way: !!body.one_way,
        cabin: body.cabin || "economy",
        adults: body.adults ?? 1,
      },
    }),
};

// ---------- Airports directory + saved routes ----------
export type Airport = {
  iata: string; name: string; city: string; region?: string; country: string;
  match?: string;
};
export type SavedRoute = {
  route_id: string; origin_iata: string; destination_iata: string;
  label: string; context?: string; default?: boolean;
  origin?: Airport; destination?: Airport;
};
export const airportsApi = {
  search: (q: string) =>
    request<{ results: Airport[] }>(
      `/travel/airports/search?q=${encodeURIComponent(q)}&limit=8`
    ),
  autoFill: () =>
    request<Airport & { auto: boolean; source_city: string }>(
      "/travel/airports/home/auto-fill"
    ),
  byIata: (iata: string) =>
    request<Airport>(`/travel/airports/${iata.toUpperCase()}`),
};
export const routesApi = {
  list: () => request<{ routes: SavedRoute[] }>("/travel/routes"),
  create: (b: { origin_iata: string; destination_iata: string; label?: string }) =>
    request<SavedRoute>("/travel/routes", { method: "POST", body: b }),
  remove: (id: string) =>
    request<{ ok: boolean }>(`/travel/routes/${id}`, { method: "DELETE" }),
};

// ---------- Jobs Deep Search ----------
export type Industry = { industry_id: string; label: string; enabled: boolean };
export type DeepSearchJob = {
  job_id: string; title: string; employer: string; employer_domain?: string;
  location: string; location_type: "remote" | "hybrid" | "on_site" | "international";
  salary_min?: number | null; salary_max?: number | null; salary_display?: string;
  posted_at?: string | null; posted_display?: string;
  fetched_at?: string;
  description_full?: string; description_highlights?: any;
  apply_url: string; apply_url_final?: string;
  apply_url_status: number; apply_url_verified_at?: string;
  is_active: boolean; is_verified: boolean;
  is_new?: boolean; is_early?: boolean;
  watch_list_employer?: boolean;
  source_platform: string; source_url?: string; thumbnail?: string;
  match_score: number; match_breakdown?: any;
  rank_position?: number; rank_score?: number;
};
export const jobsDeepApi = {
  listIndustries: () => request<{ industries: Industry[] }>("/jobs/industries"),
  addIndustry: (label: string) =>
    request<Industry>("/jobs/industries", { method: "POST", body: { label } }),
  updateIndustry: (id: string, b: { label: string; enabled: boolean }) =>
    request<{ ok: boolean }>(`/jobs/industries/${id}`, { method: "PUT", body: b }),
  deleteIndustry: (id: string) =>
    request<{ ok: boolean }>(`/jobs/industries/${id}`, { method: "DELETE" }),
  deepSearch: (body: {
    target_roles: string[]; excluded_keywords?: string[];
    industries: string[]; locations: string[];
    min_salary?: number; freshness?: string; priority_employers?: string[];
  }) =>
    request<{
      counts: Record<string, number>;
      total_raw: number; total_after_dedup: number; total_after_freshness: number;
      total_verified_active: number; jobs_count: number; search_seconds: number;
      top_job: DeepSearchJob | null;
    }>("/jobs/deep-search", { method: "POST", body }),
  verifiedFeed: (opts: {
    freshness?: string; sort?: string; min_score?: number;
    filter_new?: boolean; source?: string; limit?: number;
    work_type_filter?: string; require_location_match?: boolean;
  }) => {
    const q = new URLSearchParams();
    if (opts.freshness) q.set("freshness", opts.freshness);
    if (opts.sort) q.set("sort", opts.sort);
    if (opts.min_score) q.set("min_score", String(opts.min_score));
    if (opts.filter_new) q.set("filter_new", "true");
    if (opts.source) q.set("source", opts.source);
    if (opts.work_type_filter) q.set("work_type_filter", opts.work_type_filter);
    if (opts.require_location_match !== undefined) q.set("require_location_match", String(opts.require_location_match));
    if (opts.limit) q.set("limit", String(opts.limit));
    return request<{
      jobs: DeepSearchJob[]; count: number;
      counts_by_source: Record<string, number>;
      new_today: number; last_fetched_at: string | null;
    }>(`/jobs/verified-feed?${q.toString()}`);
  },
};

// ----------------- Plaid ---------------------------------
export const plaidApi = {
  status: () => request<{ has_real_keys: boolean; env: string; webhook_configured: boolean; android_package: string }>("/plaid/status"),
  createLinkToken: () => request<{ link_token: string; sandbox_fallback?: boolean; message?: string }>("/plaid/create-link-token", { method: "POST" }),
  exchangeToken: (public_token: string) => request<any>("/plaid/exchange-token", { method: "POST", body: { public_token } }),
  listItems: () => request<{ items: any[] }>("/plaid/items"),
  refresh: (item_id: string) => request<any>(`/plaid/items/${item_id}/refresh`, { method: "POST" }),
  disconnect: (item_id: string) => request<any>(`/plaid/items/${item_id}`, { method: "DELETE" }),
  transactions: (limit = 100) => request<{ transactions: any[]; count: number }>(`/plaid/transactions?limit=${limit}`),
  sandboxSimulate: () => request<any>("/plaid/sandbox/simulate", { method: "POST" }),
  summary: () => request<any>("/plaid/summary"),
  categorize: () => request<any>("/plaid/categorize", { method: "POST" }),
  updateCategory: (tx_id: string, category: string) =>
    request<any>(`/plaid/transactions/${tx_id}/category`, { method: "PUT", body: { category } }),
  cashflowForecast: (days = 90, threshold = 500, regenerate = false) =>
    request<any>(`/plaid/cashflow-forecast?days=${days}&threshold=${threshold}&regenerate=${regenerate}`),
  fraudScan: (days = 30) => request<any>(`/plaid/fraud-scan?days=${days}`, { method: "POST" }),
  fraudAlerts: () => request<any>("/plaid/fraud-alerts"),
  resolveFraud: (alert_id: string, decision: "trusted" | "disputed" | "reported") =>
    request<any>(`/plaid/fraud-alerts/${alert_id}`, { method: "PUT", body: { decision } }),
  cacheStats: () => request<any>("/plaid/cache-stats"),
  monthlySummary: (month?: string, refresh = false) =>
    request<any>(`/plaid/monthly-summary${month ? `?month=${month}&refresh=${refresh}` : `?refresh=${refresh}`}`),
  monthlySummaries: () => request<any>("/plaid/monthly-summaries"),
  snapshotFusion: () => request<any>("/plaid/snapshot-fusion"),
  alertSettings: () => request<any>("/plaid/alert-settings"),
  updateAlertSettings: (patch: any) => request<any>("/plaid/alert-settings", { method: "PUT", body: patch }),
  alertHistory: (days = 90) => request<any>(`/plaid/alert-history?days=${days}`),
  triggerPregen: () => request<any>("/plaid/pregen/trigger-now", { method: "POST" }),
  pregenLog: () => request<any>("/plaid/pregen/log"),
};

// ----------------- Push Notifications (Firebase via Emergent relay) ----
export const pushApi = {
  register: (platform: string, device_token: string) =>
    request<{ status: string; reason?: string }>("/register-push", {
      method: "POST",
      body: { user_id: "", platform, device_token },
    }),
  categories: () =>
    request<{ categories: { key: string; label: string; trigger: string }[] }>(
      "/push/categories"
    ),
  test: (data: {
    category?: string;
    title?: string;
    message?: string;
    action_url?: string;
  }) =>
    request<{ status: string; category?: string; reason?: string }>("/push/test", {
      method: "POST",
      body: data,
    }),
};

// ----------------- Family Locations Realtime (Firestore) ---------------
export const familyLocationsApi = {
  status: () =>
    request<{ firestore_available: boolean; collection: string; note: string }>(
      "/family-locations/status"
    ),
  sync: () =>
    request<{ ok: boolean; synced: number; members: any[] }>(
      "/family-locations/sync",
      { method: "POST" }
    ),
  simulate: (data: {
    member_id?: string;
    member_name?: string;
    distance_miles?: number;
    bearing_deg?: number;
    message?: string;
  }) =>
    request<{
      ok: boolean;
      member_id: string;
      name: string;
      previous: { lat: number; lon: number };
      new: { lat: number; lon: number };
      bearing_deg: number;
      distance_miles: number;
    }>("/family-locations/simulate", { method: "POST", body: data }),
};

export const seedDemo = () => request<any>("/seed-demo", { method: "POST" });

// ----------------- Career Resume Vault + AI Tailor ---------------------
export type ResumeFileType = "pdf" | "docx" | "doc" | "txt" | "paste";

export const careerResumesApi = {
  list: () =>
    request<{ resumes: Array<any> }>("/career/resumes"),
  get: (resume_id: string) =>
    request<any>(`/career/resumes/${resume_id}`),
  create: (data: {
    name: string;
    file_type: ResumeFileType;
    content_b64?: string;
    text?: string;
  }) =>
    request<any>("/career/resumes", { method: "POST", body: data }),
  update: (
    resume_id: string,
    data: { name?: string; text?: string; is_default?: boolean }
  ) =>
    request<{ ok: boolean; updated: string[] }>(
      `/career/resumes/${resume_id}`,
      { method: "PUT", body: data }
    ),
  remove: (resume_id: string) =>
    request<{ ok: boolean }>(`/career/resumes/${resume_id}`, {
      method: "DELETE",
    }),
  setDefault: (resume_id: string) =>
    request<{ ok: boolean }>(`/career/resumes/${resume_id}`, {
      method: "PUT",
      body: { is_default: true },
    }),
};

export type TailorResult = {
  ok: boolean;
  version_id: string;
  ats_score: number;
  keywords_matched: string[];
  keywords_missing: string[];
  summary: string;
  tailored_resume_md: string;
  cover_letter_md: string;
  interview_questions: string[];
  email_status: { status: string; reason?: string } | null;
};

export const careerTailorApi = {
  tailor: (data: {
    resume_id?: string;
    job_title: string;
    company: string;
    job_description: string;
    job_url?: string;
    tailor_resume?: boolean;
    generate_cover_letter?: boolean;
    generate_interview_questions?: boolean;
    email_to_me?: boolean;
    send_pdf?: boolean;
  }) => request<TailorResult>("/career/tailor", { method: "POST", body: data }),
  listVersions: () =>
    request<{ versions: Array<any> }>("/career/tailor/versions"),
  getVersion: (version_id: string) =>
    request<any>(`/career/tailor/versions/${version_id}`),
  deleteVersion: (version_id: string) =>
    request<{ ok: boolean }>(`/career/tailor/versions/${version_id}`, {
      method: "DELETE",
    }),
  download: (
    version_id: string,
    kind: "resume" | "cover" | "thankyou" | "followup" = "resume"
  ) =>
    request<{ filename: string; mime: string; content_b64: string; markdown: string }>(
      `/career/tailor/versions/${version_id}/download?kind=${kind}`
    ),
  thankYou: (data: {
    version_id: string;
    interviewer_name: string;
    topic_discussed: string;
    email_to_me?: boolean;
  }) => request<any>("/career/tailor/thankyou", { method: "POST", body: data }),
  followUp: (data: {
    version_id: string;
    days_since_applied: number;
    email_to_me?: boolean;
  }) => request<any>("/career/tailor/followup", { method: "POST", body: data }),
  saveApplication: (version_id: string) =>
    request<{ ok: boolean; application_id: string }>(
      "/career/tailor/save-application",
      { method: "POST", body: { version_id } }
    ),
  emailStatus: () =>
    request<{ sendgrid_ready: boolean; hint: string }>(
      "/career/tailor/email/status"
    ),
};


// ================================================================
// Career Library v2 — Resume Library, JD Library, ATS Tailoring
// ================================================================
export type LibResume = {
  resume_id: string;
  file_name: string;
  file_type: "pdf" | "docx" | "doc" | "txt";
  extracted_text?: string;
  word_count: number;
  upload_date: string;
  is_default: boolean;
  label: string;
  last_tailored?: string | null;
  low_text_warning?: boolean;
};
export type LibJd = {
  jd_id: string;
  job_title: string;
  employer: string;
  posting_url?: string;
  file_name: string;
  file_type: string;
  source: "upload" | "manual";
  extracted_text?: string;
  word_count: number;
  upload_date: string;
  match_scores?: Record<string, number>;
  keyword_analysis?: Record<string, any>;
  low_text_warning?: boolean;
};
export type TailorVersion = {
  version_id: string;
  base_resume_id: string;
  base_resume_label: string;
  jd_id: string;
  job_title: string;
  employer: string;
  generated_date: string;
  ats_score_before: number;
  ats_score_after: number;
  match_score: number;
  keywords_found: string[];
  keywords_added: string[];
  keywords_missing: string[];
  tailored_resume_text: string;
  cover_letter_text: string;
  thank_you_letter_text?: string;
  follow_up_letter_text?: string;
  withdrawal_letter_text?: string;
  interview_questions: { question: string; suggested_response: string }[];
  why_you_fit: string;
  ats_tips: string[];
  insider_connections: {
    networks_to_leverage: string[];
    linkedin_connection_template: string;
    warm_intro_template: string;
    recruiter_message_template: string;
  };
  manually_edited: boolean;
  downloaded: boolean;
  emailed: boolean;
  saved_to_application: boolean;
  job_url?: string;
  saved_to_application_id?: string;
};
export const careerLibraryApi = {
  // Resumes
  listResumes: () =>
    request<{ resumes: LibResume[] }>("/career/library/resumes"),
  uploadResume: (b: {
    file_name: string;
    file_type: string;
    file_data_b64: string;
    label?: string;
  }) =>
    request<LibResume>("/career/library/resumes", { method: "POST", body: b }),
  updateResume: (
    resume_id: string,
    b: { label?: string; is_default?: boolean; extracted_text?: string }
  ) =>
    request<{ ok: boolean }>(`/career/library/resumes/${resume_id}`, {
      method: "PUT",
      body: b,
    }),
  deleteResume: (resume_id: string) =>
    request<{ ok: boolean }>(`/career/library/resumes/${resume_id}`, {
      method: "DELETE",
    }),
  downloadResume: (resume_id: string) =>
    request<{ file_name: string; file_type: string; content_b64: string }>(
      `/career/library/resumes/${resume_id}/download`
    ),

  // JDs
  listJds: () => request<{ jds: LibJd[] }>("/career/library/jds"),
  uploadJd: (b: {
    file_name: string;
    file_type: string;
    file_data_b64: string;
  }) =>
    request<LibJd>("/career/library/jds/upload", { method: "POST", body: b }),
  addJdManual: (b: {
    job_title: string;
    employer?: string;
    posting_url?: string;
    extracted_text: string;
  }) =>
    request<LibJd>("/career/library/jds/manual", { method: "POST", body: b }),
  deleteJd: (jd_id: string) =>
    request<{ ok: boolean }>(`/career/library/jds/${jd_id}`, {
      method: "DELETE",
    }),
  downloadJd: (jd_id: string) =>
    request<{ file_name: string; file_type: string; content_b64: string }>(
      `/career/library/jds/${jd_id}/download`
    ),

  // Tailoring
  generate: (b: {
    resume_id: string;
    jd_id?: string;
    job_id?: string;
    ats_optimize?: boolean;
    generate_cover_letter?: boolean;
    generate_interview_questions?: boolean;
    generate_thankyou?: boolean;
    email_to_me?: boolean;
    send_pdf?: boolean;
  }) =>
    request<TailorVersion & { email_status?: any }>(
      "/career/library/tailor/generate",
      { method: "POST", body: b }
    ),
  history: () =>
    request<{ history: TailorVersion[] }>("/career/library/tailor/history"),
  getVersion: (version_id: string) =>
    request<TailorVersion>(`/career/library/tailor/history/${version_id}`),
  deleteVersion: (version_id: string) =>
    request<{ ok: boolean }>(`/career/library/tailor/history/${version_id}`, {
      method: "DELETE",
    }),
  regenerate: (version_id: string) =>
    request<TailorVersion>(
      `/career/library/tailor/history/${version_id}/regenerate`,
      { method: "POST" }
    ),
  editVersion: (
    version_id: string,
    b: {
      tailored_resume_text?: string;
      cover_letter_text?: string;
      thank_you_letter_text?: string;
      follow_up_letter_text?: string;
      withdrawal_letter_text?: string;
    }
  ) =>
    request<{ ok: boolean }>(
      `/career/library/tailor/history/${version_id}/edit`,
      { method: "PUT", body: b }
    ),
  download: (
    version_id: string,
    kind: "resume" | "cover" | "combined" | "thank_you" | "follow_up" | "withdrawal" = "combined",
    fmt: "pdf" | "docx" = "pdf"
  ) =>
    request<{ filename: string; mime: string; content_b64: string }>(
      `/career/library/tailor/history/${version_id}/download?kind=${kind}&fmt=${fmt}`
    ),
  generateLetter: (
    version_id: string,
    kind: "thank_you" | "follow_up" | "withdrawal",
    context_notes: string = ""
  ) =>
    request<{ ok: boolean; kind: string; text: string }>(
      `/career/library/tailor/history/${version_id}/generate-letter`,
      { method: "POST", body: { kind, context_notes } }
    ),
  email: (version_id: string) =>
    request<any>(`/career/library/tailor/history/${version_id}/email`, {
      method: "POST",
    }),
  saveApp: (version_id: string) =>
    request<{ ok: boolean; application_id: string }>(
      `/career/library/tailor/history/${version_id}/save-application`,
      { method: "POST" }
    ),
  emailStatus: () =>
    request<{ sendgrid_ready: boolean; hint: string }>(
      "/career/library/email/status"
    ),
};

// ================================================================
// Job Intelligence Engine v1
// ================================================================
export type FeedJob = {
  job_id: string;
  source: string;
  job_title: string;
  employer: string;
  employer_type: string;
  location: string;
  location_type: string;
  salary_text?: string;
  salary_min?: number;
  salary_max?: number;
  posted_date: string;
  application_deadline?: string | null;
  job_description_text: string;
  apply_url: string;
  apply_url_verified: boolean;
  apply_url_status_code: number;
  apply_url_redirect_final: string;
  link_quality: "direct_apply" | "posting_page" | "requires_login" | "general_careers" | "unverified";
  is_active: boolean;
  early_posting_flag: boolean;
  days_since_posted: number;
  tags?: string[];
  match_scores?: Record<string, any>;
  keyword_analysis?: Record<string, any>;
  display_score?: number;
};
export type JobSourceStatus = {
  id: string;
  label: string;
  connected: boolean;
  status: string;
  hint: string;
};
export const jobIntelApi = {
  sources: () => request<{ sources: JobSourceStatus[] }>("/jobs/intelligence/sources"),
  refresh: () => request<any>("/jobs/intelligence/refresh", { method: "POST" }),
  feed: (min_score: number = 0, sort: string = "best_match", limit: number = 60) =>
    request<{ jobs: FeedJob[]; counters: any }>(
      `/jobs/intelligence/feed?min_score=${min_score}&sort=${sort}&limit=${limit}`
    ),
  detail: (job_id: string) =>
    request<FeedJob>(`/jobs/intelligence/feed/${encodeURIComponent(job_id)}`),
  verifyLink: (job_id: string) =>
    request<any>(`/jobs/intelligence/feed/${encodeURIComponent(job_id)}/verify-link`, { method: "POST" }),
  saveJob: (job_id: string) =>
    request<{ ok: boolean }>(`/jobs/intelligence/feed/${encodeURIComponent(job_id)}/save`, { method: "POST" }),
  targetEmployers: () =>
    request<{ target_employers: { name: string; careers_url: string }[]; seeded: boolean }>(
      "/jobs/intelligence/target-employers"
    ),
  criteria: () => request<any>("/jobs/intelligence/criteria"),
  insights: () => request<any>("/jobs/intelligence/insights"),
};

// ================================================================
// Career Preferences (Filter Profiles + Watch List + Source Config)
// ================================================================
export type LocationEntry = {
  id: string;
  label: string;
  type: "country" | "state" | "city" | "zip" | "region" | "special";
  priority: "high" | "medium" | "low";
  work_type_override: "any" | "on_site" | "hybrid" | "remote" | "on_site_hybrid" | "hybrid_remote";
  radius_miles: number;
  country_code: string;
  admin1: string;
  city: string;
  zip: string;
  lat: number;
  lng: number;
  is_special: boolean;
  special_kind?: "remote" | "international" | "flexible" | null;
  enabled: boolean;
  can_delete: boolean;
  min_salary_override?: number;
};
export type FilterProfile = {
  profile_id: string;
  profile_name: string;
  is_active: boolean;
  is_default: boolean;
  target_roles: string[];
  excluded_keywords: string[];
  sectors: { name: string; id: string; priority: string; enabled: boolean }[];
  locations: LocationEntry[];
  work_types: string[];
  min_salary: number;
  max_salary?: number | null;
  include_no_salary: boolean;
  experience_levels: string[];
  education_requirement: string;
  clearance_filter: string;
  ranking_weights: Record<string, number>;
  alert_min_match_score: number;
  alert_min_rank: number;
  alert_frequency_cap: number;
  quiet_hours_start: string;
  quiet_hours_end: string;
  last_applied?: string | null;
  last_modified?: string;
};
export type WatchEmployer = {
  employer_id: string;
  name: string;
  type: string;
  priority: "critical" | "high" | "medium" | "low";
  careers_url: string;
  keywords: string[];
  alert_on_any: boolean;
  alert_high_match_only: boolean;
  notes: string;
  active_jobs_count?: number;
};
export type JobSourceConfig = {
  source_id: string;
  label: string;
  kind: string;
  operational: boolean;
  update_frequency_min: number;
  paused: boolean;
  requires_key?: string;
  note?: string;
  contribution_count?: number;
  last_run_at?: string | null;
};
export const careerPrefsApi = {
  listProfiles: () => request<{ profiles: FilterProfile[] }>("/career/preferences/profiles"),
  activeProfile: () => request<FilterProfile>("/career/preferences/profiles/active"),
  createProfile: (b: Partial<FilterProfile>) =>
    request<FilterProfile>("/career/preferences/profiles", { method: "POST", body: b }),
  updateProfile: (id: string, b: Partial<FilterProfile>) =>
    request<{ ok: boolean }>(`/career/preferences/profiles/${id}`, { method: "PUT", body: b }),
  deleteProfile: (id: string) =>
    request<{ ok: boolean }>(`/career/preferences/profiles/${id}`, { method: "DELETE" }),
  applyProfile: (id: string) =>
    request<any>(`/career/preferences/profiles/${id}/apply`, { method: "POST" }),

  listWatch: () => request<{ employers: WatchEmployer[] }>("/career/preferences/watch-list"),
  addWatch: (b: Partial<WatchEmployer>) =>
    request<WatchEmployer>("/career/preferences/watch-list", { method: "POST", body: b }),
  updateWatch: (id: string, b: Partial<WatchEmployer>) =>
    request<{ ok: boolean }>(`/career/preferences/watch-list/${id}`, { method: "PUT", body: b }),
  deleteWatch: (id: string) =>
    request<{ ok: boolean }>(`/career/preferences/watch-list/${id}`, { method: "DELETE" }),

  listSourceConfigs: () => request<{ sources: JobSourceConfig[] }>("/career/preferences/sources"),
  updateSource: (id: string, b: { update_frequency_min?: number; paused?: boolean; label?: string }) =>
    request<{ ok: boolean }>(`/career/preferences/sources/${id}`, { method: "PUT", body: b }),
  createSource: (b: { label: string; kind?: string; url?: string; update_frequency_min?: number; note?: string }) =>
    request<JobSourceConfig>("/career/preferences/sources", { method: "POST", body: b }),
  deleteSource: (id: string) =>
    request<{ ok: boolean }>(`/career/preferences/sources/${id}`, { method: "DELETE" }),
  restoreDefaultSources: () =>
    request<{ ok: boolean; restored: number }>("/career/preferences/sources/restore-defaults", { method: "POST" }),

  activityLog: () => request<{ log: any[] }>("/career/preferences/activity-log"),
  rankRefresh: () => request<any>("/career/preferences/rank/refresh", { method: "POST" }),

  // ---- Geo (location search) ----
  countries: () => request<{
    regions: string[];
    region_labels: Record<string, string>;
    groups: Record<string, { code: string; name: string; region: string }[]>;
    total: number;
  }>("/career/preferences/geo/countries"),
  autocomplete: (query: string, sessionToken?: string) =>
    request<{
      predictions: {
        place_id: string;
        text: string;
        main_text: string;
        secondary_text: string;
        types: string[];
        entry_type: "country" | "state" | "city" | "zip" | "region";
        source?: string;
        // Local-source predictions carry structured fields inline:
        country_code?: string;
        country_name?: string;
        admin1?: string;
        city?: string;
        zip?: string;
        lat?: number;
        lng?: number;
      }[];
      used_source?: string;
      google_error?: string;
    }>("/career/preferences/geo/autocomplete", {
      method: "POST",
      body: { query, session_token: sessionToken },
    }),
  placeDetails: (place_id: string, sessionToken?: string) =>
    request<{
      place_id: string;
      label: string;
      display_name: string;
      entry_type: string;
      country_code: string;
      country_name: string;
      admin1: string;
      city: string;
      zip: string;
      lat: number;
      lng: number;
    }>("/career/preferences/geo/place-details", {
      method: "POST",
      body: { place_id, session_token: sessionToken },
    }),
};

