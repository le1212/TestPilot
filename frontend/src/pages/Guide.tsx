import React from 'react';
import { Card, Typography, Steps, Alert, Collapse, Table, Divider } from 'antd';
const { Title, Paragraph, Text } = Typography;

const Guide: React.FC = () => (
  <div>
    <div className="page-title-block">
      <h1>使用与部署</h1>
      <p>快速上手与部署说明</p>
    </div>
    <Card className="page-card" bordered={false}>
    <Typography style={{ maxWidth: 960 }}>
      <Title level={4}>使用与部署</Title>
      <Paragraph type="secondary">
        本文档说明如何启动 TestPilot、如何使用各功能、以及如何部署到本机或服务器。与项目 README 对应，按顺序阅读即可快速上手。更详细的部署步骤（如 Linux 服务器从零部署、Nginx、HTTPS）请参见项目根目录 README.md。
      </Paragraph>

      <Divider />

      <Title level={4}>一、快速启动</Title>
      <Paragraph>
        <Text strong>Windows 用户（推荐）：</Text>在项目根目录找到 <Text code>一键启动.bat</Text>，双击运行。会依次弹出两个黑色命令行窗口（后端、前端），请勿关闭。然后在浏览器中打开 <Text code>http://localhost:3000</Text>。
      </Paragraph>
      <Paragraph>
        <Text strong>手动启动：</Text>先开一个终端，进入 <Text code>backend</Text> 目录，执行 <Text code>pip install -r requirements.txt</Text>（首次需要），再执行 <Text code>python -m uvicorn app.main:app --reload --port 8001</Text>；再开一个终端，进入 <Text code>frontend</Text> 目录，执行 <Text code>npm install</Text>（首次需要），再执行 <Text code>npx vite --port 3000</Text>。最后在浏览器打开 <Text code>http://localhost:3000</Text>。
      </Paragraph>
      <Collapse
        defaultActiveKey={[]}
        size="small"
        style={{ marginBottom: 16 }}
        items={[
          {
            key: 'important',
            label: '重要说明（点击展开）',
            children: (
              <Alert
                type="info"
                showIcon
                message="重要"
                description="系统设置、仪表盘等页面必须通过 http://localhost:3000 访问前端，不要直接访问 8001 端口，否则接口会 404。若 3000 无法访问，可尝试 http://127.0.0.1:3000 。"
              />
            ),
          },
        ]}
      />

      <Title level={4}>二、推荐使用流程</Title>
      <Steps
        direction="vertical"
        size="small"
        current={-1}
        items={[
          { title: '创建项目', description: '左侧「项目管理」→ 新建项目，填写名称与描述后保存。后续用例、环境、报告都需选择所属项目。' },
          { title: '配置测试环境', description: '「环境配置」→ 新建环境：选择项目、填写环境名称、Base URL（如 https://api.example.com）、环境变量（每行 key=value）、公共请求头。在用例里可用 {{变量名}} 引用，执行时自动替换。' },
          { title: '编写测试用例', description: '「用例管理」→ 新建用例：选择类型（接口 / Web UI / App / 小程序）、名称、项目、优先级，按类型配置请求或步骤后保存。支持分组展示；每个分组及未分组上方有「AI 生成用例」可据需求生成建议（解析失败会提示 warnings）。编辑页可点「执行」立即执行。' },
          { title: '执行测试', description: '在用例列表中点「执行」单条运行，或在编辑页点「执行」。执行前可选择「执行环境」，接口类会使用该环境的 Base URL 和变量。' },
          { title: '查看结果与报告', description: '「执行记录」查看历史，点「详情」看响应、断言、日志；失败时可点「AI生成缺陷」并编辑指派后保存。「测试报告」可把多条执行汇总成报告，支持「AI 分析报告」；若配置了 Allure，可查看 HTML 报告。' },
          { title: '（可选）使用 AI', description: '在「系统设置 → AI 模型」配置 API Key 与模型后，可在「日志查看」做 AI 分析、在「执行记录」或「日志查看」失败详情中「AI生成缺陷」、在「用例管理」点「AI 生成用例」、在「测试报告」点「AI 分析报告」、在「AI 答疑」与 AI 助手对话。' },
          { title: '（可选）即时通讯与分享', description: '「即时通讯」支持私聊、群聊，可发送图片/截图（Ctrl+V 粘贴）、群聊 @ 提及成员。用例、执行、报告、缺陷、日志等页面可「分享」至指定会话。' },
        ]}
      />

      <Title level={4}>三、各功能说明</Title>
      <Collapse
        defaultActiveKey={[]}
        size="small"
        style={{ marginBottom: 16 }}
        items={[
          {
            key: 'proj',
            label: '项目管理',
            children: (
              <Paragraph>
                新建项目：填写名称与描述后保存，创建人即为该项目负责人。用例、环境、报告都需选择所属项目。<br />
                <Text strong>权限说明：</Text>仅项目负责人或管理员可编辑、删除项目；负责人与项目成员可查看该项目并在其下创建用例与环境。列表中仅对你有管理权限的项目显示「编辑」「删除」；你负责的项目会显示「负责人」标签。删除项目会影响其下用例与环境的归属展示。
              </Paragraph>
            ),
          },
          {
            key: 'case',
            label: '用例管理',
            children: (
              <div>
                <Paragraph>
                  <Text strong>分组与 AI：</Text>支持对用例分组展示，分组可展开/折叠；从分组内进入某用例编辑后返回列表，该分组会保持展开。每个分组及未分组列表上方均有「AI 生成用例」，可选择项目、测试类型并填写需求或接口说明后生成用例建议。Web 步骤动作仅支持系统预定义动作（如打开页面、点击、输入、断言可见等），AI 或历史数据中的非标准动作会自动映射为系统动作。
                </Paragraph>
                <Paragraph>
                  <Text strong>如何设计用例：</Text>先明确测试目标、前置条件、操作步骤、预期结果；再确定断言点（如状态码、响应字段、页面文案）。接口用例通常包括：请求方法、URL、参数、预期状态码与响应内容；Web/App 用例则拆成一步步操作与每步预期。
                </Paragraph>
                <Paragraph>
                  <Text strong>如何创建：</Text>用例管理 → 新建用例 → 选择类型（接口测试 / Web UI / App / 小程序）→ 填名称、所属项目、优先级 → 按类型配置：
                </Paragraph>
                <ul style={{ paddingLeft: 20, marginBottom: 0 }}>
                  <li><Text strong>接口测试：</Text>方法、URL（可写相对路径并配合环境 Base URL）、请求参数/头/体；断言可加状态码、JSON 路径、响应头、包含文本等。</li>
                  <li><Text strong>Web UI：</Text>步骤化配置，每步选操作（打开页面、点击、输入、选择下拉、等待、断言等），填定位方式（CSS / xpath= / id=）和值。定位方式可在浏览器 F12 → 元素右键 Copy selector / Copy XPath 获取。默认浏览器为 Edge。</li>
                  <li><Text strong>App：</Text>需本机启动 Appium Server，步骤类似 Web，选平台后配置定位与操作。</li>
                  <li><Text strong>小程序：</Text>步骤化，支持打开页面、点击、输入、滑动、断言等。</li>
                </ul>
                <Paragraph style={{ marginTop: 8, marginBottom: 0 }}>保存后可在列表点「执行」单条运行，或在编辑页点「执行」立即执行并查看结果。</Paragraph>
              </div>
            ),
          },
          {
            key: 'exec',
            label: '执行记录',
            children: (
              <Paragraph>
                查看所有执行历史，支持按状态筛选后点「查询」。列表展示执行环境名称；点某条「详情」可看完整响应、断言结果、执行日志及执行环境；若执行失败，详情中有「AI生成缺陷」可根据此次失败生成缺陷并关联该执行，可编辑指派给等字段后保存为缺陷。
              </Paragraph>
            ),
          },
          {
            key: 'report',
            label: '测试报告',
            children: (
              <Paragraph>
                测试报告 → 生成报告 → 选择项目、填写报告名称、在「范围」中填写执行 ID（多个用逗号分隔，如 1,2,3；留空则自动汇总最近 100 条）→ 确定。生成后可查看汇总，可点「AI 分析报告」；若后端安装了 Allure 并生成了 HTML 报告，可在报告详情中打开 Allure 链接。
              </Paragraph>
            ),
          },
          {
            key: 'defect',
            label: '缺陷管理',
            children: (
              <Paragraph>
                新建缺陷：选项目、填标题（最多 200 字）、说明、严重程度、状态、指派给等。或从「执行记录」或「日志查看」中失败详情的「AI生成缺陷」进入，会根据失败信息生成缺陷并关联执行与用例；解析失败时会提示「未解析到有效结果，已生成示例，请人工修改」；可编辑指派给后保存。若在「系统设置」中配置了 Jira，可在此将缺陷推送到 Jira、同步状态。
              </Paragraph>
            ),
          },
          {
            key: 'im',
            label: '即时通讯',
            children: (
              <Paragraph>
                <Text strong>私聊 / 群聊：</Text>点「私聊」搜索用户发起一对一对话；点「群聊」创建群组并选择成员。<br />
                <Text strong>发送图片：</Text>点击输入框旁的图片按钮选择图片，或使用 <Text code>Ctrl+V</Text> 粘贴截图，自动上传并发送。<br />
                <Text strong>@ 提及：</Text>在群聊输入框中输入 <Text code>@</Text> 会弹出成员列表，选择成员即可 @ 对方，消息中会高亮显示。<br />
                <Text strong>分享：</Text>用例管理、执行记录、日志查看、测试报告、缺陷管理等页面均有「分享」按钮，可将内容分享到指定会话。
              </Paragraph>
            ),
          },
          {
            key: 'ai-chat',
            label: 'AI 答疑',
            children: (
              <Paragraph>
                与 AI 助手进行测试相关问答，会话自动保存，可查看历史会话。需在「系统设置 → AI 模型」中配置 API Key；选「模拟演示」可体验流程但不调用真实接口。
              </Paragraph>
            ),
          },
          {
            key: 'log',
            label: '日志查看',
            children: (
              <Paragraph>
                按执行记录展示日志，支持按状态、关键词筛选与分页。可展开单条、查看详情、复制或下载为文本；支持「AI 分析」；失败可点「AI生成缺陷」并编辑指派后保存。Web 执行若带截图，详情中会显示执行截图。
              </Paragraph>
            ),
          },
          {
            key: 'env',
            label: '环境配置',
            children: (
              <Paragraph>
                新建环境：选项目、环境名称、Base URL、环境变量（每行 key=value）、公共请求头。用例中可用 {'{{变量名}}'} 引用变量，执行时替换。执行用例前选择「执行环境」即可使用该环境的地址与变量。
              </Paragraph>
            ),
          },
          {
            key: 'settings',
            label: '系统设置',
            children: (
              <Paragraph>
                <Text strong>AI 模型：</Text>配置提供商、模型名称、API Key（及可选 API 接口地址）后保存，即可在日志分析、报告分析、AI生成缺陷、AI 生成用例、AI 答疑中使用。<br />
                <Text strong>Jira 集成：</Text>填写 Jira 地址、用户名、API Token、项目 Key 后保存，缺陷管理中即可推送与同步。<br />
                请务必通过 http://localhost:3000 访问前端，否则接口可能 404。
              </Paragraph>
            ),
          },
          {
            key: 'dashboard',
            label: '仪表盘',
            children: (
              <Paragraph>
                总览：项目数、用例数、执行数、通过率；按类型与优先级的用例分布；近 7 日执行趋势；最近执行列表。无需配置，进入即可查看。
              </Paragraph>
            ),
          },
        ]}
      />

      <Title level={4}>四、部署与进阶</Title>

      <Title level={5}>4.1 环境要求</Title>
      <Table
        size="small"
        pagination={false}
        bordered
        dataSource={[
          { key: '1', name: 'Python', version: '3.11+', note: '后端运行环境' },
          { key: '2', name: 'Node.js', version: '18+', note: '前端构建与开发' },
          { key: '3', name: 'npm', version: '9+', note: '随 Node.js 安装' },
          { key: '4', name: '操作系统', version: 'Windows / macOS / Linux', note: '均支持' },
        ]}
        columns={[
          { title: '软件', dataIndex: 'name', width: 120 },
          { title: '版本', dataIndex: 'version', width: 120 },
          { title: '说明', dataIndex: 'note' },
        ]}
        style={{ marginBottom: 16 }}
      />

      <Title level={5}>4.2 本地部署</Title>
      <Paragraph>适用场景：本机开发、演示、个人使用。</Paragraph>
      <Paragraph>步骤：安装 Python 3.11+、Node.js 18+ 并加入 PATH → 在项目根目录按「快速启动」安装依赖并启动（一键启动.bat 或手动开两个终端分别启动后端与前端）→ 浏览器访问 <Text code>http://localhost:3000</Text>。后端默认仅本机可访问；数据库为 SQLite，文件在 <Text code>backend/testplatform.db</Text>，复制即可备份。</Paragraph>

      <Title level={5}>4.3 服务端部署（生产环境）</Title>
      <Paragraph><Text strong>思路：</Text>前端打包成静态文件，用 Nginx 托管并代理 <Text code>/api</Text>、<Text code>/ws</Text> 到后端；后端以 uvicorn 或 Gunicorn 常驻运行。</Paragraph>
      <Paragraph><Text strong>前端：</Text><Text code>cd frontend && npm run build</Text>，将 <Text code>dist/</Text> 上传到服务器（如 <Text code>/var/www/testpilot/dist</Text>）。</Paragraph>
      <Paragraph><Text strong>后端：</Text>上传 <Text code>backend</Text> 目录，<Text code>pip install -r requirements.txt</Text> 后启动：<Text code>uvicorn app.main:app --host 0.0.0.0 --port 8001</Text> 或 <Text code>gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8001</Text>。建议用 systemd/supervisor 管理进程。</Paragraph>
      <Paragraph>Nginx 示例（<Text code>/api</Text>、<Text code>/ws</Text> 转发到后端，其余走前端静态）：</Paragraph>
      <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 6, fontSize: 12, fontFamily: 'monospace', marginBottom: 16, overflow: 'auto' }}>
        {`server {
  listen 80;
  server_name your-domain.com;

  location / {
    root /var/www/testpilot/dist;
    try_files $uri $uri/ /index.html;
  }

  location /api/ {
    proxy_pass http://127.0.0.1:8001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location /ws {
    proxy_pass http://127.0.0.1:8001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}`}
      </pre>

      <Title level={5}>4.4 局域网部署</Title>
      <Paragraph>适用场景：团队在同一局域网，通过一台机器 IP 访问（如 <Text code>http://192.168.1.100:3000</Text>）。</Paragraph>
      <Paragraph><Text strong>方式 A（开发模式）：</Text>后端启动时加 <Text code>--host 0.0.0.0</Text>，前端启动时加 <Text code>--host 0.0.0.0</Text>（如 <Text code>npx vite --port 3000 --host 0.0.0.0</Text>）。Vite 会输出 Network 地址（如 <Text code>http://192.168.1.100:3000</Text>），局域网内其他设备用该地址访问。需在服务器防火墙放行 3000、8001 端口。</Paragraph>
      <Paragraph><Text strong>方式 B（推荐）：</Text>在该机器上按「服务端部署」构建前端、部署后端、配置 Nginx，Nginx 监听 <Text code>0.0.0.0:80</Text>，<Text code>server_name</Text> 填该机局域网 IP。其他人通过 <Text code>http://192.168.1.100</Text> 访问即可。</Paragraph>

      <Title level={5}>4.5 Docker 部署（推荐）</Title>
      <Paragraph>项目根目录提供了 <Text code>Dockerfile</Text> 和 <Text code>docker-compose.yml</Text>，安装 Docker 后可一键构建并启动前后端 + Nginx。</Paragraph>
      <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 6, fontSize: 12, fontFamily: 'monospace', marginBottom: 16, overflow: 'auto' }}>
        {`# 1. 设置 JWT 密钥（生产必须）
export JWT_SECRET=$(python3 -c "import secrets; print(secrets.token_urlsafe(48))")

# 2. 构建并启动
docker compose up -d --build

# 3. 访问 http://localhost（Nginx 80 端口）

# 常用命令
docker compose logs -f           # 查看日志
docker compose restart testpilot # 重启后端
docker compose down              # 停止并移除`}
      </pre>

      <Title level={5}>4.6 数据库与示例数据</Title>
      <Paragraph>默认使用 SQLite，数据库文件在 <Text code>backend/testplatform.db</Text>，直接复制即可备份。需要示例数据时，在 <Text code>backend</Text> 目录执行 <Text code>python seed.py</Text>（需后端已启动）。生产环境可通过环境变量 <Text code>DATABASE_URL</Text> 切换为 MySQL 或 PostgreSQL（并安装 <Text code>aiomysql</Text>、<Text code>asyncpg</Text>）。</Paragraph>

      <Title level={5}>4.7 Web / App 执行引擎</Title>
      <Paragraph>接口测试无需额外安装。执行 Web UI 用例：需在 backend 安装 Selenium（<Text code>pip install -r requirements.txt</Text> 或双击 <Text code>backend/安装Web引擎依赖.bat</Text>），本机已安装 Chrome 或 Edge（默认使用 Edge）。驱动报错时可运行 <Text code>backend/清除浏览器驱动缓存.bat</Text> 或配置 <Text code>.edge_driver_path</Text> / <Text code>.chrome_driver_path</Text>。App 用例需本机启动 Appium Server 并连接设备或模拟器。</Paragraph>

      <Title level={5}>4.8 常用脚本（Windows）</Title>
      <Paragraph>backend 目录下：<Text code>释放8001端口.bat</Text> 可结束占用 8001 的进程；<Text code>清除浏览器驱动缓存.bat</Text> 可清除 Web 驱动缓存。重置 admin 密码：在 backend 目录执行 <Text code>python -m app.scripts.seed_admin</Text>（会重置为 admin / admin123）。</Paragraph>

      <Divider />

      <Title level={4}>五、CI/CD 流水线</Title>
      <Paragraph>
        项目在 <Text code>.github/workflows/ci.yml</Text> 中提供了完整的 CI/CD 流水线：<Text strong>检查阶段</Text>每次 push/PR 自动运行，<Text strong>部署阶段</Text>仅在 push 到 main 且检查通过后执行。
      </Paragraph>

      <Title level={5}>5.1 检查阶段（每次自动运行）</Title>
      <Table
        size="small"
        pagination={false}
        bordered
        dataSource={[
          { key: '1', name: '后端 Lint + 测试', desc: 'Python 3.11 → ruff 代码检查 → pytest 运行测试' },
          { key: '2', name: '前端构建', desc: 'Node 20 → TypeScript 类型检查 + Vite 构建' },
          { key: '3', name: '依赖漏洞审计', desc: 'pip-audit + npm audit 扫描漏洞（仅报告，不阻塞）' },
        ]}
        columns={[
          { title: 'Job', dataIndex: 'name', width: 160 },
          { title: '说明', dataIndex: 'desc' },
        ]}
        style={{ marginBottom: 16 }}
      />

      <Title level={5}>5.2 部署阶段（二选一，按需启用）</Title>
      <Paragraph>CI 流水线中预置了两种服务端部署方案，<Text strong>默认注释关闭</Text>，启用后 push 到 main 并通过检查即自动部署。</Paragraph>

      <Collapse
        defaultActiveKey={[]}
        size="small"
        style={{ marginBottom: 16 }}
        items={[
          {
            key: 'ssh',
            label: '方案 A：SSH 部署（裸机 / 虚拟机，不用 Docker）',
            children: (
              <div>
                <Paragraph><Text strong>适用场景：</Text>服务器上直接跑 Python + Nginx，已按文档完成 Linux 服务端部署。</Paragraph>
                <Paragraph><Text strong>原理：</Text>CI 通过 → SSH 到服务器 → git pull → 装依赖 → 重启后端 → 重新构建前端 → 替换 Nginx 静态文件 → reload Nginx。</Paragraph>
                <Paragraph><Text strong>启用步骤：</Text></Paragraph>
                <ol style={{ paddingLeft: 20, marginBottom: 8 }}>
                  <li>在 GitHub 仓库 → <Text strong>Settings → Secrets and variables → Actions</Text> 中添加 4 个 Secret：<Text code>DEPLOY_HOST</Text>（服务器 IP）、<Text code>DEPLOY_USER</Text>（SSH 用户名）、<Text code>DEPLOY_KEY</Text>（SSH 私钥，整段粘贴）、<Text code>DEPLOY_PATH</Text>（服务器上项目路径，如 /opt/testtool）</li>
                  <li>编辑 <Text code>.github/workflows/ci.yml</Text>，找到 <Text code>deploy-ssh</Text> 部分，去掉所有 <Text code>#</Text> 注释符</li>
                  <li>推送到 main，CI 通过后自动部署</li>
                </ol>
              </div>
            ),
          },
          {
            key: 'docker',
            label: '方案 B：Docker 部署（服务器装了 Docker）',
            children: (
              <div>
                <Paragraph><Text strong>适用场景：</Text>服务器已安装 Docker，用 docker compose 管理服务。</Paragraph>
                <Paragraph><Text strong>原理：</Text>CI 通过 → SSH 到服务器 → git pull → docker compose down → docker compose up -d --build。</Paragraph>
                <Paragraph><Text strong>启用步骤：</Text></Paragraph>
                <ol style={{ paddingLeft: 20, marginBottom: 8 }}>
                  <li>同方案 A，添加相同的 4 个 Secret</li>
                  <li>编辑 <Text code>.github/workflows/ci.yml</Text>，找到 <Text code>deploy-docker</Text> 部分，去掉所有 <Text code>#</Text> 注释符</li>
                  <li>确保服务器上 DEPLOY_PATH 已 git clone 过项目</li>
                </ol>
              </div>
            ),
          },
        ]}
      />

      <Title level={5}>5.3 如何启用 CI（首次推送到 GitHub）</Title>
      <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 6, fontSize: 12, fontFamily: 'monospace', marginBottom: 16, overflow: 'auto' }}>
        {`# 1. 初始化 git
git init && git add . && git commit -m "initial commit"

# 2. 关联 GitHub 仓库并推送
git remote add origin https://github.com/你的用户名/testtool.git
git branch -M main
git push -u origin main

# 推送后：GitHub 仓库页 → Actions 标签 → 查看 CI 运行状态`}
      </pre>

      <Title level={5}>5.4 不用 GitHub 时本地手动检查</Title>
      <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 6, fontSize: 12, fontFamily: 'monospace', marginBottom: 16, overflow: 'auto' }}>
        {`# 后端 lint（需 pip install ruff）
cd backend && ruff check app/ --select E,W,F --ignore E501

# 前端构建检查
cd frontend && npm run build

# 依赖漏洞扫描
pip install pip-audit && pip-audit -r backend/requirements.txt
cd frontend && npm audit --audit-level=high`}
      </pre>
      <Paragraph><Text strong>扩展：</Text>在 <Text code>backend/tests/</Text> 下新建 <Text code>test_*.py</Text> 即可被 pytest 自动发现。前端可添加 vitest/jest 后在 CI 中增加 <Text code>npm test</Text> 步骤。</Paragraph>

      <Divider />

      <Title level={4}>六、生产部署检查清单</Title>
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message="上线前请逐条确认以下事项"
      />
      <Table
        size="small"
        pagination={false}
        bordered
        dataSource={[
          { key: '1', item: '设置 JWT_SECRET', how: '环境变量 JWT_SECRET 设为强随机字符串，不设置则任何人可伪造 Token' },
          { key: '2', item: '限制 CORS 来源', how: '环境变量 CORS_ORIGINS 设为前端域名（如 https://your-domain.com）' },
          { key: '3', item: '修改默认密码', how: '首次登录后立即修改 admin 密码（系统会弹出提醒）' },
          { key: '4', item: '启用 HTTPS', how: '通过 Nginx + Let\'s Encrypt 或云厂商证书配置' },
          { key: '5', item: '备份数据库', how: '定期备份 testplatform.db，或迁移至 MySQL/PostgreSQL' },
          { key: '6', item: '配置日志级别', how: '环境变量 LOG_LEVEL=WARNING（生产减少日志量）' },
          { key: '7', item: '仅放行必要端口', how: '仅放行 80/443，后端 8001 不对外（通过 Nginx 反代）' },
        ]}
        columns={[
          { title: '检查项', dataIndex: 'item', width: 160 },
          { title: '操作说明', dataIndex: 'how' },
        ]}
        style={{ marginBottom: 16 }}
      />
      <Collapse
        defaultActiveKey={[]}
        size="small"
        style={{ marginBottom: 16 }}
        items={[
          {
            key: 'envvars',
            label: '环境变量一览（点击展开）',
            children: (
              <Table
                size="small"
                pagination={false}
                bordered
                dataSource={[
                  { key: '1', name: 'JWT_SECRET', desc: 'JWT 签名密钥，生产必须设置', def: '内置默认值（不安全）' },
                  { key: '2', name: 'JWT_EXPIRE_HOURS', desc: 'Token 有效期（小时）', def: '168（7 天）' },
                  { key: '3', name: 'CORS_ORIGINS', desc: '允许的前端域名，逗号分隔', def: '*（全部允许）' },
                  { key: '4', name: 'DATABASE_URL', desc: '数据库连接串', def: 'sqlite+aiosqlite:///./testplatform.db' },
                  { key: '5', name: 'LOG_LEVEL', desc: '日志级别', def: 'INFO' },
                  { key: '6', name: 'FRONTEND_URL', desc: '前端地址（用于邮件链接）', def: '自动检测' },
                  { key: '7', name: 'RATE_LIMIT_EXECUTION', desc: '每用户每分钟最大执行次数', def: '30' },
                  { key: '8', name: 'RATE_LIMIT_AI', desc: '每用户每分钟最大 AI 请求次数', def: '20' },
                  { key: '9', name: 'LOGIN_MAX_FAILED', desc: '登录连续失败锁定阈值', def: '5' },
                  { key: '10', name: 'LOGIN_LOCK_SECONDS', desc: '锁定时长（秒）', def: '900（15 分钟）' },
                ]}
                columns={[
                  { title: '变量', dataIndex: 'name', width: 200 },
                  { title: '说明', dataIndex: 'desc' },
                  { title: '默认值', dataIndex: 'def', width: 200 },
                ]}
              />
            ),
          },
        ]}
      />

      <Divider />

      <Title level={4}>七、常见问题</Title>
      <Collapse
        defaultActiveKey={[]}
        size="small"
        items={[
          { key: '1', label: '双击 一键启动.bat 没反应或窗口一闪就关？', children: '多半未安装 Python 或 Node，或未加入 PATH。请安装 Python 3.11+ 和 Node.js 18+，安装时勾选「添加到 PATH」。' },
          { key: '2', label: '浏览器打开 localhost:3000 显示无法访问？', children: '确认两个黑色窗口（后端、前端）都未关闭。若已关，重新双击 一键启动.bat；或尝试 http://127.0.0.1:3000 。' },
          { key: '3', label: '系统设置、仪表盘报错「加载失败」或 404？', children: '必须通过 http://localhost:3000 访问前端，不要直接访问 8001。若仍 404，可访问 http://localhost:8001/api/health 检查是否有 version 字段；若无，多为 8001 被旧进程占用，可运行 backend/释放8001端口.bat 后重新启动后端。' },
          { key: '4', label: '想关掉 TestPilot？', children: '关掉 一键启动.bat 弹出的两个黑色窗口即可；下次再双击 一键启动.bat 启动。' },
          { key: '5', label: '前端白屏或控制台报 proxy error？', children: '确认后端已启动并运行在 http://127.0.0.1:8001。检查 frontend/vite.config.ts 中 proxy 的 target 是否为 http://127.0.0.1:8001。' },
          { key: '6', label: '如何修改端口？', children: '后端：启动命令里改 --port 8001。前端：在 vite.config.ts 的 server.port 和 server.proxy.target 中修改，并与后端端口一致。' },
          { key: '7', label: 'Web 用例报「Unable to obtain driver」或版本不匹配？', children: '先运行 backend/清除浏览器驱动缓存.bat 后重启后端再试；或新建 backend/.edge_driver_path（或 .chrome_driver_path）写入驱动完整路径，或设置环境变量 EDGE_DRIVER_PATH / CHROME_DRIVER_PATH 后运行 start_backend.bat。' },
          { key: '8', label: '忘记管理员密码？', children: '在 backend 目录执行 python -m app.scripts.seed_admin，会将 admin 密码重置为 admin123。' },
        ]}
      />
    </Typography>
  </Card>
  </div>
);

export default Guide;
