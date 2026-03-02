import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Input, Button, List, Typography, Spin, Empty, message, Popconfirm, Tooltip,
} from 'antd';
import {
  PlusOutlined, SendOutlined, DeleteOutlined, EditOutlined,
  RobotOutlined, UserOutlined, CheckOutlined, CloseOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined, HistoryOutlined, CopyOutlined, ShareAltOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import {
  getAIConversations, getAIConversation, sendAIMessage,
  renameAIConversation, deleteAIConversation,
} from '../api';
import { formatDateTime } from '../utils/date';
import { getAIChatContext, buildContextPrompt } from '../utils/aiChatContext';
import MarkdownContent from '../components/MarkdownContent';
import ShareToIM from '../components/ShareToIM';

const { TextArea } = Input;
const { Text, Paragraph } = Typography;

const AI_CHAT_LAST_CONV_KEY = 'ai_chat_last_conv_id';
const AI_CHAT_PENDING_NEW_KEY = 'ai_chat_pending_new';

interface Conversation {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
}

interface Message {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

const AIChat: React.FC = () => {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const standaloneParam = searchParams.get('standalone') === '1' ? '&standalone=1' : '';
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  /** 当前正在发送的会话 id，null 表示新建会话；仅在该会话下显示「AI 思考中」 */
  const [sendingConvId, setSendingConvId] = useState<number | null>(null);
  const [loadingConvs, setLoadingConvs] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<any>(null);
  const activeConvIdRef = useRef<number | null>(null);
  const sendingConvIdRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    activeConvIdRef.current = activeConvId;
  }, [activeConvId]);

  // 离开页面后请求继续在后台执行；仅在仍挂载时更新 UI，避免对已卸载组件 setState
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const scrollToBottom = useCallback((instant = false) => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: instant ? 'auto' : 'smooth' });
    }, instant ? 0 : 100);
  }, []);

  const fetchConversations = useCallback(async () => {
    setLoadingConvs(true);
    try {
      const r = await getAIConversations();
      setConversations(r.data || []);
    } catch { /* ignore */ }
    setLoadingConvs(false);
  }, []);

  const fetchMessages = useCallback(async (convId: number) => {
    setLoadingMsgs(true);
    try {
      const r = await getAIConversation(convId);
      setMessages(r.data?.messages || []);
      scrollToBottom(true);
    } catch {
      message.error('加载消息失败');
    }
    setLoadingMsgs(false);
  }, [scrollToBottom]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // 设置网页标题（新标签页等场景），离开时恢复
  const defaultDocumentTitle = 'TestPilot - 可视化测试平台';
  useEffect(() => {
    const prev = document.title;
    document.title = 'AI 答疑 - TestPilot';
    return () => { document.title = prev || defaultDocumentTitle; };
  }, []);

  useEffect(() => {
    localStorage.removeItem('ai_chat_unread');
  }, []);

  useEffect(() => {
    const ctx = getAIChatContext();
    if (ctx) {
      const prompt = buildContextPrompt(ctx);
      setInputValue(prompt);
      setActiveConvId(null);
      setMessages([]);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, []);

  const idFromUrl = searchParams.get('id');
  useEffect(() => {
    if (!idFromUrl || conversations.length === 0) return;
    const n = parseInt(idFromUrl, 10);
    if (!Number.isNaN(n) && conversations.some(c => c.id === n)) {
      setActiveConvId(n);
      fetchMessages(n);
    }
  }, [idFromUrl, conversations]);

  // URL 无 id 时恢复上次查看的会话，或“发送中离开”时自动打开最新会话，避免图二缺陷
  const restoredRef = useRef(false);
  useEffect(() => {
    if (idFromUrl || conversations.length === 0 || restoredRef.current) return;
    try {
      const pendingNew = sessionStorage.getItem(AI_CHAT_PENDING_NEW_KEY) === '1';
      if (pendingNew) {
        sessionStorage.removeItem(AI_CHAT_PENDING_NEW_KEY);
        const latest = conversations.slice().sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0];
        if (latest) {
          restoredRef.current = true;
          setActiveConvId(latest.id);
          fetchMessages(latest.id);
          navigate(`/ai-chat?id=${latest.id}${standaloneParam}`, { replace: true });
          return;
        }
      }
      const last = sessionStorage.getItem(AI_CHAT_LAST_CONV_KEY);
      if (!last) return;
      const n = parseInt(last, 10);
      if (Number.isNaN(n) || !conversations.some(c => c.id === n)) return;
      restoredRef.current = true;
      setActiveConvId(n);
      fetchMessages(n);
      navigate(`/ai-chat?id=${n}${standaloneParam}`, { replace: true });
    } catch { /* ignore */ }
  }, [idFromUrl, conversations, fetchMessages, navigate]);

  useEffect(() => {
    try {
      if (activeConvId != null) sessionStorage.setItem(AI_CHAT_LAST_CONV_KEY, String(activeConvId));
      else sessionStorage.removeItem(AI_CHAT_LAST_CONV_KEY);
    } catch { /* ignore */ }
  }, [activeConvId]);

  const handleSelectConv = (conv: Conversation) => {
    setActiveConvId(conv.id);
    fetchMessages(conv.id);
    navigate(`/ai-chat?id=${conv.id}${standaloneParam}`, { replace: true });
  };

  const handleNewConv = () => {
    setActiveConvId(null);
    setMessages([]);
    setInputValue('');
    navigate(`/ai-chat${standaloneParam ? '?' + standaloneParam.slice(1) : ''}`, { replace: true });
    inputRef.current?.focus();
  };

  const handleSend = async () => {
    const content = inputValue.trim();
    if (!content || sending) return;
    const convIdForSend = activeConvId;
    if (convIdForSend === null) {
      try { sessionStorage.setItem(AI_CHAT_PENDING_NEW_KEY, '1'); } catch { /* ignore */ }
    }
    setSendingConvId(convIdForSend);
    sendingConvIdRef.current = convIdForSend;
    setSending(true);
    setInputValue('');

    const tempUserMsg: Message = {
      id: Date.now(),
      role: 'user',
      content,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUserMsg]);
    scrollToBottom();

    try {
      const r = await sendAIMessage({ conversation_id: activeConvId || undefined, content });
      const data = r.data;
      const stillOnSameConv = activeConvIdRef.current === sendingConvIdRef.current;
      const isNewConv = convIdForSend === null && data.conversation_id;

      if (!isMountedRef.current) {
        // 用户已离开页面，请求在后台完成：仅持久化新会话 id，便于返回时恢复
        if (isNewConv) {
          try {
            sessionStorage.removeItem(AI_CHAT_PENDING_NEW_KEY);
            sessionStorage.setItem(AI_CHAT_LAST_CONV_KEY, String(data.conversation_id));
          } catch { /* ignore */ }
        }
        return;
      }

      try { sessionStorage.removeItem(AI_CHAT_PENDING_NEW_KEY); } catch { /* ignore */ }
      if (isNewConv) {
        setActiveConvId(data.conversation_id);
        fetchConversations();
        navigate(`/ai-chat?id=${data.conversation_id}${standaloneParam}`, { replace: true });
      }
      if (isNewConv || stillOnSameConv) {
        setMessages(prev => {
          const filtered = prev.filter(m => m.id !== tempUserMsg.id);
          return [...filtered, data.user_message, data.ai_message];
        });
        scrollToBottom();
        if (!isMountedRef.current) {
          localStorage.setItem('ai_chat_unread', '1');
          window.dispatchEvent(new CustomEvent('ai-chat-new-reply'));
        } else {
          localStorage.removeItem('ai_chat_unread');
          window.dispatchEvent(new CustomEvent('ai-chat-clear-unread'));
        }
      }
    } catch (e: any) {
      try { sessionStorage.removeItem(AI_CHAT_PENDING_NEW_KEY); } catch { /* ignore */ }
      if (!isMountedRef.current) return;
      message.error(e.response?.data?.detail || '发送失败');
      if (activeConvIdRef.current === sendingConvIdRef.current) {
        setMessages(prev => prev.filter(m => m.id !== tempUserMsg.id));
        setInputValue(content);
      }
    } finally {
      if (isMountedRef.current) {
        setSending(false);
        setSendingConvId(null);
        sendingConvIdRef.current = null;
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    }
  };

  const handleRename = async (convId: number) => {
    const title = editTitle.trim();
    if (!title) return;
    try {
      await renameAIConversation(convId, title);
      setConversations(prev => prev.map(c => c.id === convId ? { ...c, title } : c));
    } catch {
      message.error('重命名失败');
    }
    setEditingId(null);
  };

  const handleDelete = async (convId: number) => {
    try {
      await deleteAIConversation(convId);
      setConversations(prev => prev.filter(c => c.id !== convId));
      if (activeConvId === convId) {
        setActiveConvId(null);
        setMessages([]);
        navigate(`/ai-chat${standaloneParam ? '?' + standaloneParam.slice(1) : ''}`, { replace: true });
      }
    } catch {
      message.error('删除失败');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const exportConversation = () => {
    if (messages.length === 0) {
      message.warning('暂无对话内容可导出');
      return;
    }
    const title = activeConvId ? (conversations.find(c => c.id === activeConvId)?.title || 'AI 对话') : 'AI 对话';
    const lines = [
      `# ${title}`,
      '',
      `导出时间: ${formatDateTime(new Date().toISOString(), 'YYYY-MM-DD HH:mm:ss')}`,
      '',
      '---',
      '',
      ...messages.flatMap(m => [
        `## ${m.role === 'user' ? '我' : 'AI'}`,
        '',
        m.content,
        '',
        `*${formatDateTime(m.created_at, 'YYYY-MM-DD HH:mm')}*`,
        '',
      ]),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[/\\?%*:|"<>]/g, '_')}_${formatDateTime(new Date().toISOString(), 'YYYYMMDD_HHmm')}.md`;
    a.click();
    URL.revokeObjectURL(url);
    message.success('对话已导出为 Markdown');
  };

  return (
    <div style={{
      display: 'flex', flex: 1, minHeight: 0, gap: 0,
      background: 'var(--md-sys-color-surface-bright)', borderRadius: 12,
      boxShadow: 'var(--md-elevation-2)', overflow: 'hidden',
      border: '1px solid var(--md-sys-color-outline-variant)',
    }}>
      {/* Sidebar */}
      <div style={{
        width: sidebarOpen ? 280 : 0, minWidth: sidebarOpen ? 280 : 0,
        transition: 'all 0.25s ease', overflow: 'hidden',
        borderRight: sidebarOpen ? '1px solid var(--md-sys-color-outline-variant)' : 'none',
        display: 'flex', flexDirection: 'column', background: 'var(--md-sys-color-surface-container)',
      }}>
        <div style={{
          padding: '16px', display: 'flex', gap: 8, alignItems: 'center',
          borderBottom: '1px solid var(--md-sys-color-outline-variant)',
        }}>
          <Button type="primary" icon={<PlusOutlined />} block onClick={handleNewConv}>
            新对话
          </Button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '8px' }}>
          {loadingConvs ? (
            <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
          ) : conversations.length === 0 ? (
            <Empty description="暂无对话" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <List
              dataSource={conversations}
              renderItem={conv => (
                <div
                  key={conv.id}
                  onClick={() => handleSelectConv(conv)}
                  style={{
                    padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                    marginBottom: 4, transition: 'background 0.15s',
                    background: activeConvId === conv.id ? 'rgba(25,118,210,0.08)' : 'transparent',
                  }}
                  onMouseEnter={e => {
                    if (activeConvId !== conv.id)
                      (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.04)';
                  }}
                  onMouseLeave={e => {
                    if (activeConvId !== conv.id)
                      (e.currentTarget as HTMLElement).style.background = 'transparent';
                  }}
                >
                  {editingId === conv.id ? (
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <Input
                        size="small"
                        value={editTitle}
                        onChange={e => setEditTitle(e.target.value)}
                        onPressEnter={() => handleRename(conv.id)}
                        autoFocus
                        style={{ flex: 1 }}
                      />
                      <Button size="small" type="text" icon={<CheckOutlined />} onClick={() => handleRename(conv.id)} />
                      <Button size="small" type="text" icon={<CloseOutlined />} onClick={() => setEditingId(null)} />
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontWeight: activeConvId === conv.id ? 600 : 400,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          fontSize: 13, color: 'rgba(0,0,0,0.87)',
                        }}>
                          {conv.title}
                        </div>
                        <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)', marginTop: 2 }}>
                          {formatDateTime(conv.updated_at, 'MM-DD HH:mm')}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 2, flexShrink: 0, marginLeft: 4 }}
                        onClick={e => e.stopPropagation()}>
                        <Tooltip title="重命名">
                          <Button
                            type="text" size="small" icon={<EditOutlined />}
                            onClick={() => { setEditingId(conv.id); setEditTitle(conv.title); }}
                            style={{ color: 'rgba(0,0,0,0.45)' }}
                          />
                        </Tooltip>
                        <Popconfirm title="确认删除此对话？" onConfirm={() => handleDelete(conv.id)} okText="删除" cancelText="取消">
                          <Tooltip title="删除">
                            <Button type="text" size="small" icon={<DeleteOutlined />} style={{ color: 'rgba(0,0,0,0.45)' }} />
                          </Tooltip>
                        </Popconfirm>
                      </div>
                    </div>
                  )}
                </div>
              )}
            />
          )}
        </div>
      </div>

      {/* Main chat area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Header */}
        <div style={{
          padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid var(--md-sys-color-outline-variant)',
          background: 'var(--md-sys-color-surface-bright)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button
              type="text"
              icon={sidebarOpen ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />}
              onClick={() => setSidebarOpen(!sidebarOpen)}
            />
            <RobotOutlined style={{ fontSize: 18, color: 'var(--md-sys-color-primary)' }} />
            <span style={{ fontWeight: 600, fontSize: 15 }}>
              {activeConvId ? conversations.find(c => c.id === activeConvId)?.title || 'AI 答疑' : 'AI 答疑助手'}
            </span>
          </div>
          {(activeConvId || messages.length > 0) && (
            <>
              <Tooltip title="导出对话">
                <Button type="text" icon={<DownloadOutlined />} onClick={exportConversation} />
              </Tooltip>
              <Tooltip title="分享对话">
                <Button type="text" icon={<ShareAltOutlined />} onClick={() => setShareOpen(true)} />
              </Tooltip>
            </>
          )}
        </div>

        {/* Messages area */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>
          {loadingMsgs ? (
            <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>
          ) : messages.length === 0 ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', height: '100%', color: 'rgba(0,0,0,0.45)', padding: 24,
            }}>
              <RobotOutlined style={{ fontSize: 56, marginBottom: 16, color: 'var(--md-sys-color-primary)', opacity: 0.35 }} />
              <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 8, color: 'rgba(0,0,0,0.75)' }}>
                TestPilot AI 答疑助手
              </div>
              <div style={{ fontSize: 13, textAlign: 'center', maxWidth: 420, lineHeight: 1.7, color: 'rgba(0,0,0,0.55)', marginBottom: 20 }}>
                我是你的测试专家助手，可解答自动化测试、接口测试、测试设计、缺陷分析等问题。
                <br />
                <Text type="secondary" style={{ fontSize: 12 }}>输入问题或点击下方推荐问题开始</Text>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 560 }}>
                {[
                  '如何编写接口断言',
                  '失败原因分析',
                  '如何设计测试用例',
                  '如何设计接口测试用例？',
                  '如何分析测试报告中的失败原因？',
                  '自动化测试最佳实践有哪些？',
                  '如何编写有效的缺陷描述？',
                ].map(q => (
                  <div
                    key={q}
                    onClick={() => { setInputValue(q); inputRef.current?.focus(); }}
                    style={{
                      padding: '10px 16px', borderRadius: 20, background: 'var(--md-sys-color-surface-container-high)',
                      fontSize: 13, color: 'rgba(0,0,0,0.75)', cursor: 'pointer',
                      border: '1px solid var(--md-sys-color-outline-variant)',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = 'var(--md-sys-color-surface-container)';
                      e.currentTarget.style.borderColor = 'var(--md-sys-color-primary)';
                      e.currentTarget.style.color = 'var(--md-sys-color-primary)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'var(--md-sys-color-surface-container-high)';
                      e.currentTarget.style.borderColor = 'var(--md-sys-color-outline-variant)';
                      e.currentTarget.style.color = 'rgba(0,0,0,0.75)';
                    }}
                  >
                    {q}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            messages.map(msg => (
              <div key={msg.id} style={{
                display: 'flex', gap: 12, marginBottom: 20,
                flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: msg.role === 'user' ? 'var(--md-sys-color-primary)' : '#f0f0f0',
                  color: msg.role === 'user' ? '#fff' : 'var(--md-sys-color-primary)',
                  fontSize: 16,
                }}>
                  {msg.role === 'user' ? <UserOutlined /> : <RobotOutlined />}
                </div>
                <div style={{
                  maxWidth: '75%', padding: '10px 16px', borderRadius: 12,
                  background: msg.role === 'user' ? 'var(--md-sys-color-primary)' : '#f5f5f5',
                  color: msg.role === 'user' ? '#fff' : 'rgba(0,0,0,0.87)',
                  fontSize: 14, lineHeight: 1.7, wordBreak: 'break-word',
                  boxShadow: 'var(--md-elevation-1)',
                }}>
                  {msg.role === 'assistant' ? <MarkdownContent content={msg.content} /> : <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>}
                  <div style={{
                    fontSize: 11, marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8,
                    opacity: 0.6,
                  }}>
                    {msg.role === 'assistant' && (
                      <Tooltip title="一键复制">
                        <Button
                          type="text"
                          size="small"
                          icon={<CopyOutlined />}
                          style={{ fontSize: 12, padding: '0 4px', color: 'inherit' }}
                          onClick={() => {
                            navigator.clipboard.writeText(msg.content).then(() => message.success('已复制到剪贴板')).catch(() => message.error('复制失败'));
                          }}
                        />
                      </Tooltip>
                    )}
                    <span style={{ display: 'inline-flex', alignItems: 'center' }}>{formatDateTime(msg.created_at, 'HH:mm')}</span>
                  </div>
                </div>
              </div>
            ))
          )}
          {sending && (sendingConvId === activeConvId || (sendingConvId === null && activeConvId === null)) && (
            <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: '#f0f0f0', color: 'var(--md-sys-color-primary)', fontSize: 16,
              }}>
                <RobotOutlined />
              </div>
              <div style={{
                padding: '14px 20px', borderRadius: 12, background: '#f5f5f5',
              }}>
                <Spin size="small" />
                <span style={{ marginLeft: 8, color: 'rgba(0,0,0,0.45)' }}>AI 思考中...</span>
              </div>
            </div>
          )}
          {!sending && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
            <div style={{
              display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>上一轮回复未完成，请重新发送</span>
              <Button
                type="primary"
                size="small"
                onClick={() => {
                  const last = messages[messages.length - 1];
                  if (last?.role === 'user') {
                    setInputValue(last.content);
                    setTimeout(() => inputRef.current?.focus(), 0);
                  }
                }}
              >
                重新发送
              </Button>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div style={{
          padding: '12px 24px 16px', borderTop: '1px solid var(--md-sys-color-outline-variant)',
          background: 'var(--md-sys-color-surface-bright)',
        }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {['如何编写接口断言', '失败原因分析', '如何设计测试用例'].map(q => (
              <span
                key={q}
                onClick={() => { setInputValue(q); inputRef.current?.focus(); }}
                style={{
                  padding: '4px 10px', borderRadius: 16, background: 'var(--md-sys-color-surface-container-high)',
                  fontSize: 12, color: 'rgba(0,0,0,0.7)', cursor: 'pointer',
                  border: '1px solid var(--md-sys-color-outline-variant)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--md-sys-color-surface-container)';
                  e.currentTarget.style.borderColor = 'var(--md-sys-color-primary)';
                  e.currentTarget.style.color = 'var(--md-sys-color-primary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--md-sys-color-surface-container-high)';
                  e.currentTarget.style.borderColor = 'var(--md-sys-color-outline-variant)';
                  e.currentTarget.style.color = 'rgba(0,0,0,0.7)';
                }}
              >
                {q}
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <TextArea
              ref={inputRef}
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入你的问题 (Shift+Enter 换行)"
              autoSize={{ minRows: 1, maxRows: 6 }}
              disabled={sending}
              style={{ borderRadius: 8, resize: 'none', fontSize: 14 }}
            />
            <Button
              type="primary"
              size="small"
              icon={<SendOutlined />}
              onClick={handleSend}
              loading={sending}
              disabled={!inputValue.trim()}
              style={{ borderRadius: 8, height: 32, minWidth: 32 }}
            />
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: 'rgba(0,0,0,0.35)', textAlign: 'center' }}>
            Enter 发送 · Shift+Enter 换行 · AI 回复仅供参考
          </div>
        </div>
      </div>

      <ShareToIM
        open={shareOpen}
        onCancel={() => setShareOpen(false)}
        shareType="AI答疑"
        itemTitle={activeConvId ? (conversations.find(c => c.id === activeConvId)?.title || 'AI 对话') : 'AI 答疑对话'}
        path={activeConvId ? `/ai-chat?id=${activeConvId}` : '/ai-chat'}
        content={messages.length > 0 ? `【AI答疑分享】${(conversations.find(c => c.id === activeConvId)?.title || 'AI 对话')}\n\n${messages.slice(-6).map(m => `${m.role === 'user' ? '我' : 'AI'}: ${m.content.slice(0, 200)}${m.content.length > 200 ? '...' : ''}`).join('\n\n')}\n\n点击查看：${window.location.origin}${activeConvId ? `/ai-chat?id=${activeConvId}` : '/ai-chat'}` : undefined}
      />
    </div>
  );
};

export default AIChat;
