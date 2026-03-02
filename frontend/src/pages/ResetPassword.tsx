import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Button, message } from 'antd';
import { LockOutlined, ExperimentOutlined } from '@ant-design/icons';
import { Link, useSearchParams } from 'react-router-dom';
import { resetPassword } from '../api';

const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]+$/;

const ResetPassword: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  useEffect(() => {
    if (!token) message.warning('缺少重置令牌，请从邮件链接进入');
  }, [token]);

  const onFinish = async (values: { new_password: string }) => {
    if (!token) {
      message.error('缺少重置令牌');
      return;
    }
    if (!PASSWORD_RULE.test(values.new_password)) {
      message.error('密码必须同时包含字母和数字');
      return;
    }
    setLoading(true);
    try {
      await resetPassword({ token, new_password: values.new_password });
      setSuccess(true);
      message.success('密码已重置，请使用新密码登录');
    } catch (e: any) {
      message.error(e.response?.data?.detail || '重置失败');
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
              <h1>设置新密码</h1>
            </div>
          </div>
          <span style={{ color: '#475569' }}>请输入新密码（须包含字母和数字）</span>
        </div>
        {success ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <p style={{ color: '#059669' }}>密码已重置。</p>
            <Link to="/login"><Button type="primary">去登录</Button></Link>
          </div>
        ) : !token ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: '#64748b' }}>
            <p>缺少或无效的重置链接，请从邮件中的链接进入本页。</p>
            <Link to="/login"><Button type="primary">返回登录</Button></Link>
          </div>
        ) : (
          <Form name="reset" onFinish={onFinish} autoComplete="off" size="large">
            <Form.Item
              name="new_password"
              rules={[
                { required: true, message: '请输入新密码' },
                { min: 6, message: '至少 6 位' },
                { pattern: PASSWORD_RULE, message: '必须同时包含字母和数字' },
              ]}
            >
              <Input.Password prefix={<LockOutlined />} placeholder="新密码" autoComplete="new-password" />
            </Form.Item>
            <Form.Item name="confirm" dependencies={['new_password']} rules={[{ required: true, message: '请确认新密码' }, ({ getFieldValue }) => ({ validator(_, v) { if (!v || getFieldValue('new_password') === v) return Promise.resolve(); return Promise.reject(new Error('两次输入不一致')); } })]}>
              <Input.Password prefix={<LockOutlined />} placeholder="确认新密码" autoComplete="new-password" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={loading} block disabled={!token}>确认重置</Button>
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

export default ResetPassword;
