import React, { useCallback, useEffect, useState } from 'react';
import {
  Card, Button, Table, Modal, Form, Input, Space, message, Popconfirm,
  Select, Tag, Typography, Collapse, DatePicker, Row, Col,
} from 'antd';
import dayjs from 'dayjs';
import { PlusOutlined, EditOutlined, DeleteOutlined, GlobalOutlined, SearchOutlined } from '@ant-design/icons';
import { getEnvironments, createEnvironment, updateEnvironment, deleteEnvironment, getProjects } from '../api';
import { formatDateTimeZh } from '../utils/date';
import ResizableTitle from '../components/ResizableTitle';

const { TextArea } = Input;

const Environments: React.FC = () => {
  const [envs, setEnvs] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();
  const [varsText, setVarsText] = useState('');
  const [headersText, setHeadersText] = useState('');
  const [filterDate, setFilterDate] = useState<string | undefined>();

  const defaultColWidths: Record<string, number> = { name: 160, project_name: 120, base_url: 200, vars: 80, description: 180, updated_at: 180, actions: 140 };
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(defaultColWidths);
  const handleResize = useCallback((key: string, w: number) => setColumnWidths((prev) => ({ ...prev, [key]: w })), []);

  const load = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (filterDate) params.date = filterDate;
      const [envRes, projRes] = await Promise.all([getEnvironments(params), getProjects()]);
      setEnvs(envRes.data);
      setProjects(projRes.data);
    } catch {
      message.error('加载失败');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [filterDate]);

  const parseKV = (text: string): Record<string, string> => {
    const result: Record<string, string> = {};
    text.split('\n').filter(Boolean).forEach((line) => {
      const idx = line.indexOf('=');
      if (idx > 0) {
        result[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      }
    });
    return result;
  };

  const formatKV = (obj: Record<string, string>): string =>
    Object.entries(obj || {}).map(([k, v]) => `${k}=${v}`).join('\n');

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setVarsText('');
    setHeadersText('');
    setModalOpen(true);
  };

  const openEdit = (record: any) => {
    setEditing(record);
    form.setFieldsValue({ ...record });
    setVarsText(formatKV(record.variables));
    setHeadersText(formatKV(record.headers));
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    const data = {
      ...values,
      variables: parseKV(varsText),
      headers: parseKV(headersText),
    };
    try {
      if (editing) {
        await updateEnvironment(editing.id, data);
        message.success('更新成功');
      } else {
        await createEnvironment(data);
        message.success('创建成功');
      }
      setModalOpen(false);
      load();
    } catch {
      message.error('操作失败');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteEnvironment(id);
      message.success('删除成功');
      load();
    } catch {
      message.error('删除失败');
    }
  };

  const columns = [
    {
      title: <ResizableTitle dataKey="name" width={columnWidths.name} minWidth={100} onResize={handleResize}>环境名称</ResizableTitle>,
      dataIndex: 'name',
      key: 'name',
      width: columnWidths.name,
      render: (text: string) => (
        <Space>
          <GlobalOutlined style={{ color: '#52c41a' }} />
          <Typography.Text strong>{text}</Typography.Text>
        </Space>
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
      title: <ResizableTitle dataKey="base_url" width={columnWidths.base_url} minWidth={120} onResize={handleResize}>基础地址</ResizableTitle>,
      dataIndex: 'base_url',
      key: 'base_url',
      width: columnWidths.base_url,
      ellipsis: true,
    },
    {
      title: <ResizableTitle dataKey="vars" width={columnWidths.vars} minWidth={60} onResize={handleResize}>变量数</ResizableTitle>,
      key: 'vars',
      width: columnWidths.vars,
      render: (_: any, r: any) => Object.keys(r.variables || {}).length,
    },
    {
      title: <ResizableTitle dataKey="description" width={columnWidths.description} minWidth={100} onResize={handleResize}>描述</ResizableTitle>,
      dataIndex: 'description',
      key: 'description',
      width: columnWidths.description,
      ellipsis: true,
    },
    {
      title: <ResizableTitle dataKey="updated_at" width={columnWidths.updated_at} minWidth={120} onResize={handleResize}>更新时间</ResizableTitle>,
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: columnWidths.updated_at,
      render: (t: string) => formatDateTimeZh(t),
    },
    {
      title: <ResizableTitle dataKey="actions" width={columnWidths.actions} minWidth={100} onResize={handleResize}>操作</ResizableTitle>,
      key: 'actions',
      width: columnWidths.actions,
      fixed: 'right' as const,
      render: (_: any, record: any) => (
        <Space>
          <Popconfirm title="确定编辑该环境吗？" okText="确定" cancelText="取消" onConfirm={() => openEdit(record)}>
            <Button type="link" size="small" icon={<EditOutlined />}>编辑</Button>
          </Popconfirm>
          <Popconfirm title="确定删除该环境吗？" okText="确定删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div className="page-title-block">
          <h1>环境配置</h1>
          <p>管理各项目测试环境</p>
        </div>
      </div>
      <Card
        className="page-card"
        bordered={false}
        title="环境配置"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建环境</Button>
        }
      >
        <Row gutter={[16, 16]} className="filter-bar" style={{ marginBottom: 0 }}>
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
            dataSource={envs}
            columns={columns}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 10 }}
            size="middle"
            scroll={{ x: Object.values(columnWidths).reduce((a, b) => a + b, 0) }}
          />
        </div>
      </Card>

      <Modal
        title={editing ? '编辑环境' : '新建环境'}
        open={modalOpen}
        onOk={async () => {
          await form.validateFields();
          return new Promise<void>((resolve, reject) => {
            Modal.confirm({
              title: '确定保存环境吗？',
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
        width="min(600px, 100vw - 24px)"
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="project_id" label="所属项目" rules={[{ required: true, message: '请选择项目' }]}>
            <Select placeholder="选择项目" options={projects.map((p) => ({ label: p.name, value: p.id }))} />
          </Form.Item>
          <Form.Item name="name" label="环境名称" rules={[{ required: true, message: '请输入环境名称' }]}>
            <Input placeholder="如: 开发环境 / 测试环境 / 生产环境" />
          </Form.Item>
          <Form.Item
            name="base_url"
            label="基础地址 (Base URL)"
            rules={[{
              validator: (_, value) => {
                if (!value || !String(value).trim()) return Promise.resolve();
                const v = String(value).trim();
                if (v.startsWith('http://') || v.startsWith('https://')) {
                  try {
                    new URL(v);
                    return Promise.resolve();
                  } catch {
                    return Promise.reject(new Error('请输入有效的 URL'));
                  }
                }
                if (v.startsWith('/')) return Promise.resolve();
                return Promise.reject(new Error('请填写完整 URL（如 https://api.example.com）或以 / 开头的路径'));
              },
            }]}
          >
            <Input placeholder="https://api.example.com 或留空" />
          </Form.Item>
          <Form.Item label="环境变量（每行一个，格式: key=value）">
            <TextArea
              rows={4}
              value={varsText}
              onChange={(e) => setVarsText(e.target.value)}
              placeholder={"base_host=https://api.example.com\ntoken=abc123\nuser_id=1001"}
              style={{ fontFamily: 'monospace' }}
            />
          </Form.Item>
          <Form.Item label="公共请求头（每行一个，格式: key=value）">
            <TextArea
              rows={3}
              value={headersText}
              onChange={(e) => setHeadersText(e.target.value)}
              placeholder={"Content-Type=application/json\nAuthorization=Bearer {{token}}"}
              style={{ fontFamily: 'monospace' }}
            />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <TextArea rows={2} placeholder="环境描述（选填）" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Environments;
