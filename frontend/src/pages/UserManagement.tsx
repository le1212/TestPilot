import React, { useCallback, useEffect, useState } from 'react';
import { Card, Table, Button, Space, Modal, Form, Input, Switch, message, Tag, Popconfirm, DatePicker, Row, Col } from 'antd';
import dayjs from 'dayjs';
import { PlusOutlined, TeamOutlined, SearchOutlined } from '@ant-design/icons';
import { getUsers, createUser, updateUser, deleteUser } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { formatDateTimeZh } from '../utils/date';
import ResizableTitle from '../components/ResizableTitle';

const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]+$/;

const UserManagement: React.FC = () => {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [resultModalOpen, setResultModalOpen] = useState(false);
  const [createResult, setCreateResult] = useState<{ login_account: string; initial_password: string } | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm();
  const [submitLoading, setSubmitLoading] = useState(false);
  const [filterDate, setFilterDate] = useState<string | undefined>();
  const [filterKeyword, setFilterKeyword] = useState<string>('');
  const { user: currentUser } = useAuth();

  const defaultColWidths: Record<string, number> = {
    id: 70, username: 120, real_name: 120, email: 180, phone: 120, is_admin: 90, disabled: 90, created_at: 170, action: 160,
  };
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(defaultColWidths);
  const handleResize = useCallback((key: string, w: number) => setColumnWidths((prev) => ({ ...prev, [key]: w })), []);

  const load = () => {
    setLoading(true);
    const params: any = {};
    if (filterDate) params.date = filterDate;
    if (filterKeyword && filterKeyword.trim()) params.keyword = filterKeyword.trim();
    getUsers(params)
      .then((res) => setList(res.data || []))
      .catch((e) => {
        if (e.response?.status === 403) message.error('需要管理员权限');
        else message.error('加载用户列表失败');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [filterDate]);

  if (currentUser && !currentUser.is_admin) {
    return (
      <Card><span style={{ color: '#999' }}>需要管理员权限才能访问用户管理。</span></Card>
    );
  }

  const openCreate = () => {
    setEditingId(null);
    setCreateResult(null);
    form.setFieldsValue({ real_name: '', is_admin: false, email: '', phone: '' });
    setModalOpen(true);
  };

  const openEdit = (record: any) => {
    setEditingId(record.id);
    form.setFieldsValue({
      username: record.username ?? '',
      real_name: record.real_name ?? record.username ?? '',
      password: '',
      is_admin: record.is_admin,
      disabled: record.disabled,
      email: record.email || '',
      phone: record.phone || '',
    });
    setModalOpen(true);
  };

  const onFinish = async (values: any) => {
    if (editingId != null && values.password && !PASSWORD_RULE.test(values.password)) {
      message.error('密码必须同时包含字母和数字');
      return;
    }
    setSubmitLoading(true);
    try {
      if (editingId == null) {
        const res = await createUser({
          real_name: values.real_name?.trim() || '',
          is_admin: !!values.is_admin,
          email: values.email?.trim() || undefined,
          phone: values.phone?.trim() || undefined,
        });
        const data = res.data as { user?: { username?: string }; login_account?: string; initial_password?: string };
        const loginAccount = data?.login_account ?? data?.user?.username ?? '';
        const initialPassword = data?.initial_password ?? '';
        setCreateResult({ login_account: loginAccount, initial_password: initialPassword });
        setModalOpen(false);
        message.success('用户已创建，请查看下方分配的登录账号与初始密码');
        load();
        setTimeout(() => setResultModalOpen(true), 100);
      } else {
        const payload: any = { real_name: values.real_name?.trim(), is_admin: !!values.is_admin, disabled: !!values.disabled };
        if (values.password) payload.password = values.password;
        if (values.email !== undefined) payload.email = values.email;
        if (values.phone !== undefined) payload.phone = values.phone;
        await updateUser(editingId, payload);
        message.success('已更新');
        setModalOpen(false);
        load();
      }
    } catch (e: any) {
      message.error(e.response?.data?.detail || '操作失败');
    } finally {
      setSubmitLoading(false);
    }
  };

  const onDelete = async (id: number) => {
    try {
      await deleteUser(id);
      message.success('已删除');
      load();
    } catch (e: any) {
      message.error(e.response?.data?.detail || '删除失败');
    }
  };

  const columns = [
    {
      title: <ResizableTitle dataKey="id" width={columnWidths.id} minWidth={50} onResize={handleResize}>ID</ResizableTitle>,
      dataIndex: 'id',
      key: 'id',
      width: columnWidths.id,
    },
    {
      title: <ResizableTitle dataKey="username" width={columnWidths.username} minWidth={80} onResize={handleResize}>登录账号</ResizableTitle>,
      dataIndex: 'username',
      key: 'username',
      width: columnWidths.username,
      render: (v: string) => v || '-',
    },
    {
      title: <ResizableTitle dataKey="real_name" width={columnWidths.real_name} minWidth={80} onResize={handleResize}>姓名</ResizableTitle>,
      dataIndex: 'real_name',
      key: 'real_name',
      width: columnWidths.real_name,
      render: (v: string) => v || '-',
    },
    {
      title: <ResizableTitle dataKey="email" width={columnWidths.email} minWidth={100} onResize={handleResize}>邮箱</ResizableTitle>,
      dataIndex: 'email',
      key: 'email',
      width: columnWidths.email,
      ellipsis: true,
      render: (v: string) => v || '-',
    },
    {
      title: <ResizableTitle dataKey="phone" width={columnWidths.phone} minWidth={90} onResize={handleResize}>手机号</ResizableTitle>,
      dataIndex: 'phone',
      key: 'phone',
      width: columnWidths.phone,
      render: (v: string) => v || '-',
    },
    {
      title: <ResizableTitle dataKey="is_admin" width={columnWidths.is_admin} minWidth={70} onResize={handleResize}>角色</ResizableTitle>,
      dataIndex: 'is_admin',
      key: 'is_admin',
      width: columnWidths.is_admin,
      render: (v: boolean) => (v ? <Tag color="blue">管理员</Tag> : <Tag>普通用户</Tag>),
    },
    {
      title: <ResizableTitle dataKey="disabled" width={columnWidths.disabled} minWidth={70} onResize={handleResize}>状态</ResizableTitle>,
      dataIndex: 'disabled',
      key: 'disabled',
      width: columnWidths.disabled,
      render: (v: boolean) => (v ? <Tag color="red">已停用</Tag> : <Tag color="green">正常</Tag>),
    },
    {
      title: <ResizableTitle dataKey="created_at" width={columnWidths.created_at} minWidth={120} onResize={handleResize}>创建时间</ResizableTitle>,
      dataIndex: 'created_at',
      key: 'created_at',
      width: columnWidths.created_at,
      render: (t: string) => (t ? formatDateTimeZh(t) : '-'),
    },
    {
      title: <ResizableTitle dataKey="action" width={columnWidths.action} minWidth={100} onResize={handleResize}>操作</ResizableTitle>,
      key: 'action',
      width: columnWidths.action,
      render: (_: any, record: any) => (
        <Space>
          <Button type="link" size="small" onClick={() => openEdit(record)}>编辑</Button>
          {record.id !== currentUser?.id && (
            <Popconfirm title="确定删除该用户？" onConfirm={() => onDelete(record.id)}>
              <Button type="link" size="small" danger>删除</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div className="page-title-block">
          <h1>用户管理</h1>
          <p>管理系统用户与权限</p>
        </div>
      </div>
      <Card
        className="page-card"
        bordered={false}
        title={<span><TeamOutlined /> 用户管理</span>}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建用户</Button>
        }
      >
        <Row gutter={[16, 16]} className="filter-bar" style={{ marginBottom: 0 }}>
          <Col xs={24} sm={12} md={8} lg={6}>
            <Input
              placeholder="搜索登录账号、姓名、邮箱"
              prefix={<SearchOutlined />}
              value={filterKeyword}
              onChange={(e) => setFilterKeyword(e.target.value)}
              onPressEnter={() => load()}
              allowClear
              style={{ width: '100%' }}
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
            rowKey="id"
            columns={columns}
            dataSource={list}
            loading={loading}
            tableLayout="fixed"
            scroll={{ x: Object.values(columnWidths).reduce((a, b) => a + b, 0) }}
            pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
          />
        </div>
      </Card>

      <Modal
        title={editingId == null ? '新建用户' : '编辑用户'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={onFinish}>
          {editingId != null && (
            <Form.Item name="username" label="用户账号">
              <Input disabled placeholder="登录账号（不可修改）" />
            </Form.Item>
          )}
          <Form.Item name="real_name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input placeholder="用户真实姓名" />
          </Form.Item>
          <Form.Item name="email" label="邮箱">
            <Input type="email" placeholder="选填，用于找回密码等" />
          </Form.Item>
          <Form.Item name="phone" label="手机号">
            <Input placeholder="选填" />
          </Form.Item>
          {editingId != null && (
            <>
              <Form.Item
                name="password"
                label="新密码（留空不修改）"
                rules={[{ pattern: PASSWORD_RULE, message: '密码必须同时包含字母和数字' }]}
              >
                <Input.Password placeholder="留空表示不修改" autoComplete="new-password" />
              </Form.Item>
              <Form.Item name="disabled" label="停用账号" valuePropName="checked">
                <Switch />
              </Form.Item>
            </>
          )}
          <Form.Item name="is_admin" label="管理员" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={submitLoading}>保存</Button>
              <Button onClick={() => setModalOpen(false)}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="新建成功 - 请保存登录账号与初始密码"
        open={resultModalOpen}
        onCancel={() => setResultModalOpen(false)}
        footer={<Button type="primary" onClick={() => setResultModalOpen(false)}>我已保存，关闭</Button>}
        closable
        maskClosable={false}
        width={480}
      >
        <p style={{ color: '#d4380d', marginBottom: 16 }}>请务必复制或截图保存以下信息并告知用户，关闭后将无法再次查看初始密码。</p>
        <p><strong>登录账号：</strong><code style={{ marginLeft: 8, padding: '4px 8px', background: '#f5f5f5' }}>{createResult?.login_account ?? '-'}</code></p>
        <p><strong>初始密码：</strong><code style={{ marginLeft: 8, padding: '4px 8px', background: '#f5f5f5' }}>{createResult?.initial_password ?? '-'}</code></p>
        <p style={{ color: '#666', fontSize: 12, marginTop: 16 }}>用户使用上述登录账号和初始密码登录后，请尽快在「个人资料」-「修改密码」中修改密码。</p>
      </Modal>
    </div>
  );
};

export default UserManagement;
