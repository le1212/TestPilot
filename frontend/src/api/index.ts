import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
});

const AUTH_TOKEN_KEY = 'testpilot_token';

export const getStoredToken = (): string | null => localStorage.getItem(AUTH_TOKEN_KEY);
export const setStoredToken = (token: string | null) => {
  if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
  else localStorage.removeItem(AUTH_TOKEN_KEY);
};

api.interceptors.request.use((config) => {
  const t = getStoredToken();
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !err.config?.url?.includes('/auth/login')) {
      setStoredToken(null);
      window.dispatchEvent(new Event('auth:logout'));
    }
    return Promise.reject(err);
  }
);

// ─── Projects ───
export const getProjects = (params?: any) => api.get('/projects', { params });
export const createProject = (data: any) => api.post('/projects', data);
export const updateProject = (id: number, data: any) => api.put(`/projects/${id}`, data);
export const deleteProject = (id: number) => api.delete(`/projects/${id}`);

// ─── Case Groups ───
export const getGroups = (params?: { project_id?: number }) => api.get('/groups', { params });
export const createGroup = (data: { project_id: number; name: string }) => api.post('/groups', data);
export const updateGroup = (id: number, data: { name?: string; collaborator_ids?: number[] }) => api.put(`/groups/${id}`, data);
export const deleteGroup = (id: number) => api.delete(`/groups/${id}`);

// ─── Test Cases ───
export const getCases = (params?: any) => api.get('/cases', { params });
export const getCaseCount = (params?: any) => api.get('/cases/count', { params });
/** 导出用例为 Excel。传 group_id 导出该分组，传 ungrouped_only 导出未分组，都不传则导出项目下全部 */
export const exportCasesExcel = (params: { project_id: number; group_id?: number; ungrouped_only?: boolean; type?: string; priority?: string; status?: string; keyword?: string; date?: string }) =>
  api.get('/cases/export', { params, responseType: 'blob' });
export const createCase = (data: any) => api.post('/cases', data);
export const getCase = (id: number) => api.get(`/cases/${id}`);
export const updateCase = (id: number, data: any) => api.put(`/cases/${id}`, data);
export const deleteCase = (id: number) => api.delete(`/cases/${id}`);
export const batchDeleteCases = (ids: number[]) => api.post('/cases/batch-delete', ids);
export const batchUpdateCases = (data: { case_ids: number[]; priority?: string; status?: string; group_id?: number }) =>
  api.post('/cases/batch-update', data);

// ─── Environments ───
export const getEnvironments = (params?: any) => api.get('/environments', { params });
export const createEnvironment = (data: any) => api.post('/environments', data);
export const updateEnvironment = (id: number, data: any) => api.put(`/environments/${id}`, data);
export const deleteEnvironment = (id: number) => api.delete(`/environments/${id}`);

// ─── Executions ───
export const getExecutions = (params?: any) => api.get('/executions', { params });
export const getExecution = (id: number) => api.get(`/executions/${id}`);
export const runTest = (data: any) => api.post('/executions/run', data);
export const batchRunTests = (data: any) => api.post('/executions/batch-run', data);
export const deleteExecution = (id: number) => api.delete(`/executions/${id}`);

// ─── Defects ───
export const getDefects = (params?: any) => api.get('/defects', { params });
export const getDefectStats = (params?: any) => api.get('/defects/stats', { params });
export const createDefect = (data: any) => api.post('/defects', data);
export const getDefect = (id: number) => api.get(`/defects/${id}`);
export const updateDefect = (id: number, data: any) => api.put(`/defects/${id}`, data);
export const deleteDefect = (id: number) => api.delete(`/defects/${id}`);
export const batchUpdateDefects = (data: { defect_ids: number[]; status?: string; severity?: string; priority?: string; assignee?: string }) =>
  api.post('/defects/batch-update', data);
export const getDefectComments = (defectId: number) => api.get(`/defects/${defectId}/comments`);
export const addDefectComment = (defectId: number, data: { content: string }) => api.post(`/defects/${defectId}/comments`, data);
export const getDefectLogs = (defectId: number) => api.get(`/defects/${defectId}/logs`);

// ─── Reports ───
export const getReports = (params?: any) => api.get('/reports', { params });
export const createReport = (data: any) => api.post('/reports', data);
export const getReport = (id: number) => api.get(`/reports/${id}`);
export const deleteReport = (id: number) => api.delete(`/reports/${id}`);

// ─── Logs ───
export const getLogs = (params?: any) => api.get('/logs', { params });
export const getLog = (id: number) => api.get(`/logs/${id}`);

// ─── Settings (Jira) ───
export const getJiraSettings = () => api.get('/settings/jira');
export const updateJiraSettings = (data: any) => api.put('/settings/jira', data);
export const testJiraConnection = (data: any) => api.post('/settings/jira/test', data);

// ─── Settings (SMTP 邮件通知) ───
export const getSmtpSettings = () => api.get('/settings/smtp');
export const updateSmtpSettings = (data: any) => api.put('/settings/smtp', data);
export const testSmtpConnection = (data: any) => api.post('/settings/smtp/test', data);

// ─── Settings (AI 模型) ───
export const getAiSettings = () => api.get('/settings/ai');
export const updateAiSettings = (data: { provider?: string; model?: string; base_url?: string }) => api.put('/settings/ai', data);

