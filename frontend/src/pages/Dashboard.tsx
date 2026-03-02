import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Row, Col, Statistic, Table, Tag, Space, Empty, Spin, message, List } from 'antd';
import {
  ProjectOutlined,
  FileTextOutlined,
  PlayCircleOutlined,
  CheckCircleOutlined,
  ApiOutlined,
  GlobalOutlined,
  MobileOutlined,
  AppstoreOutlined,
  BugOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { getDashboard } from '../api';
import { formatDateTimeZh, formatIsoDateZh } from '../utils/date';

const statusColors: Record<string, string> = {
  passed: 'success',
  failed: 'error',
  error: 'warning',
  running: 'processing',
  pending: 'default',
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

const typeLabels: Record<string, string> = {
  api: '接口测试',
  web: 'Web测试',
  app: 'App测试',
  miniapp: '小程序测试',
};

const priorityColors: Record<string, string> = {
  low: 'rgba(0,0,0,0.38)',
  medium: '#1976D2',
  high: '#ED6C02',
  critical: '#D32F2F',
};

const priorityLabels: Record<string, string> = {
  low: '低',
  medium: '中',
  high: '高',
  critical: '严重',
};

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboard()
      .then((res) => setStats(res.data))
      .catch(() => { message.error('仪表盘加载失败'); setStats(null); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ height: 400 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!stats) {
    return <Empty description="暂无数据" />;
  }

  const statCards = [
    { title: '项目总数', value: stats.total_projects, icon: <ProjectOutlined />, color: '#1976D2', bg: '#E3F2FD', path: '/projects' },
    { title: '用例总数', value: stats.total_cases, icon: <FileTextOutlined />, color: '#2E7D32', bg: '#E8F5E9', path: '/cases' },
    { title: '执行次数', value: stats.total_executions, icon: <PlayCircleOutlined />, color: '#ED6C02', bg: '#FFF3E0', path: '/executions' },
    { title: '通过率', value: stats.pass_rate, suffix: '%', icon: <CheckCircleOutlined />, color: '#0288D1', bg: '#E1F5FE', path: '/executions' },
  ];

  const columns = [
    {
      title: '用例名称',
      dataIndex: 'case_name',
      key: 'case_name',
      width: 200,
      ellipsis: true,
    },
    {
      title: '类型',
      dataIndex: 'case_type',
      key: 'case_type',
      width: 100,
      render: (type: string) => (
        <Space size={4}>
          {typeIcons[type]}
          <span>{typeLabels[type] || type}</span>
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (status: string) => (
        <Tag color={statusColors[status]}>{statusLabel[status] || status}</Tag>
      ),
    },
    {
      title: '耗时',
      dataIndex: 'duration_ms',
      key: 'duration_ms',
      width: 90,
      render: (ms: number) => `${ms}ms`,
    },
    {
      title: '时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 170,
      render: (t: string) => formatDateTimeZh(t),
    },
  ];

  return (
    <div className="dashboard-page">
      <div className="page-title-block">
        <h1>仪表盘</h1>
        <p>概览项目与执行数据</p>
      </div>
      <Row gutter={[20, 20]}>
        {statCards.map((card) => (
          <Col xs={24} sm={12} lg={6} key={card.title}>
            <Card
              className="stat-card"
              bordered={false}
              style={{ cursor: 'pointer', background: 'var(--md-sys-color-surface-bright)' }}
              onClick={() => card.path && navigate(card.path)}
            >
              <div className="flex items-center justify-between">
                <Statistic title={card.title} value={card.value} suffix={card.suffix} />
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 12,
                    background: card.bg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.5rem',
                    color: card.color,
                  }}
                >
                  {card.icon}
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* 快捷入口卡片 */}
      <Row gutter={[20, 20]} style={{ marginTop: 24 }}>
        <Col xs={24} md={8}>
          <Card
            className="page-card"
            bordered={false}
            title={<Space><FileTextOutlined />最近用例</Space>}
            style={{ cursor: 'pointer', background: 'var(--md-sys-color-surface-bright)' }}
            onClick={() => navigate('/cases')}
          >
            {stats.recent_cases?.length > 0 ? (
              <List
                size="small"
                dataSource={stats.recent_cases}
                renderItem={(item: any) => (
                  <List.Item
                    style={{ cursor: 'pointer', padding: '6px 0' }}
                    onClick={(e) => { e.stopPropagation(); navigate(`/cases/${item.id}`); }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{item.name}</span>
                  </List.Item>
                )}
              />
            ) : (
              <Empty description="暂无用例" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: '16px 0' }} />
            )}
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card
            className="page-card"
            bordered={false}
            title={<Space><BugOutlined />待处理缺陷</Space>}
            style={{ cursor: 'pointer', background: 'var(--md-sys-color-surface-bright)' }}
            onClick={() => navigate('/defects')}
          >
            {stats.pending_defects?.length > 0 ? (
              <List
                size="small"
                dataSource={stats.pending_defects}
                renderItem={(item: any) => (
                  <List.Item
                    style={{ cursor: 'pointer', padding: '6px 0' }}
                    onClick={(e) => { e.stopPropagation(); navigate(`/defects/${item.id}`); }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{item.title}</span>
                  </List.Item>
                )}
              />
            ) : (
              <Empty description="暂无待处理缺陷" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: '16px 0' }} />
            )}
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card
            className="page-card"
            bordered={false}
            title={<Space><PlayCircleOutlined />今日执行</Space>}
            style={{ cursor: 'pointer', background: 'var(--md-sys-color-surface-bright)' }}
            onClick={() => navigate('/executions', { state: { filterDate: dayjs().format('YYYY-MM-DD') } })}
          >
            {stats.today_executions?.length > 0 ? (
              <List
                size="small"
                dataSource={stats.today_executions}
                renderItem={(item: any) => (
                  <List.Item
                    style={{ cursor: 'pointer', padding: '6px 0' }}
                    onClick={(e) => { e.stopPropagation(); navigate('/executions', { state: { openExecutionId: item.id } }); }}
                  >
                    <Space>
                      <Tag color={statusColors[item.status]}>{statusLabel[item.status] || item.status}</Tag>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{item.case_name}</span>
                    </Space>
                  </List.Item>
                )}
              />
            ) : (
              <Empty description="今日暂无执行" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: '16px 0' }} />
            )}
          </Card>
        </Col>
      </Row>

      {stats.execution_trend?.length > 0 && (
        <Card
          className="page-card"
          title="近 7 日执行趋势"
          bordered={false}
          style={{ marginTop: 24, background: 'var(--md-sys-color-surface-bright)' }}
        >
          <Table
            dataSource={stats.execution_trend}
            rowKey="date"
            size="small"
            pagination={false}
            scroll={{ x: 400 }}
            onRow={(record: { date?: string }) => ({
              style: { cursor: 'pointer' },
              onClick: (e) => {
                e.stopPropagation();
                navigate('/executions', { state: { filterDate: record.date } });
              },
            })}
            columns={[
              { title: '日期', dataIndex: 'date', key: 'date', width: 140, render: (d: string) => formatIsoDateZh(d) },
              { title: '执行数', dataIndex: 'total', key: 'total', width: 90 },
              { title: '通过数', dataIndex: 'passed', key: 'passed', width: 90 },
              { title: '通过率', dataIndex: 'pass_rate', key: 'pass_rate', width: 90, render: (r: number) => `${r}%` },
            ]}
          />
        </Card>
      )}

      <Row gutter={[20, 20]} style={{ marginTop: 24 }}>
        <Col xs={24} lg={12}>
          <Card
            className="page-card"
            title="用例分布"
            bordered={false}
            style={{ cursor: 'pointer', background: 'var(--md-sys-color-surface-bright)' }}
            onClick={() => navigate('/cases')}
          >
            <div style={{ padding: '12px 0' }}>
              {Object.entries(stats.cases_by_type).length > 0 ? (
                <Row gutter={[16, 12]}>
                  {Object.entries(stats.cases_by_type).map(([type, count]) => (
                    <Col span={12} key={type}>
                      <div
                        role="button"
                        tabIndex={0}
                        style={{
                          padding: '16px 20px',
                          borderRadius: 12,
                          background: 'var(--md-sys-color-surface-container)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          cursor: 'pointer',
                        }}
                        onClick={(e) => { e.stopPropagation(); navigate('/cases', { state: { filterType: type } }); }}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); navigate('/cases', { state: { filterType: type } }); } }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', fontSize: '1.25rem', color: 'var(--md-sys-color-primary)' }}>{typeIcons[type]}</div>
                        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                          <div style={{ fontSize: 'var(--page-subtitle-size)', color: 'rgba(0,0,0,0.6)' }}>{typeLabels[type] || type}</div>
                          <div style={{ fontSize: 'var(--page-title-size)', fontWeight: 600 }}>{count as number}</div>
                        </div>
                      </div>
                    </Col>
                  ))}
                </Row>
              ) : (
                <Empty description="暂无用例" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              )}
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card
            className="page-card"
            title="优先级分布"
            bordered={false}
            style={{ cursor: 'pointer', background: 'var(--md-sys-color-surface-bright)' }}
            onClick={() => navigate('/cases')}
          >
            <div style={{ padding: '12px 0' }}>
              {Object.entries(stats.cases_by_priority).length > 0 ? (
                <Row gutter={[16, 12]}>
                  {Object.entries(stats.cases_by_priority).map(([priority, count]) => (
                    <Col span={12} key={priority}>
                      <div
                        role="button"
                        tabIndex={0}
                        style={{
                          padding: '16px 20px',
                          borderRadius: 12,
                          background: 'var(--md-sys-color-surface-container)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          cursor: 'pointer',
                        }}
                        onClick={(e) => { e.stopPropagation(); navigate('/cases', { state: { filterPriority: priority } }); }}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); navigate('/cases', { state: { filterPriority: priority } }); } }}
                      >
                        <div
                          style={{
                            width: 12,
                            height: 12,
                            borderRadius: '50%',
                            background: priorityColors[priority] || 'rgba(0,0,0,0.38)',
                          }}
                        />
                        <div>
                          <div style={{ fontSize: 'var(--page-subtitle-size)', color: 'rgba(0,0,0,0.6)' }}>{priorityLabels[priority] || priority}</div>
                          <div style={{ fontSize: 'var(--page-title-size)', fontWeight: 600 }}>{count as number}</div>
                        </div>
                      </div>
                    </Col>
                  ))}
                </Row>
              ) : (
                <Empty description="暂无数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              )}
            </div>
          </Card>
        </Col>
      </Row>

      <Card
        className="page-card"
        title="最近执行记录"
        bordered={false}
        style={{ marginTop: 24, marginBottom: 8, background: 'var(--md-sys-color-surface-bright)' }}
      >
        <Table
          dataSource={stats.recent_executions}
          columns={columns}
          rowKey="id"
          pagination={false}
          size="middle"
          scroll={{ x: 700 }}
          onRow={(record: { id?: number }) => ({
            style: { cursor: 'pointer' },
            onClick: () => navigate('/executions', { state: { openExecutionId: record.id } }),
          })}
          locale={{ emptyText: <Empty description="暂无执行记录" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        />
      </Card>
    </div>
  );
};

export default Dashboard;
