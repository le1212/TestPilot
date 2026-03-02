import React, { useCallback, useEffect, useState } from 'react';
import {
  Card, Table, Tag, Space, Button, Input, Select, Modal, Empty, Spin,
  Typography, Tooltip, Row, Col, message, Statistic, Collapse, DatePicker, Form, Alert,
} from 'antd';
import dayjs from 'dayjs';
import {
  SearchOutlined, EyeOutlined, DownloadOutlined,
  CheckCircleOutlined, CloseCircleOutlined, ExclamationCircleOutlined,
  ClockCircleOutlined, ApiOutlined, GlobalOutlined, MobileOutlined, AppstoreOutlined,
  CodeOutlined, CopyOutlined, ExpandOutlined, DeleteOutlined, RobotOutlined,
  BugOutlined, ArrowLeftOutlined, ShareAltOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
const { TextArea } = Input;
import { getLogs, getExecution, deleteExecution, getProjects, analyzeLog, generateDefectFromExecution, createDefect, getUsersOptions } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { formatDateTime, formatDateTimeZh } from '../utils/date';
import { formatApiErrorDetail } from '../utils/errorMessage';
import ResizableTitle from '../components/ResizableTitle';
import MarkdownContent from '../components/MarkdownContent';
import ShareToIM from '../components/ShareToIM';

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
  api: <ApiOutlined />, web: <GlobalOutlined />,
  app: <MobileOutlined />, miniapp: <AppstoreOutlined />,
};

const highlightLog = (text: string) => {
  return text.split('\n').map((line, i) => {
    let color = '#d4d4d4';
    if (line.startsWith('[通过]')) color = '#52c41a';
    else if (line.startsWith('[失败]')) color = '#ff4d4f';
    else if (line.startsWith('[错误]')) color = '#fa8c16';
    else if (line.startsWith('[请求]')) color = '#569cd6';
    else if (line.startsWith('[响应]')) color = '#ce9178';
    return <div key={i} style={{ color, lineHeight: '22px' }}>{line || '\u00A0'}</div>;
  });
};

