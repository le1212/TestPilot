import React, { useCallback, useEffect, useState } from 'react';
import {
  Card, Table, Tag, Space, Button, Modal, Typography, Collapse,
  Empty, Spin, Select, Input, message, Row, Col, DatePicker, Alert, Tooltip,
} from 'antd';
import dayjs from 'dayjs';
import {
  CheckCircleOutlined,   CloseCircleOutlined, ExclamationCircleOutlined,
  ClockCircleOutlined, EyeOutlined, SearchOutlined, BugOutlined,
  ApiOutlined, GlobalOutlined, MobileOutlined, AppstoreOutlined,
  DeleteOutlined, RobotOutlined, ArrowLeftOutlined, ShareAltOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { getExecutions, getExecution, getProjects, createDefect, deleteExecution, getUsersOptions, analyzeLog, generateDefectFromExecution, batchRunTests, getEnvironments } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { formatDateTimeZh, formatDateOnlyZh, formatIsoDateZh } from '../utils/date';
import { formatApiErrorDetail } from '../utils/errorMessage';
import ResizableTitle from '../components/ResizableTitle';
import MarkdownContent from '../components/MarkdownContent';
import ShareToIM from '../components/ShareToIM';
import Breadcrumb from '../components/Breadcrumb';

const statusConfig: Record<string, { color: string; icon: React.ReactNode }> = {
  passed: { color: 'success', icon: <CheckCircleOutlined /> },
  failed: { color: 'error', icon: <CloseCircleOutlined /> },
  error: { color: 'warning', icon: <ExclamationCircleOutlined /> },
  running: { color: 'processing', icon: <ClockCircleOutlined /> },
  pending: { color: 'default', icon: <ClockCircleOutlined /> },
};

const statusLabel: Record<string, string> = {
  passed: '通过',
  failed: '失败',
  error: '错误',
  running: '运行中',
  pending: '等待中',
};

const typeIcons: Record<string, React.ReactNode> = {
  api: <ApiOutlined />,
  web: <GlobalOutlined />,
  app: <MobileOutlined />,
  miniapp: <AppstoreOutlined />,
};

const Executions: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams<{ id?: string }>();
  const detailIdFromRoute = params.id ? parseInt(params.id, 10) : null;
  const [executions, setExecutions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [sortBy, setSortBy] = useState<string | undefined>();
  const [filterDate, setFilterDate] = useState<string | undefined>();
  const [filterKeyword, setFilterKeyword] = useState<string>('');
  const [filterProjectId, setFilterProjectId] = useState<number | undefined>();
  const [projects, setProjects] = useState<any[]>([]);
  const [defectModalOpen, setDefectModalOpen] = useState(false);
  const [defectSubmitting, setDefectSubmitting] = useState(false);
  const [defectGenLoading, setDefectGenLoading] = useState(false);
  const [generatedDefect, setGeneratedDefect] = useState<any>(null);
  const [defectAssignee, setDefectAssignee] = useState<string>('');
  const [userOptions, setUserOptions] = useState<{ id: number; username: string; real_name?: string }[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState<{ id: number; case_name: string; created_at: string } | null>(null);
  const [rerunFailedLoading, setRerunFailedLoading] = useState(false);
  const [environments, setEnvironments] = useState<any[]>([]);

  useEffect(() => {
    if (detail?.id != null) setAiAnalysis(null);
  }, [detail?.id]);

  useEffect(() => {
    if (!detailIdFromRoute || Number.isNaN(detailIdFromRoute)) return;
    setDetailLoading(true);
    getExecution(detailIdFromRoute)
      .then((res) => setDetail(res.data))
      .catch(() => { message.error('执行记录不存在或已删除'); navigate('/executions'); })
      .finally(() => setDetailLoading(false));
  }, [detailIdFromRoute]);

  const defaultColWidths: Record<string, number> = {
    id: 60,
    case_name: 200,
    project_name: 120,
    status: 100,
    duration_ms: 100,
    exec_date: 110,
    created_at: 180,
    created_by_name: 120,
    environment_name: 100,
    actions: 160,
  };
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(defaultColWidths);
  const handleResize = useCallback((key: string, w: number) => {
    setColumnWidths((prev) => ({ ...prev, [key]: w }));
  }, []);

  const load = async (p = page, ps = pageSize) => {
    setLoading(true);
    try {
      const params: any = { page: p, page_size: ps };
      if (filterStatus) params.status = filterStatus;
      if (filterDate) params.date = filterDate;
      if (filterKeyword && filterKeyword.trim()) params.keyword = filterKeyword.trim();
      if (filterProjectId) params.project_id = filterProjectId;
      if (sortBy === 'failed_first') params.sort_by = 'failed_first';
      const res = await getExecutions(params);
      const body = res.data as { data?: any[]; total?: number };
      setExecutions(Array.isArray(body?.data) ? body.data : (body as any) || []);
      setTotal(typeof body?.total === 'number' ? body.total : (body as any)?.length ?? 0);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    const stateDate = (location.state as any)?.filterDate;
    if (stateDate && typeof stateDate === 'string') {
      setFilterDate(stateDate);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state]);
  useEffect(() => {
    getProjects().then((r) => setProjects(Array.isArray(r?.data) ? r.data : [])).catch(() => {});
  }, []);
  useEffect(() => {
    getEnvironments({ project_id: filterProjectId }).then((r) => setEnvironments(Array.isArray(r?.data) ? r.data : [])).catch(() => {});
  }, [filterProjectId]);
  useEffect(() => {
    load(1, pageSize);
  }, [filterDate, sortBy]);

  useEffect(() => {
    const openId = (location.state as any)?.openExecutionId;
    if (!openId) return;
    getExecution(openId)
      .then((res) => { setDetail(res.data); })
      .catch(() => { message.error('执行记录不存在或已删除'); })
      .finally(() => { navigate(location.pathname, { replace: true, state: {} }); });
  }, [location.state]);

  const runAnalyzeExecution = async () => {
    if (!detail?.id) return;
    setAiLoading(true);
    setAiAnalysis(null);
    try {
      const res = await analyzeLog({ execution_id: detail.id });
      setAiAnalysis(res.data?.analysis ?? '');
    } catch {
      message.error('AI 分析请求失败');
    }
    setAiLoading(false);
  };

  const openAiDefect = async () => {
    if (!detail?.id) return;
    setDefectGenLoading(true);
    setGeneratedDefect(null);
    setDefectAssignee('');
    getUsersOptions().then((r) => setUserOptions(Array.isArray(r?.data) ? r.data : [])).catch(() => {});
    try {
      const res = await generateDefectFromExecution({ execution_id: detail.id });
      setGeneratedDefect(res.data);
      setDefectModalOpen(true);
      if (res.data?._fallback) {
        message.warning('未解析到有效结果，已生成示例，请人工修改');
      }
    } catch (e: any) {
      message.error(formatApiErrorDetail(e.response?.data?.detail, 'AI 生成缺陷失败'));
    }
    setDefectGenLoading(false);
  };

  const ensureStr = (v: any, maxLen = 5000) => {
    if (v == null) return '';
    if (typeof v === 'string') return v.slice(0, maxLen);
    if (Array.isArray(v)) return v.map((x, i) => `${i + 1}. ${typeof x === 'string' ? x : String(x)}`).join('\n').slice(0, maxLen);
    return String(v).slice(0, maxLen);
  };

  const handleSaveAiDefect = async () => {
    if (!generatedDefect) return;
    setDefectSubmitting(true);
    try {
      await createDefect({
        project_id: generatedDefect.project_id,
        execution_id: generatedDefect.execution_id,
        test_case_id: generatedDefect.test_case_id,
        title: typeof generatedDefect.title === 'string' ? generatedDefect.title.slice(0, 500) : String(generatedDefect.title || ''),
        description: ensureStr(generatedDefect.description, 2000),
        severity: generatedDefect.severity || 'major',
        status: 'open',
        assignee: defectAssignee || '',
        screenshots: Array.isArray(generatedDefect.screenshots) ? generatedDefect.screenshots : [],
        steps_to_reproduce: ensureStr(generatedDefect.steps_to_reproduce, 2000),
        expected_result: ensureStr(generatedDefect.expected_result, 1000),
        actual_result: ensureStr(generatedDefect.actual_result, 1000),
      });
      setDefectModalOpen(false);
      setGeneratedDefect(null);
      setDetail(null);
      message.success('缺陷已保存，可到缺陷管理查看');
    } catch (e: any) {
      const msg = formatApiErrorDetail(e.response?.data?.detail, '保存失败');
      message.error(msg);
    }
    setDefectSubmitting(false);
  };

  const canDelete = (record: any) =>
    user && (user.is_admin || (record.created_by_id != null && record.created_by_id === user.id));

  /** 仅创建人、管理员、协作者可执行 AI 生成缺陷 */
  const canGenerateDefect = (record: any) =>
    user && (
      user.is_admin ||
      (record?.created_by_id != null && record.created_by_id === user.id) ||
      (record?.case_created_by_id != null && record.case_created_by_id === user.id) ||
      (Array.isArray(record?.case_collaborator_ids) && record.case_collaborator_ids.includes(user.id))
    );

  const failedExecutions = executions.filter((e: any) => e.status === 'failed' || e.status === 'error');
  const failedCaseIds = [...new Set(failedExecutions.map((e: any) => e.test_case_id))];

  const handleRerunFailed = async () => {
    if (failedCaseIds.length === 0) {
      message.warning('当前列表无失败或错误的执行记录');
      return;
    }
    setRerunFailedLoading(true);
    try {
      await batchRunTests({
        test_case_ids: failedCaseIds,
        environment_id: filterProjectId && environments.length > 0 ? environments[0]?.id : undefined,
      });
      message.success(`已提交 ${failedCaseIds.length} 个用例重跑`);
      load(page, pageSize);
    } catch (e: any) {
      message.error(e.response?.data?.detail || '重跑失败');
    }
    setRerunFailedLoading(false);
  };

  const columns = [
    {
      title: (
        <ResizableTitle dataKey="id" width={columnWidths.id} minWidth={50} onResize={handleResize}>
          ID
        </ResizableTitle>
      ),
      dataIndex: 'id',
      key: 'id',
      width: columnWidths.id,
    },
    {
      title: (
        <ResizableTitle dataKey="case_name" width={columnWidths.case_name} minWidth={100} onResize={handleResize}>
          用例名称
        </ResizableTitle>
      ),
      dataIndex: 'case_name',
      key: 'case_name',
      width: columnWidths.case_name,
      ellipsis: true,
      render: (text: string, record: any) => (
        <Space>
          {typeIcons[record.case_type]}
          <span>{text}</span>
        </Space>
      ),
    },
    {
      title: (
        <ResizableTitle dataKey="project_name" width={columnWidths.project_name} minWidth={80} onResize={handleResize}>
          项目
        </ResizableTitle>
      ),
      dataIndex: 'project_name',
      key: 'project_name',
      width: columnWidths.project_name,
      ellipsis: true,
      render: (v: string) => v || '-',
    },
    {
      title: (
        <ResizableTitle dataKey="status" width={columnWidths.status} minWidth={80} onResize={handleResize}>
          状态
        </ResizableTitle>
      ),
      dataIndex: 'status',
      key: 'status',
      width: columnWidths.status,
      render: (status: string) => {
        const cfg = statusConfig[status] || { color: 'default', icon: null };
        return (
          <Tag color={cfg.color} icon={cfg.icon}>
            {statusLabel[status] || status}
          </Tag>
        );
      },
    },
    {
      title: (
        <ResizableTitle dataKey="duration_ms" width={columnWidths.duration_ms} minWidth={70} onResize={handleResize}>
          耗时
        </ResizableTitle>
      ),
      dataIndex: 'duration_ms',
      key: 'duration_ms',
      width: columnWidths.duration_ms,
      render: (ms: number) => {
        if (ms > 1000) return `${(ms / 1000).toFixed(1)}s`;
        return `${ms}ms`;
      },
    },
    {
      title: (
        <ResizableTitle dataKey="exec_date" width={columnWidths.exec_date} minWidth={90} onResize={handleResize}>
          执行日期
        </ResizableTitle>
      ),
      dataIndex: 'created_at',
      key: 'exec_date',
      width: columnWidths.exec_date,
      render: (t: string) => formatDateOnlyZh(t),
    },
    {
      title: (
        <ResizableTitle dataKey="created_at" width={columnWidths.created_at} minWidth={140} onResize={handleResize}>
          执行时间
        </ResizableTitle>
      ),
      dataIndex: 'created_at',
      key: 'created_at',
      width: columnWidths.created_at,
      render: (t: string) => formatDateTimeZh(t),
    },
    {
      title: (
        <ResizableTitle dataKey="created_by_name" width={columnWidths.created_by_name} minWidth={80} onResize={handleResize}>
          创建人
        </ResizableTitle>
      ),
      dataIndex: 'created_by_name',
      key: 'created_by_name',
      width: columnWidths.created_by_name,
      ellipsis: true,
      render: (v: string) => v || '-',
    },
    {
      title: (
        <ResizableTitle dataKey="environment_name" width={columnWidths.environment_name} minWidth={80} onResize={handleResize}>
          环境
        </ResizableTitle>
      ),
      dataIndex: 'environment_name',
      key: 'environment_name',
      width: columnWidths.environment_name,
      ellipsis: true,
      render: (v: string) => v || '-',
    },
    {
      title: (
        <ResizableTitle dataKey="actions" width={columnWidths.actions} minWidth={100} onResize={handleResize}>
          操作
        </ResizableTitle>
      ),
      key: 'actions',
      width: columnWidths.actions,
      fixed: 'right' as const,
      render: (_: any, record: any) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/executions/${record.id}`)}
          >
            详情
          </Button>
          <Button
            type="link"
            size="small"
            icon={<ShareAltOutlined />}
            onClick={() => {
              setShareTarget({ id: record.id, case_name: record.case_name || '未命名', created_at: record.created_at });
              setShareOpen(true);
            }}
          >
            分享
          </Button>
          {canDelete(record) && (
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => {
                Modal.confirm({
                  title: '确认删除',
                  content: `确定要删除执行记录 #${record.id}（${record.case_name || '未命名'}）吗？关联的缺陷将解除与此执行的关联。`,
                  okText: '删除',
                  okType: 'danger',
                  cancelText: '取消',
                  onOk: async () => {
                    try {
                      await deleteExecution(record.id);
                      message.success('已删除');
                      load(page, pageSize);
                    } catch {
                      message.error('删除失败');
                    }
                  },
                });
              }}
            >
              删除
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const renderDetail = () => {
    if (!detail) return null;
    const { result, logs } = detail;
    const passed = detail.status === 'passed';
    const screenshotList = Array.isArray(result?.screenshots) ? result.screenshots : (result?.screenshot_base64 ? [result.screenshot_base64] : []);
    const screenshotPaths: string[] = Array.isArray(result?.screenshot_paths) ? result.screenshot_paths : [];

    return (
      <div>
        <Space style={{ marginBottom: 16 }} wrap>
          <Tag color={passed ? 'success' : 'error'} style={{ fontSize: 14, padding: '4px 12px' }}>
            {statusLabel[detail.status] || detail.status}
          </Tag>
          <Typography.Text type="secondary">耗时: {detail.duration_ms}ms</Typography.Text>
          <Typography.Text type="secondary">
            时间: {formatDateTimeZh(detail.created_at)}
          </Typography.Text>
          {detail.environment_name && (
            <Typography.Text type="secondary">环境: {detail.environment_name}</Typography.Text>
          )}
        </Space>

        {aiAnalysis != null && aiAnalysis !== '' && (
          <Collapse
            style={{ marginBottom: 16 }}
            items={[{
              key: 'ai',
              label: <Space><RobotOutlined />AI 分析</Space>,
              children: <MarkdownContent content={aiAnalysis} />,
            }]}
          />
        )}

        {screenshotList.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <Collapse
              defaultActiveKey={[]}
              items={[{
                key: 'screenshots',
                label: `Web 执行截图（共 ${screenshotList.length} 张）`,
                children: (
                  <>
                    {screenshotPaths.length > 0 && (
                      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                        截图保存目录：{screenshotPaths[0] ? screenshotPaths[0].replace(/\\/g, '/').replace(/\/[^/]+\.png$/i, '') : ''}
                      </Typography.Text>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {screenshotList.map((base64: string, idx: number) => (
                        <div key={idx}>
                          {screenshotList.length > 1 && (
                            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>第 {idx + 1} 张</Typography.Text>
                          )}
                          {screenshotPaths[idx] && (
                            <Typography.Text copyable style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>
                              保存路径: {screenshotPaths[idx]}
                            </Typography.Text>
                          )}
                          <img
                            src={`data:image/png;base64,${base64}`}
                            alt={`执行截图 ${idx + 1}`}
                            style={{
                              maxWidth: '100%',
                              borderRadius: 8,
                              border: '1px solid #e8e8e8',
                              boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </>
                ),
              }]}
            />
          </div>
        )}

        <Collapse
          defaultActiveKey={[]}
          items={[
            ...(result?.response ? [{
              key: 'response',
              label: `响应内容（状态码: ${result.response.status_code || '未知'}）`,
              children: (
                <pre style={{
                  background: '#f5f5f5', padding: 16, borderRadius: 8, overflow: 'auto',
                  maxHeight: 400, fontSize: 13, fontFamily: 'monospace', margin: 0,
                }}>
                  {typeof result.response.body === 'object'
                    ? JSON.stringify(result.response.body, null, 2)
                    : result.response.body || '(空)'}
                </pre>
              ),
            }] : []),
            ...(result?.steps_result?.length > 0 ? [{
              key: 'steps',
              label: `步骤结果 (${result.steps_result.filter((s: any) => s.passed).length}/${result.steps_result.length})`,
              children: (
                <div>
                  {result.steps_result.map((s: any, i: number) => (
                    <div
                      key={i}
                      style={{
                        padding: '8px 12px',
                        marginBottom: 4,
                        borderRadius: 6,
                        background: s.passed ? '#f6ffed' : '#fff2f0',
                        border: `1px solid ${s.passed ? '#b7eb8f' : '#ffccc7'}`,
                      }}
                    >
                      {s.passed ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : <CloseCircleOutlined style={{ color: '#ff4d4f' }} />}
                      <span style={{ marginLeft: 8 }}>步骤{s.index} [{s.action}]: {s.message}</span>
                    </div>
                  ))}
                </div>
              ),
            }] : []),
            ...(result?.assertions?.length > 0 ? [{
              key: 'assertions',
              label: `断言结果 (${result.assertions.filter((a: any) => a.passed).length}/${result.assertions.length})`,
              children: (
                <div>
                  {result.assertions.map((a: any, i: number) => (
                    <div
                      key={i}
                      style={{
                        padding: '8px 12px',
                        marginBottom: 4,
                        borderRadius: 6,
                        background: a.passed ? '#f6ffed' : '#fff2f0',
                        border: `1px solid ${a.passed ? '#b7eb8f' : '#ffccc7'}`,
                      }}
                    >
                      {a.passed
                        ? <CheckCircleOutlined style={{ color: '#52c41a' }} />
                        : <CloseCircleOutlined style={{ color: '#ff4d4f' }} />}
                      <span style={{ marginLeft: 8 }}>{a.message}</span>
                    </div>
                  ))}
                </div>
              ),
            }] : []),
            {
              key: 'logs',
              label: '执行日志',
              children: (
                <pre style={{
                  background: '#1e1e1e', color: '#d4d4d4', padding: 16, borderRadius: 8,
                  overflow: 'auto', maxHeight: 400, fontSize: 12, fontFamily: 'monospace', margin: 0,
                }}>
                  {logs || '(无日志)'}
                </pre>
              ),
            },
            ...(result?.error ? [{
              key: 'error',
              label: '错误信息',
              children: (
                <Typography.Text type="danger">{result.error}</Typography.Text>
              ),
            }] : []),
          ]}
        />
      </div>
    );
  };

  if (detailIdFromRoute) {
    const execBreadcrumb = [
      { label: '项目', path: '/projects' },
      { label: '执行记录', path: '/executions' },
      { label: detail?.case_name ?? '加载中...' },
    ];
    return (
      <div>
        <div style={{ marginBottom: 20 }}>
          <Breadcrumb items={execBreadcrumb} />
          <Space align="center" style={{ marginBottom: 8 }}>
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/executions')}>返回列表</Button>
          </Space>
          <h1 style={{ fontSize: 'var(--page-title-size)', fontWeight: 600, color: '#0f172a', margin: 0 }}>执行详情</h1>
          <p style={{ fontSize: 'var(--page-subtitle-size)', color: '#475569', margin: '4px 0 0' }}>{detail?.case_name ? `用例：${detail.case_name}` : '查看执行结果'}</p>
        </div>
        <Card className="page-card" bordered={false}
          title={detail ? <Space><EyeOutlined /> 执行详情 - {detail.case_name}</Space> : '加载中...'}
          extra={
            detail && (
              <Space>
                <Button icon={<ShareAltOutlined />} onClick={() => { setShareTarget({ id: detail.id, case_name: detail.case_name || '未命名', created_at: detail.created_at }); setShareOpen(true); }}>分享</Button>
                <Button icon={<RobotOutlined />} loading={aiLoading} onClick={runAnalyzeExecution}>AI 分析</Button>
                {(detail.status === 'failed' || detail.status === 'error') && (
                  canGenerateDefect(detail)
                    ? (
                        <Button type="primary" icon={<BugOutlined />} loading={defectGenLoading} onClick={openAiDefect}>AI生成缺陷</Button>
                      )
                    : (
                        <Tooltip title="仅创建人、管理员、协作者可执行该功能">
                          <span>
                            <Button type="primary" icon={<BugOutlined />} disabled>AI生成缺陷</Button>
                          </span>
                        </Tooltip>
                      )
                )}
              </Space>
            )
          }
        >
          {detailLoading ? <Spin tip="加载中..." /> : renderDetail()}
        </Card>
      <ShareToIM
        open={shareOpen}
        onCancel={() => { setShareOpen(false); setShareTarget(null); }}
        shareType="执行记录"
        itemTitle={shareTarget ? `${shareTarget.case_name} - ${formatDateTimeZh(shareTarget.created_at)}` : ''}
        path={shareTarget ? `/executions/${shareTarget.id}` : ''}
      />
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div className="page-title-block">
          <h1>执行记录</h1>
          <p>查看与筛选测试执行结果</p>
        </div>
      </div>
      <Card className="page-card" bordered={false} style={{ marginBottom: 24 }}>
        <Row gutter={[16, 16]} className="filter-bar">
          <Col xs={24} sm={12} md={8} lg={6}>
            <Input
              placeholder="搜索用例名称"
              prefix={<SearchOutlined />}
              value={filterKeyword}
              onChange={(e) => setFilterKeyword(e.target.value)}
              onPressEnter={() => { setPage(1); load(1, pageSize); }}
              allowClear
              style={{ width: '100%' }}
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={6}>
            <Select
              placeholder="执行状态"
              value={filterStatus}
              onChange={(v) => setFilterStatus(v)}
              style={{ width: '100%' }}
              allowClear
              options={[
                { label: '全部状态', value: undefined },
                { label: '通过', value: 'passed' },
                { label: '失败', value: 'failed' },
                { label: '错误', value: 'error' },
                { label: '运行中', value: 'running' },
              ]}
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={6}>
            <Select
              placeholder="所属项目"
              value={filterProjectId}
              onChange={(v) => setFilterProjectId(v)}
              style={{ width: '100%' }}
              allowClear
              options={[
                { label: '全部项目', value: undefined },
                ...(projects || []).map((p: any) => ({ label: p.name, value: p.id })),
              ]}
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={6}>
            <DatePicker
              placeholder="按日期筛选"
              value={filterDate ? dayjs(filterDate) : null}
              onChange={(_, dateStr) => {
                const next = (typeof dateStr === 'string' && dateStr) ? dateStr : undefined;
                setFilterDate(next);
                setPage(1);
              }}
              style={{ width: '100%' }}
              allowClear
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={6}>
            <Select
              placeholder="排序"
              value={sortBy}
              onChange={(v) => setSortBy(v)}
              style={{ width: '100%' }}
              allowClear
              options={[
                { label: '默认（时间倒序）', value: undefined },
                { label: '失败优先', value: 'failed_first' },
              ]}
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={6}>
            <Button type="primary" icon={<SearchOutlined />} onClick={() => { setPage(1); load(1, pageSize); }} block>查询</Button>
          </Col>
          <Col xs={24}>
            <Typography.Text type="secondary">修改筛选后请点击查询；日期按自然日（Asia/Shanghai）归属，当天的执行会统计在当天。</Typography.Text>
            {filterDate && (
              <span style={{ marginLeft: 12 }}>
                <Tag color="blue">按日期：{formatIsoDateZh(filterDate)}</Tag>
                <Button type="link" size="small" onClick={() => { setFilterDate(undefined); setPage(1); load(1, pageSize); }}>清除日期</Button>
              </span>
            )}
          </Col>
        </Row>
      </Card>

      <Card
        className="page-card"
        bordered={false}
        title={`执行记录 (${total})`}
        extra={
          failedCaseIds.length > 0 && (
            <Button
              type="default"
              icon={<ReloadOutlined />}
              loading={rerunFailedLoading}
              onClick={handleRerunFailed}
            >
              仅重跑失败 ({failedCaseIds.length})
            </Button>
          )
        }
      >
        <Table
          dataSource={executions}
          columns={columns}
          rowKey="id"
          loading={loading}
          tableLayout="fixed"
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p, ps) => { setPage(p); setPageSize(ps || 50); load(p, ps || 50); },
          }}
          size="middle"
          scroll={{ x: Object.values(columnWidths).reduce((a, b) => a + b, 0) }}
          locale={{ emptyText: <Empty description="暂无执行记录" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        />
      </Card>

      <ShareToIM
        open={shareOpen}
        onCancel={() => { setShareOpen(false); setShareTarget(null); }}
        shareType="执行记录"
        itemTitle={shareTarget ? `${shareTarget.case_name} - ${formatDateTimeZh(shareTarget.created_at)}` : ''}
        path={shareTarget ? `/executions/${shareTarget.id}` : ''}
      />
      <Modal
        title={<Space><BugOutlined />AI生成缺陷</Space>}
        open={defectModalOpen}
        onCancel={() => { setDefectModalOpen(false); setGeneratedDefect(null); }}
        footer={
          generatedDefect ? (
            <Space>
              <Button onClick={() => { setDefectModalOpen(false); setGeneratedDefect(null); }}>取消</Button>
              <Button type="primary" loading={defectSubmitting} onClick={handleSaveAiDefect}>保存为缺陷</Button>
            </Space>
          ) : null
        }
        width={560}
        destroyOnClose
      >
        {generatedDefect && (
          <div>
            <Typography.Paragraph strong>标题</Typography.Paragraph>
            <Typography.Paragraph>{generatedDefect.title}</Typography.Paragraph>
            <Typography.Paragraph strong>严重程度</Typography.Paragraph>
            <Typography.Paragraph>{generatedDefect.severity}</Typography.Paragraph>
            <Typography.Paragraph strong>复现步骤</Typography.Paragraph>
            <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>{generatedDefect.steps_to_reproduce || '-'}</Typography.Paragraph>
            <Typography.Paragraph strong>预期结果</Typography.Paragraph>
            <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>{generatedDefect.expected_result || '-'}</Typography.Paragraph>
            <Typography.Paragraph strong>实际结果</Typography.Paragraph>
            <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>{generatedDefect.actual_result || '-'}</Typography.Paragraph>
            {generatedDefect.description && (
              <>
                <Typography.Paragraph strong>补充说明</Typography.Paragraph>
                <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>{generatedDefect.description}</Typography.Paragraph>
              </>
            )}
            <Typography.Paragraph strong style={{ marginTop: 16 }}>指派人员</Typography.Paragraph>
            <Select
              placeholder="选择处理人（可编辑）"
              allowClear
              showSearch
              optionFilterProp="label"
              style={{ width: '100%', marginBottom: 12 }}
              value={defectAssignee || undefined}
              onChange={(v) => setDefectAssignee(v ?? '')}
              options={userOptions.map((u) => ({
                label: u.real_name ? `${u.real_name}(${u.username})` : u.username,
                value: u.real_name ? `${u.real_name}(${u.username})` : u.username,
              }))}
            />
            <Typography.Text type="secondary">保存后可在「缺陷管理」中编辑或推送 Jira。</Typography.Text>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Executions;
