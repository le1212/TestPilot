import React, { useEffect, useState } from 'react';
import { Modal, Select, message } from 'antd';
import { getChatRooms, sendChatMessage } from '../api';
import { useAuth } from '../contexts/AuthContext';

interface ShareToIMProps {
  open: boolean;
  onCancel: () => void;
  /** 分享类型文案，如 "执行记录"、"缺陷"、"日志"、"测试报告"、"用例"、"AI答疑"、"聊天记录" */
  shareType: string;
  /** 分享项标题，如 "登录接口测试 - 2025-03-01" */
  itemTitle: string;
  /** 路由路径，如 "/executions/123"，用于生成链接 */
  path: string;
  /** 可选：自定义分享内容，不传则使用默认格式 */
  content?: string;
  /** 可选：预加载的会话列表，传入则跳过 fetch 减少延迟 */
  preloadedRooms?: { id: number; name: string; type: string }[];
}

const ShareToIM: React.FC<ShareToIMProps> = ({ open, onCancel, shareType, itemTitle, path, content: customContent, preloadedRooms }) => {
  const { user } = useAuth();
  const [rooms, setRooms] = useState<{ id: number; name: string; type: string }[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) {
      if (preloadedRooms && preloadedRooms.length > 0) {
        const list = preloadedRooms.filter((r: any) => r.type !== 'bot');
        setRooms(list);
        setSelectedRoomId(list[0]?.id ?? null);
        setLoading(false);
      } else {
        setLoading(true);
        getChatRooms()
          .then(r => {
            const list = (r.data || []).filter((room: any) => room.type !== 'bot');
            setRooms(list);
            setSelectedRoomId(list[0]?.id ?? null);
          })
          .catch(() => message.error('加载会话列表失败'))
          .finally(() => setLoading(false));
      }
    }
  }, [open, preloadedRooms]);

  const handleShare = async () => {
    if (!selectedRoomId) {
      message.warning('请选择要分享到的会话');
      return;
    }
    const fullUrl = `${window.location.origin}${path}`;
    const senderName = user?.real_name || user?.username || '用户';
    const content = customContent ?? `【分享】${senderName}分享了${shareType}「${itemTitle}」\n点击查看：${fullUrl}`;

    setSending(true);
    try {
      await sendChatMessage({ room_id: selectedRoomId, content });
      message.success('已分享至即时通讯');
      onCancel();
    } catch (e: any) {
      message.error(e.response?.data?.detail || '分享失败');
    }
    setSending(false);
  };

  return (
    <Modal
      title="分享至即时通讯"
      open={open}
      onCancel={onCancel}
      onOk={handleShare}
      confirmLoading={sending}
      okText="分享"
      destroyOnClose
    >
      <div style={{ marginBottom: 12 }}>
        <div style={{ color: 'rgba(0,0,0,0.65)', marginBottom: 4 }}>分享内容</div>
        <div style={{
          padding: 12, background: '#fafafa', borderRadius: 8, fontSize: 13, lineHeight: 1.6,
          border: '1px solid var(--md-sys-color-outline-variant)', maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap',
        }}>
          {customContent ? customContent.slice(0, 500) + (customContent.length > 500 ? '...' : '') : (
            <>
              {user?.real_name || user?.username} 分享了{shareType}「{itemTitle}」
              <br />
              <a href={path} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--md-sys-color-primary)', wordBreak: 'break-all' }}>
                {window.location.origin}{path}
              </a>
            </>
          )}
        </div>
      </div>
      <div>
        <div style={{ color: 'rgba(0,0,0,0.65)', marginBottom: 8 }}>分享到</div>
        <Select
          style={{ width: '100%' }}
          placeholder="选择会话"
          value={selectedRoomId}
          onChange={setSelectedRoomId}
          loading={loading}
          options={rooms.map(r => ({ value: r.id, label: r.name }))}
        />
      </div>
    </Modal>
  );
};

export default ShareToIM;
