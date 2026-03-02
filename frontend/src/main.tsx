import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import App from './App';
import './index.css';

dayjs.locale('zh-cn');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          /* 现代化高端风格：主色与语义色 */
          colorPrimary: '#0F62FE',
          colorPrimaryHover: '#0D4EDC',
          colorPrimaryActive: '#0A3DB0',
          colorSuccess: '#24A148',
          colorWarning: '#F1C21B',
          colorError: '#DA1E28',
          colorInfo: '#0043CE',
          borderRadius: 8,
          borderRadiusLG: 12,
          colorBgContainer: '#FFFFFF',
          colorBgLayout: '#F8FAFC',
          colorBgElevated: '#FFFFFF',
          colorBorder: 'rgba(15, 23, 42, 0.08)',
          colorBorderSecondary: 'rgba(15, 23, 42, 0.06)',
          colorText: 'rgba(15, 23, 42, 0.9)',
          colorTextSecondary: 'rgba(15, 23, 42, 0.6)',
          colorTextTertiary: 'rgba(15, 23, 42, 0.45)',
          fontFamily: '"Inter", "PingFang SC", "Microsoft YaHei", -apple-system, BlinkMacSystemFont, sans-serif',
          fontSize: 14,
          lineHeight: 1.55,
        },
        components: {
          Card: { borderRadiusLG: 14, paddingLG: 20 },
          Table: { borderRadius: 0 },
          Button: { borderRadius: 8, controlHeight: 36, controlHeightSM: 28 },
          Input: { borderRadius: 8, activeBorderColor: '#0F62FE' },
          Select: { borderRadius: 8 },
          Modal: { borderRadiusLG: 14, contentBg: '#FFFFFF' },
          Menu: { itemBorderRadius: 8 },
        },
      }}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ConfigProvider>
  </React.StrictMode>
);
