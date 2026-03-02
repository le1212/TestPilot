import React, { useEffect, useState, useCallback } from 'react';
import { Card, Form, Input, Button, Switch, Select, message, Alert, Space, Collapse } from 'antd';
import { SettingOutlined, ReloadOutlined, MailOutlined, ApiOutlined, RobotOutlined } from '@ant-design/icons';
import { getJiraSettings, updateJiraSettings, testJiraConnection, getSmtpSettings, updateSmtpSettings, testSmtpConnection, getAiSettings, updateAiSettings } from '../api';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';

const checkBackendHealth = async (): Promise<boolean> => {
  try {
    const res = await axios.get('/api/health', { timeout: 5000 });
    return res?.status === 200;
  } catch {
    return false;
  }
};

const Settings: React.FC = () => {
  const { user } = useAuth();
  const [form] = Form.useForm();
  const [smtpForm] = Form.useForm();
  const [aiForm] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [smtpLoading, setSmtpLoading] = useState(false);
  const [smtpTestLoading, setSmtpTestLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);

  const fetchSettings = useCallback(() => {
    if (!user?.is_admin) return;
    setLoadError(null);
    setLoadingSettings(true);
    Promise.all([getJiraSettings(), getSmtpSettings(), getAiSettings().catch(() => ({ data: {} }))])
      .then(([jiraRes, smtpRes, aiRes]) => {
        const d = jiraRes.data || {};
        form.setFieldsValue({
          jira_url: d.jira_url,
          jira_username: d.jira_username,
          jira_api_token: d.jira_api_token || '',
          jira_project_key: d.jira_project_key,
          jira_enabled: !!d.jira_enabled,
        });
        const s = smtpRes.data || {};
        smtpForm.setFieldsValue({
          smtp_host: s.smtp_host,
          smtp_port: s.smtp_port ?? 465,
          smtp_user: s.smtp_user,
          smtp_password: s.smtp_password || '',
          smtp_ssl: s.smtp_ssl !== false,
          from_addr: s.from_addr,
          to_emails: Array.isArray(s.to_emails) ? s.to_emails.join(', ') : (s.to_emails || ''),
          enabled: !!s.enabled,
        });
        const a = aiRes?.data || {};
        aiForm.setFieldsValue({
          provider: a.provider || 'mock',
          model: a.model || 'gpt-4o-mini',
          ai_api_key: a.ai_api_key || '',
          base_url: a.base_url || '',
        });
      })
      .catch(async (e) => {
        const status = e.response?.status;
        const is404 = status === 404;
        const backendOk = await checkBackendHealth();
        if (!backendOk) {
          setLoadError('无法连接后端。请确认后端已在端口 8001 启动（如运行 一键启动.bat 或 backend 下执行 仅启动后端.bat），并确保通过 http://localhost:3000 访问本页面（这样 /api 才会被代理到后端）。');
        } else if (is404) {
          setLoadError('设置接口返回 404。请确认通过 http://localhost:3000 访问前端（不要直接打开 8001 端口），并重启后端后再试。');
        } else {
          setLoadError('加载设置失败，请稍后重试。');
        }
      })
      .finally(() => setLoadingSettings(false));
  }, [form, smtpForm, aiForm, user?.is_admin]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  if (!user) return null;
  if (!user.is_admin) {
    return (
      <Card title={<span><SettingOutlined /> 系统设置</span>}>
        <Alert type="warning" showIcon message="仅管理员可访问系统设置（Jira 集成、邮件通知为全局配置）" />
      </Card>
    );
  }

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      await updateJiraSettings(values);
      message.success('保存成功');
    } catch {
      message.error('保存失败');
    }
    setLoading(false);
  };

  const testConnection = async () => {
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    setTestLoading(true);
    try {
      const res = await testJiraConnection(values);
      if (res.data.ok) {
        message.success(res.data.message || '连接成功');
        if (res.data.projects?.length) {
          message.info(`可选项目: ${res.data.projects.map((p: any) => p.key).join(', ')}`);
        }
      } else {
        message.error(res.data.message || '连接失败');
      }
    } catch {
      message.error('请求失败');
    }
    setTestLoading(false);
  };

  const onSmtpFinish = async (values: any) => {
    setSmtpLoading(true);
    try {
      const to_emails = (values.to_emails || '')
        .split(/[,，\s]+/)
        .map((e: string) => e.trim())
        .filter(Boolean);
      await updateSmtpSettings({ ...values, to_emails });
      message.success('SMTP 设置已保存');
    } catch {
      message.error('保存失败');
    }
    setSmtpLoading(false);
  };

  const onAiFinish = async (values: any) => {
    setAiLoading(true);
    try {
      await updateAiSettings(values);
      message.success('AI 设置已保存');
    } catch {
      message.error('保存失败');
    }
    setAiLoading(false);
  };

  const testSmtp = async () => {
    const values = await smtpForm.validateFields().catch(() => null);
    if (!values) return;
    const to_emails = (values.to_emails || '').split(/[,，\s]+/).map((e: string) => e.trim()).filter(Boolean);
    if (!to_emails.length) {
      message.warning('请先填写收件人邮箱');
      return;
    }
    setSmtpTestLoading(true);
    try {
      const res = await testSmtpConnection({ ...values, to_emails });
      if (res.data.ok) {
        message.success(res.data.message || '测试邮件发送成功');
      } else {
        message.error(res.data.message || '发送失败');
      }
    } catch {
      message.error('请求失败');
    }
    setSmtpTestLoading(false);
  };

  const collapseItems = [
    {
      key: 'jira',
      label: <span><ApiOutlined /> Jira 集成</span>,
      children: (
        <>
          <Collapse size="small" style={{ marginBottom: 16 }} items={[{ key: 'jira-desc', label: '说明（点击展开）', children: <Alert type="info" showIcon message="配置后可在缺陷管理中一键将缺陷推送到 Jira，并支持从 Jira 同步状态。" /> }]} />
          <Form form={form} layout="vertical" onFinish={onFinish}>
            <Form.Item name="jira_enabled" label="启用 Jira" valuePropName="checked">
              <Switch checkedChildren="开" unCheckedChildren="关" />
            </Form.Item>
            <Form.Item name="jira_url" label="Jira 地址" rules={[{ required: true, message: '请输入 Jira 地址' }]}>
              <Input placeholder="https://your-domain.atlassian.net" />
            </Form.Item>
            <Form.Item name="jira_username" label="用户名 / 邮箱">
              <Input placeholder="登录 Jira 的邮箱或用户名" />
            </Form.Item>
            <Form.Item name="jira_api_token" label="API Token">
              <Input.Password placeholder="留空表示不修改已保存的 Token" autoComplete="off" />
            </Form.Item>
            <Form.Item name="jira_project_key" label="项目 Key">
              <Input placeholder="如 TEST、PROJ" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={loading}>保存</Button>
              <Button style={{ marginLeft: 8 }} loading={testLoading} onClick={testConnection}>测试连接</Button>
            </Form.Item>
          </Form>
        </>
      ),
    },
    {
      key: 'smtp',
      label: <span><MailOutlined /> 邮件通知（SMTP）</span>,
      children: (
        <>
          <Collapse size="small" style={{ marginBottom: 16 }} items={[{ key: 'smtp-desc', label: '说明（点击展开）', children: <Alert type="info" showIcon message="执行结果与缺陷流转通知：配置后将在用例执行结束时、缺陷创建/更新/推送Jira/同步Jira 时向收件人发送邮件。" /> }]} />
          <Form form={smtpForm} layout="vertical" onFinish={onSmtpFinish}>
            <Form.Item name="enabled" label="启用邮件通知" valuePropName="checked">
              <Switch checkedChildren="开" unCheckedChildren="关" />
            </Form.Item>
            <Form.Item name="smtp_host" label="SMTP 服务器">
              <Input placeholder="如 smtp.qq.com、smtp.163.com" />
            </Form.Item>
            <Form.Item name="smtp_port" label="端口">
              <Input type="number" placeholder="465（SSL）或 587" />
            </Form.Item>
            <Form.Item name="smtp_ssl" label="使用 SSL" valuePropName="checked">
              <Switch checkedChildren="是" unCheckedChildren="否" />
            </Form.Item>
            <Form.Item name="smtp_user" label="发件账号">
              <Input placeholder="登录用户名/邮箱" />
            </Form.Item>
            <Form.Item name="smtp_password" label="密码/授权码">
              <Input.Password placeholder="留空表示不修改" autoComplete="off" />
            </Form.Item>
            <Form.Item name="from_addr" label="发件人地址">
              <Input placeholder="留空则使用发件账号" />
            </Form.Item>
            <Form.Item name="to_emails" label="通知收件人（多个用逗号分隔）">
              <Input.TextArea rows={2} placeholder="email1@example.com, email2@example.com" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={smtpLoading}>保存</Button>
              <Button style={{ marginLeft: 8 }} loading={smtpTestLoading} onClick={testSmtp}>发送测试邮件</Button>
            </Form.Item>
          </Form>
        </>
      ),
    },
    {
      key: 'ai',
      label: <span><RobotOutlined /> AI 模型</span>,
      children: (
        <>
          <Collapse size="small" style={{ marginBottom: 16 }} items={[{ key: 'ai-desc', label: '说明（点击展开）', children: <Alert type="info" showIcon message="用于日志分析、报告分析、根据失败执行生成缺陷、根据需求生成测试用例。此处配置的 API Key 与接口地址全局生效，所有 AI 功能共用。" /> }]} />
          <Form form={aiForm} layout="vertical" onFinish={onAiFinish}>
            <Form.Item name="provider" label="提供商">
              <Select options={[
                { label: '模拟演示（无需 API Key）', value: 'mock' },
                { label: 'OpenAI（GPT）', value: 'openai' },
                { label: 'DeepSeek', value: 'deepseek' },
                { label: '通义 / 阿里云（开放兼容）', value: 'dashscope' },
                { label: '其他开放兼容接口', value: 'openai_compatible' },
              ]} />
            </Form.Item>
            <Form.Item
              name="model"
              label="模型名称"
              extra="必须与所选提供商一致，填错会报「Model Not Exist」。OpenAI: gpt-4o-mini；DeepSeek: deepseek-chat；通义: qwen-turbo。"
            >
              <Input placeholder="如 gpt-4o-mini、deepseek-chat、qwen-turbo（按提供商填）" />
            </Form.Item>
            <Form.Item name="ai_api_key" label="API Key（全局）" extra="根据所选提供商填写：OpenAI 填 OpenAI Key，DeepSeek/通义等填对应 Key。留空表示不修改已保存的 Key。">
              <Input.Password placeholder="留空表示不修改已保存的 Key" autoComplete="off" />
            </Form.Item>
            <Form.Item name="base_url" label="API 接口地址（Base URL）" extra="填 API 服务端网址，如 https://api.xxx.com/v1。选 DeepSeek/通义 可留空。">
              <Input placeholder="例：https://api.xxx.com/v1（选 DeepSeek/通义可留空）" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={aiLoading}>保存</Button>
            </Form.Item>
          </Form>
        </>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div className="page-title-block">
          <h1>系统设置</h1>
          <p>Jira 集成、邮件通知与 AI 模型</p>
        </div>
      </div>
      {loadError && (
        <Alert
          type="error"
          showIcon
          message="加载设置失败"
          description={
            <Space direction="vertical" style={{ width: '100%' }}>
              <span>{loadError}</span>
              <Button type="primary" size="small" icon={<ReloadOutlined />} onClick={fetchSettings}>
                重试
              </Button>
            </Space>
          }
          style={{ marginBottom: 24, borderRadius: 8, maxWidth: 640 }}
        />
      )}
      <Card
        className="page-card"
        bordered={false}
        style={{ maxWidth: 640 }}
        title={<span><SettingOutlined /> 系统设置</span>}
        loading={loadingSettings}
      >
        <Collapse defaultActiveKey={[]} items={collapseItems} />
      </Card>
    </div>
  );
};

export default Settings;
