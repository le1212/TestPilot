import React, { useState } from 'react';
import { Card, Form, Input, Button, message } from 'antd';
import { UserOutlined, LockOutlined, ExperimentOutlined } from '@ant-design/icons';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Login: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const { token, login } = useAuth();
  const navigate = useNavigate();
  if (token) return <Navigate to="/" replace />;

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const result = await login(values.username, values.password);
      message.success('登录成功');
      if (result?.warnings?.length) {
        result.warnings.forEach((w: string) => message.warning(w, 6));
      }
      navigate('/', { replace: true });
    } catch (e: any) {
      message.error(e.response?.data?.detail || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--md-sys-color-surface)',
      padding: 32,
    }}>
      <Card
        className="md-login-card"
        style={{
          width: '100%',
          maxWidth: 400,
          borderRadius: 16,
          boxShadow: 'var(--md-elevation-4)',
          overflow: 'hidden',
          border: '1px solid var(--md-sys-color-outline-variant)',
          background: 'var(--md-sys-color-surface-bright)',
        }}
        bodyStyle={{ padding: '32px 28px' }}
        bordered={false}
      >
        <div className="page-title-block" style={{ marginBottom: 28 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <ExperimentOutlined style={{ fontSize: '1.5rem', color: 'var(--md-sys-color-primary)' }} />
            <h1>TestPilot</h1>
          </div>
          <p style={{ marginTop: 8 }}>统一测试平台 · 请登录</p>
        </div>
        <Form name="login" onFinish={onFinish} autoComplete="off" size="large">
          <Form.Item name="username" rules={[{ required: true, message: '请输入登录账号' }]}>
            <Input prefix={<UserOutlined />} placeholder="登录账号" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" autoComplete="off" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>登录</Button>
          </Form.Item>
          <div style={{ textAlign: 'center', marginTop: -8 }}>
            <Link to="/forgot-password">忘记密码？</Link>
          </div>
        </Form>
        <div style={{ textAlign: 'center', color: 'rgba(0,0,0,0.38)', fontSize: 12, marginTop: 8 }}>
          无注册入口，账号由管理员创建
        </div>
      </Card>
    </div>
  );
};

export default Login;
