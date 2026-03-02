import React, { useState, useEffect, useRef } from 'react';
import { Layout, Menu, Typography, theme, Dropdown, Button, Space, Badge, List, Modal, Form, Input, message, Select } from 'antd';
import {
  DashboardOutlined,
  FileTextOutlined,
  ApiOutlined,
  GlobalOutlined,
  PlayCircleOutlined,
  BookOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ExperimentOutlined,
  BarChartOutlined,
  BugOutlined,
  CodeOutlined,
  SettingOutlined,
  UserOutlined,
  LogoutOutlined,
  LockOutlined,
  TeamOutlined,
  BellOutlined,
  RobotOutlined,
  MessageOutlined,
  AppstoreOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getNotifications, getUnreadCount, markNotificationRead, markAllNotificationsRead, updateProfile, changePassword, getChatUnreadTotal } from '../api';
import { formatDateTimeZh } from '../utils/date';

const { Sider, Content, Header } = Layout;
const { Title } = Typography;

const BREAKPOINT_MD = 768;

function getMenuItems(isAdmin: boolean, chatUnread: number, aiChatUnread: boolean) {
  const items: any[] = [
    {
      key: 'test-center',
      icon: <AppstoreOutlined />,
      label: '测试中心',
      children: [
        { key: '/', icon: <DashboardOutlined />, label: '仪表盘' },
        { key: '/cases', icon: <FileTextOutlined />, label: '用例管理' },
        { key: '/executions', icon: <PlayCircleOutlined />, label: '执行记录' },
        { key: '/reports', icon: <BarChartOutlined />, label: '测试报告' },
        { key: '/defects', icon: <BugOutlined />, label: '缺陷管理' },
      ],
    },
    {
      key: 'config-data',
      icon: <ToolOutlined />,
      label: '配置与数据',
      children: [
        { key: '/environments', icon: <GlobalOutlined />, label: '环境配置' },
        { key: '/logs', icon: <CodeOutlined />, label: '日志查看' },
        { key: '/projects', icon: <ApiOutlined />, label: '项目管理' },
      ],
    },
    { type: 'divider' as const },
    {
      key: '/ai-chat',
      icon: aiChatUnread ? <Badge dot size="small" offset={[4, 0]}><RobotOutlined /></Badge> : <RobotOutlined />,
      label: 'AI 答疑',
    },
    {
      key: '/messaging',
      icon: <MessageOutlined />,
      label: (
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          即时通讯
          {chatUnread > 0 && (
            <Badge count={chatUnread} size="small" style={{ marginLeft: 8 }} overflowCount={99} />
          )}
        </span>
      ),
    },
    { type: 'divider' as const },
    { key: '/guide', icon: <BookOutlined />, label: '使用与部署' },
  ];
  if (isAdmin) {
    items.push({ type: 'divider' as const });
    items.push({ key: '/users', icon: <TeamOutlined />, label: '用户管理' });
    items.push({ key: '/settings', icon: <SettingOutlined />, label: '系统设置' });
  }
  return items;
}

