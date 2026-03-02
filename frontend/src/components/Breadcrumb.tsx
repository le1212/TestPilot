import React from 'react';
import { Breadcrumb as AntBreadcrumb } from 'antd';
import { useNavigate } from 'react-router-dom';

export interface BreadcrumbItem {
  label: string;
  path?: string;
}

const Breadcrumb: React.FC<{ items: BreadcrumbItem[] }> = ({ items }) => {
  const navigate = useNavigate();
  return (
    <AntBreadcrumb
      style={{ marginBottom: 12, fontSize: 13 }}
      items={items.map((item, i) => ({
        title: item.path && i < items.length - 1 ? (
          <a onClick={(e) => { e.preventDefault(); navigate(item.path!); }} href="#" style={{ color: 'rgba(0,0,0,0.65)' }}>{item.label}</a>
        ) : (
          <span style={{ color: i === items.length - 1 ? 'rgba(0,0,0,0.87)' : 'rgba(0,0,0,0.65)' }}>{item.label}</span>
        ),
      }))}
    />
  );
};

export default Breadcrumb;
