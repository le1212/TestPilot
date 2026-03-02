import React, { useCallback, useEffect, useState } from 'react';
import { jsPDF } from 'jspdf';
import {
  Card, Button, Table, Tag, Space, Modal, Form, Input, Select,
  message, Popconfirm, Row, Col, Statistic, Progress, Collapse,
  Empty, Spin, Typography, Descriptions, Divider, Tabs, Alert, DatePicker,
} from 'antd';
import dayjs from 'dayjs';
import {
  PlusOutlined, DeleteOutlined, EyeOutlined, FileTextOutlined, SearchOutlined,
  CheckCircleOutlined, CloseCircleOutlined, ExclamationCircleOutlined,
  BarChartOutlined, ApiOutlined, GlobalOutlined, MobileOutlined, AppstoreOutlined,
  RobotOutlined, ArrowLeftOutlined, ShareAltOutlined, FilePdfOutlined,
} from '@ant-design/icons';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { getReports, createReport, deleteReport, getReport, getProjects, analyzeReport } from '../api';
import { setAIChatContext } from '../utils/aiChatContext';
import { useAuth } from '../contexts/AuthContext';
import { formatDateTimeZh } from '../utils/date';
import ResizableTitle from '../components/ResizableTitle';
import MarkdownContent from '../components/MarkdownContent';
import ShareToIM from '../components/ShareToIM';
import Breadcrumb from '../components/Breadcrumb';

const typeIcons: Record<string, React.ReactNode> = {
  api: <ApiOutlined />, web: <GlobalOutlined />,
  app: <MobileOutlined />, miniapp: <AppstoreOutlined />,
};

const statusLabel: Record<string, string> = {
  passed: '通过',
  failed: '失败',
  error: '错误',
  running: '运行中',
  pending: '等待中',
};