const Logs: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const params = useParams<{ id?: string }>();
  const executionIdFromRoute = params.id ? parseInt(params.id, 10) : null;
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [executionDetail, setExecutionDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [keyword, setKeyword] = useState('');
  const [filterDate, setFilterDate] = useState<string | undefined>();
  const [filterProjectId, setFilterProjectId] = useState<number | undefined>();
  const [projects, setProjects] = useState<any[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [defectGenOpen, setDefectGenOpen] = useState(false);
  const [defectGenLoading, setDefectGenLoading] = useState(false);
  const [generatedDefect, setGeneratedDefect] = useState<any>(null);
  const [defectSaveLoading, setDefectSaveLoading] = useState(false);
  const [defectAssignee, setDefectAssignee] = useState<string>('');
  const [defectUserOptions, setDefectUserOptions] = useState<{ id: number; username: string; real_name?: string }[]>([]);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState<{ execution_id: number; case_name: string; created_at?: string } | null>(null);

  useEffect(() => {
    getProjects().then((r) => setProjects(Array.isArray(r?.data) ? r.data : [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (detailOpen && detail?.execution_id) {
      getExecution(detail.execution_id)
        .then((r) => setExecutionDetail(r.data))
        .catch(() => setExecutionDetail(null));
    } else {
      setExecutionDetail(null);
    }
    if (!detailOpen && !executionIdFromRoute) setAiAnalysis(null);
  }, [detailOpen, detail?.execution_id, executionIdFromRoute]);

  useEffect(() => {
    if (!executionIdFromRoute || Number.isNaN(executionIdFromRoute)) return;
    setDetailLoading(true);
    setAiAnalysis(null);
    getExecution(executionIdFromRoute)
      .then((r) => {
        const d = r.data;
        setDetail(d ? { ...d, execution_id: d.id } : null);
        setExecutionDetail(d);
      })
      .catch(() => { message.error('执行记录不存在或已删除'); navigate('/logs'); })
      .finally(() => setDetailLoading(false));
  }, [executionIdFromRoute]);

  const runAnalyzeLog = async () => {
    if (!detail?.execution_id) return;
    setAiLoading(true);
    setAiAnalysis(null);
    try {
      const res = await analyzeLog({ execution_id: detail.execution_id });
      setAiAnalysis(res.data?.analysis ?? '');
    } catch {
      message.error('AI 分析请求失败');
    }
    setAiLoading(false);
  };

  const runGenerateDefect = async () => {
    if (!detail?.execution_id) return;
    setDefectGenLoading(true);
    setGeneratedDefect(null);
    setDefectAssignee('');
    getUsersOptions().then((r) => setDefectUserOptions(Array.isArray(r?.data) ? r.data : [])).catch(() => {});
    try {
      const res = await generateDefectFromExecution({ execution_id: detail.execution_id });
      setGeneratedDefect(res.data);
      setDefectGenOpen(true);
      if (res.data?._fallback) {
        message.warning('未解析到有效结果，已生成示例，请人工修改');
      }
    } catch (e: any) {
      message.error(formatApiErrorDetail(e.response?.data?.detail, '生成失败'));
    }
    setDefectGenLoading(false);
  };

  const ensureStr = (v: any, maxLen = 5000) => {
    if (v == null) return '';
    if (typeof v === 'string') return v.slice(0, maxLen);
    if (Array.isArray(v)) return v.map((x, i) => `${i + 1}. ${typeof x === 'string' ? x : String(x)}`).join('\n').slice(0, maxLen);
    return String(v).slice(0, maxLen);
  };

  const saveGeneratedDefect = async () => {
    if (!generatedDefect) return;
    setDefectSaveLoading(true);
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
      message.success('缺陷已保存，可到缺陷管理查看');
      setDefectGenOpen(false);
      setGeneratedDefect(null);
      setDefectAssignee('');
    } catch (e: any) {
      const msg = formatApiErrorDetail(e.response?.data?.detail, '保存失败');
      message.error(msg);
    }
    setDefectSaveLoading(false);
  };

  const load = async () => {
    setLoading(true);
    try {
      const params: any = { page: 1, page_size: 200 };
      if (filterStatus) params.status = filterStatus;
      if (keyword) params.keyword = keyword;
      if (filterDate) params.date = filterDate;
      if (filterProjectId) params.project_id = filterProjectId;
      const res = await getLogs(params);
      setLogs(Array.isArray(res?.data) ? res.data : []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    Modal.success({ content: '日志已复制到剪贴板', okText: '确定' });
  };

  const canDelete = (r: any) =>
    user && (user.is_admin || (r.created_by_id != null && r.created_by_id === user.id));

  /** 仅创建人、管理员、协作者可执行「根据此次失败生成缺陷」 */
  const canGenerateDefect = (record: any) =>
    user && (
      user.is_admin ||
      (record?.created_by_id != null && record.created_by_id === user.id) ||
      (record?.case_created_by_id != null && record.case_created_by_id === user.id) ||
      (Array.isArray(record?.case_collaborator_ids) && record.case_collaborator_ids.includes(user.id))
    );

  const defaultColWidths: Record<string, number> = {
    execution_id: 60, case_name: 140, project_name: 120, status: 100, logsize: 90, duration_ms: 90, created_at: 170,
    created_by_name: 120, preview: 180, actions: 280,
  };
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(defaultColWidths);
  const handleResize = useCallback((key: string, w: number) => setColumnWidths((prev) => ({ ...prev, [key]: w })), []);

  const downloadLog = (entry: any) => {
    const content = `TestPilot 日志导出\n${'='.repeat(60)}\n用例: ${entry.case_name}\n类型: ${entry.case_type}\n状态: ${entry.status}\n耗时: ${entry.duration_ms}ms\n时间: ${formatDateTimeZh(entry.created_at)}\n${'='.repeat(60)}\n\n${entry.logs}`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `log_${entry.execution_id}_${formatDateTime(entry.created_at, 'YYYYMMDDHHmmss')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns = [
    {
      title: <ResizableTitle dataKey="execution_id" width={columnWidths.execution_id} minWidth={50} onResize={handleResize}>ID</ResizableTitle>,
      dataIndex: 'execution_id',
      key: 'execution_id',
      width: columnWidths.execution_id,
      render: (id: number) => <Typography.Text type="secondary">#{id}</Typography.Text>,
    },
    {
      title: <ResizableTitle dataKey="case_name" width={columnWidths.case_name} minWidth={100} onResize={handleResize}>用例名称</ResizableTitle>,
      dataIndex: 'case_name',
      key: 'case_name',
      width: columnWidths.case_name,
      ellipsis: true,
      render: (t: string, r: any) => <Space>{typeIcons[r.case_type]}<span>{t}</span></Space>,
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
      title: <ResizableTitle dataKey="status" width={columnWidths.status} minWidth={80} onResize={handleResize}>状态</ResizableTitle>,
      dataIndex: 'status',
      key: 'status',
      width: columnWidths.status,
      render: (s: string) => {
        const cfg = statusConfig[s] || { color: 'default', icon: null };
        return <Tag color={cfg.color} icon={cfg.icon}>{statusLabel[s] || s}</Tag>;
      },
    },
    {
      title: <ResizableTitle dataKey="logsize" width={columnWidths.logsize} minWidth={70} onResize={handleResize}>日志大小</ResizableTitle>,
      dataIndex: 'logs',
      key: 'logsize',
      width: columnWidths.logsize,
      render: (log: string) => {
        const size = new Blob([log || '']).size;
        return size > 1024 ? `${(size / 1024).toFixed(1)} KB` : `${size} B`;
      },
    },
    {
      title: <ResizableTitle dataKey="duration_ms" width={columnWidths.duration_ms} minWidth={70} onResize={handleResize}>耗时</ResizableTitle>,
      dataIndex: 'duration_ms',
      key: 'duration_ms',
      width: columnWidths.duration_ms,
      render: (ms: number) => ms > 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`,
    },
    {
      title: <ResizableTitle dataKey="created_at" width={columnWidths.created_at} minWidth={120} onResize={handleResize}>时间</ResizableTitle>,
      dataIndex: 'created_at',
      key: 'created_at',
      width: columnWidths.created_at,
      render: (t: string) => formatDateTimeZh(t),
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
      title: <ResizableTitle dataKey="preview" width={columnWidths.preview} minWidth={120} onResize={handleResize}>日志预览</ResizableTitle>,
      key: 'preview',
      width: columnWidths.preview,
      ellipsis: true,
      render: (_: any, r: any) => (
        <Typography.Text
          ellipsis
          style={{ fontFamily: 'monospace', fontSize: 12, color: '#666' }}
        >
          {(r.logs || '').split('\n')[0] || '(空)'}
        </Typography.Text>
      ),
    },
    {
      title: <ResizableTitle dataKey="actions" width={columnWidths.actions} minWidth={200} onResize={handleResize}>操作</ResizableTitle>,
      key: 'actions',
      width: columnWidths.actions,
      fixed: 'right' as const,
      render: (_: any, r: any) => (
        <Space size={4} wrap={false}>
          <Tooltip title="查看完整日志">
            <Button type="link" size="small" icon={<ExpandOutlined />}
              onClick={() => navigate(`/logs/execution/${r.execution_id}`)}>查看</Button>
          </Tooltip>
          <Tooltip title="分享至即时通讯">
            <Button type="link" size="small" icon={<ShareAltOutlined />}
              onClick={() => { setShareTarget({ execution_id: r.execution_id, case_name: r.case_name || '未命名', created_at: r.created_at }); setShareOpen(true); }}>分享</Button>
          </Tooltip>
          <Tooltip title="复制日志">
            <Button type="link" size="small" icon={<CopyOutlined />}
              onClick={() => copyToClipboard(r.logs || '')}>复制</Button>
          </Tooltip>
          <Tooltip title="下载日志">
            <Button type="link" size="small" icon={<DownloadOutlined />}
              onClick={() => downloadLog(r)}>下载</Button>
          </Tooltip>
          {canDelete(r) && (
            <Tooltip title="删除该执行记录（同时移除本条日志）">
              <Button type="link" size="small" danger icon={<DeleteOutlined />}
                onClick={() => {
                  Modal.confirm({
                    title: '确认删除',
                    content: `确定要删除执行记录 #${r.execution_id} 的日志吗？该执行记录将被删除。`,
                    okText: '删除',
                    okType: 'danger',
                    cancelText: '取消',
                    onOk: async () => {
                      try {
                        await deleteExecution(r.execution_id);
                        message.success('已删除');
                        load();
                      } catch {
                        message.error('删除失败');
                      }
                    },
                  });
                }}
              >删除</Button>
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  const renderLogDetailBody = () => {
    if (!detail) return null;
    return (
      <div>
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Card size="small" bordered={false} style={{ background: '#fafafa', borderRadius: 8 }}>
              <Statistic title="用例" value={detail.case_name} valueStyle={{ fontSize: 14 }} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small" bordered={false} style={{ background: '#fafafa', borderRadius: 8 }}>
              <Statistic title="类型" value={(detail.case_type || '').toUpperCase()} valueStyle={{ fontSize: 14 }} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small" bordered={false} style={{ background: '#fafafa', borderRadius: 8 }}>
              <Statistic title="耗时" value={`${detail.duration_ms ?? 0}ms`} valueStyle={{ fontSize: 14 }} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small" bordered={false} style={{ background: '#fafafa', borderRadius: 8 }}>
              <Statistic title="时间" value={detail.created_at ? formatDateTimeZh(detail.created_at, 'YYYY年M月D日 HH:mm:ss') : '-'} valueStyle={{ fontSize: 14 }} />
            </Card>
          </Col>
        </Row>
        {aiAnalysis != null && (
          <Collapse
            style={{ marginBottom: 16 }}
            items={[{
              key: 'ai',
              label: <Space><RobotOutlined />AI 分析</Space>,
              children: <MarkdownContent content={aiAnalysis} />,
            }]}
          />
        )}
        {detail.case_type === 'web' && (() => {
          const res = executionDetail?.result;
          const list = Array.isArray(res?.screenshots) ? res.screenshots : (res?.screenshot_base64 ? [res.screenshot_base64] : []);
          const paths: string[] = Array.isArray(res?.screenshot_paths) ? res.screenshot_paths : [];
          if (list.length === 0) return null;
          return (
            <div style={{ marginBottom: 16 }}>
              <Collapse
                defaultActiveKey={[]}
                items={[{
                  key: 'screenshots',
                  label: `Web 执行截图（共 ${list.length} 张）`,
                  children: (
                    <>
                      {paths.length > 0 && (
                        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                          截图保存目录：{paths[0] ? paths[0].replace(/\\/g, '/').replace(/\/[^/]+\.png$/i, '') : ''}
                        </Typography.Text>
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {list.map((base64: string, idx: number) => (
                          <div key={idx}>
                            {list.length > 1 && (
                              <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>第 {idx + 1} 张</Typography.Text>
                            )}
                            {paths[idx] && (
                              <Typography.Text copyable style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>
                                保存路径: {paths[idx]}
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
          );
        })()}
        <div style={{
          background: '#1e1e1e', color: '#d4d4d4', padding: 20, borderRadius: 10,
          maxHeight: 500, overflow: 'auto', fontSize: 13,
          fontFamily: 'Consolas, Monaco, "Courier New", monospace', lineHeight: '24px',
        }}>
          <div style={{ color: '#666', marginBottom: 12, borderBottom: '1px solid #333', paddingBottom: 8 }}>
            TestPilot 日志查看器 — 执行记录 #{detail.execution_id ?? detail.id}
          </div>
          {highlightLog(detail.logs || '(无输出)')}
        </div>
      </div>
    );
  };

  if (executionIdFromRoute) {
    return (
      <div>
        <div style={{ marginBottom: 20 }}>
          <Space align="center" style={{ marginBottom: 8 }}>
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/logs')}>返回列表</Button>
          </Space>
          <h1 style={{ fontSize: 'var(--page-title-size)', fontWeight: 600, color: '#0f172a', margin: 0 }}>日志详情</h1>
          <p style={{ fontSize: 'var(--page-subtitle-size)', color: '#475569', margin: '4px 0 0' }}>{detail?.case_name ? `用例：${detail.case_name}` : '查看执行日志'}</p>
        </div>
        <Card
          className="page-card"
          bordered={false}
          title={
            <Space>
              <CodeOutlined />
              <span>日志详情 - {detail?.case_name || '加载中...'}</span>
              {detail && <Tag color={statusConfig[detail.status]?.color}>{statusLabel[detail.status] || detail.status}</Tag>}
            </Space>
          }
          extra={
            detail && (
              <Space>
                {(detail.status === 'failed' || detail.status === 'error') && (
                  canGenerateDefect(detail)
                    ? (
                        <Button icon={<BugOutlined />} loading={defectGenLoading} onClick={runGenerateDefect}>根据此次失败生成缺陷</Button>
                      )
                    : (
                        <Tooltip title="仅创建人、管理员、协作者可执行该功能">
                          <span>
                            <Button icon={<BugOutlined />} disabled>根据此次失败生成缺陷</Button>
                          </span>
                        </Tooltip>
                      )
                )}
                <Button icon={<ShareAltOutlined />} onClick={() => { setShareTarget({ execution_id: detail.execution_id, case_name: detail.case_name || '未命名', created_at: detail.created_at }); setShareOpen(true); }}>分享</Button>
                <Button icon={<RobotOutlined />} loading={aiLoading} onClick={runAnalyzeLog}>AI 分析</Button>
                <Button icon={<CopyOutlined />} onClick={() => copyToClipboard(detail.logs || '')}>复制日志</Button>
                <Button icon={<DownloadOutlined />} onClick={() => downloadLog(detail)}>下载日志</Button>
              </Space>
            )
          }
        >
          {detailLoading ? <div style={{ padding: 24, textAlign: 'center' }}><Spin tip="加载中..." /></div> : renderLogDetailBody()}
        </Card>
      <ShareToIM
        open={shareOpen}
        onCancel={() => { setShareOpen(false); setShareTarget(null); }}
        shareType="日志"
        itemTitle={shareTarget ? `${shareTarget.case_name} - ${formatDateTimeZh(shareTarget.created_at)}` : ''}
        path={shareTarget ? `/logs/execution/${shareTarget.execution_id}` : ''}
      />
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div className="page-title-block">
          <h1>日志查看</h1>
          <p>查看执行与系统日志</p>
        </div>
      </div>
      <Card className="page-card" bordered={false} style={{ marginBottom: 24 }}>
        <Row gutter={[16, 16]} className="filter-bar">
          <Col xs={24} sm={12} md={8} lg={6}>
            <Input
              placeholder="搜索日志内容"
              prefix={<SearchOutlined />}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onPressEnter={load}
              allowClear
              style={{ width: '100%' }}
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={6}>
            <Select
              placeholder="执行状态"
              value={filterStatus}
              onChange={setFilterStatus}
              style={{ width: '100%' }}
              allowClear
              options={[
                { label: '通过', value: 'passed' },
                { label: '失败', value: 'failed' },
                { label: '错误', value: 'error' },
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
              onChange={(_, dateStr) => setFilterDate((typeof dateStr === 'string' && dateStr) ? dateStr : undefined)}
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

      <Card
        className="page-card"
        bordered={false}
        title={<Space><CodeOutlined />执行日志 ({logs.length})</Space>}
      >
        <Table
          dataSource={logs}
          columns={columns}
          rowKey="id"
          loading={loading}
          tableLayout="fixed"
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
          size="middle"
          scroll={{ x: Object.values(columnWidths).reduce((a, b) => a + b, 0) }}
          expandable={{
            expandedRowRender: (record: any) => (
              <pre style={{
                background: '#1e1e1e', color: '#d4d4d4', padding: 16, borderRadius: 8,
                maxHeight: 300, overflow: 'auto', fontSize: 12, fontFamily: 'Consolas, Monaco, monospace',
                margin: 0, lineHeight: '22px',
              }}>
                {highlightLog(record.logs || '(空)')}
              </pre>
            ),
          }}
          locale={{ emptyText: <Empty description="暂无日志记录" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        />
      </Card>

      <ShareToIM
        open={shareOpen}
        onCancel={() => { setShareOpen(false); setShareTarget(null); }}
        shareType="日志"
        itemTitle={shareTarget ? `${shareTarget.case_name} - ${formatDateTimeZh(shareTarget.created_at)}` : ''}
        path={shareTarget ? `/logs/execution/${shareTarget.execution_id}` : ''}
      />
      <Modal
        title={<Space><BugOutlined />根据失败生成缺陷</Space>}
        open={defectGenOpen}
        onCancel={() => { setDefectGenOpen(false); setGeneratedDefect(null); }}
        footer={
          generatedDefect ? (
            <Space>
              <Button onClick={() => { setDefectGenOpen(false); setGeneratedDefect(null); }}>取消</Button>
              <Button type="primary" loading={defectSaveLoading} onClick={saveGeneratedDefect}>保存为缺陷</Button>
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
              options={defectUserOptions.map((u) => ({
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

export default Logs;
