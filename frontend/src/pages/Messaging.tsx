import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Input, Button, List, Typography, Spin, Empty, message, Modal, Form,
  Select, Badge, Tooltip, Avatar, Tag, Popconfirm, Checkbox,
} from 'antd';
import {
  SendOutlined, PlusOutlined, TeamOutlined, UserOutlined,
  RobotOutlined, SearchOutlined, UsergroupAddOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined, SmileOutlined, PictureOutlined,
  ShareAltOutlined, CheckSquareOutlined, BorderOutlined, MessageOutlined,
} from '@ant-design/icons';
import {
  getChatRooms, startPrivateChat, createChatGroup, sendChatMessage,
  getChatMessages, searchChatMessages, searchChatUsers, getChatRoomMembers, addChatMembers,
  markChatRoomRead, uploadFile, getUserProfile,
} from '../api';
import { useNavigate } from 'react-router-dom';
import ShareToIM from '../components/ShareToIM';
import { getStoredToken } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { formatDateTime } from '../utils/date';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);

/** 微信风格时间块显示：今天 HH:mm，昨天 HH:mm，今年 M月D日 HH:mm，更早 YYYY年M月D日 */
function formatTimeBlock(t: string): string {
  if (!t) return '';
  const s = String(t).trim();
  const hasTz = /Z$|[\+\-]\d{2}:?\d{2}$/.test(s);
  const d = hasTz ? dayjs(s).local() : dayjs.utc(s).local();
  if (!d.isValid()) return '';
  const now = dayjs();
  if (d.isSame(now, 'day')) return d.format('HH:mm');
  if (d.isSame(now.subtract(1, 'day'), 'day')) return `昨天 ${d.format('HH:mm')}`;
  if (d.isSame(now, 'year')) return d.format('M月D日 HH:mm');
  return d.format('YYYY年M月D日 HH:mm');
}

const { TextArea } = Input;
const { Text } = Typography;

interface Room {
  id: number;
  name: string;
  type: 'private' | 'group' | 'bot';
  owner_id: number | null;
  member_ids: number[];
  member_count: number;
  unread_count: number;
  last_message: { content: string; msg_type?: string; created_at: string; sender_id: number } | null;
  created_at: string;
  updated_at: string;
}

interface ChatMsg {
  id: number;
  room_id: number;
  sender_id: number;
  sender_name: string;
  content: string;
  msg_type: string;
  created_at: string;
  read_status?: { read?: boolean; read_count?: number; total_recipients?: number };
  reply_to_id?: number;
  reply_to?: { id: number; sender_name: string; content: string; msg_type: string };
}

interface ChatUser {
  id: number;
  username: string;
  real_name: string;
}

const SYSTEM_BOT_ID = -1;

/** 头像显示字符：中文取姓氏首字，英文取姓（最后一个单词）首字母 */
function getSurnameChar(name: string | undefined): string {
  const n = (name || '').trim();
  if (!n) return '?';
  if (/[\u4e00-\u9fff]/.test(n)) return n[0];
  const parts = n.split(/\s+/).filter(Boolean);
  return parts.length > 1 ? (parts[parts.length - 1][0] || n[0]).toUpperCase() : n[0].toUpperCase();
}