const Reports: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams<{ id?: string }>();
  const detailIdFromRoute = params.id ? parseInt(params.id, 10) : null;
  const [reports, setReports] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterDate, setFilterDate] = useState<string | undefined>();
  const [filterKeyword, setFilterKeyword] = useState<string>('');
  const [filterProjectId, setFilterProjectId] = useState<number | undefined>();
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reportAiAnalysis, setReportAiAnalysis] = useState<string | null>(null);
  const [reportAiLoading, setReportAiLoading] = useState(false);
  const [form] = Form.useForm();
  const [shareOpen, setShareOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState<{ id: number; name: string } | null>(null);

  const defaultColWidths: Record<string, number> = {
    name: 180, project_name: 140, created_by_name: 120, result: 220, pass_rate: 120, duration_ms: 90, created_at: 170, actions: 140,
  };
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(defaultColWidths);
  const handleResize = useCallback((key: string, w: number) => setColumnWidths((prev) => ({ ...prev, [key]: w })), []);

  const load = async () => {
    setLoading(true);
    try {
      const params: any = { page: 1, page_size: 50 };
      if (filterDate) params.date = filterDate;
      if (filterKeyword && filterKeyword.trim()) params.keyword = filterKeyword.trim();
      if (filterProjectId) params.project_id = filterProjectId;
      const [rRes, pRes] = await Promise.all([
        getReports(params),
        getProjects(),
      ]);
      setReports(Array.isArray(rRes?.data) ? rRes.data : []);
      setProjects(Array.isArray(pRes?.data) ? pRes.data : []);
    } catch { message.error('加载失败'); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [filterDate, filterKeyword, filterProjectId]);

  useEffect(() => {
    const openId = (location.state as any)?.openReportId;
    const id = openId != null ? Number(openId) : NaN;
    if (Number.isNaN(id) || id < 1) return;
    navigate(`/reports/${id}`, { replace: true, state: {} });
  }, [location.state, navigate]);

  useEffect(() => {
    if (!detailIdFromRoute || Number.isNaN(detailIdFromRoute)) return;
    setDetailLoading(true);
    setReportAiAnalysis(null);
    getReport(detailIdFromRoute)
      .then((res) => setDetail(res.data))
      .catch(() => { message.error('报告不存在或已删除'); navigate('/reports'); })
      .finally(() => setDetailLoading(false));
  }, [detailIdFromRoute]);

  const allureGenerating = detail?.summary?.allure?.status === 'generating';
  const showingDetail = detailOpen || !!detailIdFromRoute;
  useEffect(() => {
    if (!showingDetail || !detail?.id || !allureGenerating) return;
    const timer = setInterval(async () => {
      try {
        const res = await getReport(detail.id);
        setDetail(res.data);
        const nextAllure = res.data?.summary?.allure;
        if (nextAllure?.html_ready || (nextAllure?.status && nextAllure.status !== 'generating')) {
          clearInterval(timer);
        }
      } catch {
        message.error('获取报告状态失败');
        clearInterval(timer);
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [showingDetail, detail?.id, allureGenerating]);

  const handleCreate = async () => {
    const values = await form.validateFields();
    const execution_ids = Array.isArray(values.execution_ids)
      ? values.execution_ids.map((id: any) => Number(id)).filter((n: number) => !Number.isNaN(n) && n > 0)
      : [];
    const status_filter = values.status_filter || undefined;
    try {
      await createReport({ ...values, execution_ids, status_filter });
      message.success('报告生成成功');
      setCreateOpen(false);
      form.resetFields();
      load();
    } catch { message.error('生成失败'); }
  };

  const handleDelete = async (id: number) => {
    await deleteReport(id);
    message.success('删除成功');
    load();
  };

  const canDelete = (r: any) =>
    user && (user.is_admin || (r.created_by_id != null && r.created_by_id === user.id));

  const openDetail = async (id: number) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setReportAiAnalysis(null);
    try {
      const res = await getReport(id);
      setDetail(res.data);
    } catch { message.error('加载失败'); }
    setDetailLoading(false);
  };

  const runAnalyzeReport = async () => {
    if (!detail?.id) return;
    setReportAiLoading(true);
    setReportAiAnalysis(null);
    try {
      const res = await analyzeReport({ report_id: detail.id });
      setReportAiAnalysis(res.data?.analysis ?? '');
    } catch {
      message.error('AI 分析请求失败');
    }
    setReportAiLoading(false);
  };

  const exportToPdf = () => {
    if (!detail) return;
    const doc = new jsPDF();
    const { summary, details, name, pass_rate, project_name, created_at } = detail;
    let y = 20;
    doc.setFontSize(18);
    doc.text(name || '测试报告', 14, y);
    y += 12;
    doc.setFontSize(11);
    doc.text(`项目: ${project_name || '-'} | 生成时间: ${formatDateTimeZh(created_at)}`, 14, y);
    y += 12;
    doc.setFontSize(14);
    doc.text('汇总', 14, y);
    y += 8;
    doc.setFontSize(11);
    const s = summary || {};
    doc.text(`通过: ${s.passed ?? 0}  失败: ${s.failed ?? 0}  错误: ${s.error ?? 0}  总计: ${s.total ?? 0}  通过率: ${pass_rate ?? 0}%`, 14, y);
    y += 15;
    if (Array.isArray(details) && details.length > 0) {
      doc.setFontSize(14);
      doc.text('执行明细', 14, y);
      y += 8;
      doc.setFontSize(10);
      const colWidths = [70, 25, 25, 30, 35];
      doc.text('用例名称', 14, y);
      doc.text('状态', 84, y);
      doc.text('耗时', 109, y);
      doc.text('断言', 134, y);
      y += 6;
      doc.setDrawColor(200, 200, 200);
      doc.line(14, y, 190, y);
      y += 6;
      for (const row of details.slice(0, 30)) {
        if (y > 270) { doc.addPage(); y = 20; }
        const caseName = (row.case_name || '').slice(0, 28);
        const status = statusLabel[row.status] || row.status || '-';
        const dur = row.duration_ms != null ? `${row.duration_ms}ms` : '-';
        const assertions = row.assertions?.length ? `${row.assertions.filter((a: any) => a.passed).length}/${row.assertions.length}` : '-';
        doc.text(caseName, 14, y);
        doc.text(status, 84, y);
        doc.text(dur, 109, y);
        doc.text(assertions, 134, y);
        y += 6;
      }
      if (details.length > 30) {
        doc.text(`... 共 ${details.length} 条，仅导出前 30 条`, 14, y + 4);
      }
    }
    doc.save(`${(name || 'report').replace(/[/\\?%*:|"<>]/g, '_')}.pdf`);
    message.success('PDF 已导出');
  };

  const columns = [
    {
      title: <ResizableTitle dataKey="name" width={columnWidths.name} minWidth={100} onResize={handleResize}>报告名称</ResizableTitle>,
      dataIndex: 'name',
      key: 'name',
      width: columnWidths.name,
      ellipsis: true,
      render: (t: string) => <Typography.Text strong>{t}</Typography.Text>,
    },
    {
      title: <ResizableTitle dataKey="project_name" width={columnWidths.project_name} minWidth={80} onResize={handleResize}>项目</ResizableTitle>,
      dataIndex: 'project_name',
      key: 'project_name',
      width: columnWidths.project_name,
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
      title: <ResizableTitle dataKey="result" width={columnWidths.result} minWidth={160} onResize={handleResize}>结果</ResizableTitle>,
      key: 'result',
      width: columnWidths.result,
      render: (_: any, r: any) => (
        <Space>
          <Tag color="success"><CheckCircleOutlined /> {r.passed}</Tag>
          <Tag color="error"><CloseCircleOutlined /> {r.failed}</Tag>
          <Tag color="warning"><ExclamationCircleOutlined /> {r.error}</Tag>
          <span style={{ color: '#999', fontSize: 12 }}>共{r.total}</span>
        </Space>
      ),
    },
    {
      title: <ResizableTitle dataKey="pass_rate" width={columnWidths.pass_rate} minWidth={80} onResize={handleResize}>通过率</ResizableTitle>,
      dataIndex: 'pass_rate',
      key: 'pass_rate',
      width: columnWidths.pass_rate,
      render: (v: string) => {
        const n = parseFloat(v);
        return <Progress percent={n} size="small" status={n >= 80 ? 'success' : n >= 50 ? 'normal' : 'exception'} />;
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
      title: <ResizableTitle dataKey="created_at" width={columnWidths.created_at} minWidth={120} onResize={handleResize}>生成时间</ResizableTitle>,
      dataIndex: 'created_at',
      key: 'created_at',
      width: columnWidths.created_at,
      render: (t: string) => formatDateTimeZh(t),
    },
    {
      title: <ResizableTitle dataKey="actions" width={columnWidths.actions} minWidth={100} onResize={handleResize}>操作</ResizableTitle>,
      key: 'actions',
      width: columnWidths.actions,
      fixed: 'right' as const,
      render: (_: any, r: any) => (
        <Space size={4}>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => navigate(`/reports/${r.id}`)}>查看</Button>
          <Button type="link" size="small" icon={<ShareAltOutlined />} onClick={() => { setShareTarget({ id: r.id, name: r.name }); setShareOpen(true); }}>分享</Button>
          {canDelete(r) && (
            <Popconfirm title="确定删除该报告吗？" okText="确定删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={() => handleDelete(r.id)}>
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const detailColumns = [
    {
      title: '用例名称', dataIndex: 'case_name', key: 'case_name', ellipsis: true,
      render: (t: string, r: any) => <Space>{typeIcons[r.case_type]}<span>{t}</span></Space>,
    },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 100,
      render: (s: string) => (
        <Tag color={s === 'passed' ? 'success' : s === 'failed' ? 'error' : 'warning'}>{statusLabel[s] || s}</Tag>
      ),
    },
    {
      title: '耗时', dataIndex: 'duration_ms', key: 'duration_ms', width: 90,
      render: (ms: number) => `${ms}ms`,
    },
    {
      title: '断言', key: 'assertions', width: 100,
      render: (_: any, r: any) => {
        const a = r.assertions || [];
        const p = a.filter((x: any) => x.passed).length;
        return a.length > 0 ? <span>{p}/{a.length}</span> : <span style={{ color: '#ccc' }}>-</span>;
      },
    },
  ];

  const renderDetailContent = () => {
    if (detailLoading) return <Spin />;
    if (!detail) return <Empty />;
    const { summary, details } = detail;
    const rate = parseFloat(detail.pass_rate);

    return (
      <div>
        <Space style={{ marginBottom: 16 }}>
          <Button icon={<ShareAltOutlined />} onClick={() => { setShareTarget({ id: detail.id, name: detail.name }); setShareOpen(true); }}>分享</Button>
          <Button icon={<FilePdfOutlined />} onClick={exportToPdf}>导出 PDF</Button>
          <Button icon={<RobotOutlined />} loading={reportAiLoading} onClick={runAnalyzeReport}>AI 分析报告</Button>
          <Button icon={<RobotOutlined />} onClick={() => {
            const s = detail.summary || {};
            const summary = `报告：${detail.name}\n通过：${s.passed ?? 0} 失败：${s.failed ?? 0} 错误：${s.error ?? 0} 总计：${s.total ?? 0}\n通过率：${detail.pass_rate ?? 0}%`;
            setAIChatContext({ source: 'report', id: detail.id, title: detail.name, summary });
            navigate('/ai-chat');
          }}>向 AI 提问</Button>
        </Space>
        {reportAiAnalysis != null && (
          <Collapse
            style={{ marginBottom: 24 }}
            items={[{
              key: 'ai',
              label: <Space><RobotOutlined />AI 分析</Space>,
              children: <MarkdownContent content={reportAiAnalysis} />,
            }]}
          />
        )}
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={5}>
            <Card size="small" bordered={false} style={{ background: '#f6ffed', borderRadius: 8, textAlign: 'center' }}>
              <Statistic title="通过" value={summary.passed} valueStyle={{ color: '#52c41a' }} prefix={<CheckCircleOutlined />} />
            </Card>
          </Col>
          <Col span={5}>
            <Card size="small" bordered={false} style={{ background: '#fff2f0', borderRadius: 8, textAlign: 'center' }}>
              <Statistic title="失败" value={summary.failed} valueStyle={{ color: '#ff4d4f' }} prefix={<CloseCircleOutlined />} />
            </Card>
          </Col>
          <Col span={5}>
            <Card size="small" bordered={false} style={{ background: '#fff7e6', borderRadius: 8, textAlign: 'center' }}>
              <Statistic title="错误" value={summary.error} valueStyle={{ color: '#fa8c16' }} prefix={<ExclamationCircleOutlined />} />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small" bordered={false} style={{ background: '#e6f4ff', borderRadius: 8, textAlign: 'center' }}>
              <Statistic title="总计" value={summary.total} />
            </Card>
          </Col>
          <Col span={5}>
            <Card size="small" bordered={false} style={{ background: '#fafafa', borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>通过率</div>
              <Progress type="circle" percent={rate} size={64} status={rate >= 80 ? 'success' : rate >= 50 ? 'normal' : 'exception'} />
            </Card>
          </Col>
        </Row>

        <Table
          dataSource={details}
          columns={detailColumns}
          rowKey="execution_id"
          size="small"
          pagination={false}
          expandable={{
            expandedRowRender: (record: any) => (
              <div>
                {record.assertions?.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>断言结果</Typography.Text>
                    {record.assertions.map((a: any, i: number) => (
                      <div key={i} style={{
                        padding: '6px 12px', marginBottom: 4, borderRadius: 6,
                        background: a.passed ? '#f6ffed' : '#fff2f0',
                        border: `1px solid ${a.passed ? '#b7eb8f' : '#ffccc7'}`, fontSize: 13,
                      }}>
                        {a.passed ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : <CloseCircleOutlined style={{ color: '#ff4d4f' }} />}
                        <span style={{ marginLeft: 8 }}>{a.message}</span>
                      </div>
                    ))}
                  </div>
                )}
                {record.error && <Typography.Text type="danger">错误: {record.error}</Typography.Text>}
                {record.logs && (
                  <Collapse defaultActiveKey={[]} size="small" items={[{
                    key: 'log', label: '执行日志',
                    children: (
                      <pre style={{
                        background: '#1e1e1e', color: '#d4d4d4', padding: 12, borderRadius: 6,
                        maxHeight: 200, overflow: 'auto', fontSize: 12, fontFamily: 'monospace', margin: 0,
                      }}>{record.logs}</pre>
                    ),
                  }]} />
                )}
              </div>
            ),
          }}
        />
      </div>
    );
  };

  const renderAllureContent = () => {
    if (detailLoading) return <Spin />;
    if (!detail) return <Empty />;

    const allure = detail?.summary?.allure;
    const htmlReady = !!allure?.html_ready;
    const htmlUrl = allure?.html_url as string | undefined;
    const reason = allure?.reason as string | undefined;
    const generating = allure?.status === 'generating';

    if (generating) {
      return (
        <div style={{ padding: 24, textAlign: 'center' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16, color: '#666' }}>正在生成 Allure HTML 报告，请稍候…</div>
          <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>生成完成后将收到系统通知</div>
        </div>
      );
    }

    if (!htmlReady || !htmlUrl) {
      return (
        <div>
          <Alert
            type="warning"
            showIcon
            message="Allure HTML 报告未生成"
            description={
              <div>
                <div style={{ marginBottom: 8 }}>
                  当前后端未检测到 Allure CLI（或生成失败）。你仍然可以使用外部 Allure 服务读取 allure-results。
                </div>
                {reason && (
                  <pre style={{ background: '#fafafa', padding: 12, borderRadius: 8, whiteSpace: 'pre-wrap' }}>
                    {reason}
                  </pre>
                )}
                <div style={{ marginTop: 8, color: '#666' }}>
                  解决方案：安装 Allure Commandline，并确保命令 <code>allure</code> 可用，然后重新生成报告。
                </div>
              </div>
            }
            style={{ borderRadius: 10 }}
          />
        </div>
      );
    }

    return (
      <div>
        <Space style={{ marginBottom: 12 }}>
          <Button type="primary" onClick={() => window.open(htmlUrl, '_blank')}>新窗口打开 Allure</Button>
          {allure?.server_url && (
            <Typography.Text type="secondary">外部 Allure Server: {allure.server_url}</Typography.Text>
          )}
        </Space>
        <div style={{ border: '1px solid #f0f0f0', borderRadius: 10, overflow: 'hidden' }}>
          <iframe
            title="Allure Report"
            src={htmlUrl}
            style={{ width: '100%', height: 680, border: 'none', background: '#fff' }}
          />
        </div>
      </div>
    );
  };

  if (detailIdFromRoute) {
    const reportBreadcrumb = [
      { label: '项目', path: '/projects' },
      { label: '测试报告', path: '/reports' },
      { label: detail?.name ?? '加载中...' },
    ];
    return (
      <div>
        <div style={{ marginBottom: 20 }}>
          <Breadcrumb items={reportBreadcrumb} />
          <Space align="center" style={{ marginBottom: 8 }}>
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/reports')}>返回列表</Button>
          </Space>
          <h1 style={{ fontSize: 'var(--page-title-size)', fontWeight: 600, color: '#0f172a', margin: 0 }}>报告详情</h1>
          <p style={{ fontSize: 'var(--page-subtitle-size)', color: '#475569', margin: '4px 0 0' }}>{detail?.name || '加载中...'}</p>
        </div>
        <Card className="page-card" bordered={false} title={detail ? <Space><FileTextOutlined />{detail.name}</Space> : '加载中...'}>
          <Tabs
            defaultActiveKey="platform"
            items={[
              { key: 'platform', label: '平台报告', children: renderDetailContent() },
              { key: 'allure', label: 'Allure 报告', children: renderAllureContent() },
            ]}
          />
        </Card>
      <ShareToIM
        open={shareOpen}
        onCancel={() => { setShareOpen(false); setShareTarget(null); }}
        shareType="测试报告"
        itemTitle={shareTarget?.name ?? ''}
        path={shareTarget ? `/reports/${shareTarget.id}` : ''}
      />
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div className="page-title-block">
          <h1>测试报告</h1>
          <p>生成与查看测试报告</p>
        </div>
      </div>
      <Card
        className="page-card"
        bordered={false}
        title={<Space><BarChartOutlined />测试报告 ({reports.length})</Space>}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            生成报告
          </Button>
        }
      >
        <Row gutter={[16, 16]} className="filter-bar" style={{ marginBottom: 0 }}>
          <Col xs={24} sm={12} md={8} lg={6}>
            <Input
              placeholder="搜索报告名称"
              prefix={<SearchOutlined />}
              value={filterKeyword}
              onChange={(e) => setFilterKeyword(e.target.value)}
              onPressEnter={() => load()}
              allowClear
              style={{ width: '100%' }}
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
            <Button type="primary" icon={<SearchOutlined />} onClick={() => load()} block>查询</Button>
          </Col>
        </Row>
        <div style={{ marginTop: 16 }}>
          <Table
            dataSource={reports}
            columns={columns}
            rowKey="id"
            loading={loading}
            tableLayout="fixed"
            pagination={{ pageSize: 10, showTotal: (t) => `共 ${t} 条` }}
            size="middle"
            scroll={{ x: Object.values(columnWidths).reduce((a, b) => a + b, 0) }}
            locale={{ emptyText: <Empty description="暂无报告，点击「生成报告」创建第一份报告" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
          />
        </div>
      </Card>

      <ShareToIM
        open={shareOpen}
        onCancel={() => { setShareOpen(false); setShareTarget(null); }}
        shareType="测试报告"
        itemTitle={shareTarget?.name ?? ''}
        path={shareTarget ? `/reports/${shareTarget.id}` : ''}
      />
      <Modal
        title="生成测试报告"
        open={createOpen}
        onOk={async () => {
          await form.validateFields();
          return new Promise<void>((resolve, reject) => {
            Modal.confirm({
              title: '确定生成报告吗？',
              okText: '确定',
              cancelText: '取消',
              onOk: () => handleCreate().then(resolve).catch(reject),
              onCancel: () => reject(new Error('cancelled')),
            });
          });
        }}
        onCancel={() => setCreateOpen(false)}
        okText="生成"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="project_id" label="所属项目" rules={[{ required: true, message: '请选择项目' }]}>
            <Select placeholder="选择项目" options={projects.map((p) => ({ label: p.name, value: p.id }))} />
          </Form.Item>
          <Form.Item name="name" label="报告名称" rules={[{ required: true, message: '请输入报告名称' }]}>
            <Input placeholder="如: V1.0回归测试报告" />
          </Form.Item>
          <Form.Item label="范围" extra="可输入多个执行 ID，逗号分隔；留空则自动汇总最近 100 条执行记录">
            <Form.Item name="execution_ids" noStyle>
              <Select mode="tags" placeholder="输入执行 ID，逗号分隔（可选）" tokenSeparators={[',']} style={{ width: '100%' }} />
            </Form.Item>
          </Form.Item>
          <Form.Item name="status_filter" label="仅包含执行状态" extra="选「通过」则报告与 Allure 只含通过的记录">
            <Select placeholder="全部" allowClear options={[
              { label: '全部', value: undefined },
              { label: '通过', value: 'passed' },
              { label: '失败', value: 'failed' },
              { label: '错误', value: 'error' },
            ]} />
          </Form.Item>
        </Form>
      </Modal>

    </div>
  );
};

export default Reports;
