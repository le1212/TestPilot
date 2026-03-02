import { Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ProjectProvider } from './contexts/ProjectContext';
import ErrorBoundary from './components/ErrorBoundary';
import AppLayout from './components/Layout';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import TestCases from './pages/TestCases';
import CaseEditor from './pages/CaseEditor';
import Executions from './pages/Executions';
import Reports from './pages/Reports';
import Defects from './pages/Defects';
import Settings from './pages/Settings';
import Logs from './pages/Logs';
import Environments from './pages/Environments';
import Projects from './pages/Projects';
import Guide from './pages/Guide';
import UserManagement from './pages/UserManagement';
import AIChat from './pages/AIChat';
import Messaging from './pages/Messaging';

function ProtectedRoutes() {
  const { token, loading } = useAuth();
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/cases" element={<TestCases />} />
        <Route path="/cases/new" element={<CaseEditor />} />
        <Route path="/cases/:id" element={<CaseEditor />} />
        <Route path="/executions" element={<Executions />} />
        <Route path="/executions/:id" element={<Executions />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/reports/:id" element={<Reports />} />
        <Route path="/defects" element={<Defects />} />
        <Route path="/defects/:id" element={<Defects />} />
        <Route path="/logs" element={<Logs />} />
        <Route path="/logs/execution/:id" element={<Logs />} />
        <Route path="/environments" element={<Environments />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/guide" element={<Guide />} />
        <Route path="/ai-chat" element={<AIChat />} />
        <Route path="/messaging" element={<Messaging />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/users" element={<UserManagement />} />
      </Routes>
    </AppLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ProjectProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/*" element={<ProtectedRoutes />} />
        </Routes>
        </ProjectProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