const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [narrow, setNarrow] = useState(typeof window !== 'undefined' && window.innerWidth < BREAKPOINT_MD);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationList, setNotificationList] = useState<any[]>([]);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const isStandaloneAiChat = location.pathname.startsWith('/ai-chat') && searchParams.get('standalone') === '1';
  const { token } = theme.useToken();
  const { user, logout, refreshUser } = useAuth();
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileForm] = Form.useForm();
  const [profileSaving, setProfileSaving] = useState(false);
  const [changePwdModalOpen, setChangePwdModalOpen] = useState(false);
  const [changePwdForm] = Form.useForm();
  const [changePwdSaving, setChangePwdSaving] = useState(false);
  const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]+$/;
  const [chatUnread, setChatUnread] = useState(0);
  const [aiChatUnread, setAiChatUnread] = useState(() => localStorage.getItem('ai_chat_unread') === '1');
  const chatWsRef = useRef<WebSocket | null>(null);
  const menuItems = getMenuItems(!!user?.is_admin, chatUnread, aiChatUnread);

  const fetchUnread = () => {
    getUnreadCount().then((r) => setUnreadCount(r.data?.count ?? 0)).catch(() => {});
  };
  const fetchNotifications = () => {
    getNotifications({ page: 1, page_size: 15 }).then((r) => setNotificationList(r.data || [])).catch(() => {});
  };

  useEffect(() => {
    fetchUnread();
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const storedToken = localStorage.getItem('testpilot_token');
    const wsUrl = `${proto}//${window.location.host}/ws/notifications${storedToken ? `?token=${encodeURIComponent(storedToken)}` : ''}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onmessage = () => {
      fetchUnread();
      fetchNotifications();
    };
    ws.onclose = () => { wsRef.current = null; };
    const pollInterval = 3000;
    const pollTimer = setInterval(fetchUnread, pollInterval);
    return () => { ws.close(); wsRef.current = null; clearInterval(pollTimer); };
  }, []);

  const fetchChatUnread = () => {
    getChatUnreadTotal().then(r => setChatUnread(r.data?.total ?? 0)).catch(() => {});
  };

  useEffect(() => {
    fetchChatUnread();
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const storedToken = localStorage.getItem('testpilot_token');
    if (storedToken) {
      const chatWsUrl = `${proto}//${window.location.host}/ws/chat?token=${encodeURIComponent(storedToken)}`;
      const cws = new WebSocket(chatWsUrl);
      chatWsRef.current = cws;
      cws.onmessage = () => {
        setChatUnread(prev => prev + 1);
        fetchChatUnread();
      };
      cws.onclose = () => { chatWsRef.current = null; };
    }
    const chatPoll = setInterval(fetchChatUnread, 10000);
    return () => {
      if (chatWsRef.current) { chatWsRef.current.close(); chatWsRef.current = null; }
      clearInterval(chatPoll);
    };
  }, []);

  useEffect(() => {
    if (location.pathname === '/messaging') {
      const timer = setTimeout(fetchChatUnread, 1000);
      return () => clearTimeout(timer);
    }
  }, [location.pathname]);

  useEffect(() => {
    if (location.pathname.startsWith('/ai-chat')) {
      localStorage.removeItem('ai_chat_unread');
      setAiChatUnread(false);
    }
  }, [location.pathname]);

  useEffect(() => {
    const onNewReply = () => setAiChatUnread(true);
    const onClearUnread = () => setAiChatUnread(false);
    window.addEventListener('ai-chat-new-reply', onNewReply);
    window.addEventListener('ai-chat-clear-unread', onClearUnread);
    return () => {
      window.removeEventListener('ai-chat-new-reply', onNewReply);
      window.removeEventListener('ai-chat-clear-unread', onClearUnread);
    };
  }, []);

  const isChatPage = location.pathname.startsWith('/ai-chat') || location.pathname.startsWith('/messaging');
  useEffect(() => {
    if (isChatPage) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [isChatPage]);

  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < BREAKPOINT_MD);
    window.addEventListener('resize', onResize);
    onResize();
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const pathFirst = location.pathname.split('/')[1] || '';
  const activeKey = '/' + pathFirst;
  const openKeys = (() => {
    if (['', 'cases', 'executions', 'reports', 'defects'].includes(pathFirst)) return ['test-center'];
    if (['environments', 'logs', 'projects'].includes(pathFirst)) return ['config-data'];
    return [];
  })();

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {!isStandaloneAiChat && (
        <Sider
          trigger={null}
          collapsible
          collapsed={collapsed || narrow}
          width={240}
          className="md-nav-drawer"
          style={{
            background: 'var(--md-sys-color-surface-bright)',
            borderRight: '1px solid var(--md-sys-color-outline-variant)',
            position: 'fixed',
            left: 0,
            top: 0,
            bottom: 0,
            zIndex: 100,
            overflow: 'auto',
            boxShadow: 'var(--md-elevation-2)',
          }}
        >
          <div
            className="md-drawer-header"
            style={{
              height: 64,
              display: 'flex',
              alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'flex-start',
              padding: collapsed ? '0' : '0 24px',
              borderBottom: '1px solid var(--md-sys-color-outline-variant)',
              gap: 12,
              background: 'var(--md-sys-color-surface-bright)',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <ExperimentOutlined style={{ fontSize: '1.25rem', color: token.colorPrimary }} />
              {!collapsed && (
                <Title level={4} style={{ margin: 0, color: token.colorPrimary, whiteSpace: 'nowrap', fontWeight: 600, fontSize: 'var(--page-title-size)' }}>
                  TestPilot
                </Title>
              )}
            </span>
          </div>
          <Menu
            mode="inline"
            selectedKeys={[activeKey]}
            defaultOpenKeys={openKeys}
            items={menuItems}
            onClick={({ key }) => {
              if (key === '/ai-chat') {
                const base = window.location.origin + (window.location.pathname.replace(/\/[^/]*$/, '/') || '/');
                window.open(new URL('ai-chat', base).href + '?standalone=1', '_blank', 'noopener,noreferrer');
                return;
              }
              if (key.startsWith('/')) navigate(key);
            }}
            style={{ border: 'none', padding: '12px 8px', background: 'transparent' }}
          />
        </Sider>
      )}

      <Layout style={{ marginLeft: isStandaloneAiChat ? 0 : (narrow ? 80 : (collapsed ? 80 : 240)), transition: 'margin-left 0.2s' }}>
        <Header
          className="md-app-bar"
          style={{
            background: 'var(--md-sys-color-surface-bright)',
            padding: narrow && !isStandaloneAiChat ? '0 16px' : '0 32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--md-sys-color-outline-variant)',
            position: 'sticky',
            top: 0,
            zIndex: 99,
            height: 64,
            boxShadow: 'var(--md-elevation-1)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0, gap: 16 }}>
            {!isStandaloneAiChat && (
              <div
                onClick={() => setCollapsed(!collapsed)}
                style={{ display: 'inline-flex', alignItems: 'center', fontSize: '1.125rem', cursor: 'pointer', color: 'rgba(0,0,0,0.6)', flexShrink: 0, padding: 8, margin: '-8px 8px -8px -8px', borderRadius: 8 }}
              >
                {collapsed || narrow ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              </div>
            )}
            {/* 全局项目选择器已移除，各页面自带独立的项目筛选 */}
            <div style={{ marginLeft: isStandaloneAiChat ? 0 : undefined, fontSize: 'var(--page-title-size)', fontWeight: 500, color: 'rgba(0,0,0,0.87)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {(() => {
                let found = menuItems.find((m: any) => 'key' in m && m.key === activeKey);
                if (!found) {
                  for (const m of menuItems) {
                    if ((m as any).children) {
                      const child = (m as any).children.find((c: any) => c.key === activeKey);
                      if (child) { found = child; break; }
                    }
                  }
                }
                if (!found) return 'TestPilot';
                if (activeKey === '/messaging') return '即时通讯';
                return (found as any).label || 'TestPilot';
              })()}
            </div>
          </div>
          <Space size="middle">
            <Dropdown
              open={notificationOpen}
              onOpenChange={(v) => { setNotificationOpen(v); if (v) fetchNotifications(); }}
              dropdownRender={() => (
                <div style={{ background: 'var(--md-sys-color-surface-bright)', boxShadow: 'var(--md-elevation-4)', borderRadius: 12, minWidth: 320, maxWidth: 400, border: '1px solid var(--md-sys-color-outline-variant)' }}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--md-sys-color-outline-variant)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, color: 'rgba(0,0,0,0.87)' }}>站内通知</span>
                    {unreadCount > 0 && (
                      <Button type="link" size="small" onClick={() => { markAllNotificationsRead().then(() => { fetchUnread(); fetchNotifications(); }); }}>全部已读</Button>
                    )}
                  </div>
                  <List
                    size="small"
                    dataSource={notificationList}
                    style={{ maxHeight: 360, overflow: 'auto' }}
                    renderItem={(item: any) => {
                      const extra = item.extra || {};
                      const go = () => {
                        if (!item.read) markNotificationRead(item.id).then(() => { fetchUnread(); fetchNotifications(); });
                        setNotificationOpen(false);
                        if (extra.defect_id) {
                          navigate('/defects', { state: { openDefectId: extra.defect_id } });
                        } else if (extra.execution_id) {
                          navigate('/executions', { state: { openExecutionId: extra.execution_id } });
                        } else if (extra.report_id) {
                          navigate('/reports', { state: { openReportId: extra.report_id } });
                        }
                      };
                      return (
                        <List.Item
                          key={item.id}
                          style={{ opacity: item.read ? 0.8 : 1, cursor: 'pointer' }}
                          onClick={go}
                        >
                          <List.Item.Meta title={item.title} description={item.content || formatDateTimeZh(item.created_at)} />
                        </List.Item>
                      );
                    }}
                  />
                  {notificationList.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: 'rgba(0,0,0,0.6)' }}>暂无通知</div>}
                </div>
              )}
              placement="bottomRight"
            >
              <Badge count={unreadCount} size="small" offset={[-2, 2]} showZero={false}>
                <Button type="text" icon={<BellOutlined />} style={{ display: 'inline-flex', alignItems: 'center', fontSize: '1.125rem' }} />
              </Badge>
            </Dropdown>
            <Dropdown
              menu={{
                items: [
                  { key: 'profile', icon: <UserOutlined />, label: '个人资料', onClick: () => { profileForm.setFieldsValue({ email: user?.email ?? '', phone: user?.phone ?? '' }); setProfileModalOpen(true); } },
                  { key: 'changePwd', icon: <LockOutlined />, label: '修改密码', onClick: () => { changePwdForm.resetFields(); setChangePwdModalOpen(true); } },
                  { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: () => { logout(); navigate('/login'); } },
                ],
              }}
              placement="bottomRight"
            >
              <Button type="text" icon={<UserOutlined />} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>{user?.real_name ? `${user.real_name}(${user.username})` : (user?.username || '用户')}</span>
                {user?.is_admin && <Typography.Text type="secondary" style={{ fontSize: 12 }}>管理员</Typography.Text>}
              </Button>
            </Dropdown>
          </Space>
        </Header>
        <Content style={{
          padding: narrow ? 12 : 24,
          paddingBottom: narrow ? 12 : 32,
          minHeight: 'calc(100vh - 64px)',
          overflowX: 'auto',
          minWidth: 0,
          ...(isChatPage && {
            overflow: 'hidden',
            height: 'calc(100vh - 64px)',
            display: 'flex',
            flexDirection: 'column',
          }),
        }}
        >
          <div
            className="page-content"
            style={isChatPage ? { flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', paddingBottom: 0 } : undefined}
          >
            {children}
          </div>
        </Content>
      </Layout>
      <Modal
        title="个人资料"
        open={profileModalOpen}
        onCancel={() => setProfileModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <div style={{ marginBottom: 16 }}>
          <span style={{ color: 'rgba(0,0,0,0.6)' }}>登录账号：</span>
          <strong style={{ marginLeft: 8 }}>{user?.username ?? '-'}</strong>
        </div>
        <Form
          form={profileForm}
          layout="vertical"
          onFinish={async (v) => {
            setProfileSaving(true);
            try {
              await updateProfile({ email: v.email, phone: v.phone });
              message.success('已保存');
              refreshUser();
              setProfileModalOpen(false);
            } catch {
              message.error('保存失败');
            }
            setProfileSaving(false);
          }}
        >
          <Form.Item name="email" label="邮箱">
            <Input type="email" placeholder="用于通知与找回" />
          </Form.Item>
          <Form.Item name="phone" label="手机号">
            <Input placeholder="选填" />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={profileSaving}>保存</Button>
              <Button onClick={() => setProfileModalOpen(false)}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="修改密码"
        open={changePwdModalOpen}
        onCancel={() => setChangePwdModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form
          form={changePwdForm}
          layout="vertical"
          onFinish={async (v) => {
            if (!PASSWORD_RULE.test(v.new_password)) {
              message.error('新密码必须同时包含字母和数字');
              return;
            }
            setChangePwdSaving(true);
            try {
              await changePassword({ old_password: v.old_password, new_password: v.new_password });
              message.success('密码已修改');
              setChangePwdModalOpen(false);
            } catch (e: any) {
              message.error(e.response?.data?.detail || '修改失败');
            }
            setChangePwdSaving(false);
          }}
        >
          <Form.Item name="old_password" label="原密码" rules={[{ required: true, message: '请输入原密码' }]}>
            <Input.Password placeholder="原密码" autoComplete="current-password" />
          </Form.Item>
          <Form.Item
            name="new_password"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { pattern: PASSWORD_RULE, message: '必须同时包含字母和数字' },
            ]}
          >
            <Input.Password placeholder="新密码" autoComplete="new-password" />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={changePwdSaving}>确认修改</Button>
              <Button onClick={() => setChangePwdModalOpen(false)}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  );
};

export default AppLayout;
