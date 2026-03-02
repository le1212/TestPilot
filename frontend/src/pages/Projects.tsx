import React, { useCallback, useEffect, useState } from 'react';
import { Card, Button, Table, Modal, Form, Input, Space, message, Popconfirm, Typography, DatePicker, Row, Col, Tag } from 'antd';
import dayjs from 'dayjs';
import { PlusOutlined, EditOutlined, DeleteOutlined, FolderOpenOutlined, SearchOutlined } from '@ant-design/icons';
import { getProjects, createProject, updateProject, deleteProject } from '../api';
import { formatDateTimeZh } from '../utils/date';
import ResizableTitle from '../components/ResizableTitle';
import { useAuth } from '../contexts/AuthContext';

const { TextArea } = Input;

const Projects: React.FC = () => {
  const { user } = useAuth();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();
  const [filterDate, setFilterDate] = useState<string | undefined>();

  const defaultColWidths: Record<string, number> = { name: 180, description: 240, case_count: 90, updated_at: 180, actions: 140 };
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(defaultColWidths);
  const handleResize = useCallback((key: string, w: number) => setColumnWidths((prev) => ({ ...prev, [key]: w })), []);

  const load = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (filterDate) params.date = filterDate;
      const res = await getProjects(params);
      setProjects(res.data);
    } catch {
      message.error('加载项目失败');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [filterDate]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (record: any) => {
    setEditing(record);
    form.setFieldsValue(record);
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    try {
      if (editing) {
        await updateProject(editing.id, values);
        message.success('更新成功');
      } else {
        await createProject(values);
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
      await deleteProject(id);
      message.success('删除成功');
      load();
    } catch {
      message.error('删除失败');
    }
  };

  const columns = [
    {
      title: <ResizableTitle dataKey="name" width={columnWidths.name} minWidth={100} onResize={handleResize}>项目名称</ResizableTitle>,
      dataIndex: 'name',
      key: 'name',
      width: columnWidths.name,
      render: (text: string, record: any) => (
        <Space>
          <FolderOpenOutlined style={{ color: '#0369a1' }} />
          <Typography.Text strong>{text}</Typography.Text>
          {record.created_by_id != null && record.created_by_id === user?.id && <Tag color="blue">负责人</Tag>}
        </Space>
      ),
    },
    {
      title: <ResizableTitle dataKey="description" width={columnWidths.description} minWidth={100} onResize={handleResize}>描述</ResizableTitle>,
      dataIndex: 'description',
      key: 'description',
      width: columnWidths.description,
      ellipsis: true,
    },
    {
      title: <ResizableTitle dataKey="case_count" width={columnWidths.case_count} minWidth={70} onResize={handleResize}>用例数</ResizableTitle>,
      dataIndex: 'case_count',
      key: 'case_count',
      width: columnWidths.case_count,
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
      render: (_: any, record: any) => {
        const canManage = user && (user.is_admin || (record.created_by_id != null && record.created_by_id === user.id));
        if (!canManage) return <Typography.Text type="secondary">—</Typography.Text>;
        return (
          <Space>
            <Popconfirm title="确定编辑该项目吗？" okText="确定" cancelText="取消" onConfirm={() => openEdit(record)}>
              <Button type="link" size="small" icon={<EditOutlined />}>编辑</Button>
            </Popconfirm>
            <Popconfirm title="确定删除该项目吗？删除后其下用例与环境的归属会受影响。" okText="确定删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={() => handleDelete(record.id)}>
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <div className="page-title-block">
        <h1>项目管理</h1>
        <p>创建与管理测试项目</p>
      </div>
      <Card
        className="page-card"
        bordered={false}
        title="项目列表"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新建项目
          </Button>
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
        <Table
          dataSource={projects}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
          size="middle"
          scroll={{ x: Object.values(columnWidths).reduce((a, b) => a + b, 0) }}
        />
      </Card>

      <Modal
        title={editing ? '编辑项目' : '新建项目'}
        open={modalOpen}
        onOk={async () => {
          await form.validateFields();
          return new Promise<void>((resolve, reject) => {
            Modal.confirm({
              title: '确定保存项目吗？',
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
        width="min(480px, 100vw - 24px)"
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="项目名称" rules={[{ required: true, message: '请输入项目名称' }]}>
            <Input placeholder="输入项目名称" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <TextArea rows={3} placeholder="项目描述（选填）" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Projects;
