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
  delete: (id: string) => request(`/investments/${id}`, { method: "DELETE" }),
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

// ----------------- Health -----------------
export const healthApi = {
  get: () => request<any>("/health-profile"),
  update: (data: any) =>
    request<any>("/health-profile", { method: "PUT", body: data }),
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
  chat: (message: string, session_id?: string) =>
    request<{ response: string; session_id: string }>("/chat", {
      method: "POST",
      body: { message, session_id },
    }),
  chatHistory: (session_id?: string) =>
    request<any[]>(`/chat/history${session_id ? `?session_id=${session_id}` : ""}`),
};

// ----------------- Alerts -----------------
export const alertsApi = {
  list: () =>
    request<{ alerts: any[]; count: number }>("/alerts"),
};

// ----------------- Seed -----------------
export const seedDemo = () => request<any>("/seed-demo", { method: "POST" });