// ─── AI 分析/生成 ───
export const getAiSettingsPublic = () => api.get('/ai/settings');
export const analyzeLog = (data: { log_text?: string; execution_id?: number }) => api.post<{ analysis: string }>('/ai/analyze-log', data);
export const analyzeReport = (data: { report_id: number }) => api.post<{ analysis: string }>('/ai/analyze-report', data);
export const generateDefectFromExecution = (data: { execution_id: number }) => api.post<{
  title: string; description: string; steps_to_reproduce: string; expected_result: string; actual_result: string; severity: string;
  project_id: number; execution_id: number; test_case_id: number;
  _fallback?: boolean;
}>('/ai/generate-defect', data);
export const generateCases = (data: { project_id: number; requirement: string; preferred_type?: string }) =>
  api.post<{ cases: any[]; warnings?: string[] }>('/ai/generate-cases', data);
export const generateSteps = (data: { case_type: string; requirement: string }) =>
  api.post<{ steps: any[]; config_suggestion?: any; case_suggestion?: any; warnings?: string[] }>('/ai/generate-steps', data);

// ─── Defects Jira ───
export const pushDefectToJira = (id: number) => api.post(`/defects/${id}/push-jira`);
export const syncDefectFromJira = (id: number) => api.post(`/defects/${id}/sync-jira`);

// ─── Uploads ───
export const uploadFile = (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post('/uploads', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

// ─── Auth ───
export const login = (data: { username: string; password: string }) => api.post('/auth/login', data);
export const getMe = () => api.get('/auth/me');
export const changePassword = (data: { old_password: string; new_password: string }) => api.post('/auth/change-password', data);
export const forgotPassword = (email: string) => api.post('/auth/forgot-password', { email });
export const resetPassword = (data: { token: string; new_password: string }) => api.post('/auth/reset-password', data);

// ─── Users（管理员） ───
export const getUsers = (params?: any) => api.get('/users', { params });
export const getUsersOptions = () => api.get<{ id: number; username: string; real_name?: string }[]>('/users/options');
export const getMeProfile = () => api.get('/users/me');
export const getUserProfile = (userId: number) =>
  api.get<{ id: number; username: string; real_name?: string; email?: string; phone?: string }>(`/users/${userId}/profile`);
export const updateProfile = (data: { email?: string; phone?: string }) => api.put('/users/me', data);
export const createUser = (data: { real_name: string; is_admin?: boolean; email?: string; phone?: string }) => api.post<{ user: any; login_account: string; initial_password: string }>('/users', data);
export const updateUser = (id: number, data: { real_name?: string; password?: string; is_admin?: boolean; disabled?: boolean; email?: string; phone?: string }) => api.put(`/users/${id}`, data);
export const deleteUser = (id: number) => api.delete(`/users/${id}`);

// ─── Notifications ───
export const getNotifications = (params?: { page?: number; page_size?: number }) => api.get('/notifications', { params });
export const getUnreadCount = () => api.get('/notifications/unread-count');
export const markNotificationRead = (id: number) => api.post(`/notifications/${id}/read`);
export const markAllNotificationsRead = () => api.post('/notifications/read-all');

// ─── Dashboard ───
export const getHealth = () => api.get('/health');
export const getDashboard = () => api.get('/dashboard');

// ─── AI 答疑 ───
export const getAIConversations = () => api.get('/ai-chat/conversations');
export const getAIConversation = (id: number) => api.get(`/ai-chat/conversations/${id}`);
export const sendAIMessage = (data: { conversation_id?: number; content: string }, config?: { signal?: AbortSignal }) =>
  api.post('/ai-chat/send', data, config);
export const renameAIConversation = (id: number, title: string) => api.put(`/ai-chat/conversations/${id}`, { title });
export const deleteAIConversation = (id: number) => api.delete(`/ai-chat/conversations/${id}`);

// ─── 即时通讯 ───
export const getChatRooms = () => api.get('/chat/rooms');
export const startPrivateChat = (targetUserId: number) => api.post('/chat/private', { target_user_id: targetUserId });
export const createChatGroup = (data: { name: string; member_ids: number[] }) => api.post('/chat/group', data);
export const addChatMembers = (roomId: number, memberIds: number[]) => api.post(`/chat/rooms/${roomId}/members`, { member_ids: memberIds });
export const getChatRoomMembers = (roomId: number) => api.get(`/chat/rooms/${roomId}/members`);
export const sendChatMessage = (data: { room_id: number; content: string; msg_type?: string; reply_to_id?: number }) => api.post('/chat/send', data);
export const getChatMessages = (roomId: number, params?: { page?: number; page_size?: number; around_message_id?: number }) =>
  api.get(`/chat/rooms/${roomId}/messages`, { params });
export const searchChatMessages = (params: { keyword: string; room_id?: number; page?: number; page_size?: number }, signal?: AbortSignal) =>
  api.get('/chat/search', { params, signal });
export const searchChatUsers = (keyword?: string) => api.get('/chat/users', { params: { keyword } });
export const markChatRoomRead = (roomId: number) => api.post(`/chat/rooms/${roomId}/read`);
export const getChatUnreadTotal = () => api.get<{ total: number }>('/chat/unread-total');

export default api;
