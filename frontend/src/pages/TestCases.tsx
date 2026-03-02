import React, { useCallback, useEffect, useState } from 'react';
import {
  Card, Button, Table, Tag, Space, Input, Select, message, Popconfirm,
  Typography, Tooltip, Dropdown, Row, Col, DatePicker, Modal, Form,
} from 'antd';
import dayjs from 'dayjs';
import {
  PlusOutlined, DeleteOutlined, PlayCircleOutlined, SearchOutlined,
  ApiOutlined, GlobalOutlined, MobileOutlined, AppstoreOutlined,
  EditOutlined, ThunderboltOutlined, EyeOutlined, RobotOutlined, PlusCircleOutlined,
  FolderOutlined, RightOutlined, DownOutlined, UpOutlined, ExportOutlined,
  ShareAltOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { getCases, deleteCase, batchDeleteCases, batchUpdateCases, runTest, batchRunTests, getProjects, getEnvironments, generateCases, createCase, getGroups, createGroup, updateGroup, deleteGroup, getUsersOptions, exportCasesExcel } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useProjectContext } from '../contexts/ProjectContext';
import { formatDateTimeZh } from '../utils/date';
import ResizableTitle from '../components/ResizableTitle';
import ShareToIM from '../components/ShareToIM';

const typeMap: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  api: { label: '接口', icon: <ApiOutlined />, color: '#0369a1' },
  web: { label: '网页', icon: <GlobalOutlined />, color: '#059669' },
  app: { label: 'App', icon: <MobileOutlined />, color: '#d97706' },
  miniapp: { label: '小程序', icon: <AppstoreOutlined />, color: '#0d9488' },
};

const priorityMap: Record<string, { color: string }> = {
  low: { color: '#64748b' },
  medium: { color: '#0369a1' },
  high: { color: '#d97706' },
  critical: { color: '#dc2626' },
};

const priorityLabel: Record<string, string> = {
  low: '低',
  medium: '中',
  high: '高',
  critical: '严重',
};

const statusLabel: Record<string, string> = {
  draft: '草稿',
  active: '启用',
  deprecated: '废弃',
};

const statusMap: Record<string, { color: string }> = {
  draft: { color: 'default' },
  active: { color: 'success' },
  deprecated: { color: 'warning' },
};

const CASES_PAGE_PROJECT_KEY = 'testcases_selected_project_id';

