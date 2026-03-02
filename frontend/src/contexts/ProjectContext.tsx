import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { getProjects } from '../api';

const PROJECT_CONTEXT_KEY = 'testpilot_project_id';

interface ProjectContextValue {
  projectId: number | null;
  setProjectId: (id: number | null) => void;
  projects: { id: number; name: string }[];
  refreshProjects: () => Promise<void>;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [projectId, setProjectIdState] = useState<number | null>(() => {
    try {
      const s = localStorage.getItem(PROJECT_CONTEXT_KEY);
      if (s) {
        const n = parseInt(s, 10);
        if (!Number.isNaN(n)) return n;
      }
    } catch {
      // ignore
    }
    return null;
  });
  const [projects, setProjects] = useState<{ id: number; name: string }[]>([]);

  const refreshProjects = useCallback(async () => {
    try {
      const res = await getProjects();
      setProjects(Array.isArray(res?.data) ? res.data : []);
    } catch {
      setProjects([]);
    }
  }, []);

  const setProjectId = useCallback((id: number | null) => {
    setProjectIdState(id);
    try {
      if (id != null) {
        localStorage.setItem(PROJECT_CONTEXT_KEY, String(id));
      } else {
        localStorage.removeItem(PROJECT_CONTEXT_KEY);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  // 无项目数据或当前选中的项目不在列表中时清空 projectId，避免下拉框显示无效默认值（如 1）
  useEffect(() => {
    if (projectId == null) return;
    if (projects.length === 0 || !projects.some((p) => p.id === projectId)) {
      setProjectIdState(null);
      try {
        localStorage.removeItem(PROJECT_CONTEXT_KEY);
      } catch {
        // ignore
      }
    }
  }, [projects, projectId]);

  const value: ProjectContextValue = {
    projectId,
    setProjectId,
    projects,
    refreshProjects,
  };

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProjectContext(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProjectContext must be used within ProjectProvider');
  return ctx;
}
