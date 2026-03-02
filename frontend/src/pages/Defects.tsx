import React, { useCallback, useEffect, useState } from 'react';
import {
  Card, Button, Table, Tag, Space, Modal, Form, Input, Select,
  message, Popconfirm, Row, Col, Statistic, Upload, Image,
  Empty, Typography, Divider, Descriptions, Badge, Alert, Tabs, Timeline, Spin, DatePicker, Collapse, Dropdown,
} from 'antd';
import dayjs from 'dayjs';
import {
  PlusOutlined, DeleteOutlined, EditOutlined, EyeOutlined, BugOutlined,
  UploadOutlined, PictureOutlined, SearchOutlined,
  ExclamationCircleOutlined, CheckCircleOutlined,
  LinkOutlined, CloudUploadOutlined, SyncOutlined, ShareAltOutlined, ArrowLeftOutlined,
  AppstoreOutlined, UnorderedListOutlined, DownOutlined, RobotOutlined,
} from '@ant-design/icons';
import { useLocation, useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { getDefects, getDefect, createDefect, updateDefect, deleteDefect, batchUpdateDefects, getDefectStats, getProjects, uploadFile, pushDefectToJira, syncDefectFromJira, getJiraSettings, getUsersOptions, getDefectComments, addDefectComment, getDefectLogs } from '../api';
import { setAIChatContext } from '../utils/aiChatContext';
import { useAuth } from '../contexts/AuthContext';
import { useProjectContext } from '../contexts/ProjectContext';
import { formatDateTimeZh } from '../utils/date';
import ResizableTitle from '../components/ResizableTitle';
import ShareToIM from '../components/ShareToIM';
import Breadcrumb from '../components/Breadcrumb';

const { TextArea } = Input;

/** 将上传返回的相对路径转为当前源可访问的绝对 URL，便于图片加载与预览 */
function toImageSrc(path: string | undefined): string {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  return path.startsWith('/') ? base + path : base + '/' + path;
}

const severityConfig: Record<string, { color: string; label: string }> = {
  blocker: { color: '#cf1322', label: '阻塞' },
  critical: { color: '#ff4d4f', label: '严重' },
  major: { color: '#fa8c16', label: '一般' },
  minor: { color: '#1677ff', label: '次要' },
  trivial: { color: '#8c8c8c', label: '轻微' },
};

const priorityConfig: Record<string, { color: string; label: string }> = {
  low: { color: '#8c8c8c', label: '低' },
  medium: { color: '#1677ff', label: '中' },
  high: { color: '#fa8c16', label: '高' },
  critical: { color: '#cf1322', label: '严重' },
};

const statusConfig: Record<string, { color: string; label: string }> = {
  open: { color: 'error', label: '待处理' },
  in_progress: { color: 'processing', label: '处理中' },
  fixed: { color: 'warning', label: '已修复' },
  pending_verification: { color: 'gold', label: '待验证' },
  verified: { color: 'success', label: '已验证' },
  closed: { color: 'default', label: '已关闭' },
  rejected: { color: 'default', label: '已拒绝' },
};

const BOARD_STATUSES = ['open', 'in_progress', 'fixed', 'pending_verification', 'verified', 'closed'];

const Defects: React.FC = () => {
  const { user } = useAuth();
  const projectCtx = useProjectContext();
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams<{ id?: string }>();
  const detailIdFromRoute = params.id ? parseInt(params.id, 10) : null;
  const [searchParams, setSearchParams] = useSearchParams();
  const [defects, setDefects] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [detailEditMode, setDetailEditMode] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [filters, setFilters] = useState<any>({});
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list');
  const [selectedDefectIds, setSelectedDefectIds] = useState<React.Key[]>([]);
  const [userOptions, setUserOptions] = useState<{ id: number; username: string; real_name?: string }[]>([]);
  const [form] = Form.useForm();
  const [jiraBaseUrl, setJiraBaseUrl] = useState<string>('');
  const [jiraActionLoading, setJiraActionLoading] = useState<number | null>(null);
  const [detailComments, setDetailComments] = useState<any[]>([]);
  const [detailLogs, setDetailLogs] = useState<any[]>([]);
  const [detailCommentsLoading, setDetailCommentsLoading] = useState(false);
  const [detailLogsLoading, setDetailLogsLoading] = useState(false);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentForm] = Form.useForm();

  const defaultColWidths: Record<string, number> = {
    id: 60, title: 200, severity: 90, status: 90, screenshots: 70, assignee: 90, project_name: 120,
    created_by_name: 120, created_at: 170, jira_key: 100, updated_at: 170, actions: 300,
  };
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(defaultColWidths);
  const handleResize = useCallback((key: string, w: number) => setColumnWidths((prev) => ({ ...prev, [key]: w })), []);

  const load = async () => {
    setLoading(true);
    try {
      const pid = filters.project_id ?? projectCtx?.projectId;
      const params: any = { page: 1, page_size: 200 };
      if (filters.status) params.status = filters.status;
      if (filters.severity) params.severity = filters.severity;
      if (filters.keyword) params.keyword = filters.keyword;
      if (pid) params.project_id = pid;
      if (filters.assignee != null && filters.assignee !== '') params.assignee = filters.assignee;
      if (filters.date) params.date = filters.date;
      const [dRes, pRes, sRes, jiraRes] = await Promise.all([
        getDefects(params), getProjects(), getDefectStats(params),
        getJiraSettings().catch(() => ({ data: {} })),
      ]);
      setDefects(Array.isArray(dRes?.data) ? dRes.data : []);
      setProjects(Array.isArray(pRes?.data) ? pRes.data : []);
      setStats(sRes?.data ?? null);
      const url = (jiraRes?.data?.jira_url || '').replace(/\/$/, '');
      setJiraBaseUrl(url);
    } catch { message.error('加载失败'); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [filters.project_id, filters.status, filters.severity, filters.keyword, filters.assignee, filters.date]);

  // 无项目数据或当前选中的项目不在列表中时清空 project_id，避免下拉框显示无效默认值（如 1）
  useEffect(() => {
    const pid = filters.project_id;
    if (pid == null) return;
    if (projects.length === 0 || !projects.some((p: any) => p.id === pid)) {
      setFilters((prev: any) => ({ ...prev, project_id: undefined }));
    }
  }, [projects, filters.project_id]);

  // 仅当 context 的 projectId 在项目列表中时才同步到 filters，避免无数据时与清空逻辑形成循环导致闪烁
  useEffect(() => {
    const ctxPid = projectCtx?.projectId ?? null;
    if (ctxPid == null || filters.project_id != null) return;
    if (projects.length > 0 && projects.some((p: any) => p.id === ctxPid)) {
      setFilters((prev: any) => ({ ...prev, project_id: ctxPid }));
    }
  }, [projectCtx?.projectId, projects, filters.project_id]);
  useEffect(() => {
    if (filters.project_id != null) {
      projectCtx?.setProjectId(filters.project_id);
    }
  }, [filters.project_id]);
  useEffect(() => {
    getUsersOptions().then((r) => setUserOptions(Array.isArray(r?.data) ? r.data : [])).catch(() => {});
  }, []);

  useEffect(() => {
    const openId = (location.state as any)?.openDefectId;
    const id = openId != null ? Number(openId) : NaN;
    if (Number.isNaN(id) || id < 1) return;
    navigate(`/defects/${id}`, { replace: true, state: {} });
  }, [location.state, navigate]);

  const defectIdFromUrl = searchParams.get('defect_id');
  useEffect(() => {
    if (!defectIdFromUrl) return;
    const id = parseInt(defectIdFromUrl, 10);
    if (Number.isNaN(id)) return;
    setSearchParams({});
    navigate(`/defects/${id}`, { replace: true });
  }, [defectIdFromUrl]);

  const loadDetailExtra = useCallback((defectId: number) => {
    setDetailComments([]);
    setDetailLogs([]);
    setDetailCommentsLoading(true);
    setDetailLogsLoading(true);
    Promise.all([getDefectComments(defectId), getDefectLogs(defectId)])
      .then(([cRes, lRes]) => {
        setDetailComments(Array.isArray(cRes?.data) ? cRes.data : []);
        setDetailLogs(Array.isArray(lRes?.data) ? lRes.data : []);
      })
      .catch(() => { message.error('加载讨论与日志失败'); })
      .finally(() => { setDetailCommentsLoading(false); setDetailLogsLoading(false); });
  }, []);

  useEffect(() => {
    if (!detailIdFromRoute || Number.isNaN(detailIdFromRoute)) return;
    setDetailLoading(true);
    setDetailEditMode(false);
    getDefect(detailIdFromRoute)
      .then((res) => {
        const d = res.data;
        setDetail(d);
        loadDetailExtra(d.id);
      })
      .catch(() => { message.error('缺陷不存在或已删除'); navigate('/defects'); })
      .finally(() => setDetailLoading(false));
  }, [detailIdFromRoute, loadDetailExtra, navigate]);

  const [shareOpen, setShareOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState<{ id: number; title: string } | null>(null);
  const openShareModal = (defect: { id: number; title: string }) => {
    setShareTarget(defect);
    setShareOpen(true);
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const res = await uploadFile(file);
      const url = res.data.url;
      setScreenshots((prev) => [...prev, url]);
      message.success('上传成功');
    } catch { message.error('上传失败'); }
    setUploading(false);
    return false;
  };

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setScreenshots([]);
    setModalOpen(true);
  };

  const openEdit = (record: any) => {
    setEditing(record);
    form.setFieldsValue(record);
    setScreenshots(record.screenshots || []);
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    const data = { ...values, screenshots };
    try {
      if (editing) {
        await updateDefect(editing.id, data);
        message.success('更新成功');
      } else {
        await createDefect(data);
        message.success('提交成功');
      }
      setModalOpen(false);
      load();
    } catch { message.error('操作失败'); }
  };

  const handleDelete = async (id: number) => {
    await deleteDefect(id);
    message.success('删除成功');
    load();
  };

  const handlePushJira = async (id: number) => {
    setJiraActionLoading(id);
    try {
      const res = await pushDefectToJira(id);
      message.success(res.data?.jira_key ? `已推送到 Jira: ${res.data.jira_key}` : '推送成功');
      load();
    } catch (e: any) {
      message.error(e.response?.data?.detail || '推送到 Jira 失败');
    }
    setJiraActionLoading(null);
  };

  const handleSyncJira = async (id: number) => {
    setJiraActionLoading(id);
    try {
      await syncDefectFromJira(id);
      message.success('已从 Jira 同步状态');
      load();
    } catch (e: any) {
      message.error(e.response?.data?.detail || '同步状态失败');
    }
    setJiraActionLoading(null);
  };

  const canDelete = () => user?.is_admin === true;

  const handleBatchUpdate = async (field: 'status' | 'severity' | 'priority' | 'assignee', value: string) => {
    const ids = selectedDefectIds as number[];
    if (ids.length === 0) {
      message.warning('请先选择缺陷');
      return;
    }
    const payload: any = { defect_ids: ids };
    if (field === 'status') payload.status = value;
    else if (field === 'severity') payload.severity = value;
    else if (field === 'priority') payload.priority = value;
    else if (field === 'assignee') payload.assignee = value;
    try {
      const res = await batchUpdateDefects(payload);
      message.success(`已更新 ${res.data?.updated ?? 0} 条缺陷`);
      setSelectedDefectIds([]);
      load();
    } catch {
      message.error('批量更新失败');
    }
  };

  /** 仅创建人、管理员、被指派人可编辑 / 推送到 Jira / 同步状态，其余仅详情 */
  const canEditDefect = (r: any) => {
    if (!user) return false;
    if (user.is_admin) return true;
    if (r.created_by_id != null && r.created_by_id === user.id) return true;
    const assigneeDisplay = user.real_name ? `${user.real_name}(${user.username})` : user.username;
    if (r.assignee && r.assignee === assigneeDisplay) return true;
    return false;
  };

  /** 仅管理员、当前被指派人可编辑「指派给」；创建人仅在被指派时方可编辑 */
  const canEditAssignee = (r: any) => {
    if (!user) return false;
    if (user.is_admin) return true;
    const assigneeDisplay = user.real_name ? `${user.real_name}(${user.username})` : user.username;
    return !!(r.assignee && r.assignee === assigneeDisplay);
  };

  const handleAddComment = () => {
    if (!detail?.id) return;
    commentForm.validateFields().then((values) => {
      setCommentSubmitting(true);
      addDefectComment(detail.id, { content: values.content })
        .then(() => {
          commentForm.resetFields();
          loadDetailExtra(detail.id);
          message.success('评论已发布');
        })
        .catch(() => message.error('发布失败'))
        .finally(() => setCommentSubmitting(false));
    });
  };

  const handleSaveDetailEdit = async () => {
    if (!detail?.id) return;
    const values = await form.validateFields();
    const data = { ...values, screenshots };
    try {
      const res = await updateDefect(detail.id, data);
      message.success('更新成功');
      setDetail(res.data);
      setDetailEditMode(false);
    } catch {
      message.error('操作失败');
    }
  };

  const startDetailEdit = () => {
    if (!detail) return;
    form.setFieldsValue(detail);
    setScreenshots(detail.screenshots || []);
    setDetailEditMode(true);
  };

  const columns = [
    {
      title: <ResizableTitle dataKey="id" width={columnWidths.id} minWidth={50} onResize={handleResize}>ID</ResizableTitle>,
      dataIndex: 'id',
      key: 'id',
      width: columnWidths.id,
      render: (id: number) => <Typography.Text type="secondary">#{id}</Typography.Text>,
    },
    {
      title: <ResizableTitle dataKey="title" width={columnWidths.title} minWidth={120} onResize={handleResize}>缺陷标题</ResizableTitle>,
      dataIndex: 'title',
      key: 'title',
      width: columnWidths.title,
      ellipsis: true,
      render: (t: string, r: any) => (
        <Typography.Link onClick={() => navigate(`/defects/${r.id}`)}>{t}</Typography.Link>
      ),
    },
    {
      title: <ResizableTitle dataKey="severity" width={columnWidths.severity} minWidth={70} onResize={handleResize}>严重程度</ResizableTitle>,
      dataIndex: 'severity',
      key: 'severity',
      width: columnWidths.severity,
      render: (s: string) => {
        const cfg = severityConfig[s] || { color: '#999', label: s };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: <ResizableTitle dataKey="priority" width={80} minWidth={60} onResize={handleResize}>优先级</ResizableTitle>,
      dataIndex: 'priority',
      key: 'priority',
      width: 80,
      render: (p: string) => {
        const cfg = priorityConfig[p || 'medium'] || { color: '#999', label: p || '中' };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: <ResizableTitle dataKey="status" width={columnWidths.status} minWidth={70} onResize={handleResize}>状态</ResizableTitle>,
      dataIndex: 'status',
      key: 'status',
      width: columnWidths.status,
      render: (s: string) => {
        const cfg = statusConfig[s] || { color: 'default', label: s };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: <ResizableTitle dataKey="screenshots" width={columnWidths.screenshots} minWidth={56} onResize={handleResize}>截图</ResizableTitle>,
      dataIndex: 'screenshots',
      key: 'screenshots',
      width: columnWidths.screenshots,
      render: (ss: string[]) => ss?.length > 0 ? (
        <Badge count={ss.length} size="small"><PictureOutlined style={{ fontSize: 18, color: '#1677ff' }} /></Badge>
      ) : <span style={{ color: '#ccc' }}>-</span>,
    },
    {
      title: <ResizableTitle dataKey="assignee" width={columnWidths.assignee} minWidth={70} onResize={handleResize}>指派</ResizableTitle>,
      dataIndex: 'assignee',
      key: 'assignee',
      width: columnWidths.assignee,
      ellipsis: true,
      render: (a: string) => a || <span style={{ color: '#ccc' }}>-</span>,
    },
    {
      title: <ResizableTitle dataKey="project_name" width={columnWidths.project_name} minWidth={80} onResize={handleResize}>项目</ResizableTitle>,
      dataIndex: 'project_name',
      key: 'project_name',
      width: columnWidths.project_name,
      ellipsis: true,
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
      title: <ResizableTitle dataKey="created_at" width={columnWidths.created_at} minWidth={120} onResize={handleResize}>创建时间</ResizableTitle>,
      dataIndex: 'created_at',
      key: 'created_at',
      width: columnWidths.created_at,
      render: (t: string) => formatDateTimeZh(t),
    },
    {
      title: <ResizableTitle dataKey="jira_key" width={columnWidths.jira_key} minWidth={70} onResize={handleResize}>Jira</ResizableTitle>,
      dataIndex: 'jira_key',
      key: 'jira_key',
      width: columnWidths.jira_key,
      render: (key: string) => key ? (
        jiraBaseUrl ? (
          <a href={`${jiraBaseUrl}/browse/${key}`} target="_blank" rel="noopener noreferrer">{key}</a>
        ) : (
          <span>{key}</span>
        )
      ) : <span style={{ color: '#ccc' }}>-</span>,
    },
    {
      title: <ResizableTitle dataKey="updated_at" width={columnWidths.updated_at} minWidth={120} onResize={handleResize}>更新时间</ResizableTitle>,
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: columnWidths.updated_at,
      render: (t: string) => formatDateTimeZh(t),
    },
    {
      title: <ResizableTitle dataKey="actions" width={columnWidths.actions} minWidth={200} onResize={handleResize}>操作</ResizableTitle>,
      key: 'actions',
      width: columnWidths.actions,
      fixed: 'right' as const,
      render: (_: any, r: any) => (
        <Space size={4} wrap>
          <Button type="link" size="small" icon={<EyeOutlined />}
            onClick={() => navigate(`/defects/${r.id}`)}>详情</Button>
          <Button type="link" size="small" icon={<ShareAltOutlined />}
            onClick={() => openShareModal({ id: r.id, title: r.title })}>分享</Button>
          {canEditDefect(r) && (
            <>
              <Button type="link" size="small" icon={<EditOutlined />}
                onClick={() => navigate(`/defects/${r.id}`)}>编辑</Button>
              <Button type="link" size="small" icon={<CloudUploadOutlined />}
                loading={jiraActionLoading === r.id} onClick={() => handlePushJira(r.id)}>推送到 Jira</Button>
              <Button type="link" size="small" icon={<SyncOutlined />}
                loading={jiraActionLoading === r.id} disabled={!r.jira_key} onClick={() => handleSyncJira(r.id)}>同步状态</Button>
            </>
          )}
          {canDelete() && (
            <Popconfirm title="确定删除该缺陷吗？" okText="确定删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={() => handleDelete(r.id)}>
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const renderDetailContent = () => {
    if (!detail) return null;
    return (
      <>
        <Typography.Title level={4} style={{ marginBottom: 16 }}>{detail.title}</Typography.Title>
        <Tabs
          defaultActiveKey="info"
          items={[
            {
              key: 'info',
              label: '详情',
              children: (
                <>
                  <Descriptions bordered column={2} size="small">
                    <Descriptions.Item label="项目">{detail.project_name}</Descriptions.Item>
                    <Descriptions.Item label="关联用例">{detail.case_name || '-'}</Descriptions.Item>
                    <Descriptions.Item label="Jira">
                      {detail.jira_key ? (
                        jiraBaseUrl ? (
                          <a href={`${jiraBaseUrl}/browse/${detail.jira_key}`} target="_blank" rel="noopener noreferrer">
                            <LinkOutlined /> {detail.jira_key}
                          </a>
                        ) : (
                          detail.jira_key
                        )
                      ) : '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="严重程度">
                      <Tag color={severityConfig[detail.severity]?.color}>{severityConfig[detail.severity]?.label}</Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="优先级">
                      <Tag color={priorityConfig[detail.priority]?.color}>{priorityConfig[detail.priority]?.label}</Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="状态">
                      <Tag color={statusConfig[detail.status]?.color}>{statusConfig[detail.status]?.label}</Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="指派给">{detail.assignee || '-'}</Descriptions.Item>
                    <Descriptions.Item label="创建人">{detail.created_by_name || '-'}</Descriptions.Item>
                    <Descriptions.Item label="创建时间">{formatDateTimeZh(detail.created_at)}</Descriptions.Item>
                    <Descriptions.Item label="更新时间">{formatDateTimeZh(detail.updated_at)}</Descriptions.Item>
                  </Descriptions>
                  {detail.steps_to_reproduce && (
                    <div style={{ marginTop: 16 }}>
                      <Typography.Text strong>复现步骤</Typography.Text>
                      <pre style={{ background: '#fafafa', padding: 12, borderRadius: 8, whiteSpace: 'pre-wrap', marginTop: 8, fontSize: 13 }}>
                        {detail.steps_to_reproduce}
                      </pre>
                    </div>
                  )}
                  <Row gutter={16} style={{ marginTop: 16 }}>
                    {detail.expected_result && (
                      <Col span={12}>
                        <Typography.Text strong>预期结果</Typography.Text>
                        <div style={{ background: '#f6ffed', padding: 12, borderRadius: 8, marginTop: 8, border: '1px solid #b7eb8f' }}>
                          {detail.expected_result}
                        </div>
                      </Col>
                    )}
                    {detail.actual_result && (
                      <Col span={12}>
                        <Typography.Text strong>实际结果</Typography.Text>
                        <div style={{ background: '#fff2f0', padding: 12, borderRadius: 8, marginTop: 8, border: '1px solid #ffccc7' }}>
                          {detail.actual_result}
                        </div>
                      </Col>
                    )}
                  </Row>
                  {detail.description && (
                    <div style={{ marginTop: 16 }}>
                      <Typography.Text strong>补充说明</Typography.Text>
                      <div style={{ background: '#fafafa', padding: 12, borderRadius: 8, marginTop: 8 }}>{detail.description}</div>
                    </div>
                  )}
                  {detail.screenshots?.length > 0 && (
                    <div style={{ marginTop: 16 }}>
                      <Typography.Text strong>缺陷截图 ({detail.screenshots.length})</Typography.Text>
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
                        <Image.PreviewGroup>
                          {detail.screenshots.map((url: string, i: number) => (
                            <Image key={i} src={toImageSrc(url)} width={160} height={120}
                              style={{ objectFit: 'cover', borderRadius: 8, border: '1px solid #f0f0f0' }} />
                          ))}
                        </Image.PreviewGroup>
                      </div>
                    </div>
                  )}
                </>
              ),
            },
            {
              key: 'discussion',
              label: `讨论区 (${detailComments.length})`,
              children: (
                <div style={{ paddingTop: 8 }}>
                  <Spin spinning={detailCommentsLoading}>
                    <div style={{ marginBottom: 16 }}>
                      <Form form={commentForm} layout="vertical">
                        <Form.Item name="content" rules={[{ required: true, message: '请输入评论内容' }]}>
                          <TextArea rows={3} placeholder="发表评论..." maxLength={2000} showCount />
                        </Form.Item>
                        <Button type="primary" onClick={handleAddComment} loading={commentSubmitting}>发布</Button>
                      </Form>
                    </div>
                    {detailComments.length === 0 && !detailCommentsLoading && (
                      <Empty description="暂无评论" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ margin: '24px 0' }} />
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {detailComments.map((c: any) => (
                        <div key={c.id} style={{ background: '#fafafa', padding: 12, borderRadius: 8, border: '1px solid #f0f0f0' }}>
                          <Space style={{ marginBottom: 8 }}>
                            <Typography.Text strong>{c.user_display || `用户${c.user_id}`}</Typography.Text>
                            <Typography.Text type="secondary">{formatDateTimeZh(c.created_at)}</Typography.Text>
                          </Space>
                          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{c.content}</div>
                        </div>
                      ))}
                    </div>
                  </Spin>
                </div>
              ),
            },
            {
              key: 'logs',
              label: '操作日志',
              children: (
                <div style={{ paddingTop: 8 }}>
                  <Spin spinning={detailLogsLoading}>
                    {detailLogs.length === 0 && !detailLogsLoading && (
                      <Empty description="暂无操作记录" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ margin: '24px 0' }} />
                    )}
                    <Timeline
                      items={detailLogs.map((log: any) => ({
                        children: (
                          <div>
                            <Typography.Text type="secondary">{formatDateTimeZh(log.created_at)}</Typography.Text>
                            <span style={{ marginLeft: 8 }}>{log.user_display || '系统'}</span>
                            <span style={{ marginLeft: 8 }}>{log.action_message}</span>
                          </div>
                        ),
                      }))}
                    />
                  </Spin>
                </div>
              ),
            },
          ]}
        />
      </>
    );
  };

  if (detailIdFromRoute) {
    const defectBreadcrumb = [
      { label: detail?.project_name || '项目', path: '/projects' },
      { label: '缺陷管理', path: '/defects' },
      { label: detail?.title ?? '加载中...' },
    ];
    return (
      <div>
        <div style={{ marginBottom: 20 }}>
          <Breadcrumb items={defectBreadcrumb} />
          <Space align="center" style={{ marginBottom: 8 }}>
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/defects')}>返回列表</Button>
          </Space>
          <h1 style={{ fontSize: 'var(--page-title-size)', fontWeight: 600, color: '#0f172a', margin: 0 }}>缺陷详情 #{detailIdFromRoute}</h1>
          <p style={{ fontSize: 'var(--page-subtitle-size)', color: '#475569', margin: '4px 0 0' }}>查看与编辑缺陷</p>
        </div>
        <Card className="page-card" bordered={false}
          title={
            <Space>
              <BugOutlined /> {detail?.title || '加载中...'}
              {detail && (
                <>
                  <Button type="link" size="small" icon={<RobotOutlined />} onClick={() => {
                    const summary = `标题：${detail.title}\n描述：${(detail.description || '').slice(0, 500)}\n严重程度：${detail.severity}\n复现步骤：${(detail.steps_to_reproduce || '').slice(0, 300)}`;
                    setAIChatContext({ source: 'defect', id: detail.id, title: detail.title, summary });
                    navigate('/ai-chat');
                  }}>向 AI 提问</Button>
                  <Button type="link" size="small" icon={<ShareAltOutlined />} onClick={() => openShareModal({ id: detail.id, title: detail.title })}>分享</Button>
                  {canEditDefect(detail) && !detailEditMode && (
                    <Button type="link" size="small" icon={<EditOutlined />} onClick={startDetailEdit}>编辑</Button>
                  )}
                  {canEditDefect(detail) && detailEditMode && (
                    <>
                      <Button type="primary" size="small" onClick={handleSaveDetailEdit}>保存</Button>
                      <Button size="small" onClick={() => setDetailEditMode(false)}>取消</Button>
                    </>
                  )}
                  {canEditDefect(detail) && (
                    <>
                      <Button type="link" size="small" icon={<CloudUploadOutlined />}
                        loading={jiraActionLoading === detail.id} onClick={() => handlePushJira(detail.id)}>推送到 Jira</Button>
                      <Button type="link" size="small" icon={<SyncOutlined />}
                        loading={jiraActionLoading === detail.id} disabled={!detail.jira_key} onClick={() => handleSyncJira(detail.id)}>同步状态</Button>
                    </>
                  )}
                  {canDelete() && (
                    <Popconfirm title="确定删除该缺陷吗？" okText="确定删除" cancelText="取消" okButtonProps={{ danger: true }}
                      onConfirm={() => { handleDelete(detail.id); navigate('/defects'); }}>
                      <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
                    </Popconfirm>
                  )}
                </>
              )}
            </Space>
          }
        >
          {detailLoading ? (
            <Spin tip="加载中..." />
          ) : detailEditMode ? (
            <Form form={form} layout="vertical" initialValues={{ severity: 'major', priority: 'medium', status: 'open' }}>
              <Row gutter={16}>
                <Col xs={24} md={16}>
                  <Form.Item name="title" label="缺陷标题" rules={[{ required: true, message: '请输入标题' }, { max: 200, message: '标题最多 200 字' }]}>
                    <Input placeholder="简要描述缺陷" maxLength={200} showCount />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item name="project_id" label="所属项目" rules={[{ required: true, message: '请选择项目' }]}>
                    <Select placeholder="选择项目" options={projects.map((p) => ({ label: p.name, value: p.id }))} />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col xs={24} sm={8}>
                  <Form.Item name="severity" label="严重程度">
                    <Select options={Object.entries(severityConfig).map(([k, v]) => ({ label: v.label, value: k }))} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={8}>
                  <Form.Item name="priority" label="优先级">
                    <Select options={Object.entries(priorityConfig).map(([k, v]) => ({ label: v.label, value: k }))} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={8}>
                  <Form.Item name="status" label="状态">
                    <Select options={Object.entries(statusConfig).map(([k, v]) => ({ label: v.label, value: k }))} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={8}>
                  <Form.Item name="assignee" label="指派给">
                    <Select placeholder="搜索并选择处理人" allowClear showSearch optionFilterProp="label"
                      filterOption={(input, option) => (option?.label ?? '').toString().toLowerCase().includes((input || '').toLowerCase())}
                      options={userOptions.map((u) => ({ label: u.real_name ? `${u.real_name}(${u.username})` : u.username, value: u.real_name ? `${u.real_name}(${u.username})` : u.username }))} />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="steps_to_reproduce" label="复现步骤">
                <TextArea rows={3} placeholder="1. 打开页面...\n2. 点击...\n3. 出现..." />
              </Form.Item>
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item name="expected_result" label="预期结果">
                    <TextArea rows={2} placeholder="应该显示..." />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="actual_result" label="实际结果">
                    <TextArea rows={2} placeholder="实际显示..." />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="description" label="补充说明">
                <TextArea rows={2} placeholder="其他补充信息（选填）" />
              </Form.Item>
              <Form.Item label="缺陷截图">
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  {screenshots.map((url, i) => (
                    <div key={i} style={{ position: 'relative' }}>
                      <Image src={toImageSrc(url)} width={100} height={100} style={{ objectFit: 'cover', borderRadius: 8 }} />
                      <Button size="small" danger icon={<DeleteOutlined />}
                        style={{ position: 'absolute', top: 2, right: 2, minWidth: 20, width: 20, height: 20, padding: 0 }}
                        onClick={() => setScreenshots(screenshots.filter((_, j) => j !== i))} />
                    </div>
                  ))}
                </div>
                <Upload accept="image/*" showUploadList={false} beforeUpload={(file) => { handleUpload(file); return false; }}>
                  <Button icon={<UploadOutlined />} loading={uploading}>上传截图</Button>
                </Upload>
              </Form.Item>
            </Form>
          ) : (
            renderDetailContent()
          )}
        </Card>
      <ShareToIM
        open={shareOpen}
        onCancel={() => { setShareOpen(false); setShareTarget(null); }}
        shareType="缺陷"
        itemTitle={shareTarget?.title ?? ''}
        path={shareTarget ? `/defects/${shareTarget.id}` : ''}
      />
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div className="page-title-block">
          <h1>缺陷管理</h1>
          <p>跟踪与处理测试缺陷</p>
        </div>
      </div>
      {stats && (
        <Row gutter={[20, 20]} style={{ marginBottom: 24 }}>
          <Col xs={12} sm={8} md={6} lg={4}>
            <Card bordered={false} className="stat-card" size="small">
              <Statistic title="缺陷总数" value={stats.total} prefix={<BugOutlined />} />
            </Card>
          </Col>
          {Object.entries(stats.by_status || {}).map(([k, v]) => (
            <Col xs={12} sm={8} md={6} lg={4} key={k}>
              <Card bordered={false} className="stat-card" size="small">
                <Statistic title={statusConfig[k]?.label || k} value={v as number}
                  valueStyle={{ color: k === 'open' ? '#ff4d4f' : k === 'closed' ? '#52c41a' : undefined }} />
              </Card>
            </Col>
          ))}
        </Row>
      )}

      <Card className="page-card" bordered={false} style={{ marginBottom: 24 }}>
        <Row gutter={[16, 16]} className="filter-bar">
          <Col xs={24} sm={12} md={8} lg={6}>
            <Input placeholder="搜索缺陷" prefix={<SearchOutlined />} allowClear
              value={filters.keyword} onChange={(e) => setFilters({ ...filters, keyword: e.target.value })}
              onPressEnter={load} style={{ width: '100%' }} />
          </Col>
          <Col xs={24} sm={12} md={8} lg={6}>
            <Select placeholder="严重程度" allowClear style={{ width: '100%' }}
              value={filters.severity} onChange={(v) => setFilters({ ...filters, severity: v })}
              options={Object.entries(severityConfig).map(([k, v]) => ({ label: v.label, value: k }))} />
          </Col>
          <Col xs={24} sm={12} md={8} lg={6}>
            <Select placeholder="状态" allowClear style={{ width: '100%' }}
              value={filters.status} onChange={(v) => setFilters({ ...filters, status: v })}
              options={Object.entries(statusConfig).map(([k, v]) => ({ label: v.label, value: k }))} />
          </Col>
          <Col xs={24} sm={12} md={8} lg={6}>
            <Select placeholder="项目" allowClear style={{ width: '100%' }}
              value={projects.length > 0 && projects.some((p: any) => p.id === filters.project_id) ? filters.project_id : undefined}
              onChange={(v) => setFilters({ ...filters, project_id: v })}
              options={projects.map((p) => ({ label: p.name, value: p.id }))} />
          </Col>
          <Col xs={24} sm={12} md={8} lg={6}>
            <Select placeholder="指派给" allowClear style={{ width: '100%' }}
              value={filters.assignee} onChange={(v) => setFilters({ ...filters, assignee: v })}
              showSearch
              optionFilterProp="label"
              filterOption={(input, option) =>
                (option?.label ?? '').toString().toLowerCase().includes((input || '').toLowerCase())
              }
              options={userOptions.map((u) => {
                const label = u.real_name ? `${u.real_name}(${u.username})` : u.username;
                return { label, value: label };
              })}
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={6}>
            <DatePicker
              placeholder="按日期筛选"
              value={filters.date ? dayjs(filters.date) : null}
              onChange={(_, dateStr) => setFilters({ ...filters, date: (typeof dateStr === 'string' && dateStr) ? dateStr : undefined })}
              style={{ width: '100%' }}
              allowClear
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={6}>
            <Button type="primary" icon={<SearchOutlined />} onClick={load} block>搜索</Button>
          </Col>
          <Col xs={24}>
            <Typography.Text type="secondary">修改筛选后请点击搜索</Typography.Text>
          </Col>
        </Row>
      </Card>

      <Card className="page-card" bordered={false}
        title={<Space><BugOutlined />缺陷列表 ({(defects ?? []).length})</Space>}
        extra={
          <Space>
            <Button.Group>
              <Button icon={<UnorderedListOutlined />} type={viewMode === 'list' ? 'primary' : 'default'} onClick={() => setViewMode('list')}>列表</Button>
              <Button icon={<AppstoreOutlined />} type={viewMode === 'board' ? 'primary' : 'default'} onClick={() => setViewMode('board')}>看板</Button>
            </Button.Group>
            {selectedDefectIds.length > 0 && (
              <Dropdown
                menu={{
                  items: [
                    {
                      key: 'status',
                      label: '批量修改状态',
                      children: Object.entries(statusConfig).map(([k, v]) => ({
                        key: k,
                        label: v.label,
                        onClick: () => handleBatchUpdate('status', k),
                      })),
                    },
                    {
                      key: 'severity',
                      label: '批量修改严重程度',
                      children: Object.entries(severityConfig).map(([k, v]) => ({
                        key: k,
                        label: v.label,
                        onClick: () => handleBatchUpdate('severity', k),
                      })),
                    },
                    {
                      key: 'priority',
                      label: '批量修改优先级',
                      children: Object.entries(priorityConfig).map(([k, v]) => ({
                        key: k,
                        label: v.label,
                        onClick: () => handleBatchUpdate('priority', k),
                      })),
                    },
                    {
                      key: 'assignee',
                      label: '批量修改指派',
                      children: userOptions.map((u) => {
                        const label = u.real_name ? `${u.real_name}(${u.username})` : u.username;
                        return { key: String(u.id), label, onClick: () => handleBatchUpdate('assignee', label) };
                      }),
                    },
                  ],
                }}
              >
                <Button>批量操作 ({selectedDefectIds.length})</Button>
              </Dropdown>
            )}
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>提交缺陷</Button>
          </Space>
        }>
        <Collapse
          defaultActiveKey={[]}
          size="small"
          style={{ marginBottom: 16 }}
          items={[
            {
              key: 'workflow',
              label: '缺陷流转说明（点击展开）',
              children: (
                <Alert
                  type="info"
                  showIcon
                  message="缺陷流转说明"
                  description="测试人员提交缺陷后，在「指派给」中选择开发者并可将状态设为「处理中」。开发者修复完成后将状态改为「待验证」，即流转给测试人员验证。测试人员验证通过后改为「已验证」，不通过可改回为「待处理」。"
                />
              ),
            },
          ]}
        />
        {viewMode === 'list' ? (
          <Table
            dataSource={defects ?? []}
            columns={columns}
            rowKey="id"
            loading={loading}
            rowSelection={{ selectedRowKeys: selectedDefectIds, onChange: (keys) => setSelectedDefectIds(keys) }}
            tableLayout="fixed"
            pagination={{ pageSize: 15, showTotal: (t) => `共 ${t} 条` }}
            size="middle"
            scroll={{ x: Object.values(columnWidths).reduce((a, b) => a + b, 0) }}
            locale={{ emptyText: <Empty description="暂无缺陷记录" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
          />
        ) : (
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', minHeight: 400 }}>
            {BOARD_STATUSES.map((statusKey) => {
              const colDefects = (defects ?? []).filter((d: any) => (d.status || '') === statusKey);
              const cfg = statusConfig[statusKey] || { color: 'default', label: statusKey };
              return (
                <div key={statusKey} style={{ minWidth: 260, maxWidth: 260, background: '#fafafa', borderRadius: 8, padding: 12, border: '1px solid #f0f0f0' }}>
                  <div style={{ marginBottom: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Tag color={cfg.color}>{cfg.label}</Tag>
                    <span style={{ color: '#666' }}>({colDefects.length})</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 'calc(100vh - 380px)', overflowY: 'auto' }}>
                    {colDefects.map((d: any) => (
                      <Card key={d.id} size="small" hoverable style={{ cursor: 'pointer' }}
                        onClick={() => navigate(`/defects/${d.id}`)}>
                        <Typography.Text ellipsis style={{ display: 'block', fontWeight: 500 }}>{d.title}</Typography.Text>
                        <Space size={4} style={{ marginTop: 8 }}>
                          <Tag color={severityConfig[d.severity]?.color} style={{ margin: 0 }}>{severityConfig[d.severity]?.label}</Tag>
                          <Tag color={priorityConfig[d.priority]?.color} style={{ margin: 0 }}>{priorityConfig[d.priority]?.label}</Tag>
                          {d.assignee && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{d.assignee}</Typography.Text>}
                        </Space>
                      </Card>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <ShareToIM
        open={shareOpen}
        onCancel={() => { setShareOpen(false); setShareTarget(null); }}
        shareType="缺陷"
        itemTitle={shareTarget?.title ?? ''}
        path={shareTarget ? `/defects/${shareTarget.id}` : ''}
      />
      {/* Create/Edit Modal */}
      <Modal
        title={editing ? '编辑缺陷' : '提交缺陷'}
        open={modalOpen}
        onOk={async () => {
          await form.validateFields();
          return new Promise<void>((resolve, reject) => {
            Modal.confirm({
              title: editing ? '确定保存缺陷吗？' : '确定提交缺陷吗？',
              okText: '确定',
              cancelText: '取消',
              onOk: () => handleSave().then(resolve).catch(reject),
              onCancel: () => reject(new Error('cancelled')),
            });
          });
        }}
        onCancel={() => setModalOpen(false)}
        okText="保存"
        cancelText="取消"
        width="min(720px, 100vw - 24px)"
        destroyOnClose
      >
        <Form form={form} layout="vertical" initialValues={{ severity: 'major', priority: 'medium', status: 'open' }}>
          <Row gutter={16}>
            <Col xs={24} md={16}>
              <Form.Item name="title" label="缺陷标题" rules={[{ required: true, message: '请输入标题' }, { max: 200, message: '标题最多 200 字' }]}>
                <Input placeholder="简要描述缺陷" maxLength={200} showCount />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="project_id" label="所属项目" rules={[{ required: true, message: '请选择项目' }]}>
                <Select placeholder="选择项目" options={projects.map((p) => ({ label: p.name, value: p.id }))} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} sm={8}>
              <Form.Item name="severity" label="严重程度" extra={editing && !canEditAssignee(editing) ? '仅管理员、当前被指派人可修改' : undefined}>
                <Select
                  options={Object.entries(severityConfig).map(([k, v]) => ({ label: v.label, value: k }))}
                  disabled={!!editing && !canEditAssignee(editing)}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="priority" label="优先级">
                <Select options={Object.entries(priorityConfig).map(([k, v]) => ({ label: v.label, value: k }))} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="status" label="状态" extra={editing && !canEditAssignee(editing) ? '仅管理员、当前被指派人可修改' : undefined}>
                <Select
                  options={Object.entries(statusConfig).map(([k, v]) => ({ label: v.label, value: k }))}
                  disabled={!!editing && !canEditAssignee(editing)}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="assignee" label="指派给" extra={editing && !canEditAssignee(editing) ? '仅管理员、当前被指派人可修改' : undefined}>
                <Select
                  placeholder="搜索并选择处理人"
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  disabled={!!editing && !canEditAssignee(editing)}
                  filterOption={(input, option) =>
                    (option?.label ?? '').toString().toLowerCase().includes((input || '').toLowerCase())
                  }
                  options={userOptions.map((u) => {
                    const label = u.real_name ? `${u.real_name}(${u.username})` : u.username;
                    return { label, value: label };
                  })}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="steps_to_reproduce" label="复现步骤">
            <TextArea rows={3} placeholder="1. 打开页面...\n2. 点击...\n3. 出现..." />
          </Form.Item>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="expected_result" label="预期结果">
                <TextArea rows={2} placeholder="应该显示..." />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="actual_result" label="实际结果">
                <TextArea rows={2} placeholder="实际显示..." />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="补充说明">
            <TextArea rows={2} placeholder="其他补充信息（选填）" />
          </Form.Item>
          <Form.Item label="缺陷截图">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              {screenshots.map((url, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  <Image src={toImageSrc(url)} width={100} height={100} style={{ objectFit: 'cover', borderRadius: 8 }} />
                  <Button size="small" danger icon={<DeleteOutlined />}
                    style={{ position: 'absolute', top: 2, right: 2, minWidth: 20, width: 20, height: 20, padding: 0 }}
                    onClick={() => setScreenshots(screenshots.filter((_, j) => j !== i))} />
                </div>
              ))}
            </div>
            <Upload
              accept="image/*"
              showUploadList={false}
              beforeUpload={(file) => { handleUpload(file); return false; }}
            >
              <Button icon={<UploadOutlined />} loading={uploading}>上传截图</Button>
            </Upload>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Defects;