/** 将消息内容中的 URL 和 @提及 渲染 */
function renderMessageContent(text: string, isMe: boolean) {
  const combinedRegex = /(@\[[^\]]+\]\(\d+\)|https?:\/\/[^\s]+)/g;
  const parts = text.split(combinedRegex).filter(Boolean);
  return parts.map((part, i) => {
    const mentionMatch = part.match(/^@\[([^\]]+)\]\((\d+)\)$/);
    if (mentionMatch) {
      return (
        <Tag key={i} style={{ margin: '0 2px', fontSize: 12, lineHeight: 1.4 }}>
          @{mentionMatch[1]}
        </Tag>
      );
    }
    if (part.match(/^https?:\/\/[^\s]+$/)) {
      return (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer"
          style={{ color: isMe ? 'rgba(255,255,255,0.9)' : 'var(--md-sys-color-primary)', textDecoration: 'underline', wordBreak: 'break-all' }}>
          {part}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

/** 高亮搜索关键词（微信风格绿色，支持多处匹配） */
function highlightKeyword(text: string, keyword: string): React.ReactNode {
  if (!text || !keyword) return text;
  const kw = keyword.trim();
  if (!kw) return text;
  const lower = text.toLowerCase();
  const kwLower = kw.toLowerCase();
  const parts: React.ReactNode[] = [];
  let last = 0;
  let pos = 0;
  while ((pos = lower.indexOf(kwLower, last)) >= 0) {
    parts.push(text.slice(last, pos));
    parts.push(<span key={pos} style={{ color: '#07c160', fontWeight: 500 }}>{text.slice(pos, pos + kw.length)}</span>);
    last = pos + kw.length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}

/** 将图片 URL 转为可访问的完整地址 */
function toImageUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`;
}

const CARD_TYPE_LABELS: Record<string, { color: string; label: string }> = {
  defect: { color: '#f5222d', label: '缺陷通知' },
  execution: { color: '#1890ff', label: '执行通知' },
  report: { color: '#722ed1', label: '报告通知' },
  case: { color: '#52c41a', label: '用例通知' },
  system: { color: '#faad14', label: '系统通知' },
};

function parseCardContent(raw: string): { title: string; content: string; link: string; type: string } | null {
  try {
    const d = JSON.parse(raw);
    if (d && typeof d.title === 'string') return d;
  } catch { /* fallback for old plain-text system messages */ }
  return null;
}

const Messaging: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchKeyword, setSearchKeyword] = useState('');

  const [newPrivateOpen, setNewPrivateOpen] = useState(false);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [userList, setUserList] = useState<ChatUser[]>([]);
  const [userSearching, setUserSearching] = useState(false);
  const [groupForm] = Form.useForm();

  const [memberListOpen, setMemberListOpen] = useState(false);
  const [roomMembers, setRoomMembers] = useState<ChatUser[]>([]);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [searchMsgOpen, setSearchMsgOpen] = useState(false);
  const [searchMsgKeyword, setSearchMsgKeyword] = useState('');
  const [searchMsgResults, setSearchMsgResults] = useState<any[]>([]);
  const [searchMsgLoading, setSearchMsgLoading] = useState(false);
  const [searchMsgTotal, setSearchMsgTotal] = useState(0);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareContent, setShareContent] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedMsgIds, setSelectedMsgIds] = useState<Set<number>>(new Set());
  const [mentionOpen, setMentionOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileUser, setProfileUser] = useState<(ChatUser & { email?: string; phone?: string }) | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [mentionMembers, setMentionMembers] = useState<ChatUser[]>([]);
  const [replyingTo, setReplyingTo] = useState<ChatMsg | null>(null);
  const [highlightMsgId, setHighlightMsgId] = useState<number | null>(null);
  const [unifiedSearchLoading, setUnifiedSearchLoading] = useState(false);
  const [unifiedSearchRooms, setUnifiedSearchRooms] = useState<{ room_id: number; room_name: string; count: number }[]>([]);
  const [unifiedSearchMessages, setUnifiedSearchMessages] = useState<any[]>([]);
  const [unifiedSearchTotal, setUnifiedSearchTotal] = useState(0);
  const unifiedSearchAbortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<any>(null);
  const searchRoomInputRef = useRef<any>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const roomListRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const activeRoomRef = useRef<number | null>(null);

  const scrollToBottom = useCallback((instant = false) => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: instant ? 'auto' : 'smooth' });
    }, instant ? 0 : 100);
  }, []);

  const fetchRooms = useCallback(async () => {
    setLoadingRooms(true);
    try {
      const r = await getChatRooms();
      setRooms(r.data || []);
    } catch { /* ignore */ }
    setLoadingRooms(false);
  }, []);

  const fetchMessages = useCallback(async (roomId: number, aroundMessageId?: number) => {
    setLoadingMsgs(true);
    try {
      const params: { page?: number; page_size?: number; around_message_id?: number } = aroundMessageId
        ? { around_message_id: aroundMessageId, page_size: 100 }
        : { page: 1, page_size: 200 };
      const r = await getChatMessages(roomId, params);
      const msgs = (r.data as { messages?: any[] })?.messages || [];
      setMessages(msgs);
      if (!aroundMessageId) scrollToBottom(true);
    } catch {
      message.error('加载消息失败');
    }
    setLoadingMsgs(false);
  }, [scrollToBottom]);

  useEffect(() => {
    activeRoomRef.current = activeRoomId;
  }, [activeRoomId]);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  // 微信风格：输入即搜，展示群聊+聊天记录
  useEffect(() => {
    const kw = (searchKeyword || '').trim();
    if (!kw) {
      setUnifiedSearchRooms([]);
      setUnifiedSearchMessages([]);
      setUnifiedSearchTotal(0);
      return;
    }
    if (unifiedSearchAbortRef.current) unifiedSearchAbortRef.current.abort();
    const ctrl = new AbortController();
    unifiedSearchAbortRef.current = ctrl;
    setUnifiedSearchLoading(true);
    searchChatMessages({ keyword: kw, page: 1, page_size: 50 }, ctrl.signal)
      .then((r: any) => {
        const d = r.data || {};
        setUnifiedSearchRooms(d.rooms_summary || []);
        setUnifiedSearchMessages(d.messages || []);
        setUnifiedSearchTotal(d.total || 0);
      })
      .catch((e: any) => {
        if (e?.name !== 'AbortError' && e?.code !== 'ERR_CANCELED') message.error('搜索失败');
      })
      .finally(() => {
        if (unifiedSearchAbortRef.current === ctrl) setUnifiedSearchLoading(false);
        if (unifiedSearchAbortRef.current === ctrl) unifiedSearchAbortRef.current = null;
      });
    return () => ctrl.abort();
  }, [searchKeyword]);

  // 搜索时滚动到顶部
  useEffect(() => {
    if ((searchKeyword || '').trim() && roomListRef.current) {
      roomListRef.current.scrollTop = 0;
    }
  }, [searchKeyword]);

  // 点击搜索结果后滚动并定位到该消息
  useEffect(() => {
    if (!highlightMsgId || !messages.length) return;
    const el = document.querySelector(`[data-msg-id="${highlightMsgId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const t = setTimeout(() => setHighlightMsgId(null), 2500);
      return () => clearTimeout(t);
    }
  }, [highlightMsgId, messages]);

  // 进入群聊时加载成员，用于 @ 提及
  useEffect(() => {
    if (!activeRoomId) return;
    const room = rooms.find(r => r.id === activeRoomId);
    if (room?.type === 'group') {
      getChatRoomMembers(activeRoomId).then(r => setMentionMembers(r.data || [])).catch(() => {});
    } else {
      setMentionMembers([]);
    }
  }, [activeRoomId, rooms]);

  // WebSocket for real-time
  useEffect(() => {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = getStoredToken();
    if (!token) return;
    const wsUrl = `${proto}//${window.location.host}/ws/chat?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'chat_message' && data.message) {
          const msg = data.message as ChatMsg;
          const isActiveRoom = activeRoomRef.current === msg.room_id;
          if (isActiveRoom) {
            setMessages(prev => {
              if (prev.some(m => m.id === msg.id)) return prev;
              return [...prev, { ...msg, read_status: msg.read_status || { read: false } }];
            });
            scrollToBottom();
            markChatRoomRead(msg.room_id).catch(() => {});
          }
          setRooms(prev => prev.map(r => {
            if (r.id !== msg.room_id) return r;
            const lastContent = (msg as ChatMsg).msg_type === 'image' ? '[图片]' : (msg as ChatMsg).msg_type === 'card' ? '[通知卡片]' : msg.content;
            return {
              ...r,
              last_message: { content: lastContent, msg_type: (msg as ChatMsg).msg_type, created_at: msg.created_at, sender_id: msg.sender_id },
              updated_at: msg.created_at,
              unread_count: isActiveRoom ? 0 : r.unread_count + 1,
            };
          }));
        } else if (data.type === 'read_receipt' && data.room_id === activeRoomRef.current) {
          const { user_id: readerId, last_read_message_id } = data;
          if (readerId === user?.id) return;
          setMessages(prev => prev.map(m => {
            if (m.sender_id !== user?.id || m.id > last_read_message_id) return m;
            const rs = m.read_status;
            if (rs?.read) return m;
            if (rs?.total_recipients != null) {
              const newCount = Math.min((rs.read_count || 0) + 1, rs.total_recipients);
              return { ...m, read_status: { read_count: newCount, total_recipients: rs.total_recipients } };
            }
            return { ...m, read_status: { read: true } };
          }));
        }
      } catch { /* ignore */ }
    };

    ws.onclose = () => { wsRef.current = null; };

    return () => { ws.close(); wsRef.current = null; };
  }, [scrollToBottom]);

  const handleSelectRoom = (room: Room) => {
    setActiveRoomId(room.id);
    fetchMessages(room.id);
    if (room.unread_count > 0) {
      markChatRoomRead(room.id).catch(() => {});
      setRooms(prev => prev.map(r => r.id === room.id ? { ...r, unread_count: 0 } : r));
    }
  };

  const handleSend = async () => {
    const content = inputValue.trim();
    if (!content || sending || !activeRoomId) return;
    const replyToId = replyingTo?.id;
    setInputValue('');
    setReplyingTo(null);
    const tempId = -Date.now();
    const senderName = user?.real_name || user?.username || '我';
    const tempMsg: ChatMsg = {
      id: tempId,
      room_id: activeRoomId,
      sender_id: user?.id ?? 0,
      sender_name: senderName,
      content,
      msg_type: 'text',
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempMsg]);
    scrollToBottom();
    setSending(true);
    try {
      const r = await sendChatMessage({ room_id: activeRoomId, content, reply_to_id: replyToId });
      const msg = r.data as ChatMsg;
      setMessages(prev => prev.map(m => m.id === tempId ? msg : m));
      scrollToBottom();
      setRooms(prev => prev.map(rm => rm.id === activeRoomId ? {
        ...rm,
        last_message: { content: msg.content, msg_type: msg.msg_type, created_at: msg.created_at, sender_id: msg.sender_id },
        updated_at: msg.created_at,
      } : rm));
    } catch (e: any) {
      message.error(e.response?.data?.detail || '发送失败');
      setInputValue(content);
      setMessages(prev => prev.filter(m => m.id !== tempId));
    }
    setSending(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setMentionOpen(false);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setInputValue(v);
    const match = v.match(/@(?!\[)([^\s]*)$/);
    if (match && activeRoom?.type === 'group') {
      setMentionOpen(true);
    } else {
      setMentionOpen(false);
    }
  };

  const getMentionFilter = () => {
    const match = inputValue.match(/@(?!\[)([^\s]*)$/);
    return match ? match[1].toLowerCase() : '';
  };

  const MENTION_ALL_ITEM: ChatUser = { id: 0, username: 'all', real_name: '所有人' };
  const filteredMentionMembers = (() => {
    const filter = getMentionFilter();
    const members = mentionMembers.filter(m => {
      if (m.id === user?.id || m.id === SYSTEM_BOT_ID) return false;
      if (!filter) return true;
      const name = (m.real_name || m.username || '').toLowerCase();
      const uname = (m.username || '').toLowerCase();
      return name.includes(filter) || uname.includes(filter);
    });
    const allMatch = !filter || '所有人'.includes(filter) || 'all'.includes(filter);
    return allMatch ? [MENTION_ALL_ITEM, ...members] : members;
  })();

  const handleMentionSelect = (m: ChatUser) => {
    const name = m.real_name || m.username;
    setInputValue(prev => prev.replace(/@(?!\[)([^\s]*)$/, `@[${name}](${m.id}) `));
    setMentionOpen(false);
    inputRef.current?.focus();
  };

  const sendImage = async (url: string) => {
    if (!activeRoomId || sending || !activeRoom || activeRoom.type === 'bot') return;
    setSending(true);
    try {
      const r = await sendChatMessage({ room_id: activeRoomId, content: url, msg_type: 'image' });
      const msg = r.data as ChatMsg;
      setMessages(prev => (prev.some(m => m.id === msg.id) ? prev : [...prev, msg]));
      scrollToBottom();
      setRooms(prev => prev.map(rm => rm.id === activeRoomId ? {
        ...rm,
        last_message: { content: '[图片]', msg_type: 'image', created_at: msg.created_at, sender_id: msg.sender_id },
        updated_at: msg.created_at,
      } : rm));
    } catch (e: any) {
      message.error(e.response?.data?.detail || '发送失败');
    }
    setSending(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleImageUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      message.error('请选择图片文件');
      return;
    }
    setUploadingImg(true);
    try {
      const r = await uploadFile(file);
      const url = (r.data as { url?: string })?.url;
      if (url) await sendImage(url);
    } catch (e: any) {
      message.error(e.response?.data?.detail || '上传失败');
    }
    setUploadingImg(false);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (file) handleImageUpload(file);
        return;
      }
    }
  };

  // Search users
  const handleSearchUsers = async (keyword: string) => {
    setUserSearching(true);
    try {
      const r = await searchChatUsers(keyword);
      setUserList(r.data || []);
    } catch { /* ignore */ }
    setUserSearching(false);
  };

  const handleStartPrivate = async (targetUserId: number) => {
    try {
      const r = await startPrivateChat(targetUserId);
      setNewPrivateOpen(false);
      await fetchRooms();
      setActiveRoomId(r.data.room_id);
      fetchMessages(r.data.room_id);
    } catch (e: any) {
      message.error(e.response?.data?.detail || '发起私聊失败');
    }
  };

  const handleCreateGroup = async (values: any) => {
    try {
      const r = await createChatGroup({ name: values.name, member_ids: values.member_ids });
      setNewGroupOpen(false);
      groupForm.resetFields();
      await fetchRooms();
      setActiveRoomId(r.data.room_id);
      fetchMessages(r.data.room_id);
    } catch (e: any) {
      message.error(e.response?.data?.detail || '创建群聊失败');
    }
  };

  const handleOpenProfile = async (senderId: number) => {
    if (senderId === user?.id || senderId === SYSTEM_BOT_ID) return;
    setProfileOpen(true);
    setProfileLoading(true);
    setProfileUser(null);
    try {
      const r = await getUserProfile(senderId);
      const u = r.data;
      setProfileUser(u ? { id: u.id, username: u.username, real_name: u.real_name || '', email: u.email, phone: u.phone } : null);
    } catch {
      message.error('获取用户资料失败');
      setProfileOpen(false);
    }
    setProfileLoading(false);
  };

  const handleSendMessageToProfile = async () => {
    if (!profileUser) return;
    try {
      const r = await startPrivateChat(profileUser.id);
      setProfileOpen(false);
      setProfileUser(null);
      await fetchRooms();
      setActiveRoomId(r.data.room_id);
      fetchMessages(r.data.room_id);
    } catch (e: any) {
      message.error(e.response?.data?.detail || '发起私聊失败');
    }
  };

  const handleShowMembers = async () => {
    if (!activeRoomId) return;
    try {
      const r = await getChatRoomMembers(activeRoomId);
      setRoomMembers(r.data || []);
      setMemberListOpen(true);
    } catch { message.error('获取成员失败'); }
  };

  const handleAddMembers = async (memberIds: number[]) => {
    if (!activeRoomId) return;
    try {
      await addChatMembers(activeRoomId, memberIds);
      setAddMemberOpen(false);
      handleShowMembers();
      message.success('已添加');
    } catch (e: any) {
      message.error(e.response?.data?.detail || '添加失败');
    }
  };

  const searchMsgAbortRef = useRef<AbortController | null>(null);
  const handleSearchMessages = useCallback(async () => {
    const kw = searchMsgKeyword.trim();
    if (!kw) {
      setSearchMsgResults([]);
      setSearchMsgTotal(0);
      return;
    }
    if (searchMsgAbortRef.current) searchMsgAbortRef.current.abort();
    const ctrl = new AbortController();
    searchMsgAbortRef.current = ctrl;
    setSearchMsgLoading(true);
    try {
      const r = await searchChatMessages(
        { keyword: kw, page: 1, page_size: 50 },
        ctrl.signal
      );
      const data = r.data as { messages?: any[]; total?: number };
      setSearchMsgResults(data.messages || []);
      setSearchMsgTotal(data.total || 0);
    } catch (e: any) {
      if (e?.name === 'AbortError' || e?.code === 'ERR_CANCELED') return;
      message.error('搜索失败');
      setSearchMsgResults([]);
    } finally {
      if (searchMsgAbortRef.current === ctrl) setSearchMsgLoading(false);
      if (searchMsgAbortRef.current === ctrl) searchMsgAbortRef.current = null;
    }
  }, [searchMsgKeyword]);

  useEffect(() => {
    if (!searchMsgOpen) return;
    const kw = searchMsgKeyword.trim();
    if (!kw) {
      setSearchMsgResults([]);
      setSearchMsgTotal(0);
      return;
    }
    const timer = setTimeout(handleSearchMessages, 280);
    return () => clearTimeout(timer);
  }, [searchMsgOpen, searchMsgKeyword, handleSearchMessages]);

  const handleSearchResultClick = (msg: { room_id: number; id: number }) => {
    setSearchMsgOpen(false);
    setHighlightMsgId(msg.id);
    setActiveRoomId(msg.room_id);
    fetchMessages(msg.room_id, msg.id);
    const room = rooms.find(r => r.id === msg.room_id);
    if (room?.unread_count) {
      markChatRoomRead(msg.room_id).catch(() => {});
      setRooms(prev => prev.map(r => r.id === msg.room_id ? { ...r, unread_count: 0 } : r));
    }
  };

  const activeRoom = rooms.find(r => r.id === activeRoomId);

  const getRoomIcon = (type: string) => {
    if (type === 'bot') return <RobotOutlined style={{ color: 'var(--md-sys-color-primary)' }} />;
    if (type === 'group') return <TeamOutlined style={{ color: '#52c41a' }} />;
    return <UserOutlined style={{ color: '#1890ff' }} />;
  };

  const getRoomAvatar = (room: Room) => {
    if (room.type === 'bot') {
      return (
        <Avatar size={40} style={{ background: '#e6f4ff', color: 'var(--md-sys-color-primary)', flexShrink: 0 }}
          icon={<RobotOutlined />}
        />
      );
    }
    if (room.type === 'group') {
      return (
        <Avatar size={40} style={{ background: '#f6ffed', color: '#52c41a', flexShrink: 0 }}
          icon={<TeamOutlined />}
        />
      );
    }
    return (
      <Avatar size={40} style={{ background: '#f0f0f0', color: '#1890ff', flexShrink: 0, fontSize: 16 }}>
        {getSurnameChar(room.name)}
      </Avatar>
    );
  };

  const kw = (searchKeyword || '').trim();
  const isSearching = !!kw;
  const handleUnifiedRoomClick = (item: { room_id: number; room_name: string }) => {
    setSearchKeyword('');
    const room = rooms.find(r => r.id === item.room_id);
    if (room) handleSelectRoom(room);
    else {
      setActiveRoomId(item.room_id);
      fetchMessages(item.room_id);
    }
  };
  const handleUnifiedMsgClick = (msg: { room_id: number; id: number }) => {
    setSearchKeyword('');
    handleSearchResultClick(msg);
  };

  return (
    <div style={{
      display: 'flex', flex: 1, minHeight: 0, gap: 0,
      background: 'var(--md-sys-color-surface-bright)', borderRadius: 12,
      boxShadow: 'var(--md-elevation-2)', overflow: 'hidden',
      border: '1px solid var(--md-sys-color-outline-variant)',
    }}>
      {/* Sidebar - Room list */}
      <div style={{
        width: sidebarOpen ? 300 : 0, minWidth: sidebarOpen ? 300 : 0,
        transition: 'all 0.25s ease', overflow: 'hidden',
        borderRight: sidebarOpen ? '1px solid var(--md-sys-color-outline-variant)' : 'none',
        display: 'flex', flexDirection: 'column', background: 'var(--md-sys-color-surface-container)',
      }}>
        {/* Top actions */}
        <div style={{
          padding: '12px', display: 'flex', gap: 8, alignItems: 'center',
          borderBottom: '1px solid var(--md-sys-color-outline-variant)',
        }}>
          <Tooltip title="发起私聊">
            <Button icon={<UserOutlined />} onClick={() => { setNewPrivateOpen(true); setUserList([]); }}>
              私聊
            </Button>
          </Tooltip>
          <Tooltip title="创建群聊">
            <Button icon={<TeamOutlined />} onClick={() => { setNewGroupOpen(true); handleSearchUsers(''); }}>
              群聊
            </Button>
          </Tooltip>
        </div>

        {/* Search */}
        <div
          style={{ padding: '8px 12px', cursor: 'text' }}
          onClick={() => searchRoomInputRef.current?.focus()}
        >
          <Input
            ref={searchRoomInputRef}
            placeholder="搜索会话..."
            prefix={<SearchOutlined style={{ color: 'rgba(0,0,0,0.25)' }} />}
            value={searchKeyword}
            onChange={e => setSearchKeyword(e.target.value)}
            allowClear
            size="small"
            style={{ borderRadius: 8 }}
          />
        </div>

        {/* Room list / 微信风格搜索结果 */}
        <div ref={roomListRef} style={{ flex: 1, overflow: 'auto' }}>
          {isSearching ? (
            unifiedSearchLoading ? (
              <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
            ) : unifiedSearchRooms.length === 0 && unifiedSearchMessages.length === 0 ? (
              <Empty description="未找到匹配内容" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <div style={{ paddingBottom: 12 }}>
                {unifiedSearchRooms.length > 0 && (
                  <>
                    <div style={{ padding: '8px 12px', fontSize: 12, color: 'rgba(0,0,0,0.45)', fontWeight: 500 }}>群聊 / 私聊</div>
                    {unifiedSearchRooms.map(rs => {
                      const room = rooms.find(r => r.id === rs.room_id);
                      return (
                        <div
                          key={rs.room_id}
                          onClick={() => handleUnifiedRoomClick(rs)}
                          style={{
                            display: 'flex', gap: 10, padding: '10px 12px', cursor: 'pointer',
                            transition: 'background 0.15s', alignItems: 'center',
                            background: activeRoomId === rs.room_id ? 'rgba(25,118,210,0.08)' : 'transparent',
                          }}
                          onMouseEnter={e => { if (activeRoomId !== rs.room_id) (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.04)'; }}
                          onMouseLeave={e => { if (activeRoomId !== rs.room_id) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                        >
                          {room ? getRoomAvatar(room) : (
                            <Avatar size={40} style={{ background: '#f0f0f0', color: '#1890ff', flexShrink: 0, fontSize: 16 }}>
                              {getSurnameChar(rs.room_name)}
                            </Avatar>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 500, color: 'rgba(0,0,0,0.87)' }}>{rs.room_name}</div>
                            <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)', marginTop: 2 }}>包含:<span style={{ color: '#07c160', fontWeight: 500 }}>{kw}</span></div>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
                {unifiedSearchMessages.length > 0 && (
                  <>
                    <div style={{ padding: '12px 12px 8px', fontSize: 12, color: 'rgba(0,0,0,0.45)', fontWeight: 500 }}>聊天记录</div>
                    {unifiedSearchMessages.map((msg: any) => (
                      <div
                        key={msg.id}
                        onClick={() => handleUnifiedMsgClick(msg)}
                        style={{
                          display: 'flex', gap: 10, padding: '10px 12px', cursor: 'pointer',
                          transition: 'background 0.15s', alignItems: 'flex-start',
                          borderBottom: '1px solid rgba(0,0,0,0.06)',
                        }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.04)'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                      >
                        <Avatar size={36} style={{ background: '#e6e6e6', color: '#666', flexShrink: 0, fontSize: 14 }}>
                          {getSurnameChar(msg.sender_name)}
                        </Avatar>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', marginBottom: 2 }}>
                            {msg.room_name} {msg.sender_name} · {formatDateTime(msg.created_at, 'MM-DD HH:mm')}
                          </div>
                          <div style={{ fontSize: 13, color: 'rgba(0,0,0,0.87)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {msg.msg_type === 'image' ? '[图片]' : highlightKeyword(msg.content || '', kw)}
                          </div>
                          <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.35)', marginTop: 2 }}>
                            共 {unifiedSearchRooms.find(r => r.room_id === msg.room_id)?.count ?? 1} 条相关聊天记录
                          </div>
                        </div>
                      </div>
                    ))}
                    {unifiedSearchTotal > unifiedSearchMessages.length && (
                      <div style={{ padding: '8px 12px', fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
                        查看全部({unifiedSearchTotal})
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          ) : loadingRooms ? (
            <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
          ) : rooms.length === 0 ? (
            <Empty description="暂无会话" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            rooms.map(room => (
              <div
                key={room.id}
                onClick={() => handleSelectRoom(room)}
                style={{
                  display: 'flex', gap: 10, padding: '10px 12px', cursor: 'pointer',
                  transition: 'background 0.15s', alignItems: 'center',
                  background: activeRoomId === room.id ? 'rgba(25,118,210,0.08)' : 'transparent',
                }}
                onMouseEnter={e => {
                  if (activeRoomId !== room.id) (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.04)';
                }}
                onMouseLeave={e => {
                  if (activeRoomId !== room.id) (e.currentTarget as HTMLElement).style.background = 'transparent';
                }}
              >
                <Badge count={room.unread_count} size="small" offset={[-4, 4]} showZero={false}>
                  {getRoomAvatar(room)}
                </Badge>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{
                      fontWeight: (activeRoomId === room.id || room.unread_count > 0) ? 600 : 400,
                      fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      color: 'rgba(0,0,0,0.87)', flex: 1, minWidth: 0,
                    }}>
                      {room.name}
                      {room.type === 'group' && (
                        <span style={{ color: 'rgba(0,0,0,0.35)', fontSize: 11, marginLeft: 4 }}>
                          ({room.member_count})
                        </span>
                      )}
                    </span>
                    {room.last_message?.created_at && (
                      <span style={{ fontSize: 11, color: room.unread_count > 0 ? 'var(--md-sys-color-primary)' : 'rgba(0,0,0,0.35)', flexShrink: 0, marginLeft: 8 }}>
                        {formatDateTime(room.last_message.created_at, 'HH:mm')}
                      </span>
                    )}
                  </div>
                  {room.last_message && (
                    <div style={{
                      fontSize: 12, color: room.unread_count > 0 ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.45)', marginTop: 2,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      fontWeight: room.unread_count > 0 ? 500 : 400,
                    }}>
                      {(() => {
                        const lm = room.last_message;
                        if (!lm) return '';
                        if (lm.msg_type === 'image') return '[图片]';
                        if (lm.msg_type === 'card') {
                          const cd = parseCardContent(lm.content);
                          return cd ? `[通知] ${cd.title}` : lm.content;
                        }
                        return lm.content;
                      })()}
                    </div>
                  )}
                </div>
              </div>
            ))
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
            <Button type="text"
              icon={sidebarOpen ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />}
              onClick={() => setSidebarOpen(!sidebarOpen)}
            />
            {activeRoom && getRoomIcon(activeRoom.type)}
            <span style={{ fontWeight: 600, fontSize: 15 }}>
              {activeRoom?.name || '即时通讯'}
            </span>
            {activeRoom?.type === 'group' && (
              <Tag color="green" style={{ marginLeft: 4, fontSize: 11 }}>群聊</Tag>
            )}
            {activeRoom?.type === 'bot' && (
              <Tag color="blue" style={{ marginLeft: 4, fontSize: 11 }}>系统</Tag>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Tooltip title="搜索聊天记录">
              <Button type="text" size="small" icon={<SearchOutlined />}
                onClick={() => { setSearchMsgOpen(true); setSearchMsgKeyword(''); setSearchMsgResults([]); }}
                style={{ height: 28, padding: '0 8px', lineHeight: 1 }}>
                搜索
              </Button>
            </Tooltip>
            {activeRoomId && (
              <Tooltip title={selectMode ? '取消选择' : '选择消息分享'}>
                <Button type="text" size="small" icon={selectMode ? <BorderOutlined /> : <CheckSquareOutlined />}
                  onClick={() => { setSelectMode(!selectMode); setSelectedMsgIds(new Set()); }}
                  style={{ width: 28, height: 28, padding: 0 }} />
              </Tooltip>
            )}
            {activeRoom && activeRoom.type !== 'bot' && (
              <>
                <Tooltip title="查看成员">
                  <Button type="text" size="small" icon={<TeamOutlined />} onClick={handleShowMembers}
                    style={{ width: 28, height: 28, padding: 0 }} />
                </Tooltip>
                {activeRoom.type === 'group' && (
                  <Tooltip title="邀请成员">
                    <Button type="text" size="small" icon={<UsergroupAddOutlined />}
                      onClick={() => { setAddMemberOpen(true); handleSearchUsers(''); }}
                      style={{ width: 28, height: 28, padding: 0 }} />
                  </Tooltip>
                )}
              </>
            )}
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>
          {!activeRoomId ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', height: '100%', color: 'rgba(0,0,0,0.45)',
            }}>
              <SmileOutlined style={{ fontSize: 64, marginBottom: 16, color: 'var(--md-sys-color-primary)', opacity: 0.3 }} />
              <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 8, color: 'rgba(0,0,0,0.65)' }}>
                TestPilot 即时通讯
              </div>
              <div style={{ fontSize: 13, textAlign: 'center', maxWidth: 400, lineHeight: 1.8 }}>
                选择左侧会话开始聊天，或发起新的私聊/群聊
                <br />
                <Text type="secondary" style={{ fontSize: 12 }}>默认包含消息通知机器人，系统通知将在此推送</Text>
              </div>
            </div>
          ) : loadingMsgs ? (
            <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>
          ) : messages.length === 0 ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              height: '100%', minHeight: 200, color: 'rgba(0,0,0,0.45)',
            }}>
              <MessageOutlined style={{ fontSize: 48, marginBottom: 12, color: 'var(--md-sys-color-primary)', opacity: 0.4 }} />
              <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 6, color: 'rgba(0,0,0,0.65)' }}>
                暂无消息
              </div>
              <div style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>
                发一句消息，开始聊天吧
              </div>
            </div>
          ) : (
            <>
            {selectMode && selectedMsgIds.size > 0 && (
              <div style={{
                position: 'sticky', top: 0, zIndex: 10, padding: '8px 0', marginBottom: 8,
                background: 'var(--md-sys-color-surface-container)', borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              }}>
                <span style={{ fontSize: 13 }}>已选 {selectedMsgIds.size} 条</span>
                <Button type="primary" size="small" icon={<ShareAltOutlined />}
                  onClick={() => {
                    const toShare = messages.filter(m => selectedMsgIds.has(m.id) && m.msg_type !== 'system');
                    const content = toShare.map(m => {
                      const prefix = m.sender_id === user?.id ? '我' : (m.sender_name || '');
                      const body = m.msg_type === 'image' ? '[图片]' : m.content;
                      return `${prefix} ${formatDateTime(m.created_at, 'HH:mm')}: ${body}`;
                    }).join('\n');
                    setShareContent(`【聊天记录分享】\n${content}\n\n来自会话：${activeRoom?.name || ''}`);
                    setShareOpen(true);
                  }}>
                  分享选中
                </Button>
              </div>
            )}
            {messages.map((msg, idx) => {
              const isMe = msg.sender_id === user?.id;
              const isCard = msg.msg_type === 'card';
              const isSystem = msg.msg_type === 'system' && msg.sender_id === SYSTEM_BOT_ID;
              const isPlainSystem = msg.msg_type === 'system' && msg.sender_id !== SYSTEM_BOT_ID;

              if (isCard || isSystem) {
                const card = parseCardContent(msg.content);
                if (card) {
                  const typeInfo = CARD_TYPE_LABELS[card.type] || CARD_TYPE_LABELS.system;
                  return (
                    <div key={msg.id} data-msg-id={msg.id} style={{ display: 'flex', justifyContent: 'center', margin: '12px 24px' }}>
                      <div
                        onClick={card.link ? () => navigate(card.link) : undefined}
                        style={{
                          width: '100%', maxWidth: 420,
                          background: '#fff', border: '1px solid rgba(0,0,0,0.08)',
                          borderRadius: 10, padding: '12px 16px',
                          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                          cursor: card.link ? 'pointer' : 'default',
                          transition: 'box-shadow 0.2s',
                        }}
                        onMouseEnter={e => { if (card.link) (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)'; }}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)'}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <Tag color={typeInfo.color} style={{ margin: 0, fontSize: 11, lineHeight: '18px', borderRadius: 4 }}>{typeInfo.label}</Tag>
                          <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.35)' }}>{formatTimeBlock(msg.created_at)}</span>
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'rgba(0,0,0,0.87)', lineHeight: 1.5, wordBreak: 'break-word' }}>
                          {card.title}
                        </div>
                        {card.content && (
                          <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.55)', marginTop: 4, lineHeight: 1.5, wordBreak: 'break-word' }}>
                            {card.content}
                          </div>
                        )}
                        {card.link && (
                          <div style={{ fontSize: 12, color: 'var(--md-sys-color-primary)', marginTop: 8 }}>
                            点击查看详情 &rarr;
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={msg.id} data-msg-id={msg.id} style={{ textAlign: 'center', margin: '12px 0' }}>
                    <Tag style={{
                      background: '#f0f5ff', color: '#1890ff', border: 'none',
                      borderRadius: 12, padding: '2px 12px', fontSize: 12,
                    }}>
                      {msg.content}
                    </Tag>
                    <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.25)', marginTop: 2 }}>
                      {formatDateTime(msg.created_at, 'HH:mm')}
                    </div>
                  </div>
                );
              }
              if (isPlainSystem) {
                return (
                  <div key={msg.id} data-msg-id={msg.id} style={{ textAlign: 'center', margin: '12px 0' }}>
                    <Tag style={{
                      background: '#f0f5ff', color: '#1890ff', border: 'none',
                      borderRadius: 12, padding: '2px 12px', fontSize: 12,
                    }}>
                      {msg.content}
                    </Tag>
                    <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.25)', marginTop: 2 }}>
                      {formatDateTime(msg.created_at, 'HH:mm')}
                    </div>
                  </div>
                );
              }

              const prev = messages[idx - 1];
              const prevSameSender = prev && prev.sender_id === msg.sender_id && prev.msg_type !== 'system' && prev.msg_type !== 'card' && prev.sender_id !== SYSTEM_BOT_ID;
              const prevTime = prev?.created_at ? new Date(prev.created_at).getTime() : 0;
              const currTime = new Date(msg.created_at).getTime();
              const within5Min = prevTime && (currTime - prevTime) < 5 * 60 * 1000;
              const showAvatar = !prevSameSender || !within5Min;
              const compactTop = prevSameSender && within5Min;
              const showTimeSeparator = !prev || !prevTime || (currTime - prevTime) >= 5 * 60 * 1000;

              const isSelected = selectedMsgIds.has(msg.id);
              return (
                <React.Fragment key={msg.id}>
                {showTimeSeparator && (
                  <div style={{ textAlign: 'center', margin: '12px 0 8px' }}>
                    <span style={{
                      fontSize: 12, color: 'rgba(0,0,0,0.4)', background: 'rgba(0,0,0,0.06)',
                      padding: '2px 10px', borderRadius: 4,
                    }}>
                      {formatTimeBlock(msg.created_at)}
                    </span>
                  </div>
                )}
                <div
                  data-msg-id={msg.id}
                  style={{
                    width: '100%',
                    display: 'flex',
                    justifyContent: isMe ? 'flex-end' : 'flex-start',
                    marginBottom: compactTop ? 4 : 14,
                    ...(selectMode && { cursor: 'pointer' }),
                    ...(highlightMsgId === msg.id && {
                      background: 'rgba(25,118,210,0.12)',
                      borderRadius: 8,
                      marginLeft: -8,
                      marginRight: -8,
                      padding: '4px 8px',
                      marginTop: -4,
                    }),
                  }}
                  onClick={selectMode ? () => {
                    if (msg.msg_type === 'system') return;
                    setSelectedMsgIds(prev => {
                      const next = new Set(prev);
                      if (next.has(msg.id)) next.delete(msg.id);
                      else next.add(msg.id);
                      return next;
                    });
                  } : undefined}
                >
                  {selectMode && msg.msg_type !== 'system' && (
                    <Checkbox
                      checked={isSelected}
                      onChange={() => {
                        setSelectedMsgIds(prev => {
                          const next = new Set(prev);
                          if (next.has(msg.id)) next.delete(msg.id);
                          else next.add(msg.id);
                          return next;
                        });
                      }}
                      onClick={e => e.stopPropagation()}
                      style={{ alignSelf: 'center', marginRight: isMe ? 0 : 8, marginLeft: isMe ? 8 : 0 }}
                    />
                  )}
                  <div style={{
                    display: 'flex',
                    gap: 10,
                    flexDirection: isMe ? 'row-reverse' : 'row',
                    alignItems: 'flex-end',
                    maxWidth: '75%',
                  }}>
                  {showAvatar ? (
                    <Tooltip title={!isMe && msg.msg_type !== 'system' ? '查看用户资料' : undefined}>
                      <Avatar
                        size={36}
                        style={{
                          background: isMe ? 'var(--md-sys-color-primary)' : '#e6e6e6',
                          color: isMe ? '#fff' : '#666', flexShrink: 0, fontSize: 14,
                          ...(!isMe && msg.msg_type !== 'system' && { cursor: 'pointer' }),
                        }}
                        onClick={!isMe && msg.msg_type !== 'system' ? () => handleOpenProfile(msg.sender_id) : undefined}
                      >
                        {getSurnameChar(msg.sender_name)}
                      </Avatar>
                    </Tooltip>
                  ) : (
                    <div style={{ width: 36, flexShrink: 0 }} />
                  )}
                    <div style={{ maxWidth: '100%', minWidth: 0 }}>
                    {!isMe && activeRoom?.type === 'group' && showAvatar && (
                      <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)', marginBottom: 2, paddingLeft: 4 }}>
                        {msg.sender_name}
                      </div>
                    )}
                    {msg.reply_to && (
                      <div style={{
                        padding: '6px 10px', marginBottom: 6, borderRadius: 6, background: 'rgba(0,0,0,0.06)',
                        borderLeft: '3px solid var(--md-sys-color-primary)', fontSize: 12, color: 'rgba(0,0,0,0.6)',
                      }}>
                        <div style={{ fontWeight: 500, marginBottom: 2 }}>{msg.reply_to.sender_name}</div>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {msg.reply_to.msg_type === 'image' ? '[图片]' : msg.reply_to.content}
                        </div>
                      </div>
                    )}
                    <div className="msg-bubble-row" style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
                      <div style={{
                        padding: '8px 12px', borderRadius: 10,
                        background: isMe ? 'var(--md-sys-color-primary)' : '#f5f5f5',
                        color: isMe ? '#fff' : 'rgba(0,0,0,0.87)',
                        fontSize: 14, lineHeight: 1.5, wordBreak: 'break-word',
                        boxShadow: 'var(--md-elevation-1)',
                        whiteSpace: 'pre-wrap',
                        maxWidth: '100%',
                      }}>
                        {msg.msg_type === 'image' ? (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={() => setImagePreviewUrl(toImageUrl(msg.content))}
                            onKeyDown={e => e.key === 'Enter' && setImagePreviewUrl(toImageUrl(msg.content))}
                            style={{ cursor: 'pointer', display: 'block', lineHeight: 0 }}
                          >
                            <img src={toImageUrl(msg.content)} alt="图片" style={{ maxWidth: 280, maxHeight: 280, borderRadius: 8, display: 'block', verticalAlign: 'top' }} />
                          </span>
                        ) : (
                          renderMessageContent(msg.content, isMe)
                        )}
                      </div>
                      <div style={{
                        display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start',
                        gap: 2, flexShrink: 0, alignSelf: 'flex-end',
                      }}>
                        {isMe && msg.read_status && (
                          <span style={{ fontSize: 11, color: msg.read_status.read ? '#52c41a' : 'rgba(0,0,0,0.35)' }}>
                            {msg.read_status.read ? '已读' : msg.read_status.total_recipients != null ? `${msg.read_status.read_count || 0}/${msg.read_status.total_recipients}人已读` : '未读'}
                          </span>
                        )}
                        {!selectMode && msg.msg_type !== 'system' && (
                          <div className="msg-action-btns" style={{
                            display: 'flex',
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                          }}>
                            <Tooltip title="引用回复">
                              <Button
                                type="text"
                                size="small"
                                icon={<MessageOutlined />}
                                style={{ width: 24, height: 24, padding: 0, minWidth: 24, color: 'rgba(0,0,0,0.45)' }}
                                onClick={e => {
                                  e.stopPropagation();
                                  setReplyingTo(msg);
                                  inputRef.current?.focus();
                                }}
                              />
                            </Tooltip>
                            <Tooltip title="分享此条">
                              <Button
                                type="text"
                                size="small"
                                icon={<ShareAltOutlined />}
                                style={{ width: 24, height: 24, padding: 0, minWidth: 24, color: 'rgba(0,0,0,0.45)' }}
                                onClick={e => {
                                  e.stopPropagation();
                                  const body = msg.msg_type === 'image' ? '[图片]' : msg.content;
                                  setShareContent(`【聊天记录】${msg.sender_name || '我'} ${formatDateTime(msg.created_at, 'HH:mm')}: ${body}`);
                                  setShareOpen(true);
                                }}
                              />
                            </Tooltip>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  </div>
                </div>
                </React.Fragment>
              );
            })}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        {activeRoomId && activeRoom?.type !== 'bot' && (
          <div style={{
            padding: '12px 24px 16px', borderTop: '1px solid var(--md-sys-color-outline-variant)',
            background: 'var(--md-sys-color-surface-bright)',
          }}>
            {replyingTo && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '8px 12px',
                background: 'rgba(25,118,210,0.08)', borderRadius: 8, border: '1px solid var(--md-sys-color-primary)',
              }}>
                <MessageOutlined style={{ color: 'var(--md-sys-color-primary)' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(0,0,0,0.87)' }}>回复 {replyingTo.sender_name}</div>
                  <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {replyingTo.msg_type === 'image' ? '[图片]' : replyingTo.content}
                  </div>
                </div>
                <Button type="text" size="small" onClick={() => setReplyingTo(null)}>取消</Button>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', position: 'relative' }}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) handleImageUpload(f);
                  e.target.value = '';
                }}
              />
              <Tooltip title="发送图片（支持粘贴截图 Ctrl+V）">
                <Button
                  size="small"
                  icon={<PictureOutlined />}
                  onClick={() => fileInputRef.current?.click()}
                  loading={uploadingImg}
                  disabled={sending}
                  style={{ borderRadius: 8, minWidth: 32, height: 32, flexShrink: 0 }}
                />
              </Tooltip>
              <div style={{ flex: 1, position: 'relative' }}>
                <TextArea
                  ref={inputRef}
                  value={inputValue}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  placeholder={activeRoom?.type === 'group' ? '输入消息，@ 提及成员' : '输入消息'}
                  autoSize={{ minRows: 1, maxRows: 4 }}
                  disabled={sending}
                  style={{ borderRadius: 8, resize: 'none', fontSize: 14 }}
                />
                {mentionOpen && filteredMentionMembers.length > 0 && (
                  <div style={{
                    position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 4,
                    background: 'var(--md-sys-color-surface-container-high)', borderRadius: 8,
                    boxShadow: 'var(--md-elevation-2)', maxHeight: 200, overflow: 'auto',
                    zIndex: 1000, border: '1px solid var(--md-sys-color-outline-variant)',
                  }}>
                    {filteredMentionMembers.slice(0, 10).map(m => (
                      <div
                        key={m.id}
                        onClick={() => handleMentionSelect(m)}
                        style={{
                          padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                          borderBottom: '1px solid rgba(0,0,0,0.06)',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.04)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                      >
                        <Avatar size={28} style={{ background: m.id === 0 ? '#faad14' : '#1890ff' }}>
                          {m.id === 0 ? <TeamOutlined /> : getSurnameChar(m.real_name || m.username)}
                        </Avatar>
                        <span style={{ fontSize: 13, fontWeight: m.id === 0 ? 500 : 400 }}>{m.real_name || m.username}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <Button type="primary" size="small" icon={<SendOutlined />} onClick={handleSend}
                loading={sending} disabled={!inputValue.trim()}
                style={{ borderRadius: 8, height: 32, minWidth: 32, flexShrink: 0 }}
              />
            </div>
            <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.35)', marginTop: 4 }}>
              Enter 发送 · Shift+Enter 换行 · Ctrl+V 粘贴截图
            </div>
          </div>
        )}
        {activeRoomId && activeRoom?.type === 'bot' && (
          <div style={{
            padding: '16px 24px', borderTop: '1px solid var(--md-sys-color-outline-variant)',
            background: 'var(--md-sys-color-surface-container)', textAlign: 'center',
            color: 'rgba(0,0,0,0.45)', fontSize: 13,
          }}>
            消息通知机器人 — 系统通知将自动推送至此
          </div>
        )}
      </div>

      {/* Modal: Start private chat */}
      <Modal
        title="发起私聊"
        open={newPrivateOpen}
        onCancel={() => setNewPrivateOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Input
          placeholder="搜索用户名或姓名..."
          prefix={<SearchOutlined />}
          onChange={e => handleSearchUsers(e.target.value)}
          style={{ marginBottom: 12 }}
          allowClear
          autoFocus
        />
        {userList.length > 0 ? (
          <List
            loading={userSearching}
            dataSource={userList}
            style={{ maxHeight: 300, overflow: 'auto' }}
            renderItem={(u: ChatUser) => (
              <List.Item
                key={u.id}
                style={{ cursor: 'pointer', padding: '8px 12px', borderRadius: 8 }}
                onClick={() => handleStartPrivate(u.id)}
              >
                <List.Item.Meta
                  avatar={<Avatar style={{ background: '#1890ff' }}>{getSurnameChar(u.real_name || u.username)}</Avatar>}
                  title={u.real_name || u.username}
                  description={u.username}
                />
              </List.Item>
            )}
            locale={{ emptyText: '未找到用户' }}
          />
        ) : (
          !userSearching && (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'rgba(0,0,0,0.45)', fontSize: 13 }}>
              输入用户名或姓名搜索联系人
            </div>
          )
        )}
        {userSearching && userList.length === 0 && (
          <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
        )}
      </Modal>

      {/* Modal: Create group */}
      <Modal
        title="创建群聊"
        open={newGroupOpen}
        onCancel={() => { setNewGroupOpen(false); groupForm.resetFields(); }}
        footer={null}
        destroyOnClose
      >
        <Form form={groupForm} layout="vertical" onFinish={handleCreateGroup}>
          <Form.Item name="name" label="群聊名称" rules={[{ required: true, message: '请输入群名' }]}>
            <Input placeholder="输入群聊名称" maxLength={100} />
          </Form.Item>
          <Form.Item name="member_ids" label="选择成员" rules={[{ required: true, message: '请选择成员' }]}>
            <Select
              mode="multiple"
              placeholder="搜索并选择成员"
              showSearch
              filterOption={false}
              onSearch={handleSearchUsers}
              loading={userSearching}
              options={userList.map(u => ({
                value: u.id,
                label: `${u.real_name || u.username} (${u.username})`,
              }))}
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>创建群聊</Button>
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal: User profile (click avatar) */}
      <Modal
        title="用户资料"
        open={profileOpen}
        onCancel={() => { setProfileOpen(false); setProfileUser(null); }}
        footer={profileUser ? (
          <Button type="primary" size="small" icon={<MessageOutlined />} onClick={handleSendMessageToProfile}>
            发消息
          </Button>
        ) : null}
        destroyOnClose
        width={360}
      >
        {profileLoading ? (
          <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
        ) : profileUser ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '4px 0' }}>
            <Avatar size={56} style={{ background: 'var(--md-sys-color-primary)', color: '#fff', fontSize: 22 }}>
              {getSurnameChar(profileUser.real_name || profileUser.username)}
            </Avatar>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{profileUser.real_name || profileUser.username || '—'}</div>
              <div style={{ color: 'rgba(0,0,0,0.45)', fontSize: 12, marginTop: 2 }}>@{profileUser.username}</div>
            </div>
            <div style={{ width: '100%', borderTop: '1px solid var(--md-sys-color-outline-variant)', paddingTop: 12, marginTop: 4 }}>
              <div style={{ fontSize: 13, color: 'rgba(0,0,0,0.6)', marginBottom: 6 }}>
                邮箱：{profileUser.email?.trim() || '暂无'}
              </div>
              <div style={{ fontSize: 13, color: 'rgba(0,0,0,0.6)' }}>
                联系方式：{profileUser.phone?.trim() || '未填写'}
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Modal: 图片预览（页内查看，不新开标签） */}
      <Modal
        open={!!imagePreviewUrl}
        onCancel={() => setImagePreviewUrl(null)}
        footer={imagePreviewUrl ? (
          <Button type="link" size="small" onClick={() => { window.open(imagePreviewUrl, '_blank'); }}>
            在新标签页打开
          </Button>
        ) : null}
        width="90vw"
        style={{ maxWidth: 900 }}
        styles={{ body: { textAlign: 'center', padding: 16 } }}
        destroyOnClose
      >
        {imagePreviewUrl && (
          <img
            src={imagePreviewUrl}
            alt="预览"
            style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain', borderRadius: 8 }}
            onClick={e => e.stopPropagation()}
          />
        )}
      </Modal>

      {/* Modal: Member list */}
      <Modal
        title="房间成员"
        open={memberListOpen}
        onCancel={() => setMemberListOpen(false)}
        footer={null}
      >
        <List
          dataSource={roomMembers}
          renderItem={(m: ChatUser) => (
            <List.Item key={m.id}>
              <List.Item.Meta
                avatar={
                  m.id === SYSTEM_BOT_ID
                    ? <Avatar style={{ background: '#e6f4ff', color: 'var(--md-sys-color-primary)' }} icon={<RobotOutlined />} />
                    : <Avatar style={{ background: '#1890ff' }}>{getSurnameChar(m.real_name || m.username)}</Avatar>
                }
                title={m.real_name || m.username}
                description={m.id === SYSTEM_BOT_ID ? '系统机器人' : m.username}
              />
            </List.Item>
          )}
        />
      </Modal>

      <ShareToIM
        open={shareOpen}
        onCancel={() => { setShareOpen(false); setShareContent(''); }}
        shareType="聊天记录"
        itemTitle={activeRoom?.name ? `来自「${activeRoom.name}」` : '聊天记录'}
        path="/messaging"
        content={shareContent || undefined}
        preloadedRooms={rooms}
      />

      {/* Modal: Search chat messages */}
      <Modal
        title="搜索聊天记录"
        open={searchMsgOpen}
        onCancel={() => setSearchMsgOpen(false)}
        footer={null}
        destroyOnClose
        width={520}
      >
        <div style={{ marginBottom: 12 }}>
          <Input.Search
            placeholder="输入关键词搜索（输入即搜，280ms 防抖）"
            value={searchMsgKeyword}
            onChange={e => setSearchMsgKeyword(e.target.value)}
            onSearch={handleSearchMessages}
            loading={searchMsgLoading}
            enterButton="搜索"
            allowClear
          />
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', marginTop: 6 }}>
            搜索全部会话中的消息
          </div>
        </div>
        <div style={{ maxHeight: 360, overflow: 'auto', border: '1px solid var(--md-sys-color-outline-variant)', borderRadius: 8 }}>
          {searchMsgLoading ? (
            <div style={{ padding: 24, textAlign: 'center' }}><Spin /></div>
          ) : searchMsgResults.length === 0 && searchMsgKeyword.trim() ? (
            <Empty description="未找到匹配消息" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: 24 }} />
          ) : searchMsgResults.length === 0 ? (
            <Empty description="输入关键词即可搜索" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: 24 }} />
          ) : (
            <List
              size="small"
              dataSource={searchMsgResults}
              renderItem={(msg: any) => (
                <List.Item
                  style={{ cursor: 'pointer', padding: '10px 16px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}
                  onClick={() => handleSearchResultClick(msg)}
                >
                  <List.Item.Meta
                    title={
                      <span style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                        <span style={{ color: 'rgba(0,0,0,0.45)' }}>{msg.room_name}</span>
                        <span style={{ fontWeight: 500 }}>{msg.sender_name}</span>
                        <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.35)', display: 'inline-flex', alignItems: 'center' }}>
                          {formatDateTime(msg.created_at, 'MM-DD HH:mm')}
                        </span>
                      </span>
                    }
                    description={
                      <div style={{
                        fontSize: 13, color: 'rgba(0,0,0,0.87)', marginTop: 4,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {msg.msg_type === 'image' ? '[图片]' : msg.content}
                      </div>
                    }
                  />
                </List.Item>
              )}
            />
          )}
        </div>
        {searchMsgTotal > 0 && (
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', marginTop: 8 }}>
            共找到 {searchMsgTotal} 条相关消息
          </div>
        )}
      </Modal>

      {/* Modal: Add members to group */}
      <Modal
        title="邀请成员"
        open={addMemberOpen}
        onCancel={() => setAddMemberOpen(false)}
        footer={null}
        destroyOnClose
      >
        <AddMembersForm
          userList={userList}
          userSearching={userSearching}
          onSearch={handleSearchUsers}
          existingIds={activeRoom?.member_ids || []}
          onSubmit={handleAddMembers}
        />
      </Modal>
    </div>
  );
};

const AddMembersForm: React.FC<{
  userList: ChatUser[];
  userSearching: boolean;
  onSearch: (kw: string) => void;
  existingIds: number[];
  onSubmit: (ids: number[]) => void;
}> = ({ userList, userSearching, onSearch, existingIds, onSubmit }) => {
  const [selected, setSelected] = useState<number[]>([]);
  const filtered = userList.filter(u => !existingIds.includes(u.id));
  return (
    <div>
      <Select
        mode="multiple"
        placeholder="搜索并选择新成员"
        showSearch
        filterOption={false}
        onSearch={onSearch}
        loading={userSearching}
        value={selected}
        onChange={setSelected}
        options={filtered.map(u => ({
          value: u.id,
          label: `${u.real_name || u.username} (${u.username})`,
        }))}
        style={{ width: '100%', marginBottom: 12 }}
      />
      <Button type="primary" block disabled={selected.length === 0}
        onClick={() => onSubmit(selected)}>
        添加 {selected.length > 0 ? `(${selected.length}人)` : ''}
      </Button>
    </div>
  );
};

export default Messaging;
