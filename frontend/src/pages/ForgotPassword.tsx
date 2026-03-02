import React, { useState } from 'react';
import { Card, Form, Input, Button, message } from 'antd';
import { MailOutlined, ExperimentOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { forgotPassword } from '../api';

const ForgotPassword: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const onFinish = async (values: { email: string }) => {
    setLoading(true);
    try {
      await forgotPassword(values.email.trim());
      setSent(true);
      message.success('若该邮箱已注册，您将收到重置链接，请查收邮件');
    } catch (e: any) {
      message.error(e.response?.data?.detail || '请求失败');
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
      background: 'linear-gradient(160deg, #f8fafc 0%, #e2e8f0 50%, #cbd5e1 100%)',
      padding: 24,
    }}>
      <Card
        style={{ width: '100%', maxWidth: 400, borderRadius: 16, boxShadow: '0 8px 32px rgba(15,23,42,0.12)', border: '1px solid rgba(226,232,240,0.8)' }}
        bordered={false}
      >
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div className="page-title-block" style={{ marginBottom: 24 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <ExperimentOutlined style={{ fontSize: '1.5rem', color: '#0369a1' }} />
              <h1>找回密码</h1>
            </div>
          </div>
          <span style={{ color: '#475569' }}>输入注册邮箱，我们将发送重置链接</span>
        </div>
        {sent ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <p style={{ color: '#059669' }}>已发送。请查收邮件并点击链接设置新密码。</p>
            <Link to="/login">返回登录</Link>
          </div>
        ) : (
          <Form name="forgot" onFinish={onFinish} autoComplete="off" size="large">
            <Form.Item name="email" rules={[{ required: true, message: '请输入邮箱' }, { type: 'email', message: '请输入有效邮箱' }]}>
              <Input prefix={<MailOutlined />} placeholder="注册时填写的邮箱" type="email" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={loading} block>发送重置链接</Button>
            </Form.Item>
          </Form>
        )}
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Link to="/login">返回登录</Link>
        </div>
      </Card>
    </div>
  );
};

export default ForgotPassword;
