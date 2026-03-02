import React, { useRef, useCallback, useState } from 'react';

export interface ResizableTitleProps {
  dataKey: string;
  width: number;
  minWidth?: number;
  maxWidth?: number;
  onResize: (key: string, width: number) => void;
  children: React.ReactNode;
}

const ResizableTitle: React.FC<ResizableTitleProps> = ({
  dataKey,
  width,
  minWidth = 60,
  maxWidth = 800,
  onResize,
  children,
}) => {
  const [resizing, setResizing] = useState(false);
  const startX = useRef(0);
  const startW = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      startX.current = e.clientX;
      startW.current = width;
      setResizing(true);
    },
    [width]
  );

  React.useEffect(() => {
    if (!resizing) return;
    const move = (e: MouseEvent) => {
      const delta = e.clientX - startX.current;
      const next = Math.min(maxWidth, Math.max(minWidth, startW.current + delta));
      onResize(dataKey, next);
    };
    const up = () => setResizing(false);
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [resizing, dataKey, minWidth, maxWidth, onResize]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', width: '100%', position: 'relative' }}>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{children}</span>
      <span
        onMouseDown={handleMouseDown}
        className="resizable-title-handle"
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: 8,
          cursor: 'col-resize',
          marginRight: -4,
        }}
        title="拖拽调节列宽"
      />
    </div>
  );
};

export default ResizableTitle;