const TestCases: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const projectCtx = useProjectContext();
  const [cases, setCases] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [envs, setEnvs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [filters, setFilters] = useState<any>(() => {
    try {
      const saved = sessionStorage.getItem(CASES_PAGE_PROJECT_KEY);
      const projectId = saved ? parseInt(saved, 10) : undefined;
      if (projectId && !Number.isNaN(projectId)) {
        return { keyword: '', project_id: projectId, type: undefined, priority: undefined, tags: '', date: undefined };
      }
    } catch {
      // ignore
    }
    return { keyword: '', project_id: undefined, type: undefined, priority: undefined, tags: '', date: undefined };
  });
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Record<string, boolean>>({});
  const [aiGenOpen, setAiGenOpen] = useState(false);
  const [aiGenLoading, setAiGenLoading] = useState(false);
  const [generatedCasesList, setGeneratedCasesList] = useState<any[]>([]);
  const [aiGenForm] = Form.useForm();
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [groups, setGroups] = useState<any[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [editingGroupName, setEditingGroupName] = useState('');
  const [aiModalGroups, setAiModalGroups] = useState<any[]>([]);
  const [groupCollaboratorModal, setGroupCollaboratorModal] = useState<any | null>(null);
  const [groupCollaboratorIds, setGroupCollaboratorIds] = useState<number[]>([]);
  const [userOptions, setUserOptions] = useState<{ id: number; username: string; real_name?: string }[]>([]);
  /** 当前正在导出的分组 id，或 'ungrouped' 表示未分组，用于按钮 loading */
  const [exportingKey, setExportingKey] = useState<number | 'ungrouped' | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState<{ id: number; name: string } | null>(null);

  const defaultColWidths: Record<string, number> = { name: 200, project_name: 120, type: 100, priority: 80, status: 80, created_by_name: 120, updated_at: 170, actions: 200 };
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(defaultColWidths);
  const handleResize = useCallback((key: string, w: number) => setColumnWidths((prev) => ({ ...prev, [key]: w })), []);

  const canDelete = (record: any) =>
    user && (user.is_admin || (record.created_by_id != null && record.created_by_id === user.id));
  const canEdit = (record: any) =>
    user && (user.is_admin || (record.created_by_id != null && record.created_by_id === user.id)
      || (Array.isArray(record.collaborator_ids) && record.collaborator_ids.includes(user.id)));
  const canRun = (record: any) => canEdit(record) && record.status === 'active';
  const canManageGroup = (group: any) =>
    user && (user.is_admin || (group.created_by_id != null && group.created_by_id === user.id)
      || (Array.isArray(group.collaborator_ids) && group.collaborator_ids.includes(user.id)));
  const selectedRows = cases.filter((c) => selectedKeys.includes(c.id));
  const deletableSelectedIds = selectedRows.filter((r) => canDelete(r)).map((r) => r.id);
  const runnableSelectedIds = selectedRows.filter((r) => canRun(r)).map((r) => r.id);
  const runnableCaseIds = cases.filter((r) => canRun(r)).map((r) => r.id);
  const hasAnyRunnable = runnableCaseIds.length > 0;

  const loadProjects = async () => {
    setProjectsLoading(true);
    try {
      const [projRes, envRes] = await Promise.all([getProjects(), getEnvironments()]);
      setProjects(Array.isArray(projRes?.data) ? projRes.data : []);
      setEnvs(Array.isArray(envRes?.data) ? envRes.data : []);
    } catch {
      message.error('加载项目失败');
    }
    setProjectsLoading(false);
  };

  const selectedProjectId = filters.project_id ?? null;
  /** 当前列表对应的筛选条件（与展示的 cases 一致），用于 hasActiveFilter：只有点击搜索后才会更新 */
  const [appliedFilters, setAppliedFilters] = useState<any>({ keyword: '', type: undefined, priority: undefined, date: undefined });
  const hasActiveFilter = !!(appliedFilters.keyword?.trim() || appliedFilters.type || appliedFilters.priority || appliedFilters.tags?.trim() || appliedFilters.date);

  const loadCases = async (filterOverride?: any) => {
    const f = filterOverride ?? filters;
    const pid = f.project_id ?? projectCtx?.projectId;
    if (pid == null) {
      setCases([]);
      return;
    }
    setAppliedFilters({ keyword: f.keyword ?? '', type: f.type, priority: f.priority, tags: f.tags ?? '', date: f.date });
    setLoading(true);
    try {
      const params: any = { project_id: pid, page: 1, page_size: 200 };
      if (f.keyword) params.keyword = f.keyword;
      if (f.type) params.type = f.type;
      if (f.priority) params.priority = f.priority;
      if (f.tags?.trim()) params.tags = f.tags.trim();
      if (f.date) params.date = f.date;
      const caseRes = await getCases(params);
      setCases(Array.isArray(caseRes?.data) ? caseRes.data : []);
    } catch {
      message.error('加载用例失败');
    }
    setLoading(false);
  };

  const loadGroups = async () => {
    if (selectedProjectId == null) {
      setGroups([]);
      return;
    }
    setGroupsLoading(true);
    try {
      const res = await getGroups({ project_id: selectedProjectId });
      setGroups(Array.isArray(res?.data) ? res.data : []);
    } catch {
      message.error('加载分组失败');
    }
    setGroupsLoading(false);
  };

  useEffect(() => {
    loadProjects();
  }, []);

  // 无项目数据时清空项目选择，避免下拉框显示无效的默认值（如 1）
  useEffect(() => {
    const pid = filters.project_id;
    if (pid == null) return;
    if (projects.length === 0 || !projects.some((p: any) => p.id === pid)) {
      setFilters((prev: any) => ({ ...prev, project_id: undefined }));
      try {
        sessionStorage.removeItem(CASES_PAGE_PROJECT_KEY);
      } catch {
        // ignore
      }
    }
  }, [projects, filters.project_id]);

  useEffect(() => {
    const s = location.state as any;
    if (s?.openProjectId != null) {
      setFilters((prev: any) => ({ ...prev, project_id: s.openProjectId }));
      try {
        sessionStorage.setItem(CASES_PAGE_PROJECT_KEY, String(s.openProjectId));
      } catch {
        // ignore
      }
    }
    if (s?.expandGroupId != null) {
      const key = s.expandGroupId === 'ungrouped' ? 'ungrouped' : `g${s.expandGroupId}`;
      setCollapsedGroupIds((prev) => ({ ...prev, [key]: false }));
    }
    if (s?.openProjectId != null || s?.expandGroupId != null) {
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state]);

  useEffect(() => {
    const pid = filters.project_id ?? projectCtx?.projectId;
    if (pid != null && filters.project_id == null) {
      setFilters((prev: any) => ({ ...prev, project_id: pid }));
    }
  }, [projectCtx?.projectId]);

  useEffect(() => {
    const pid = filters.project_id;
    if (pid != null) {
      try {
        sessionStorage.setItem(CASES_PAGE_PROJECT_KEY, String(pid));
        projectCtx?.setProjectId(pid);
      } catch {
        // ignore
      }
    }
  }, [filters.project_id]);

  useEffect(() => {
    const pid = filters.project_id ?? projectCtx?.projectId;
    if (pid == null) return;
    loadCases();
  }, [filters.project_id, projectCtx?.projectId]);

  useEffect(() => {
    loadGroups();
  }, [selectedProjectId]);

  const handleSearch = () => loadCases();

  /** 导出 Excel：groupId 为某分组 id 时导出该分组；ungrouped 为 true 时仅导出未分组；都不传时导出项目下全部 */
  const handleExportExcel = async (groupId?: number, ungrouped?: boolean) => {
    if (selectedProjectId == null) {
      message.warning('请先选择项目');
      return;
    }
    const key = ungrouped ? 'ungrouped' : (groupId ?? null);
    setExportingKey(key);
    try {
      const params: any = { project_id: selectedProjectId };
      if (ungrouped) params.ungrouped_only = true;
      else if (groupId != null) params.group_id = groupId;
      if (filters.keyword) params.keyword = filters.keyword;
      if (filters.type) params.type = filters.type;
      if (filters.priority) params.priority = filters.priority;
      if (filters.date) params.date = filters.date;
      const res = await exportCasesExcel(params);
      const blob = res.data as Blob;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      const scopeName = ungrouped ? '未分组' : (groups.find((g: any) => g.id === groupId)?.name ?? '全部');
      a.download = `用例导出_${selectedProject?.name ?? selectedProjectId}_${scopeName}_${dayjs().format('YYYY-MM-DD_HH-mm')}.xlsx`;
      a.href = url;
      a.click();
      window.URL.revokeObjectURL(url);
      message.success('导出成功');
    } catch (e: any) {
      const data = e?.response?.data;
      if (data instanceof Blob) {
        try {
          const text = await data.text();
          const j = JSON.parse(text);
          message.error(j.detail || '导出失败');
        } catch {
          message.error('导出失败');
        }
      } else {
        message.error(typeof data?.detail === 'string' ? data.detail : '导出失败');
      }
    }
    setExportingKey(null);
  };

  const handleDelete = async (id: number) => {
    await deleteCase(id);
    message.success('删除成功');
    loadCases();
    loadGroups();
    loadProjects();
  };

  const handleAddGroup = async () => {
    if (selectedProjectId == null) return;
    try {
      await createGroup({ project_id: selectedProjectId, name: '新分组' });
      message.success('分组已添加');
      loadGroups();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || '添加分组失败');
    }
  };

  const handleSaveGroupName = async (group: any) => {
    if (editingGroupId !== group.id || !editingGroupName.trim()) {
      setEditingGroupId(null);
      return;
    }
    try {
      await updateGroup(group.id, { name: editingGroupName.trim() });
      message.success('已保存');
      setEditingGroupId(null);
      loadGroups();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || '保存失败');
    }
  };

  const handleDeleteGroup = async (group: any) => {
    if (!canManageGroup(group)) return;
    try {
      await deleteGroup(group.id);
      message.success('分组已删除');
      loadGroups();
      loadCases();
      loadProjects();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || '删除失败');
    }
  };

  const openGroupCollaboratorModal = (group: any) => {
    setGroupCollaboratorModal(group);
    setGroupCollaboratorIds(Array.isArray(group.collaborator_ids) ? group.collaborator_ids : []);
    getUsersOptions().then((r) => setUserOptions(Array.isArray(r?.data) ? r.data : [])).catch(() => []);
  };

  const handleSaveGroupCollaborators = async () => {
    if (!groupCollaboratorModal) return;
    try {
      await updateGroup(groupCollaboratorModal.id, { collaborator_ids: groupCollaboratorIds });
      message.success('协作者已保存');
      setGroupCollaboratorModal(null);
      loadGroups();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || '保存失败');
    }
  };

  const handleBatchDelete = async () => {
    if (deletableSelectedIds.length === 0) return;
    await batchDeleteCases(deletableSelectedIds);
    message.success('批量删除成功');
    setSelectedKeys([]);
    loadCases();
    loadGroups();
    loadProjects();
  };

  const handleRun = async (caseId: number) => {
    message.loading({ content: '执行中...', key: 'run' });
    try {
      const res = await runTest({ test_case_id: caseId });
      if (res.data.status === 'passed') {
        message.success({ content: '执行通过', key: 'run' });
      } else {
        message.error({ content: '执行失败', key: 'run' });
      }
    } catch {
      message.error({ content: '执行出错', key: 'run' });
    }
  };

  const handleAiGenerate = async () => {
    const values = await aiGenForm.validateFields().catch(() => null);
    if (!values?.project_id || !(values.requirement || '').trim()) {
      message.warning('请选择项目并填写需求描述');
      return;
    }
    setAiGenLoading(true);
    setGeneratedCasesList([]);
    try {
      const res = await generateCases({
        project_id: values.project_id,
        requirement: values.requirement.trim(),
        preferred_type: values.preferred_type || undefined,
      });
      setGeneratedCasesList(Array.isArray(res.data?.cases) ? res.data.cases : []);
      if (!(res.data?.cases?.length > 0)) message.info('未生成到可用用例，可调整需求描述后重试');
      const warnings = res.data?.warnings;
      if (Array.isArray(warnings) && warnings.length > 0) {
        message.warning(warnings.join(' '));
      }
    } catch {
      message.error('AI 生成失败');
    }
    setAiGenLoading(false);
  };

  const addGeneratedCase = async (item: any) => {
    const values = aiGenForm.getFieldsValue();
    const project_id = values.project_id;
    if (!project_id) {
      message.warning('请先选择项目');
      return;
    }
    const group_id = values.group_id ?? undefined;
    try {
      await createCase({
        project_id,
        group_id: group_id || undefined,
        name: item.name || '未命名用例',
        description: item.description || '',
        type: item.type || 'api',
        priority: item.priority || 'medium',
        status: 'active',
        tags: [],
        config: item.config || {},
      });
      message.success('已添加用例');
      setGeneratedCasesList((prev) => prev.filter((c) => c !== item));
      loadCases();
      loadGroups();
      loadProjects();
    } catch {
      message.error('添加失败');
    }
  };

  const handleBatchRun = async () => {
    const ids = selectedKeys.length > 0 ? runnableSelectedIds : runnableCaseIds;
    if (ids.length === 0) {
      message.warning(selectedKeys.length > 0 ? '所选用例中无您有权限执行的' : '当前列表无您有权限执行的用例');
      return;
    }
    return handleBatchRunWithIds(ids);
  };

  const handleBatchUpdate = async (field: 'priority' | 'status' | 'group', value: string | number) => {
    const ids = selectedKeys as number[];
    if (ids.length === 0) {
      message.warning('请先选择用例');
      return;
    }
    const payload: any = { case_ids: ids };
    if (field === 'priority') payload.priority = value;
    else if (field === 'status') payload.status = value;
    else if (field === 'group') payload.group_id = value === 'ungrouped' ? null : value;
    try {
      const res = await batchUpdateCases(payload);
      message.success(`已更新 ${res.data?.updated ?? 0} 条用例`);
      setSelectedKeys([]);
      loadCases();
      loadGroups();
    } catch {
      message.error('批量更新失败');
    }
  };

  const handleBatchRunWithIds = async (ids: number[]) => {
    if (ids.length === 0) return;
    setRunning(true);
    message.loading({ content: `正在批量执行 ${ids.length} 条用例...`, key: 'batchRun' });
    try {
      await batchRunTests({ test_case_ids: ids });
      message.success({ content: `已提交 ${ids.length} 条用例执行`, key: 'batchRun' });
      setSelectedKeys([]);
    } catch {
      message.error({ content: '批量执行失败', key: 'batchRun' });
    }
    setRunning(false);
  };

  const columns = [
    {
      title: <ResizableTitle dataKey="name" width={columnWidths.name} minWidth={100} onResize={handleResize}>用例名称</ResizableTitle>,
      dataIndex: 'name',
      key: 'name',
      width: columnWidths.name,
      ellipsis: true,
      render: (text: string, record: any) => (
        <Typography.Link onClick={() => navigate(`/cases/${record.id}`, { state: { expandGroupId: record.group_id != null ? record.group_id : 'ungrouped' } })}>
          {text}
        </Typography.Link>
      ),
    },
    {
      title: <ResizableTitle dataKey="project_name" width={columnWidths.project_name} minWidth={80} onResize={handleResize}>项目</ResizableTitle>,
      dataIndex: 'project_name',
      key: 'project_name',
      width: columnWidths.project_name,
      ellipsis: true,
      render: (v: string) => v || '-',
    },
    {
      title: <ResizableTitle dataKey="type" width={columnWidths.type} minWidth={70} onResize={handleResize}>类型</ResizableTitle>,
      dataIndex: 'type',
      key: 'type',
      width: columnWidths.type,
      render: (type: string) => {
        const t = typeMap[type] || { label: type, icon: null, color: '#999' };
        return (
          <Tag style={{ color: t.color, borderColor: t.color, background: `${t.color}10` }}>
            <Space size={4}>{t.icon}{t.label}</Space>
          </Tag>
        );
      },
    },
    {
      title: <ResizableTitle dataKey="priority" width={columnWidths.priority} minWidth={60} onResize={handleResize}>优先级</ResizableTitle>,
      dataIndex: 'priority',
      key: 'priority',
      width: columnWidths.priority,
      render: (p: string) => (
        <Tag color={priorityMap[p]?.color}>{priorityLabel[p] || p}</Tag>
      ),
    },
    {
      title: <ResizableTitle dataKey="status" width={columnWidths.status} minWidth={60} onResize={handleResize}>状态</ResizableTitle>,
      dataIndex: 'status',
      key: 'status',
      width: columnWidths.status,
      render: (s: string) => (
        <Tag color={statusMap[s]?.color}>{statusLabel[s] || s}</Tag>
      ),
    },
    {
      title: <ResizableTitle dataKey="created_by_name" width={columnWidths.created_by_name} minWidth={80} onResize={handleResize}>创建人</ResizableTitle>,
      dataIndex: 'created_by_name',
      key: 'created_by_name',
      width: columnWidths.created_by_name,
      ellipsis: true,
      render: (v: string) => v || '-',
    },
    {
      title: <ResizableTitle dataKey="updated_at" width={columnWidths.updated_at} minWidth={120} onResize={handleResize}>更新时间</ResizableTitle>,
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: columnWidths.updated_at,
      render: (t: string) => formatDateTimeZh(t),
    },
    {
      title: <ResizableTitle dataKey="actions" width={columnWidths.actions} minWidth={140} onResize={handleResize}>操作</ResizableTitle>,
      key: 'actions',
      width: columnWidths.actions,
      fixed: 'right' as const,
      render: (_: any, record: any) => (
        <Space>
          {canEdit(record) ? (
            canRun(record) ? (
              <Tooltip title="执行">
                <Popconfirm title="确定执行该用例吗？" okText="确定" cancelText="取消" onConfirm={() => handleRun(record.id)}>
                  <Button
                    type="link"
                    size="small"
                    icon={<ThunderboltOutlined />}
                    style={{ color: '#059669' }}
                  >
                    执行
                  </Button>
                </Popconfirm>
              </Tooltip>
            ) : (
              <Tooltip title="状态非启用，不可执行">
                <span>
                  <Button type="link" size="small" icon={<ThunderboltOutlined />} disabled style={{ color: '#94a3b8' }}>
                    执行
                  </Button>
                </span>
              </Tooltip>
            )
          ) : null}
          {canEdit(record) ? (
            <Popconfirm title="确定编辑该用例吗？" okText="确定" cancelText="取消" onConfirm={() => navigate(`/cases/${record.id}`, { state: { expandGroupId: record.group_id != null ? record.group_id : 'ungrouped' } })}>
              <Button type="link" size="small" icon={<EditOutlined />}>编辑</Button>
            </Popconfirm>
          ) : (
            <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => navigate(`/cases/${record.id}`, { state: { expandGroupId: record.group_id != null ? record.group_id : 'ungrouped' } })}>查看</Button>
          )}
          <Button type="link" size="small" icon={<ShareAltOutlined />} onClick={() => { setShareTarget({ id: record.id, name: record.name }); setShareOpen(true); }}>分享</Button>
          {canDelete(record) && (
            <Popconfirm title="确定删除该用例吗？" okText="确定删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={() => handleDelete(record.id)}>
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  return (
    <div>
      <div className="page-title-block">
        <h1>用例管理</h1>
        <p>请先选择项目，再在该项目下查看、筛选、创建用例</p>
      </div>

      <Card className="page-card" bordered={false} style={{ marginBottom: 16 }}>
        <Row gutter={[16, 16]} className="filter-bar">
          <Col xs={24} sm={12} md={5}>
            <Select
              placeholder="请选择项目（必选）"
              value={projects.length > 0 && projects.some((p: any) => p.id === filters.project_id) ? filters.project_id : undefined}
              onChange={(v) => setFilters({ ...filters, project_id: v })}
              style={{ width: '100%' }}
              allowClear
              options={projects.map((p: any) => ({ label: p.name, value: p.id }))}
            />
          </Col>
          <Col xs={24} sm={12} md={5}>
            <Input
              placeholder="搜索用例名称"
              prefix={<SearchOutlined />}
              value={filters.keyword}
              onChange={(e) => setFilters({ ...filters, keyword: e.target.value })}
              onPressEnter={handleSearch}
              allowClear
              disabled={selectedProjectId == null}
              style={{ width: '100%' }}
            />
          </Col>
          <Col xs={24} sm={12} md={4}>
            <Select
              placeholder="用例类型"
              value={filters.type}
              onChange={(v) => setFilters({ ...filters, type: v })}
              style={{ width: '100%' }}
              allowClear
              disabled={selectedProjectId == null}
              options={[
                { label: '全部类型', value: undefined },
                { label: '接口测试', value: 'api' },
                { label: 'Web测试', value: 'web' },
                { label: 'App测试', value: 'app' },
                { label: '小程序测试', value: 'miniapp' },
              ]}
            />
          </Col>
          <Col xs={24} sm={12} md={4}>
            <Select
              placeholder="优先级"
              value={filters.priority}
              onChange={(v) => setFilters({ ...filters, priority: v })}
              style={{ width: '100%' }}
              allowClear
              disabled={selectedProjectId == null}
              options={[
                { label: '全部优先级', value: undefined },
                { label: '低', value: 'low' },
                { label: '中', value: 'medium' },
                { label: '高', value: 'high' },
                { label: '严重', value: 'critical' },
              ]}
            />
          </Col>
          <Col xs={24} sm={12} md={4}>
            <Input
              placeholder="标签（逗号分隔）"
              value={filters.tags}
              onChange={(e) => setFilters({ ...filters, tags: e.target.value })}
              onPressEnter={handleSearch}
              allowClear
              disabled={selectedProjectId == null}
              style={{ width: '100%' }}
            />
          </Col>
          <Col xs={24} sm={12} md={3}>
            <DatePicker
              placeholder="按日期"
              value={filters.date ? dayjs(filters.date) : null}
              onChange={(_, dateStr) => setFilters({ ...filters, date: (typeof dateStr === 'string' && dateStr) ? dateStr : undefined })}
              style={{ width: '100%' }}
              allowClear
              disabled={selectedProjectId == null}
            />
          </Col>
          <Col xs={24} sm={12} md={2}>
            <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch} block disabled={selectedProjectId == null}>搜索</Button>
          </Col>
        </Row>
      </Card>

      <Card
        className="page-card"
        bordered={false}
        title={
          selectedProjectId != null
            ? <Space><span>{selectedProject?.name ?? '项目'}</span><Typography.Text type="secondary">共 {cases.length} 条用例</Typography.Text></Space>
            : <Space><span>测试项目</span><Typography.Text type="secondary">共 0 条用例</Typography.Text></Space>
        }
        extra={
          <Space>
            {selectedProjectId != null && selectedKeys.length > 0 && (
              <>
                <Dropdown
                  menu={{
                    items: [
                      {
                        key: 'priority',
                        label: '批量修改优先级',
                        children: [
                          { key: 'low', label: '低', onClick: () => handleBatchUpdate('priority', 'low') },
                          { key: 'medium', label: '中', onClick: () => handleBatchUpdate('priority', 'medium') },
                          { key: 'high', label: '高', onClick: () => handleBatchUpdate('priority', 'high') },
                          { key: 'critical', label: '严重', onClick: () => handleBatchUpdate('priority', 'critical') },
                        ],
                      },
                      {
                        key: 'status',
                        label: '批量修改状态',
                        children: [
                          { key: 'draft', label: '草稿', onClick: () => handleBatchUpdate('status', 'draft') },
                          { key: 'active', label: '启用', onClick: () => handleBatchUpdate('status', 'active') },
                          { key: 'deprecated', label: '废弃', onClick: () => handleBatchUpdate('status', 'deprecated') },
                        ],
                      },
                      {
                        key: 'group',
                        label: '批量移动分组',
                        children: [
                          { key: 'ungrouped', label: '移至未分组', onClick: () => handleBatchUpdate('group', 'ungrouped') },
                          ...groups.map((g: any) => ({ key: String(g.id), label: g.name, onClick: () => handleBatchUpdate('group', g.id) })),
                        ],
                      },
                    ],
                  }}
                >
                  <Button size="small">批量操作 ({selectedKeys.length})</Button>
                </Dropdown>
                {deletableSelectedIds.length > 0 && (
                  <Popconfirm title={`确认删除 ${deletableSelectedIds.length} 条用例?`} onConfirm={handleBatchDelete}>
                    <Button danger icon={<DeleteOutlined />} size="small">批量删除 ({deletableSelectedIds.length})</Button>
                  </Popconfirm>
                )}
              </>
            )}
            <Popconfirm title="确定添加分组吗？" okText="确定" cancelText="取消" onConfirm={handleAddGroup}>
              <Button type="primary" icon={<PlusOutlined />} size="small" disabled={selectedProjectId == null} title={selectedProjectId == null ? '请先选择上方测试项目' : undefined}>添加分组</Button>
            </Popconfirm>
          </Space>
        }
      >
        {selectedProjectId == null ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <Typography.Text type="secondary">请先选择上方「测试项目」，再在此处添加分组或新建用例</Typography.Text>
          </div>
        ) : groupsLoading ? (
            <div style={{ padding: 24, textAlign: 'center' }}><Typography.Text type="secondary">加载分组中...</Typography.Text></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {groups.map((g: any) => {
                const groupCases = cases.filter((c: any) => c.group_id === g.id);
                if (hasActiveFilter && groupCases.length === 0) return null;
                const runnableInGroup = groupCases.filter((r: any) => canRun(r));
                const selectedInGroup = groupCases.filter((c: any) => selectedKeys.includes(c.id));
                const runnableSelectedInGroup = selectedInGroup.filter((r: any) => canRun(r));
                const collapsed = collapsedGroupIds[`g${g.id}`] !== false;
                return (
                  <div key={g.id} style={{ border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden' }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        background: '#fafafa',
                        borderBottom: collapsed ? undefined : '1px solid #f0f0f0',
                        flexWrap: 'wrap',
                        gap: 8,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                        <Button
                          type="text"
                          size="small"
                          icon={collapsed ? <RightOutlined /> : <DownOutlined />}
                          onClick={() => setCollapsedGroupIds((prev) => ({ ...prev, [`g${g.id}`]: !prev[`g${g.id}`] }))}
                          style={{ padding: '0 4px' }}
                        />
                        {editingGroupId === g.id ? (
                          <Input
                            size="small"
                            value={editingGroupName}
                            onChange={(e) => setEditingGroupName(e.target.value)}
                            onPressEnter={() => handleSaveGroupName(g)}
                            onBlur={() => handleSaveGroupName(g)}
                            style={{ width: 200 }}
                            autoFocus
                          />
                        ) : (
                          <Typography.Text strong style={{ fontSize: 14 }}>{g.name}</Typography.Text>
                        )}
                        {editingGroupId !== g.id && canManageGroup(g) && (
                          <>
                            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => { setEditingGroupId(g.id); setEditingGroupName(g.name); }}>编辑</Button>
                            <Button type="link" size="small" onClick={() => openGroupCollaboratorModal(g)}>协作者</Button>
                          </>
                        )}
                        <Tag color="default">{g.case_count ?? groupCases.length} 用例</Tag>
                      </div>
                      <Space size="small" wrap>
                        <Button icon={<ExportOutlined />} size="small" loading={exportingKey === g.id} onClick={() => handleExportExcel(g.id)} title="导出该分组为 Excel">导出 Excel</Button>
                        {runnableInGroup.length > 0 && (
                          selectedInGroup.length > 0 ? (
                            <Popconfirm title="确定批量执行所选用例吗？" okText="确定" cancelText="取消" onConfirm={() => handleBatchRunWithIds(runnableSelectedInGroup.map((r: any) => r.id))}>
                              <Button type="primary" icon={<ThunderboltOutlined />} loading={running} size="small">批量执行 ({runnableSelectedInGroup.length})</Button>
                            </Popconfirm>
                          ) : (
                            <Popconfirm title="确定执行该分组全部用例吗？" okText="确定" cancelText="取消" onConfirm={() => handleBatchRunWithIds(runnableInGroup.map((r: any) => r.id))}>
                              <Button icon={<ThunderboltOutlined />} loading={running} size="small">执行全部 ({runnableInGroup.length})</Button>
                            </Popconfirm>
                          )
                        )}
                        {canManageGroup(g) && (
                          <>
                            <Button icon={<RobotOutlined />} size="small" onClick={() => { setAiGenOpen(true); setGeneratedCasesList([]); aiGenForm.setFieldsValue({ project_id: selectedProjectId, group_id: g.id, preferred_type: undefined }); setAiModalGroups(groups); }}>AI 生成用例</Button>
                            <Popconfirm title="确定新建用例吗？将跳转到编辑页。" okText="确定" cancelText="取消" onConfirm={() => navigate('/cases/new', { state: { project_id: selectedProjectId, group_id: g.id } })}>
                              <Button type="primary" size="small" icon={<PlusOutlined />}>新建用例</Button>
                            </Popconfirm>
                            <Popconfirm title="确认删除该分组？其下用例也将一并删除，且不可恢复。" onConfirm={() => handleDeleteGroup(g)}>
                              <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
                            </Popconfirm>
                          </>
                        )}
                      </Space>
                    </div>
                    {!collapsed && (
                      <Table
                        dataSource={groupCases}
                        columns={columns}
                        rowKey="id"
                        loading={loading}
                        tableLayout="fixed"
                        pagination={false}
                        size="small"
                        scroll={{ x: Object.values(columnWidths).reduce((a, b) => a + b, 0) }}
                        rowSelection={{ selectedRowKeys: selectedKeys, onChange: setSelectedKeys }}
                        style={{ margin: 0 }}
                      />
                    )}
                  </div>
                );
              })}
              {cases.filter((c: any) => !c.group_id).length > 0 && (() => {
                const ungrouped = cases.filter((c: any) => !c.group_id);
                const runnableUngrouped = ungrouped.filter((r: any) => canRun(r));
                const selectedUngrouped = ungrouped.filter((c: any) => selectedKeys.includes(c.id));
                const runnableSelectedUngrouped = selectedUngrouped.filter((r: any) => canRun(r));
                const collapsed = collapsedGroupIds.ungrouped !== false;
                return (
                  <div key="ungrouped" style={{ border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#fafafa', borderBottom: collapsed ? undefined : '1px solid #f0f0f0', flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Button type="text" size="small" icon={collapsed ? <RightOutlined /> : <DownOutlined />} onClick={() => setCollapsedGroupIds((prev) => ({ ...prev, ungrouped: !prev.ungrouped }))} style={{ padding: '0 4px' }} />
                        <Typography.Text type="secondary">未分组</Typography.Text>
                        <Tag color="default">{ungrouped.length} 用例</Tag>
                      </div>
                      <Space size="small">
                        <Button icon={<ExportOutlined />} size="small" loading={exportingKey === 'ungrouped'} onClick={() => handleExportExcel(undefined, true)} title="导出未分组用例为 Excel">导出 Excel</Button>
                        <Button icon={<RobotOutlined />} size="small" onClick={() => { setAiGenOpen(true); setGeneratedCasesList([]); aiGenForm.setFieldsValue({ project_id: selectedProjectId, group_id: undefined, preferred_type: undefined }); setAiModalGroups(groups); }}>AI 生成用例</Button>
                        {runnableUngrouped.length > 0 && (selectedUngrouped.length > 0 ? (
                          <Popconfirm key="batch" title="确定批量执行所选用例吗？" okText="确定" cancelText="取消" onConfirm={() => handleBatchRunWithIds(runnableSelectedUngrouped.map((r: any) => r.id))}>
                            <Button type="primary" icon={<ThunderboltOutlined />} loading={running} size="small">批量执行 ({runnableSelectedUngrouped.length})</Button>
                          </Popconfirm>
                        ) : (
                          <Popconfirm key="all" title="确定执行未分组全部用例吗？" okText="确定" cancelText="取消" onConfirm={() => handleBatchRunWithIds(runnableUngrouped.map((r: any) => r.id))}>
                            <Button icon={<ThunderboltOutlined />} loading={running} size="small">执行全部 ({runnableUngrouped.length})</Button>
                          </Popconfirm>
                        ))}
                      </Space>
                    </div>
                    {!collapsed && (
                      <Table dataSource={ungrouped} columns={columns} rowKey="id" loading={loading} tableLayout="fixed" pagination={false} size="small" scroll={{ x: Object.values(columnWidths).reduce((a, b) => a + b, 0) }} rowSelection={{ selectedRowKeys: selectedKeys, onChange: setSelectedKeys }} style={{ margin: 0 }} />
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </Card>

      <Modal
        title={groupCollaboratorModal ? `分组协作者 - ${groupCollaboratorModal.name}` : '分组协作者'}
        open={!!groupCollaboratorModal}
        onCancel={() => setGroupCollaboratorModal(null)}
        onOk={() =>
          new Promise<void>((resolve, reject) => {
            Modal.confirm({
              title: '确定保存协作者设置吗？',
              okText: '确定',
              cancelText: '取消',
              onOk: () =>
                handleSaveGroupCollaborators().then(resolve).catch(reject),
              onCancel: () => reject(new Error('cancelled')),
            });
          })
        }
        okText="保存"
        width={480}
        destroyOnClose
      >
        {groupCollaboratorModal && (
          <div style={{ padding: '8px 0' }}>
            <div style={{ marginBottom: 8 }}>协作者与创建人、管理员均可管理本分组（编辑/删除分组、新建用例、AI 生成到本分组）</div>
            <Select
              mode="multiple"
              placeholder="选择协作者（可搜索用户名）"
              value={groupCollaboratorIds}
              onChange={setGroupCollaboratorIds}
              options={userOptions.map((u) => ({
                label: u.real_name ? `${u.real_name}(${u.username})` : u.username,
                value: u.id,
              }))}
              style={{ width: '100%' }}
              allowClear
              showSearch
              filterOption={(input: string, option: any) =>
                (option?.label ?? '').toString().toLowerCase().includes(input.toLowerCase())
              }
              optionFilterProp="label"
            />
          </div>
        )}
      </Modal>

      <Modal
        title={<Space><RobotOutlined />AI 生成用例</Space>}
        open={aiGenOpen}
        onCancel={() => { setAiGenOpen(false); setGeneratedCasesList([]); }}
        footer={null}
        width={640}
        destroyOnClose
      >
        <Form
          form={aiGenForm}
          layout="vertical"
          onValuesChange={(v) => {
            if (v.project_id != null) {
              getGroups({ project_id: v.project_id }).then((r) => setAiModalGroups(Array.isArray(r?.data) ? r.data : [])).catch(() => setAiModalGroups([]));
              aiGenForm.setFieldsValue({ group_id: undefined });
            }
          }}
        >
          <Form.Item name="project_id" label="所属项目" rules={[{ required: true, message: '请选择项目' }]}>
            <Select placeholder="选择项目" options={projects.map((p) => ({ label: p.name, value: p.id }))} />
          </Form.Item>
          <Form.Item name="group_id" label="添加到分组" extra="选择分组后，添加的用例将归入该分组；不选则归入未分组">
            <Select
              placeholder="不选则归入未分组"
              allowClear
              options={aiModalGroups.map((g: any) => ({ label: g.name, value: g.id }))}
            />
          </Form.Item>
          <Form.Item name="preferred_type" label="生成测试类型" extra="选择后 AI 优先生成该类型用例，不选则混合生成">
            <Select
              placeholder="不限制（混合生成）"
              allowClear
              options={[
                { label: '不限制（混合生成）', value: undefined },
                { label: '接口测试 (API)', value: 'api' },
                { label: 'Web 自动化', value: 'web' },
                { label: 'App 自动化', value: 'app' },
                { label: '小程序', value: 'miniapp' },
              ]}
            />
          </Form.Item>
          <Form.Item name="requirement" label="需求描述" rules={[{ required: true, message: '请填写需求或接口说明' }]} extra="可粘贴接口文档、需求说明或功能描述，AI 将生成测试用例建议">
            <Input.TextArea rows={4} placeholder="例如：用户登录接口 POST /api/login，参数 username, password；或：商品列表页需验证筛选、分页、排序" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" loading={aiGenLoading} onClick={handleAiGenerate}>生成</Button>
            <Button style={{ marginLeft: 8 }} onClick={() => setAiGenOpen(false)}>取消</Button>
          </Form.Item>
        </Form>
        {generatedCasesList.length > 0 && (
          <div style={{ marginTop: 16, borderTop: '1px solid #f0f0f0', paddingTop: 16 }}>
            <Typography.Text strong>生成结果（点击「添加」保存到用例管理）</Typography.Text>
            <div style={{ maxHeight: 320, overflow: 'auto', marginTop: 8 }}>
              {generatedCasesList.map((item: any, idx: number) => (
                <div key={idx} style={{ padding: '10px 12px', marginBottom: 8, background: '#fafafa', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <Typography.Text strong>{item.name}</Typography.Text>
                    <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{item.description || '-'}</div>
                    <Space size={4} style={{ marginTop: 4 }}>
                      <Tag>{typeMap[item.type]?.label || item.type}</Tag>
                      <Tag>{priorityLabel[item.priority] || item.priority}</Tag>
                    </Space>
                  </div>
                  <Popconfirm title="确定将该用例添加到列表吗？" okText="确定" cancelText="取消" onConfirm={() => addGeneratedCase(item)}>
                    <Button type="link" size="small" icon={<PlusCircleOutlined />}>添加</Button>
                  </Popconfirm>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>

      <ShareToIM
        open={shareOpen}
        onCancel={() => { setShareOpen(false); setShareTarget(null); }}
        shareType="用例"
        itemTitle={shareTarget?.name ?? ''}
        path={shareTarget ? `/cases/${shareTarget.id}` : ''}
      />
    </div>
  );
};

export default TestCases;
