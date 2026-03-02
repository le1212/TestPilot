import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const contentStyle: React.CSSProperties = {
  fontSize: 13,
  lineHeight: 1.6,
  margin: 0,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  marginBottom: 12,
  fontSize: 13,
};
const thTdStyle: React.CSSProperties = {
  border: '1px solid #e8e8e8',
  padding: '8px 10px',
  textAlign: 'left',
  verticalAlign: 'top',
};
const thStyle: React.CSSProperties = { ...thTdStyle, background: '#fafafa', fontWeight: 600 };

/** 用于渲染 AI 分析等 Markdown 内容，标题/加粗/列表/表格等会正确显示 */
export default function MarkdownContent({ content }: { content: string }) {
  if (!content?.trim()) return null;
  return (
    <div className="ai-analysis-markdown" style={contentStyle}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <div style={{ fontWeight: 700, fontSize: 16, marginTop: 12, marginBottom: 6 }}>{children}</div>,
          h2: ({ children }) => <div style={{ fontWeight: 700, fontSize: 15, marginTop: 12, marginBottom: 4 }}>{children}</div>,
          h3: ({ children }) => <div style={{ fontWeight: 600, fontSize: 14, marginTop: 10, marginBottom: 4 }}>{children}</div>,
          p: ({ children }) => <div style={{ marginBottom: 6 }}>{children}</div>,
          ul: ({ children }) => <ul style={{ marginBottom: 8, paddingLeft: 20 }}>{children}</ul>,
          ol: ({ children }) => <ol style={{ marginBottom: 8, paddingLeft: 20 }}>{children}</ol>,
          li: ({ children }) => <li style={{ marginBottom: 2 }}>{children}</li>,
          strong: ({ children }) => <strong style={{ fontWeight: 600 }}>{children}</strong>,
          table: ({ children }) => <table style={tableStyle}>{children}</table>,
          thead: ({ children }) => <thead>{children}</thead>,
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => <tr>{children}</tr>,
          th: ({ children }) => <th style={thStyle}>{children}</th>,
          td: ({ children }) => <td style={thTdStyle}>{children}</td>,
          code: ({ className, children, ...rest }) => {
            const isBlock = Boolean(className);
            if (isBlock) {
              return (
                <pre style={{ background: '#f5f5f5', padding: 10, borderRadius: 6, overflow: 'auto', margin: '8px 0', fontSize: 12 }}>
                  <code {...rest}>{children}</code>
                </pre>
              );
            }
            return (
              <code style={{ background: '#f5f5f5', padding: '1px 4px', borderRadius: 4, fontSize: 12 }} {...rest}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
