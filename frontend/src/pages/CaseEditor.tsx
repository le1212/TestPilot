import React, { useEffect, useState } from 'react';
import {
  Card, Form, Input, InputNumber, Select, Button, Space, Tabs, message, Tag, Row, Col,
  Typography, Divider, Table, Popconfirm, Switch, Alert, Spin, Collapse, Tooltip, Upload, Modal,
} from 'antd';
import {
  SaveOutlined, PlayCircleOutlined, ArrowLeftOutlined, PlusOutlined,
  DeleteOutlined, ApiOutlined, GlobalOutlined, MobileOutlined,
  AppstoreOutlined, CheckCircleOutlined, CloseCircleOutlined,
  ThunderboltOutlined, ArrowUpOutlined, ArrowDownOutlined, FolderAddOutlined,
  RobotOutlined, PlusCircleOutlined, ShareAltOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { getCase, createCase, updateCase, runTest, getProjects, getEnvironments, getUsersOptions, uploadFile, generateSteps } from '../api';
import { setAIChatContext } from '../utils/aiChatContext';
import { useAuth } from '../contexts/AuthContext';
import ShareToIM from '../components/ShareToIM';
import Breadcrumb from '../components/Breadcrumb';

const { TextArea } = Input;

const httpMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
const methodColors: Record<string, string> = {
  GET: '#059669', POST: '#0369a1', PUT: '#d97706',
  DELETE: '#dc2626', PATCH: '#0d9488', HEAD: '#64748b', OPTIONS: '#0d9488',
};

const execStatusLabel: Record<string, string> = {
  passed: '通过',
  failed: '失败',
  error: '错误',
  running: '运行中',
  pending: '等待中',
};

const CaseEditor: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const isEdit = id && id !== 'new';

  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [caseData, setCaseData] = useState<any>(null); // 用于判断是否可编辑
  const [shareOpen, setShareOpen] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  const [envs, setEnvs] = useState<any[]>([]);
  const [caseType, setCaseType] = useState('api');
  const [runResult, setRunResult] = useState<any>(null);
  const [runEnvId, setRunEnvId] = useState<number | undefined>(undefined);
  const [userOptions, setUserOptions] = useState<{ id: number; username: string; real_name?: string }[]>([]);
  const [collaboratorIds, setCollaboratorIds] = useState<number[]>([]);
  const [aiGenOpen, setAiGenOpen] = useState(false);
  const [aiGenLoading, setAiGenLoading] = useState(false);
  const [generatedSteps, setGeneratedSteps] = useState<any[]>([]);
  const [generatedConfigSuggestion, setGeneratedConfigSuggestion] = useState<any>(null);
  const [generatedCaseSuggestion, setGeneratedCaseSuggestion] = useState<{ name?: string; description?: string; priority?: string } | null>(null);
  const [aiGenInsertSectionIdx, setAiGenInsertSectionIdx] = useState(0);
  const [aiGenType, setAiGenType] = useState<'api' | 'web' | 'app' | 'miniapp'>('api');
  const [aiGenForm] = Form.useForm();

  const canEdit = !isEdit || !user || !caseData
    ? true
    : Boolean(user.is_admin || (caseData.created_by_id != null && caseData.created_by_id === user.id)
      || (Array.isArray(caseData.collaborator_ids) && caseData.collaborator_ids.includes(user.id)));
  const formStatus = Form.useWatch('status', form);
  const formProjectId = Form.useWatch('project_id', form);
  const canRun = canEdit && formStatus === 'active';
  const readOnly: boolean = Boolean(isEdit && !canEdit);

  // 切换项目时若当前执行环境不属于新项目，则清空执行环境选择，避免下拉显示无效 id
  useEffect(() => {
    if (formProjectId == null || runEnvId == null) return;
    const env = envs.find((e: any) => e.id === runEnvId);
    if (env && env.project_id !== formProjectId) setRunEnvId(undefined);
  }, [formProjectId, runEnvId, envs]);

  // API config state
  const [method, setMethod] = useState('GET');
  const [url, setUrl] = useState('');
  const [headers, setHeaders] = useState<{ key: string; value: string }[]>([]);
  const [params, setParams] = useState<{ key: string; value: string }[]>([]);
  const [bodyType, setBodyType] = useState('json');
  const [body, setBody] = useState('');
  const [assertions, setAssertions] = useState<any[]>([]);
  const [timeoutSeconds, setTimeoutSeconds] = useState<number>(30);
  const [dataDriverEnabled, setDataDriverEnabled] = useState(false);
  const [dataDriverFileUrl, setDataDriverFileUrl] = useState('');
  const [dataDriverSheetName, setDataDriverSheetName] = useState('');
  const [dataDriverUploading, setDataDriverUploading] = useState(false);

  // Web config state
  const [webSteps, setWebSteps] = useState<any[]>([]);
  const [webBrowser, setWebBrowser] = useState<'chrome' | 'edge'>('edge');
  const [webAddToSectionIdx, setWebAddToSectionIdx] = useState(0);
  const [webSectionActiveKeys, setWebSectionActiveKeys] = useState<string[]>([]);

  // App config state
  const [appSteps, setAppSteps] = useState<any[]>([]);
  const [appPlatform, setAppPlatform] = useState('android');
  const [appAddToSectionIdx, setAppAddToSectionIdx] = useState(0);
  const [appSectionActiveKeys, setAppSectionActiveKeys] = useState<string[]>([]);

  // Mini-program config state
  const [miniSteps, setMiniSteps] = useState<any[]>([]);
  const [miniAddToSectionIdx, setMiniAddToSectionIdx] = useState(0);
  const [miniSectionActiveKeys, setMiniSectionActiveKeys] = useState<string[]>([]);

  useEffect(() => {
    if (!isEdit) {
      setWebBrowser('edge');
    }
  }, [isEdit]);

  useEffect(() => {
    Promise.all([getProjects(), getEnvironments()]).then(([p, e]) => {
      setProjects(p.data);
      setEnvs(e.data);
      const projectsList = Array.isArray(p?.data) ? p.data : [];
      const stateProjectId = (location.state as any)?.project_id;
      if (!isEdit && stateProjectId != null && projectsList.some((proj: any) => proj.id === stateProjectId)) {
        form.setFieldsValue({ project_id: stateProjectId });
      }
    });

    if (isEdit) getUsersOptions().then((r) => setUserOptions(Array.isArray(r?.data) ? r.data : [])).catch(() => {});
    if (isEdit) {
      setLoading(true);
      getCase(Number(id))
        .then((res) => {
          const c = res.data;
          setCaseData(c);
          setCollaboratorIds(Array.isArray(c.collaborator_ids) ? c.collaborator_ids : []);
          setRunEnvId(c.default_environment_id != null ? c.default_environment_id : undefined);
          // 仅当 project_id 在项目列表中时才回填，避免无数据时下拉显示无效 id（如 1）
          return Promise.all([getProjects(), Promise.resolve(c)]);
        })
        .then(([pRes, c]: [any, any]) => {
          const projectsList = Array.isArray(pRes?.data) ? pRes.data : [];
          const validProjectId = projectsList.some((proj: any) => proj.id === c.project_id) ? c.project_id : undefined;
          form.setFieldsValue({
            project_id: validProjectId,
            name: c.name,
            type: c.type,
            priority: c.priority,
            status: c.status,
            description: c.description,
            tags: c.tags,
          });
          setCaseType(c.type);
          const cfg = c.config || {};

          if (c.type === 'api') {
            setMethod(cfg.method || 'GET');
            setUrl(cfg.url || '');
            setHeaders(cfg.headers ? Object.entries(cfg.headers).map(([k, v]) => ({ key: k, value: v as string })) : []);
            setParams(cfg.params ? Object.entries(cfg.params).map(([k, v]) => ({ key: k, value: v as string })) : []);
            setBodyType(cfg.body_type || 'json');
            setBody(cfg.body || '');
            setAssertions(cfg.assertions || []);
            setTimeoutSeconds(typeof cfg.timeout_seconds === 'number' ? cfg.timeout_seconds : 30);
            const dd = cfg.data_driver || {};
            setDataDriverEnabled(Boolean(dd.enabled));
            setDataDriverFileUrl(dd.file_url || '');
            setDataDriverSheetName(dd.sheet_name || '');
            setWebSteps([]);
            setAppSteps([]);
            setMiniSteps([]);
          } else if (c.type === 'web') {
            setWebSteps((cfg.steps || []).map((s: any) => ({ ...s, action: normalizeWebAction(s.action || '') })));
            setWebBrowser((cfg.browser === 'chrome' ? 'chrome' : 'edge') as 'chrome' | 'edge');
            setDataDriverEnabled(Boolean((cfg.data_driver || {}).enabled));
            setDataDriverFileUrl((cfg.data_driver || {}).file_url || '');
            setDataDriverSheetName((cfg.data_driver || {}).sheet_name || '');
            setAppSteps([]);
            setMiniSteps([]);
          } else if (c.type === 'app') {
            setAppPlatform(cfg.platform || 'android');
            setAppSteps(cfg.steps || []);
            setDataDriverEnabled(Boolean((cfg.data_driver || {}).enabled));
            setDataDriverFileUrl((cfg.data_driver || {}).file_url || '');
            setDataDriverSheetName((cfg.data_driver || {}).sheet_name || '');
            setWebSteps([]);
            setMiniSteps([]);
          } else if (c.type === 'miniapp') {
            setMiniSteps(cfg.steps || []);
            setDataDriverEnabled(Boolean((cfg.data_driver || {}).enabled));
            setDataDriverFileUrl((cfg.data_driver || {}).file_url || '');
            setDataDriverSheetName((cfg.data_driver || {}).sheet_name || '');
            setWebSteps([]);
            setAppSteps([]);
          } else {
            setWebSteps([]);
            setAppSteps([]);
            setMiniSteps([]);
          }
        })
        .finally(() => setLoading(false));
    }
  }, [id]);

  const buildConfig = () => {
    if (caseType === 'api') {
      const h: Record<string, string> = {};
      headers.filter((x) => x.key).forEach((x) => (h[x.key] = x.value));
      const p: Record<string, string> = {};
      params.filter((x) => x.key).forEach((x) => (p[x.key] = x.value));
      const cfg: any = { method, url, headers: h, params: p, body_type: bodyType, body, assertions, timeout_seconds: timeoutSeconds };
      if (dataDriverEnabled && dataDriverFileUrl) {
        cfg.data_driver = { enabled: true, file_url: dataDriverFileUrl, sheet_name: dataDriverSheetName || undefined };
      }
      return cfg;
    }
    if (caseType === 'web') {
      const cfg: any = { browser: webBrowser, steps: webSteps };
      if (dataDriverEnabled && dataDriverFileUrl) cfg.data_driver = { enabled: true, file_url: dataDriverFileUrl, sheet_name: dataDriverSheetName || undefined };
      return cfg;
    }
    if (caseType === 'app') {
      const cfg: any = { platform: appPlatform, steps: appSteps };
      if (dataDriverEnabled && dataDriverFileUrl) cfg.data_driver = { enabled: true, file_url: dataDriverFileUrl, sheet_name: dataDriverSheetName || undefined };
      return cfg;
    }
    if (caseType === 'miniapp') {
      const cfg: any = { steps: miniSteps };
      if (dataDriverEnabled && dataDriverFileUrl) cfg.data_driver = { enabled: true, file_url: dataDriverFileUrl, sheet_name: dataDriverSheetName || undefined };
      return cfg;
    }
    return {};
  };

  const handleSave = async () => {
    if (readOnly) return;
    const values = await form.validateFields();
    setSaving(true);
    const data = { ...values, config: buildConfig() };
    (data as any).collaborator_ids = collaboratorIds;
    (data as any).default_environment_id = runEnvId ?? null;
    const stateGroupId = (location.state as any)?.group_id;
    if (!isEdit && stateGroupId != null) (data as any).group_id = stateGroupId;
    try {
      if (isEdit) {
        await updateCase(Number(id), data);
        message.success('保存成功');
        setCaseData((prev: any) => (prev ? { ...prev, ...data, collaborator_ids: collaboratorIds } : prev));
      } else {
        const res = await createCase(data);
        message.success('创建成功');
        const projectId = (data as any).project_id ?? res.data?.project_id;
        const groupId = (data as any).group_id ?? res.data?.group_id;
        if (projectId != null) {
          navigate('/cases', { replace: true, state: { openProjectId: projectId, expandGroupId: groupId != null ? groupId : 'ungrouped' } });
        } else {
          navigate(`/cases/${res.data.id}`, { replace: true });
        }
      }
    } catch {
      message.error('保存失败');
    }
    setSaving(false);
  };

  const handleRun = async () => {
    if (!isEdit) {
      message.warning('请先保存用例');
      return;
    }
    setRunning(true);
    setRunResult(null);
    try {
      // 执行前先保存当前表单（类型、步骤等），否则后端会按数据库里的旧类型执行
      const values = await form.validateFields().catch(() => null);
      if (values) {
        const data = { ...values, config: buildConfig() };
        await updateCase(Number(id), data);
      }
      const res = await runTest({
        test_case_id: Number(id),
        environment_id: runEnvId || undefined,
        run_type: caseType,
        run_config: buildConfig(),
      });
      setRunResult(res.data);
      if (res.data.status === 'passed') {
        message.success('执行通过');
      } else {
        message.error('执行失败');
      }
    } catch {
      message.error('执行出错');
    }
    setRunning(false);
  };

  const getSectionsFromSteps = (steps: any[]): { title: string; insertEndIndex: number }[] => {
    if (!steps?.length) return [{ title: '步骤', insertEndIndex: 0 }];
    const sections: { title: string; groupStepIndex: number | null; stepCount: number }[] = [];
    let current: { title: string; groupStepIndex: number | null; stepCount: number } = { title: '步骤', groupStepIndex: null, stepCount: 0 };
    steps.forEach((step, i) => {
      const action = (step.action || '').trim().toLowerCase();
      if (action === '__group__') {
        if (current.stepCount > 0 || current.groupStepIndex !== null) sections.push(current);
        current = { title: ((step.value || '').trim()) || '未命名分组', groupStepIndex: i, stepCount: 0 };
      } else {
        current.stepCount++;
      }
    });
    sections.push(current);
    return sections.map((sec, idx) => {
      const next = sections[idx + 1];
      const insertEndIndex = next ? next.groupStepIndex! : steps.length;
      return { title: sec.title, insertEndIndex };
    });
  };

  const openAiGenModal = (insertSectionIdx?: number) => {
    setGeneratedSteps([]);
    setGeneratedConfigSuggestion(null);
    setGeneratedCaseSuggestion(null);
    setAiGenInsertSectionIdx(insertSectionIdx ?? 0);
    aiGenForm.setFieldsValue({ requirement: '', ai_gen_type: 'api' });
    setAiGenType('api');
    setAiGenOpen(true);
  };

  const handleAiGenerate = async () => {
    const values = await aiGenForm.validateFields().catch(() => null);
    if (!(values?.requirement || '').trim()) {
      message.warning('请填写需求或功能描述');
      return;
    }
    const genType = (values?.ai_gen_type || 'api') as 'api' | 'web' | 'app' | 'miniapp';
    setAiGenLoading(true);
    setGeneratedSteps([]);
    setGeneratedConfigSuggestion(null);
    setGeneratedCaseSuggestion(null);
    try {
      const res = await generateSteps({ case_type: genType, requirement: values.requirement.trim() });
      setAiGenType(genType);
      setGeneratedSteps(Array.isArray(res.data?.steps) ? res.data.steps : []);
      setGeneratedConfigSuggestion(res.data?.config_suggestion ?? null);
      setGeneratedCaseSuggestion(res.data?.case_suggestion ?? null);
      const warnings = res.data?.warnings;
      if (Array.isArray(warnings) && warnings.length > 0) {
        message.warning(warnings.join(' '));
      }
      if (genType === 'api' && !res.data?.config_suggestion && !(res.data?.steps?.length)) {
        message.info('未生成到配置建议，可调整描述后重试');
      } else if (genType !== 'api' && !(res.data?.steps?.length)) {
        message.info('未生成到步骤，可调整描述后重试');
      }
    } catch {
      message.error('AI 生成失败');
    }
    setAiGenLoading(false);
  };

  const applyGeneratedConfig = () => {
    const c = generatedConfigSuggestion;
    if (!c) return;
    setMethod((c.method || 'GET').toUpperCase());
    setUrl(c.url || '');
    setHeaders(Array.isArray(c.headers) ? c.headers : (c.headers && typeof c.headers === 'object' ? Object.entries(c.headers).map(([k, v]) => ({ key: k, value: String(v ?? '') })) : []));
    setParams(Array.isArray(c.params) ? c.params : (c.params && typeof c.params === 'object' ? Object.entries(c.params).map(([k, v]) => ({ key: k, value: String(v ?? '') })) : []));
    setBody(c.body ?? '');
    if (Array.isArray(c.assertions)) setAssertions(c.assertions);
    message.success('已应用 API 配置建议');
    setGeneratedConfigSuggestion(null);
  };

  const applyGeneratedCaseSuggestion = () => {
    const cs = generatedCaseSuggestion;
    if (!cs) return;
    const updates: { name?: string; description?: string; priority?: string; type?: string } = {};
    if (cs.name != null && cs.name !== '') updates.name = cs.name;
    if (cs.description != null && cs.description !== '') updates.description = cs.description;
    if (cs.priority != null && cs.priority !== '') updates.priority = cs.priority;
    updates.type = aiGenType;
    if (Object.keys(updates).length > 0) form.setFieldsValue(updates);
    setCaseType(aiGenType);
    message.success('已应用到用例（含名称、测试类型、描述与优先级）');
    setGeneratedCaseSuggestion(null);
  };

  const insertGeneratedSteps = () => {
    if (!generatedSteps.length) return;
    const stepsSource = aiGenType === 'web' ? webSteps : aiGenType === 'app' ? appSteps : miniSteps;
    const setStepsSource = aiGenType === 'web' ? setWebSteps : aiGenType === 'app' ? setAppSteps : setMiniSteps;
    const sections = getSectionsFromSteps(stepsSource);
    const sec = sections[aiGenInsertSectionIdx];
    const insertAt = sec ? sec.insertEndIndex : stepsSource.length;
    const normalized = generatedSteps.map((s: any) => ({
      action: s.action || '',
      locator: s.locator || '',
      value: s.value != null ? String(s.value) : '',
      description: s.description || '',
    }));
    setStepsSource([...stepsSource.slice(0, insertAt), ...normalized, ...stepsSource.slice(insertAt)]);
    message.success(`已插入 ${normalized.length} 条步骤`);
    setGeneratedSteps([]);
  };

  const renderKVEditor = (
    data: { key: string; value: string }[],
    setData: React.Dispatch<React.SetStateAction<{ key: string; value: string }[]>>,
    label: string,
    isReadOnly?: boolean
  ) => (
    <div>
      {data.map((item, idx) => (
        <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
          <Input
            placeholder="键"
            value={item.key}
            onChange={isReadOnly ? undefined : (e) => { const n = [...data]; n[idx].key = e.target.value; setData(n); }}
            readOnly={isReadOnly}
            style={{ flex: 1 }}
          />
          <Input
            placeholder="值"
            value={item.value}
            onChange={isReadOnly ? undefined : (e) => { const n = [...data]; n[idx].value = e.target.value; setData(n); }}
            readOnly={isReadOnly}
            style={{ flex: 1 }}
          />
          {!isReadOnly && (
            <Button danger icon={<DeleteOutlined />} style={{ flexShrink: 0 }} onClick={() => setData(data.filter((_, i) => i !== idx))} />
          )}
        </div>
      ))}
      {!isReadOnly && (
        <Button type="dashed" icon={<PlusOutlined />} onClick={() => setData([...data, { key: '', value: '' }])} block>
          添加{label}
        </Button>
      )}
    </div>
  );

  const renderDataDriverSection = () =>
    !readOnly ? (
      <div style={{ marginBottom: 16, padding: 12, background: '#fafafa', borderRadius: 8 }}>
        <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>Excel 数据驱动</Typography.Text>
        <Space wrap align="center">
          <Switch checked={dataDriverEnabled} onChange={setDataDriverEnabled} />
          <span>启用后按 Excel 每行执行一次，步骤/URL 等可用 {`{{列名}}`} 占位</span>
        </Space>
        {dataDriverEnabled && (
          <Space wrap style={{ marginTop: 8 }}>
            <Upload name="file" showUploadList={false} accept=".xlsx,.xls"
              beforeUpload={(file) => {
                setDataDriverUploading(true);
                uploadFile(file).then((r) => {
                  const url = r.data?.url ?? '';
                  setDataDriverFileUrl(url.startsWith('http') ? url : `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`);
                  message.success('上传成功');
                }).catch(() => message.error('上传失败')).finally(() => setDataDriverUploading(false));
                return false;
              }}
            >
              <Button loading={dataDriverUploading} size="small">选择 Excel</Button>
            </Upload>
            {dataDriverFileUrl && <Typography.Text type="secondary" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>已选: {dataDriverFileUrl.split('/').pop()}</Typography.Text>}
            <Input placeholder="工作表名（可选）" value={dataDriverSheetName} onChange={(e) => setDataDriverSheetName(e.target.value)} style={{ width: 200 }} allowClear />
          </Space>
        )}
      </div>
    ) : null;

  const renderApiConfig = () => (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Select
          value={method}
          onChange={readOnly ? undefined : setMethod}
          disabled={readOnly}
          style={{ width: 130 }}
          options={httpMethods.map((m) => ({
            label: <span style={{ color: methodColors[m], fontWeight: 600 }}>{m}</span>,
            value: m,
          }))}
        />
        <Input
          placeholder="请求URL，例如：https://api.example.com/users 或 /users（配合环境 Base URL）"
          value={url}
          onChange={readOnly ? undefined : (e) => setUrl(e.target.value)}
          readOnly={readOnly}
          style={{ flex: 1, fontFamily: 'monospace' }}
        />
        {!readOnly && (
          <Button
            type="primary"
            icon={<ThunderboltOutlined />}
            onClick={handleRun}
            loading={running}
          >
            发送
          </Button>
        )}
      </div>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#666' }}>请求超时(秒):</span>
        <InputNumber
          min={1}
          max={300}
          value={timeoutSeconds}
          onChange={readOnly ? undefined : (v) => setTimeoutSeconds(v ?? 30)}
          disabled={readOnly}
          style={{ width: 80 }}
        />
      </div>

      {renderDataDriverSection()}

      <Tabs
        defaultActiveKey="params"
        items={[
          {
            key: 'params',
            label: `请求参数 (${params.filter((x) => x.key).length})`,
            children: renderKVEditor(params, setParams, '参数', readOnly),
          },
          {
            key: 'headers',
            label: `请求头 (${headers.filter((x) => x.key).length})`,
            children: renderKVEditor(headers, setHeaders, '请求头', readOnly),
          },
          {
            key: 'body',
            label: '请求体',
            children: (
              <div>
                <Select
                  value={bodyType}
                  onChange={readOnly ? undefined : setBodyType}
                  disabled={readOnly}
                  style={{ width: 160, marginBottom: 8 }}
                  options={[
                    { label: 'JSON', value: 'json' },
                    { label: '表单', value: 'form' },
                    { label: '原始文本', value: 'raw' },
                    { label: '无', value: 'none' },
                  ]}
                />
                {bodyType !== 'none' && (
                  <TextArea
                    value={body}
                    onChange={readOnly ? undefined : (e) => setBody(e.target.value)}
                    readOnly={readOnly}
                    rows={8}
                    placeholder={bodyType === 'json' ? '{\n  "key": "value"\n}' : '请求体内容'}
                    style={{ fontFamily: 'monospace', fontSize: 13 }}
                  />
                )}
              </div>
            ),
          },
          {
            key: 'assertions',
            label: `断言 (${assertions.length})`,
            children: (
              <div>
                {assertions.map((a, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                    <Select
                      value={a.type}
                      onChange={readOnly ? undefined : (v) => { const n = [...assertions]; n[idx].type = v; setAssertions(n); }}
                      disabled={readOnly}
                      style={{ width: 120, flexShrink: 0 }}
                      options={[
                        { label: '状态码', value: 'status_code' },
                        { label: 'JSON路径', value: 'json_path' },
                        { label: '响应头', value: 'header' },
                        { label: '包含文本', value: 'body_contains' },
                      ]}
                    />
                    <Input
                      placeholder="字段（例如 data.id）"
                      value={a.field}
                      onChange={readOnly ? undefined : (e) => { const n = [...assertions]; n[idx].field = e.target.value; setAssertions(n); }}
                      readOnly={readOnly}
                      style={{ flex: 1 }}
                    />
                    <Select
                      value={a.operator || 'equals'}
                      onChange={readOnly ? undefined : (v) => { const n = [...assertions]; n[idx].operator = v; setAssertions(n); }}
                      disabled={readOnly}
                      style={{ width: 100, flexShrink: 0 }}
                      options={[
                        { label: '等于', value: 'equals' },
                        { label: '不等于', value: 'not_equals' },
                        { label: '包含', value: 'contains' },
                        { label: '大于', value: 'greater_than' },
                        { label: '小于', value: 'less_than' },
                        { label: '正则', value: 'regex' },
                      ]}
                    />
                    <Input
                      placeholder="期望值"
                      value={a.expected}
                      onChange={readOnly ? undefined : (e) => { const n = [...assertions]; n[idx].expected = e.target.value; setAssertions(n); }}
                      readOnly={readOnly}
                      style={{ flex: 1 }}
                    />
                    {!readOnly && <Button danger icon={<DeleteOutlined />} style={{ flexShrink: 0 }} onClick={() => setAssertions(assertions.filter((_, i) => i !== idx))} />}
                  </div>
                ))}
                {!readOnly && (
                  <Button
                    type="dashed"
                    icon={<PlusOutlined />}
                    onClick={() => setAssertions([...assertions, { type: 'status_code', field: '', operator: 'equals', expected: '200' }])}
                    block
                  >
                    添加断言
                  </Button>
                )}
              </div>
            ),
          },
        ]}
      />
    </div>
  );

  const locatorHelp = (
    <span style={{ fontSize: 12 }}>
      <strong>如何获取：</strong>浏览器 F12 → 元素右键 Copy → Copy selector 或 Copy XPath；或看元素属性 name/id。<br />
      <strong>填写格式：</strong>不写前缀按 CSS；<code>xpath=</code>、<code>id=xxx</code>、<code>name=xxx</code>（表单 name 常用）。例：<code>#kw</code>、<code>name=username</code>、<code>xpath=//button[text()="提交"]</code>
    </span>
  );
  const valueHelp = (
    <span style={{ fontSize: 12 }}>
      <strong>按操作类型填：</strong>打开页面 → URL（可相对路径）；输入 → 要输入的文本；选择下拉 → 选项文字；断言文本 → 期望包含的文本；等待 → 可选填超时(ms)；滚动 → 可选填像素。点击、清除、断言可见等可不填。
    </span>
  );

  const renderStepEditor = (
    steps: any[],
    setSteps: React.Dispatch<React.SetStateAction<any[]>>,
    actionOptions: { label: string; value: string }[],
    addToSectionIdx: number,
    setAddToSectionIdx: (v: number) => void,
    isReadOnly?: boolean,
    normalizeAction?: (a: string) => string,
    sectionActiveKeys?: string[],
    setSectionActiveKeys?: (v: string[] | ((prev: string[]) => string[])) => void
  ) => {
    const ensureLeadingGroup = (arr: any[]) => {
      if (arr.length === 0) return arr;
      if ((arr[0].action || '').trim().toLowerCase() === '__group__') return arr;
      return [{ action: '__group__', value: '步骤', locator: '', description: '' }, ...arr];
    };

    const moveStep = (fromIdx: number, direction: 1 | -1) => {
      const toIdx = fromIdx + direction;
      if (toIdx < 0 || toIdx >= steps.length) return;
      const n = [...steps];
      [n[fromIdx], n[toIdx]] = [n[toIdx], n[fromIdx]];
      setSteps(n);
    };
    // 分组整块上移/下移
    const getGroupBlock = (groupStepIdx: number) => {
      const start = groupStepIdx;
      let end = steps.length;
      for (let i = groupStepIdx + 1; i < steps.length; i++) {
        if ((steps[i].action || '').trim().toLowerCase() === '__group__') {
          end = i;
          break;
        }
      }
      return { start, end, block: steps.slice(start, end) };
    };
    const moveGroup = (secIdx: number, direction: 1 | -1) => {
      const sec = sections[secIdx];
      if (sec.groupStepIndex === null) return;
      const { start, end, block } = getGroupBlock(sec.groupStepIndex);
      if (direction === -1) {
        if (secIdx <= 0) return;
        const prevSec = sections[secIdx - 1];
        const insertAt = prevSec.groupStepIndex !== null ? prevSec.groupStepIndex : 0;
        const before = steps.slice(0, insertAt);
        const after = steps.slice(insertAt, start).concat(steps.slice(end));
        setSteps([...before, ...block, ...after]);
      } else {
        if (secIdx >= sections.length - 1) return;
        const nextSec = sections[secIdx + 1];
        const nextStart = nextSec.groupStepIndex!;
        const nextEnd = getGroupBlock(nextStart).end;
        const afterBlock = steps.slice(nextStart, nextEnd);
        const before = steps.slice(0, start);
        const after = steps.slice(end, nextStart).concat(steps.slice(nextEnd));
        setSteps([...before, ...afterBlock, ...block, ...after]);
      }
    };
    // 按 __group__ 拆成层级：每个分组一个区块，可折叠。无步骤时不生成任何分组
    type Section = { title: string; groupStepIndex: number | null; stepEntries: { step: any; globalIndex: number }[] };
    const sections: Section[] = [];
    if (steps.length > 0) {
      let current: Section = { title: '步骤', groupStepIndex: null, stepEntries: [] };
      steps.forEach((step, i) => {
        const action = (step.action || '').trim().toLowerCase();
        if (action === '__group__') {
          if (current.stepEntries.length > 0 || current.groupStepIndex !== null) sections.push(current);
          current = {
            title: (step.value || '').trim() || '未命名分组',
            groupStepIndex: i,
            stepEntries: [],
          };
        } else {
          current.stepEntries.push({ step, globalIndex: i });
        }
      });
      sections.push(current);
    }

    const clampedSectionIdx = Math.min(addToSectionIdx, Math.max(0, sections.length - 1));
    const addStepToSection = (secIdx: number) => {
      const endIdx = secIdx + 1 < sections.length ? sections[secIdx + 1].groupStepIndex! : steps.length;
      setSteps([...steps.slice(0, endIdx), { action: '', locator: '', value: '', description: '' }, ...steps.slice(endIdx)]);
    };
    const getInsertIndex = () => {
      const sec = sections[clampedSectionIdx];
      if (!sec) return steps.length;
      if (sec.stepEntries.length > 0) return sec.stepEntries[sec.stepEntries.length - 1].globalIndex + 1;
      if (sec.groupStepIndex !== null) return sec.groupStepIndex + 1;
      return 0;
    };

    const renderStepRow = (entry: { step: any; globalIndex: number }, localIndex: number) => {
      const idx = entry.globalIndex;
      const step = entry.step;
      return (
        <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
          <Tag color="blue" style={{ flexShrink: 0, margin: 0 }}>{localIndex}</Tag>
          {!isReadOnly && (
            <>
              <Button type="text" size="small" icon={<ArrowUpOutlined />} disabled={idx === 0} onClick={() => moveStep(idx, -1)} title="上移" />
              <Button type="text" size="small" icon={<ArrowDownOutlined />} disabled={idx === steps.length - 1} onClick={() => moveStep(idx, 1)} title="下移" />
            </>
          )}
          <Select
            value={normalizeAction ? normalizeAction(step.action) : step.action}
            onChange={isReadOnly ? undefined : (v) => { const n = [...steps]; n[idx].action = v ?? ''; setSteps(n); }}
            disabled={isReadOnly}
            style={{ width: 120, flexShrink: 0 }}
            placeholder="操作"
            options={actionOptions}
          />
          <span style={{ flex: 1, minWidth: 0 }}>
            <Tooltip title={!isReadOnly ? locatorHelp : undefined} placement="topLeft" overlayInnerStyle={{ maxWidth: 420 }}>
              <Input
                placeholder="定位方式"
                value={step.locator}
                onChange={isReadOnly ? undefined : (e) => { const n = [...steps]; n[idx].locator = e.target.value; setSteps(n); }}
                readOnly={isReadOnly}
                size="small"
                style={{ width: '100%' }}
              />
            </Tooltip>
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <Tooltip title={!isReadOnly ? valueHelp : undefined} placement="topLeft" overlayInnerStyle={{ maxWidth: 420 }}>
              <Input
                placeholder="值/输入内容"
                value={step.value}
                onChange={isReadOnly ? undefined : (e) => { const n = [...steps]; n[idx].value = e.target.value; setSteps(n); }}
                readOnly={isReadOnly}
                size="small"
                style={{ width: '100%' }}
              />
            </Tooltip>
          </span>
          <Tooltip title={step.description ? step.description : undefined} placement="topLeft" overlayInnerStyle={{ maxWidth: 400 }}>
            <span style={{ display: 'inline-block', width: 100, flexShrink: 0 }}>
              <Input
                placeholder="描述"
                value={step.description}
                onChange={isReadOnly ? undefined : (e) => { const n = [...steps]; n[idx].description = e.target.value; setSteps(n); }}
                readOnly={isReadOnly}
                size="small"
                style={{ width: '100%' }}
              />
            </span>
          </Tooltip>
          {!isReadOnly && (
            <Popconfirm title="确定删除该步骤吗？" okText="确定" cancelText="取消" onConfirm={() => setSteps(steps.filter((_, i) => i !== idx))}>
              <Button type="text" size="small" danger icon={<DeleteOutlined />} title="删除" />
            </Popconfirm>
          )}
        </div>
      );
    };

    return (
      <div>
        <Collapse
          defaultActiveKey={[]}
          size="small"
          style={{ marginBottom: 12 }}
          items={[{
            key: 'help',
            label: '定位方式与值/输入内容 填写说明',
            children: (
              <div style={{ fontSize: 12 }}>
                <p style={{ marginBottom: 6 }}>
                  <strong>定位方式：</strong>不写前缀按 CSS；<code>xpath=</code>、<code>id=xxx</code>、<code>name=xxx</code>（表单 name，AI 易用）。F12 可 Copy selector / XPath，或看元素 name/id 属性。
                </p>
                <p style={{ marginBottom: 0 }}>
                  <strong>值/输入内容：</strong>打开页面填 URL；固定等待填秒数（如 2、3）；输入填文本；选择下拉填选项文字；断言文本填期望内容；等待元素/滚动可填超时或像素。点击、清除、断言可见等可不填。
                </p>
              </div>
            ),
          }]}
        />
        {sections.length === 0 ? (
          <div style={{ marginBottom: 12, padding: 24, background: '#fafafa', borderRadius: 8, textAlign: 'center' }}>
            <Typography.Text type="secondary" style={{ marginRight: 8 }}>暂无分组与步骤，请点击「添加分组」或「添加步骤」开始。</Typography.Text>
            {!isReadOnly && (
              <Space wrap>
                <Button type="dashed" size="small" icon={<FolderAddOutlined />} onClick={() => setSteps([...steps, { action: '__group__', locator: '', value: '新分组', description: '' }])}>添加分组</Button>
                <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={() => setSteps([...steps, { action: '', locator: '', value: '', description: '' }])}>添加步骤</Button>
              </Space>
            )}
          </div>
        ) : (
        <Collapse
          {...(setSectionActiveKeys && sectionActiveKeys != null
            ? {
                activeKey: sectionActiveKeys,
                onChange: (keys: string | string[]) => {
                  const next = (Array.isArray(keys) ? keys : []) as string[];
                  if (next.length === 0 && sectionActiveKeys.length > 0) {
                    setSectionActiveKeys(['s0']);
                  } else {
                    setSectionActiveKeys(next);
                  }
                },
              }
            : { defaultActiveKey: [] as string[] })}
          size="small"
          style={{ marginBottom: 12 }}
          items={sections.map((sec, secIdx) => ({
            key: `s${secIdx}`,
            label: (
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', flexWrap: 'wrap' }}>
                <span style={{ flex: 1, minWidth: 0 }}>{sec.title}</span>
                <Tag style={{ margin: 0, flexShrink: 0 }}>{sec.stepEntries.length} 步</Tag>
                {!isReadOnly && (
                  <span onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                    {sec.groupStepIndex !== null && (
                      <>
                        <Button type="text" size="small" icon={<ArrowUpOutlined />} disabled={secIdx === 0} onClick={() => moveGroup(secIdx, -1)} title="上移分组" />
                        <Button type="text" size="small" icon={<ArrowDownOutlined />} disabled={secIdx === sections.length - 1} onClick={() => moveGroup(secIdx, 1)} title="下移分组" />
                      </>
                    )}
                    <Button type="text" size="small" icon={<PlusOutlined />} onClick={() => addStepToSection(secIdx)}>添加步骤</Button>
                    {sec.groupStepIndex !== null && (
                      <Popconfirm
                        title="确定要删除该分组吗？"
                        description="将同时删除该分组内的全部步骤，且不可恢复。"
                        okText="确定删除"
                        cancelText="取消"
                        okButtonProps={{ danger: true }}
                        onConfirm={() => {
                          const start = sec.groupStepIndex!;
                          let end = steps.length;
                          for (let i = start + 1; i < steps.length; i++) {
                            if ((steps[i].action || '').trim().toLowerCase() === '__group__') {
                              end = i;
                              break;
                            }
                          }
                          setSteps([...steps.slice(0, start), ...steps.slice(end)]);
                        }}
                      >
                        <Button type="text" size="small" danger icon={<DeleteOutlined />} title="删除分组（同时删除该分组内全部步骤）">删除分组</Button>
                      </Popconfirm>
                    )}
                    {sec.groupStepIndex === null && (
                      <Popconfirm
                        title="确定要清空所有步骤吗？"
                        description="将删除全部分组与步骤，且不可恢复。"
                        okText="确定删除"
                        cancelText="取消"
                        okButtonProps={{ danger: true }}
                        onConfirm={() => setSteps([])}
                      >
                        <Button type="text" size="small" danger icon={<DeleteOutlined />} title="删除分组">删除分组</Button>
                      </Popconfirm>
                    )}
                  </span>
                )}
              </span>
            ),
            children: (
              <div style={{ paddingTop: 4 }}>
                <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Typography.Text type="secondary" style={{ flexShrink: 0 }}>分组名称：</Typography.Text>
                  <Input
                    value={sec.groupStepIndex !== null ? ((steps[sec.groupStepIndex]?.value ?? '') as string) : sec.title}
                    onChange={isReadOnly ? undefined : (e) => {
                      if (sec.groupStepIndex !== null) {
                        const n = [...steps];
                        n[sec.groupStepIndex!] = { ...n[sec.groupStepIndex!], value: e.target.value };
                        setSteps(n);
                      } else {
                        setSteps([{ action: '__group__', value: e.target.value || '步骤', locator: '', description: '' }, ...steps]);
                      }
                    }}
                    readOnly={isReadOnly}
                    placeholder="未命名分组"
                    allowClear={!isReadOnly}
                    style={{ width: 200 }}
                  />
                </div>
                {sec.stepEntries.length === 0 ? (
                  <Typography.Text type="secondary">该分组下暂无步骤。可点击「添加步骤」（新步骤会加在末尾），再用上移/下移调整到本分组。</Typography.Text>
                ) : (
                  sec.stepEntries.map((entry, i) => renderStepRow(entry, i + 1))
                )}
              </div>
            ),
          }))}
        />
        )}
        {!isReadOnly && sections.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <Button type="dashed" icon={<FolderAddOutlined />} onClick={() => setSteps([...steps, { action: '__group__', locator: '', value: '新分组', description: '' }])}>
              添加分组
            </Button>
          </div>
        )}
      </div>
    );
  };

  const webActions = [
    { label: '打开页面', value: 'open' },
    { label: '固定等待(秒)', value: 'sleep' },
    { label: '点击', value: 'click' },
    { label: '输入', value: 'input' },
    { label: '清除', value: 'clear' },
    { label: '选择下拉', value: 'select' },
    { label: '等待元素', value: 'wait' },
    { label: '断言文本', value: 'assert_text' },
    { label: '断言可见', value: 'assert_visible' },
    { label: '断言标题', value: 'assert_title' },
    { label: '截图', value: 'screenshot' },
    { label: '滚动', value: 'scroll' },
    { label: '悬停', value: 'hover' },
    { label: '切换iframe', value: 'switch_frame' },
    { label: '执行JS', value: 'execute_js' },
  ];
  const webActionValues = webActions.map((x) => x.value);
  // 强制仅使用系统动作：先别名映射，再语义回退，未知用 wait（避免误用 open）
  const normalizeWebAction = (a: string) => {
    if (!a) return 'wait';
    let s = a.trim().toLowerCase();
    if (s === 'navigate') s = 'open';
    else if (['wait_for_page', 'wait_for_presence', 'wait_for_element'].includes(s)) s = 'wait';
    else if (s === 'assert_element' || s === 'assert') s = 'assert_visible';
    else if (s === 'execute_script' || s === 'set_network') s = 'execute_js';
    if (webActionValues.includes(s)) return s;
    if (/assert|check|verify/.test(s)) return s.includes('title') ? 'assert_title' : (s.includes('text') ? 'assert_text' : 'assert_visible');
    if (['input', 'type', 'fill'].includes(s)) return 'input';
    if (['click', 'submit', 'tap'].includes(s)) return 'click';
    if (s === 'sleep' || s === 'delay' || s.includes('wait')) return s === 'sleep' || s === 'delay' ? 'sleep' : 'wait';
    if (s.includes('scroll')) return 'scroll';
    if (s === 'screenshot' || s === 'capture') return 'screenshot';
    if (s === 'hover' || s === 'mouse_over') return 'hover';
    if (s === 'select' || s === 'dropdown') return 'select';
    if (s.includes('clear')) return 'clear';
    if (s.includes('frame')) return 'switch_frame';
    if (s === 'execute_js' || s === 'script') return 'execute_js';
    if (s === 'open' || s === 'go' || s === 'visit') return 'open';
    return 'wait';
  };

  const appActions = [
    { label: '点击', value: 'tap' },
    { label: '输入', value: 'input' },
    { label: '滑动', value: 'swipe' },
    { label: '长按', value: 'long_press' },
    { label: '等待元素', value: 'wait' },
    { label: '断言文本', value: 'assert_text' },
    { label: '返回', value: 'back' },
    { label: '截图', value: 'screenshot' },
    { label: '启动应用', value: 'launch' },
    { label: '关闭应用', value: 'close_app' },
  ];

  const miniActions = [
    { label: '打开页面', value: 'navigate' },
    { label: '点击', value: 'tap' },
    { label: '输入', value: 'input' },
    { label: '滑动', value: 'swipe' },
    { label: '等待', value: 'wait' },
    { label: '断言文本', value: 'assert_text' },
    { label: '截图', value: 'screenshot' },
    { label: '调用API', value: 'call_api' },
    { label: '获取数据', value: 'get_data' },
  ];

  const renderWebConfig = () => (
    <div>
      <Collapse
        defaultActiveKey={[]}
        size="small"
        style={{ marginBottom: 16 }}
        items={[
          {
            key: 'web-desc',
            label: 'Web UI 测试说明（点击展开）',
            children: (
              <Alert
                message="Web UI 测试"
                description="配置浏览器自动化测试步骤。执行引擎使用 Selenium，可选 Chrome 或 Edge（需本机已安装对应浏览器）。"
                type="info"
                showIcon
              />
            ),
          },
        ]}
      />
      {renderDataDriverSection()}
      <Form.Item label="浏览器" style={{ marginBottom: 16 }}>
        <Select
          value={webBrowser}
          onChange={readOnly ? undefined : (v) => setWebBrowser(v as 'chrome' | 'edge')}
          disabled={readOnly}
          style={{ width: 200 }}
          options={[
            { label: 'Microsoft Edge（默认）', value: 'edge' },
            { label: 'Chrome', value: 'chrome' },
          ]}
        />
      </Form.Item>
      {renderStepEditor(webSteps, setWebSteps, webActions, webAddToSectionIdx, setWebAddToSectionIdx, readOnly, normalizeWebAction, webSectionActiveKeys, setWebSectionActiveKeys)}
    </div>
  );

  const renderAppConfig = () => (
    <div>
      <Collapse
        defaultActiveKey={[]}
        size="small"
        style={{ marginBottom: 16 }}
        items={[
          {
            key: 'app-desc',
            label: 'App 自动化测试说明（点击展开）',
            children: (
              <Alert
                message="App 自动化测试"
                description="配置移动端自动化测试步骤。执行引擎将使用 Appium 驱动移动设备完成操作。"
                type="info"
                showIcon
              />
            ),
          },
        ]}
      />
      {renderDataDriverSection()}
      <Form.Item label="目标平台" style={{ marginBottom: 16 }}>
        <Select
          value={appPlatform}
          onChange={readOnly ? undefined : setAppPlatform}
          disabled={readOnly}
          style={{ width: 200 }}
          options={[
            { label: '安卓 (Android)', value: 'android' },
            { label: '苹果 (iOS)', value: 'ios' },
          ]}
        />
      </Form.Item>
      {renderStepEditor(appSteps, setAppSteps, appActions, appAddToSectionIdx, setAppAddToSectionIdx, readOnly, undefined, appSectionActiveKeys, setAppSectionActiveKeys)}
    </div>
  );

  const renderMiniappConfig = () => (
    <div>
      <Collapse
        defaultActiveKey={[]}
        size="small"
        style={{ marginBottom: 16 }}
        items={[
          {
            key: 'mini-desc',
            label: '小程序自动化测试说明（点击展开）',
            children: (
              <Alert
                message="小程序自动化测试"
                description="配置微信/支付宝小程序自动化测试步骤。执行引擎将使用小程序自动化SDK完成操作。"
                type="info"
                showIcon
              />
            ),
          },
        ]}
      />
      {renderDataDriverSection()}
      {renderStepEditor(miniSteps, setMiniSteps, miniActions, miniAddToSectionIdx, setMiniAddToSectionIdx, readOnly, undefined, miniSectionActiveKeys, setMiniSectionActiveKeys)}
    </div>
  );

  const renderResultPanel = () => {
    if (!runResult) return null;
    const { status, result, logs, duration_ms } = runResult;
    const passed = status === 'passed';

    return (
      <Card
        title={
          <Space>
            {passed ? (
              <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 18 }} />
            ) : (
              <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 18 }} />
            )}
            <span>执行结果</span>
            <Tag color={passed ? 'success' : 'error'}>{execStatusLabel[status] || status}</Tag>
            <span style={{ color: '#999', fontSize: 13 }}>{duration_ms ?? 0}ms</span>
          </Space>
        }
        bordered={false}
        style={{ marginTop: 16, borderRadius: 12 }}
      >
        {result?.response && (
          <Collapse
            defaultActiveKey={[]}
            items={[
              {
                key: 'response',
                label: `响应（状态码: ${result.response.status_code}）`,
                children: (
                  <pre style={{
                    background: '#f5f5f5', padding: 16, borderRadius: 8, overflow: 'auto',
                    maxHeight: 400, fontSize: 13, fontFamily: 'monospace', wordBreak: 'break-all', whiteSpace: 'pre-wrap', margin: 0,
                  }}>
                    {typeof result.response.body === 'object'
                      ? JSON.stringify(result.response.body, null, 2)
                      : result.response.body}
                  </pre>
                ),
              },
              ...(result.assertions?.length > 0
                ? [{
                    key: 'assertions',
                    label: `断言结果 (${result.assertions.filter((a: any) => a.passed).length}/${result.assertions.length} 通过)`,
                    children: (
                      <div>
                        {result.assertions.map((a: any, i: number) => (
                          <div
                            key={i}
                            style={{
                              padding: '8px 12px',
                              marginBottom: 4,
                              borderRadius: 6,
                              background: a.passed ? '#f6ffed' : '#fff2f0',
                              border: `1px solid ${a.passed ? '#b7eb8f' : '#ffccc7'}`,
                            }}
                          >
                            {a.passed ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : <CloseCircleOutlined style={{ color: '#ff4d4f' }} />}
                            <span style={{ marginLeft: 8 }}>{a.message}</span>
                          </div>
                        ))}
                      </div>
                    ),
                  }]
                : []),
              {
                key: 'logs',
                label: '执行日志',
                children: (
                  <pre style={{
                    background: '#1e1e1e', color: '#d4d4d4', padding: 16, borderRadius: 8,
                    overflow: 'auto', maxHeight: 300, fontSize: 12, fontFamily: 'monospace', wordBreak: 'break-all', whiteSpace: 'pre-wrap', margin: 0,
                  }}>
                    {logs}
                  </pre>
                ),
              },
            ]}
          />
        )}
        {result?.error && (
          <>
            <Alert type="error" message="执行错误" description={result.error} showIcon style={{ marginBottom: 8 }} />
            {result.error.includes('暂未实现') && result.error.includes('web') && (
              <Alert
                type="warning"
                message="请重启后端后再执行"
                description="当前连接的后端可能是旧进程，未加载 Web 执行引擎。请关闭所有后端窗口后，重新运行 一键启动.bat 或执行：cd backend && python -m uvicorn app.main:app --reload --port 8001，再点击「执行」。"
                showIcon
              />
            )}
          </>
        )}
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ height: 400 }}>
        <Spin size="large" />
      </div>
    );
  }

  const projectId = caseData?.project_id ?? form.getFieldValue('project_id');
  const projectName = projects.find((p: any) => p.id === projectId)?.name ?? '项目';
  const breadcrumbItems = [
    { label: projectName, path: '/projects' },
    { label: '用例管理', path: '/cases' },
    { label: isEdit ? (caseData?.name ?? '加载中...') : '新建用例' },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Breadcrumb items={breadcrumbItems} />
      </div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => {
            const state = location.state as any;
            const expandGroupId = state?.expandGroupId ?? caseData?.group_id;
            navigate('/cases', { state: { openProjectId: caseData?.project_id ?? state?.openProjectId, expandGroupId: expandGroupId != null ? expandGroupId : 'ungrouped' } });
          }}>
            返回列表
          </Button>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {readOnly ? '查看用例' : isEdit ? '编辑用例' : '新建用例'}
          </Typography.Title>
        </Space>
        <Space>
          {isEdit && caseData && (
            <>
              <Button icon={<RobotOutlined />} onClick={() => {
                const cfg = caseData.config || {};
                const summary = `用例名称：${caseData.name}\n类型：${caseData.type}\n描述：${(caseData.description || '').slice(0, 500)}\n配置摘要：${JSON.stringify(cfg).slice(0, 300)}`;
                setAIChatContext({ source: 'case', id: caseData.id, title: caseData.name, summary });
                navigate('/ai-chat');
              }}>向 AI 提问</Button>
              <Button icon={<ShareAltOutlined />} onClick={() => setShareOpen(true)}>分享</Button>
            </>
          )}
          {!readOnly && (
            <Popconfirm title="确定保存用例吗？" okText="确定" cancelText="取消" onConfirm={() => handleSave()}>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={saving}
              >
                保存
              </Button>
            </Popconfirm>
          )}
          {isEdit && (
            <Space>
              <Select
                placeholder="执行环境（可选）"
                allowClear
                value={(() => {
                  const pid = formProjectId ?? caseData?.project_id;
                  const allowed = envs.filter((e: any) => !pid || e.project_id === pid);
                  return allowed.some((e: any) => e.id === runEnvId) ? runEnvId : undefined;
                })()}
                onChange={setRunEnvId}
                style={{ width: 180 }}
                disabled={!canRun}
                options={envs
                  .filter((e: any) => !formProjectId || e.project_id === formProjectId)
                  .map((e: any) => ({ label: e.name, value: e.id }))}
              />
              <Tooltip title={!canEdit ? '仅创建人、管理员或协作者可执行' : formStatus !== 'active' ? '状态非启用，不可执行' : undefined}>
                <span>
                  <Popconfirm title="确定执行该用例吗？" okText="确定" cancelText="取消" onConfirm={() => handleRun()}>
                    <Button
                      icon={<PlayCircleOutlined />}
                      loading={running}
                      disabled={!canRun}
                      style={canRun ? { color: '#059669', borderColor: '#059669' } : undefined}
                    >
                      执行
                    </Button>
                  </Popconfirm>
                </span>
              </Tooltip>
            </Space>
          )}
        </Space>
      </div>

      <Card className="page-card" bordered={false} style={{ marginBottom: 16 }}>
        <Form form={form} layout="vertical" initialValues={{ type: 'api', priority: 'medium', status: 'active' }} disabled={readOnly}>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="project_id" label="所属项目" rules={[{ required: true, message: '请选择项目' }]}>
                <Select placeholder="选择项目" options={projects.map((p) => ({ label: p.name, value: p.id }))} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="name" label="用例名称" rules={[{ required: true, message: '请输入用例名称' }, { max: 500, message: '用例名称最多 500 字' }]}>
                <Input placeholder="输入用例名称" maxLength={500} showCount />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} sm={12} md={6}>
              <Form.Item name="type" label="测试类型">
                <Select
                  onChange={(v) => setCaseType(v)}
                  options={[
                    { label: <Space><ApiOutlined />接口测试</Space>, value: 'api' },
                    { label: <Space><GlobalOutlined />Web测试</Space>, value: 'web' },
                    { label: <Space><MobileOutlined />App测试</Space>, value: 'app' },
                    { label: <Space><AppstoreOutlined />小程序测试</Space>, value: 'miniapp' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Form.Item name="priority" label="优先级">
                <Select
                  options={[
                    { label: <Tag color="default">低</Tag>, value: 'low' },
                    { label: <Tag color="blue">中</Tag>, value: 'medium' },
                    { label: <Tag color="orange">高</Tag>, value: 'high' },
                    { label: <Tag color="red">严重</Tag>, value: 'critical' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Form.Item name="status" label="状态">
                <Select
                  options={[
                    { label: '草稿', value: 'draft' },
                    { label: '启用', value: 'active' },
                    { label: '废弃', value: 'deprecated' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Form.Item name="description" label="描述">
                <TextArea placeholder="简要描述" rows={3} style={{ resize: 'vertical', minHeight: 80 }} />
              </Form.Item>
            </Col>
            {!readOnly && (
              <Col xs={24}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
                  <Form.Item label="协作者" extra="协作者与创建人、管理员均可编辑本用例" style={{ marginBottom: 0, flex: '1 1 auto', minWidth: 200 }}>
                    <Select
                      mode="multiple"
                      placeholder="选择可协作编辑的用户（可搜索用户名）"
                      value={collaboratorIds}
                      onChange={setCollaboratorIds}
                      options={userOptions.map((u) => ({
                        label: u.real_name ? `${u.real_name}(${u.username})` : u.username,
                        value: u.id,
                      }))}
                      style={{ width: '100%', maxWidth: 400 }}
                      allowClear
                      showSearch
                      filterOption={(input, option) =>
                        (option?.label ?? '').toString().toLowerCase().includes(input.toLowerCase())
                      }
                      optionFilterProp="label"
                    />
                  </Form.Item>
                  <Button type="primary" ghost icon={<RobotOutlined />} onClick={() => openAiGenModal(0)} style={{ flexShrink: 0 }}>
                    AI 生成步骤
                  </Button>
                </div>
              </Col>
            )}
          </Row>
        </Form>
      </Card>

      <Card
        className="page-card"
        bordered={false}
        title={
          <Space>
            {caseType === 'api' && <><ApiOutlined /> 接口配置</>}
            {caseType === 'web' && <><GlobalOutlined /> Web操作步骤</>}
            {caseType === 'app' && <><MobileOutlined /> App操作步骤</>}
            {caseType === 'miniapp' && <><AppstoreOutlined /> 小程序操作步骤</>}
          </Space>
        }
      >
        {caseType === 'api' && renderApiConfig()}
        {caseType === 'web' && renderWebConfig()}
        {caseType === 'app' && renderAppConfig()}
        {caseType === 'miniapp' && renderMiniappConfig()}
      </Card>

      {renderResultPanel()}

      <Modal
        title={<Space><RobotOutlined />AI 生成测试步骤与数据</Space>}
        open={aiGenOpen}
        onCancel={() => { setAiGenOpen(false); setGeneratedSteps([]); setGeneratedConfigSuggestion(null); setGeneratedCaseSuggestion(null); }}
        footer={null}
        width={640}
        destroyOnClose
      >
        <Form form={aiGenForm} layout="vertical" initialValues={{ ai_gen_type: 'api' }}>
          <Form.Item name="ai_gen_type" label="生成类型">
            <Select
              options={[
                { label: '接口测试', value: 'api' },
                { label: 'Web 测试', value: 'web' },
                { label: 'App 测试', value: 'app' },
                { label: '小程序测试', value: 'miniapp' },
              ]}
              style={{ width: 160 }}
            />
          </Form.Item>
          <Form.Item name="requirement" label="需求/功能描述" rules={[{ required: true, message: '请填写需求或功能说明' }]} extra="根据上方选择的类型与描述，AI 将生成对应测试步骤或 API 配置建议">
            <Input.TextArea rows={4} placeholder="例如：用户登录接口 POST /api/login，参数 username、password；或：登录页输入账号密码点击登录，校验成功跳转首页" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" loading={aiGenLoading} onClick={handleAiGenerate}>生成</Button>
            <Button style={{ marginLeft: 8 }} onClick={() => setAiGenOpen(false)}>取消</Button>
          </Form.Item>
        </Form>
        {aiGenType === 'api' && generatedConfigSuggestion && (
          <div style={{ marginTop: 16, borderTop: '1px solid #f0f0f0', paddingTop: 16 }}>
            <Typography.Text strong>API 配置建议</Typography.Text>
            <div style={{ marginTop: 8, padding: 12, background: '#fafafa', borderRadius: 8, fontSize: 13 }}>
              <div><strong>方法：</strong>{generatedConfigSuggestion.method} <strong>URL：</strong>{generatedConfigSuggestion.url || '-'}</div>
              {generatedConfigSuggestion.assertions?.length > 0 && (
                <div style={{ marginTop: 6 }}><strong>断言：</strong>{generatedConfigSuggestion.assertions.length} 条</div>
              )}
            </div>
            <Popconfirm title="确定将 AI 配置应用到当前接口配置吗？" okText="确定" cancelText="取消" onConfirm={applyGeneratedConfig}>
              <Button type="primary" size="small" style={{ marginTop: 8 }}>应用配置</Button>
            </Popconfirm>
          </div>
        )}
        {aiGenType !== 'api' && generatedCaseSuggestion && (
          <div style={{ marginTop: 16, borderTop: '1px solid #f0f0f0', paddingTop: 16 }}>
            <Typography.Text strong>用例建议（标题 / 类型 / 优先级 / 描述）</Typography.Text>
            <div style={{ marginTop: 8, padding: 12, background: '#fafafa', borderRadius: 8, fontSize: 13 }}>
              {(generatedCaseSuggestion.name != null && generatedCaseSuggestion.name !== '') && (
                <div><strong>名称：</strong>{generatedCaseSuggestion.name}</div>
              )}
              <div style={{ marginTop: 4 }}><strong>测试类型：</strong>{({ api: '接口测试', web: 'Web 测试', app: 'App 测试', miniapp: '小程序测试' })[aiGenType]}</div>
              {(generatedCaseSuggestion.description != null && generatedCaseSuggestion.description !== '') && (
                <div style={{ marginTop: 4 }}><strong>描述：</strong>{generatedCaseSuggestion.description}</div>
              )}
              {(generatedCaseSuggestion.priority != null && generatedCaseSuggestion.priority !== '') && (
                <div style={{ marginTop: 4 }}><strong>优先级：</strong>{generatedCaseSuggestion.priority}</div>
              )}
            </div>
            <Popconfirm title="确定应用到用例吗？将更新名称、测试类型、描述与优先级。" okText="确定" cancelText="取消" onConfirm={applyGeneratedCaseSuggestion}>
              <Button type="primary" size="small" style={{ marginTop: 8 }}>应用到用例</Button>
            </Popconfirm>
          </div>
        )}
        {aiGenType !== 'api' && generatedSteps.length > 0 && (
          <div style={{ marginTop: 16, borderTop: '1px solid #f0f0f0', paddingTop: 16 }}>
            <Typography.Text strong>生成步骤（{generatedSteps.length} 条）</Typography.Text>
            <div style={{ marginTop: 8, marginBottom: 8 }}>
              <Typography.Text type="secondary" style={{ marginRight: 8 }}>插入到分组：</Typography.Text>
              <Select
                value={aiGenInsertSectionIdx}
                onChange={setAiGenInsertSectionIdx}
                options={getSectionsFromSteps(aiGenType === 'web' ? webSteps : aiGenType === 'app' ? appSteps : miniSteps).map((s, i) => ({ label: s.title, value: i }))}
                style={{ width: 160 }}
                size="small"
              />
              <Popconfirm title="确定将生成的步骤插入到当前分组吗？" okText="确定" cancelText="取消" onConfirm={insertGeneratedSteps}>
                <Button type="primary" size="small" icon={<PlusCircleOutlined />} style={{ marginLeft: 8 }}>插入步骤</Button>
              </Popconfirm>
            </div>
            <div style={{ maxHeight: 280, overflow: 'auto' }}>
              {generatedSteps.map((s: any, idx: number) => (
                <div key={idx} style={{ padding: '8px 12px', marginBottom: 4, background: (s.action === '__group__' ? '#e6f4ff' : '#fafafa'), borderRadius: 6, fontSize: 12 }}>
                  {(s.action === '__group__')
                    ? <><Tag color="blue">分组</Tag><span style={{ marginLeft: 4 }}>{s.value || '未命名分组'}</span></>
                    : (
                      <>
                        <Tag color="blue">{s.action || '-'}</Tag>
                        {s.locator && <span style={{ color: '#666' }}> 定位: {s.locator}</span>}
                        {s.value != null && String(s.value) && <span style={{ color: '#666' }}> 值: {String(s.value)}</span>}
                        {s.description && <span style={{ color: '#999' }}> {s.description}</span>}
                      </>
                    )}
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>

      {isEdit && caseData && (
        <ShareToIM
          open={shareOpen}
          onCancel={() => setShareOpen(false)}
          shareType="用例"
          itemTitle={caseData.name ?? ''}
          path={`/cases/${caseData.id}`}
        />
      )}
    </div>
  );
};

export default CaseEditor;
