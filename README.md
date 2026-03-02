# TestPilot - 可视化自动化测试平台

一个现代化的 Web 可视化测试平台，支持**接口测试、Web UI 测试、App 测试、小程序测试**，提供用例管理、执行引擎、测试报告、缺陷管理、**即时通讯**（支持图片/截图、群聊 @ 提及、点击头像查看用户资料并发消息、头像显示姓氏）、**AI 答疑**（新回复红点提示）、分享、讨论区与操作日志等完整功能。

---

## 给新手：三步跑起来

如果你**从没部署过项目**，按下面三步做即可在电脑上打开 TestPilot：

| 步骤 | 你要做的事 | 说明 |
|------|------------|------|
| **① 装环境** | 安装 Python 和 Node.js | 见下方 [环境准备](#环境准备)，约 5 分钟 |
| **② 装依赖** | 在项目里执行两条命令 | 后端装一次、前端装一次，见 [快速开始](#快速开始) |
| **③ 启动** | 双击 `一键启动.bat` 或手动开两个窗口 | 启动后浏览器打开 http://localhost:3000 |

**第一次打开页面**：用默认账号 **admin**，密码 **admin123** 登录，然后到左侧「项目管理」里新建一个项目，就可以开始添加用例了。更细的操作见 [如何使用](#如何使用)。

---

## 目录

- [环境准备](#环境准备)（必读：安装 Python 与 Node.js）
- [快速开始](#快速开始)（安装依赖 + 启动）
- [如何使用](#如何使用)（登录后怎么用）
- [部署指南](#部署指南)（本机 / **Linux 服务器详细** / 局域网）
- [功能模块说明](#功能模块说明)
- [即时通讯与 AI 答疑](#即时通讯与-ai-答疑)
- [AI 功能说明](#ai-功能说明)
- [项目结构](#项目结构)
- [后端脚本说明](#后端脚本说明)
- [常见问题](#常见问题)
- [扩展指南](#扩展指南)
- [CI 流水线](#ci-流水线)
- [技术栈](#技术栈供参考)
- [设计参考](#设计参考)
- [开源与推送到 GitHub](#开源与推送到-github)

---

## 开源与推送到 GitHub

本项目采用 **MIT 协议**开源，详见根目录 [LICENSE](LICENSE)。

若你想将本项目推送到自己的 GitHub 仓库并公开，请按 **[GITHUB_PUBLISH.md](GITHUB_PUBLISH.md)** 中的步骤操作，包括：安装 Git、在 GitHub 创建仓库、本地初始化并推送、配置认证（HTTPS Token 或 SSH）等。

---

## 环境准备

在运行 TestPilot 之前，电脑上需要安装两样东西：**Python** 和 **Node.js**。下面用「小白也能懂」的方式说明怎么装、怎么检查是否装好。

### 1. 安装 Python（后端需要）

- **下载**：打开 [Python 官网](https://www.python.org/downloads/)，下载 **Python 3.11 或更高版本**（如 3.12）。
- **安装时务必勾选**：「Add Python to PATH」（把 Python 加到系统路径），然后点「Install Now」。
- **检查是否装好**：  
  按 `Win + R` 输入 `cmd` 回车，在黑色窗口里输入下面命令并回车：
  ```bash
  python --version
  ```
  若显示类似 `Python 3.11.x` 或 `Python 3.12.x` 就说明装好了。若提示「不是内部或外部命令」，说明没勾选「Add Python to PATH」，需要卸载后重装并勾选该项。

### 2. 安装 Node.js（前端需要）

- **下载**：打开 [Node.js 官网](https://nodejs.org/)，下载 **LTS 版本**（推荐 18 或 20）。
- **安装**：一路「下一步」，默认会同时安装 **npm**（不用单独装）。
- **检查是否装好**：  
  重新打开一个 cmd 窗口，输入：
  ```bash
  node --version
  npm --version
  ```
  若分别显示版本号（如 `v18.x.x` 和 `9.x.x`）就说明装好了。

### 3. Web / App 测试（按需准备）

- **只做接口测试**：安装好 Python 和 Node.js 即可，本步可跳过。
- **要跑 Web 页面自动化**：本机必须安装 **Chrome** 或 **Microsoft Edge**（默认使用 Edge）；首次运行 Web 用例时，后端会自动下载对应驱动。
- **要跑 App 自动化**：必须额外安装并启动 **Appium Server**，并连接真机或模拟器。

---

## 快速开始

以下所有命令，都是在「命令行」里执行的。  
**如何打开命令行**：按 `Win + R`，输入 `cmd` 回车；或在本项目文件夹里按住 Shift 右键，选择「在此处打开 PowerShell 窗口」。

### 第一步：安装后端依赖

1. 在命令行里**先进入项目的 backend 文件夹**：
   ```bash
   cd backend
   ```
   （若你的项目在 `D:\my\testtool`，就先把路径改成你的，例如：`cd D:\my\testtool\backend`）

2. 安装 Python 依赖（会从网络下载包，需要一点时间）：
   ```bash
   pip install -r requirements.txt
   ```

3. **仅当需要执行 Web UI 类型用例时**：双击运行 `backend` 文件夹里的 **`安装Web引擎依赖.bat`**，且本机需已安装 Chrome 或 Edge。只做接口测试可跳过本步。

### 第二步：安装前端依赖

1. **新开一个**命令行窗口（不要关掉刚才那个），进入项目的 **frontend** 文件夹：
   ```bash
   cd frontend
   ```
   （同样，若路径不同请改成你的，例如：`cd D:\my\testtool\frontend`）

2. 安装前端依赖（会从网络下载包，需要一点时间）：
   ```bash
   npm install
   ```

### 第三步：启动服务

**方式一：一键启动（推荐，仅 Windows）**

- 在项目**根目录**（和 `backend`、`frontend` 同级）找到 **`一键启动.bat`**，**双击运行**。
- 会先后弹出**两个**黑色命令行窗口（先后端、后前端），**不要关闭这两个窗口**，关掉就等于关掉了服务。

**方式二：手动启动（适合所有系统）**

- **第一个窗口**（后端）：
  ```bash
  cd backend
  python -m uvicorn app.main:app --reload --port 8001
  ```
  看到类似 `Uvicorn running on http://127.0.0.1:8001` 就说明后端已启动。

- **第二个窗口**（前端）：新开一个命令行窗口，执行：
  ```bash
  cd frontend
  npx vite --port 3000
  ```
  看到类似 `Local: http://localhost:3000` 就说明前端已启动。

### 第四步：在浏览器里打开

在浏览器地址栏输入并访问：

**http://localhost:3000**

（若打不开，可试试：http://127.0.0.1:3000）

**重要**：  
- **必须访问**：**http://localhost:3000**（或 http://127.0.0.1:3000）。  
- **不要**在浏览器里直接打开 http://localhost:8001：那样只能看到 API 文档，无法登录、无法使用仪表盘和用例等功能。所有日常使用都通过 3000 端口进入。

### 第五步：登录与示例数据

- **登录**：使用默认管理员账号 **admin**，密码 **admin123**。登录后请在「个人资料」或「修改密码」里**立即修改默认密码**。
- **示例数据（可选）**：若希望先看到示例项目和用例，在后端**已启动**的情况下，再开一个命令行窗口，执行：
  ```bash
  cd backend
  python seed.py
  ```
  执行成功后，刷新浏览器，即可在「用例管理」「环境配置」等页面看到示例数据。

---

## 如何使用

下面按「第一次用」的顺序说明：登录后先做什么、再做什么，以及各功能大概怎么用。

### 1. 登录

用管理员给的账号登录（或默认 **admin / admin123**）。登录后左侧是菜单，右侧是当前页面。

### 2. 创建项目（必做一步）

- 点左侧 **「项目管理」**。
- 点 **「新建项目」**（或类似按钮）。
- 填写**项目名称**（如「XX 系统测试」）和**描述**，点保存。**创建后你即为该项目负责人**。
- **项目管理权限**：仅**项目负责人**或**管理员**可编辑、删除项目；负责人与项目成员可查看该项目并在其下创建用例/环境。列表中对无编辑权限的项目不显示「编辑」「删除」按钮。
- 之后新建用例、环境、报告时，都会要求选择「所属项目」，选你有权限的项目即可。

### 3. 配置测试环境（接口测试时有用）

- 点左侧 **「环境配置」**。
- 新建环境：选择上面创建的项目，填**环境名称**（如「测试环境」）、**Base URL**（如 `https://api.example.com`）。
- 可填**环境变量**（每行 `key=value`）和**公共请求头**。在用例里可以用 `{{变量名}}` 引用，执行时会自动替换。

**环境变量 & 公共请求头示例（可直接复制到表单里）：**

- **环境变量**（每行一个 `key=value`，用例里用 `{{变量名}}` 引用；值可以是地址、token、ID 等，与基础地址可一致或不同）：
  ```
  base_host=https://api.example.com
  token=eyJhbGciOiJIUzI1NiJ9.xxx
  user_id=10086
  env_name=测试环境
  ```
  用例里例如：URL 填 `{{base_host}}/user/{{user_id}}`，请求头填 `Authorization: Bearer {{token}}`，执行时会替换成上面配置的值。

- **公共请求头**（每行一个 `key=value`，会对该环境下所有接口请求生效）：
  ```
  Content-Type=application/json
  Authorization=Bearer {{token}}
  X-Tenant-Id=100
  ```
  若在环境变量里已配置 `token`，这里写 `Authorization=Bearer {{token}}` 即可自动带上该环境的 token。

### 4. 编写与执行用例

- 点左侧 **「用例管理」**。
- 新建用例：选择**类型**（接口 / Web UI / App / 小程序）、**名称**、**所属项目**、**优先级**，再按类型配置：
  - **接口测试**：请求方法、URL、参数/头/体；断言（状态码、JSON 路径、响应内容等）。
  - **Web UI**：一步步配置（打开页面、点击、输入、断言等），定位方式支持 CSS/XPath/id。
  - **App**：需本机先启动 Appium Server，步骤类似 Web。
- **用例管理**支持分组：可对用例分组展示，分组可展开/折叠；从分组内点进某用例编辑后返回列表，该分组会保持展开。
- 每个分组及未分组列表上方均有 **「AI 生成用例」**：选择项目、填写需求或接口说明后可生成用例建议，按需添加至列表。解析失败时会提示 warnings，便于人工修改。Web 类步骤动作仅使用系统支持的词（如 open、click、input、assert_visible 等），AI 或历史数据中的非标准动作会自动映射为系统动作。
- 保存后，在列表里点 **「执行」** 可单条运行，或在编辑页点 **「执行」** 立即执行。编辑页可先选「执行环境」再执行；所选执行环境会随用例保存，下次打开编辑页会自动回显。

### 5. 查看结果与报告

- **执行记录**：点左侧「执行记录」，可看每次执行的历史；列表展示**环境**名称，点某条的「详情」可看响应、断言、日志及执行环境；若失败可点 **「AI生成缺陷」** 根据此次失败生成缺陷（指派可编辑）并保存。
- **测试报告**：在「测试报告」里可选择一批执行记录生成报告；「范围」可输入多个执行 ID（逗号分隔），留空则自动汇总最近 100 条；可点 **「AI 分析报告」**；若配置了 Allure，可查看 HTML 报告。
- **日志查看**：按执行记录查看请求/响应与断言过程，支持筛选、复制、下载；可点 **「AI 分析」**；失败可 **「AI生成缺陷」**（指派可编辑）。

### 6. 缺陷管理

- 在「缺陷管理」里可新建/编辑缺陷：标题、严重程度、状态、**指派给**（可编辑）、复现步骤、截图等。
- 可从**执行记录**或**日志查看**中失败/错误详情的 **「AI生成缺陷」** 一键根据失败信息生成缺陷并带入关联信息；解析失败时会提示「未解析到有效结果，已生成示例，请人工修改」；生成后可编辑指派给等字段再保存。
- **权限**：仅创建人、管理员、被指派人可编辑；状态/严重程度/指派给仅管理员、当前被指派人可改；仅管理员可删除。讨论区与操作日志在缺陷详情中查看。可选在「系统设置」里配置 Jira 后推送、同步缺陷。

### 缺陷流转简要说明

- 测试提交缺陷 → 指派给开发 → 状态「处理中」→ 开发修完改为「待验证」→ 测试验证通过改为「已验证」，不通过可改回「待处理」。指派给谁会收到站内通知。

### 7. 即时通讯

- 点左侧 **「即时通讯」** 进入聊天界面。
- **私聊**：点「私聊」搜索用户并发起一对一对话。
- **群聊**：点「群聊」创建群组，选择成员后即可群内沟通。
- **发送图片/截图**：点击输入框旁的图片按钮选择图片，或使用 **Ctrl+V** 直接粘贴截图发送。
- **群聊 @ 提及**：在群聊输入框中输入 **@** 会弹出成员列表，选择成员即可 @ 对方，消息中会高亮显示提及。
- **用户资料**：点击会话中的用户头像可查看对方资料（姓名、用户名），并提供「发消息」按钮快速发起私聊。
- **头像显示**：用户头像默认显示姓氏（中文取首字，英文取姓的首字母）。
- **分享**：用例管理、执行记录、日志查看、测试报告、缺陷管理等页面均有「分享」按钮，可将内容分享到指定会话；聊天记录支持分享至其他会话。

### 8. AI 答疑

- 点左侧 **「AI 答疑」** 进入 AI 对话页面。
- 可新建会话、查看历史会话，与 AI 助手进行测试相关问答。
- **新回复红点**：当 AI 生成回复成功时，侧边栏「AI 答疑」菜单项会显示红点提示，与即时通讯未读提示一致。
- 需在「系统设置 → AI 模型」中配置 API Key 后使用；选「模拟演示」可体验流程但不调用真实接口。

---

## 部署指南

根据你的使用场景选一种即可：本机自己用、放到服务器给大家用、或在局域网里给同事用。

---

### 一、本地部署（本机开发 / 演示 / 个人使用）

**你要做的：**

1. 确保已按 [环境准备](#环境准备) 安装好 Python 3.11+ 和 Node.js 18+，并已按 [快速开始](#快速开始) 在项目里装好后端、前端依赖。
2. 启动方式二选一：
   - **Windows**：在项目根目录双击 **`一键启动.bat`**（会先启后端、再启前端）。
   - **其他系统或手动**：一个终端执行 `cd backend` → `python -m uvicorn app.main:app --reload --port 8001`；另一个终端执行 `cd frontend` → `npx vite --port 3000`。
3. 浏览器访问 **http://localhost:3000** 使用系统。

**注意：**

- 后端默认只监听本机（127.0.0.1:8001），只有你这台电脑能访问。
- 数据库是 SQLite，文件在 **`backend/testplatform.db`**，直接复制该文件即可备份。

---

### 二、服务端部署（正式环境，多人通过域名或 IP 访问）

**整体思路**：前端打包成静态文件，由 Nginx 提供页面；后端在服务器上常驻运行；Nginx 把 `/api`、`/ws` 转发给后端。用户通过域名或 IP 访问即可。

下面以 **Linux 服务器**为主，给出从零到可访问的完整步骤（小白也可按顺序操作）；若使用 Windows 服务器，见文末 [Windows 服务器简要说明](#windows-服务器简要说明)。

---

#### Linux 服务器详细部署（小白向）

以下假设你有一台 **Ubuntu 22.04 / Debian 11+** 的云服务器（腾讯云、阿里云、华为云等均可），并已获得 **root** 或 **sudo** 权限。若使用 **CentOS / Rocky**，会在对应步骤注明差异。

---

##### 2.1 你需要准备什么

| 准备项 | 说明 |
|--------|------|
| **一台 Linux 服务器** | 1 核 2G 即可跑通，推荐 2 核 4G 更稳。 |
| **SSH 连接方式** | 云控制台提供的「登录」或本机终端用 `ssh root@你的服务器IP`。 |
| **域名（可选）** | 有域名可绑定后通过 `http://你的域名` 访问；没有则用 `http://服务器公网IP` 访问。 |
| **本机已安装** | 本地已能运行项目（用于构建前端），或直接在服务器上装 Node 后构建也可。 |

---

##### 2.2 连接服务器

在**你自己的电脑**上打开终端（Windows 可用 PowerShell 或 Git Bash）：

```bash
ssh root@你的服务器IP
```

例如：`ssh root@123.45.67.89`。首次会提示确认指纹，输入 `yes` 回车；然后输入服务器密码（或使用密钥登录）。  
看到类似 `root@xxx:~#` 的提示符，说明已连上，后面的命令都在**服务器上**执行（除非特别说明「在本机」）。

---

##### 2.3 安装基础环境（Python、Node、Nginx）

以下命令**逐条复制、在服务器终端执行**。若某条报错，先看报错信息再继续。

**（1）更新系统软件包（推荐先做一次）**

```bash
sudo apt update && sudo apt upgrade -y
```

**（2）安装 Python 3.11+**

```bash
sudo apt install -y software-properties-common
sudo add-apt-repository -y ppa:deadsnakes/ppa
sudo apt update
sudo apt install -y python3.11 python3.11-venv python3.11-dev
```

检查是否装好：

```bash
python3.11 --version
```

应显示 `Python 3.11.x`。

**（3）安装 Node.js 18（用于构建前端）**

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```

检查：

```bash
node --version
npm --version
```

应分别显示 `v18.x.x` 和版本号。

**（4）安装 Nginx**

```bash
sudo apt install -y nginx
```

**（5）安装 pip（若没有）**

```bash
sudo apt install -y python3-pip
```

或为 Python 3.11 单独装 pip：

```bash
curl -sS https://bootstrap.pypa.io/get-pip.py | python3.11
```

---

**若你的服务器是 CentOS / Rocky Linux**，可用下面等价步骤（需 root 或 sudo）：

```bash
# 安装 Python 3.11
sudo dnf install -y python3.11 python3.11-pip

# 安装 Node 18
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo dnf install -y nodejs

# 安装 Nginx
sudo dnf install -y nginx
```

---

##### 2.4 上传项目到服务器

任选一种方式，把**整个项目**（至少包含 `backend` 和 `frontend` 两个文件夹）放到服务器上。

**方式 A：用 Git（推荐，服务器已装 git 时）**

在服务器上执行（把仓库地址换成你的）：

```bash
cd /opt
sudo git clone https://github.com/你的用户名/testtool.git
sudo chown -R $USER:$USER testtool
cd testtool
```

**方式 B：本机打包后上传**

- 在本机项目根目录打包：把 `backend`、`frontend` 两个文件夹打成 zip，或直接打包整个项目。
- 用 **scp** 上传（在本机终端执行，路径改成你的）：

  ```bash
  scp -r 你的项目根目录路径 root@你的服务器IP:/opt/testtool
  ```

  或使用 **WinSCP、FinalShell、MobaXterm** 等工具，把项目拖到服务器 `/opt/testtool`。

**方式 C：只在服务器上放 backend，前端在本机构建后只上传 dist**

见下一步「构建前端」：在本机构建好后，把 `frontend/dist` 整个文件夹上传到服务器即可，backend 仍需完整上传。

---

这里假设项目在服务器上的路径为 **`/opt/testtool`**（包含 `backend`、`frontend`）。若你放在别的路径，后面所有 `/opt/testtool` 请替换成你的路径。

---

##### 2.5 构建前端

**在服务器上**进入前端目录并构建（会生成 `dist` 文件夹）：

```bash
cd /opt/testtool/frontend
npm install
npm run build
```

若 `npm install` 很慢，可先配置国内镜像再执行：

```bash
npm config set registry https://registry.npmmirror.com
npm install
npm run build
```

构建成功后，会多出一个 **`dist`** 目录。我们稍后让 Nginx 指向这个目录。

**可选**：若你希望在本机构建（例如本机已装好 Node），则在本机项目里执行：

```bash
cd frontend
npm install
npm run build
```

然后把 **`frontend/dist`** 整个文件夹上传到服务器，例如放到 `/var/www/testpilot/dist`（需先在服务器上建好目录）。

---

##### 2.6 部署后端并做成系统服务

**（1）创建虚拟环境并安装依赖（推荐）**

```bash
cd /opt/testtool/backend
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

若服务器上只有 `python3` 且版本 ≥3.11，可用 `python3 -m venv venv`。

**（2）先手动测一下后端能否启动**

```bash
cd /opt/testtool/backend
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8001
```

看到 `Uvicorn running on http://0.0.0.0:8001` 说明正常。按 `Ctrl+C` 停止，然后做成系统服务。

**（3）用 systemd 做成开机自启服务**

创建服务配置文件：

```bash
sudo nano /etc/systemd/system/testpilot.service
```

在打开的编辑器里**整段粘贴**下面内容（注意把 **/opt/testtool** 改成你实际的项目路径）：

```ini
[Unit]
Description=TestPilot Backend
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/testtool/backend
Environment="PATH=/opt/testtool/backend/venv/bin"
ExecStart=/opt/testtool/backend/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8001
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

保存并退出（nano：`Ctrl+O` 回车，再 `Ctrl+X`）。若你不用虚拟环境，可把 `Environment` 和 `ExecStart` 里的路径改成系统 `uvicorn` 所在路径。

启用并启动服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable testpilot
sudo systemctl start testpilot
sudo systemctl status testpilot
```

`status` 里应看到 **active (running)**。以后重启服务器，后端也会自动起来。

**常用命令：**

- 重启后端：`sudo systemctl restart testpilot`
- 查看日志：`sudo journalctl -u testpilot -f`

---

##### 2.7 配置 Nginx

**（1）把前端 dist 放到 Nginx 可用的目录（若还没放）**

例如：

```bash
sudo mkdir -p /var/www/testpilot
sudo cp -r /opt/testtool/frontend/dist /var/www/testpilot/
```

若你本机构建并上传的 dist 已在 `/var/www/testpilot/dist`，可跳过。

**（2）新建 Nginx 站点配置**

```bash
sudo nano /etc/nginx/sites-available/testpilot
```

**整段粘贴**下面内容，并**按注释修改两处**：`server_name` 和 `root` 的路径。

```nginx
server {
    listen 80;
    server_name 你的域名或服务器IP;   # 例如：testpilot.example.com 或 123.45.67.89

    # 前端静态文件（页面、JS、CSS）
    location / {
        root /var/www/testpilot/dist;   # 若 dist 在其他路径，改成实际路径
        try_files $uri $uri/ /index.html;
    }

    # 后端 API（登录、用例、执行等接口）
    location /api/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket（站内通知实时推送；不配则仅轮询，通知会延迟几秒）
    location /ws {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

保存退出。

**（3）启用站点并检查配置**

```bash
sudo ln -sf /etc/nginx/sites-available/testpilot /etc/nginx/sites-enabled/
sudo nginx -t
```

看到 `syntax is ok` 和 `test is successful` 后重载 Nginx：

```bash
sudo systemctl reload nginx
```

---

##### 2.8 放行端口与启动

- **80 端口**：Nginx 默认监听 80，云服务器需在**安全组/防火墙**里放行 **80**（和 443，若后面要 HTTPS）。
- 后端 8001 只对本机开放，无需对外放行。

确认 Nginx 和 TestPilot 服务都在运行：

```bash
sudo systemctl status nginx
sudo systemctl status testpilot
```

---

##### 2.9 验证访问

在浏览器打开：

- **有域名**：`http://你的域名`
- **无域名**：`http://你的服务器公网IP`

应能看到 TestPilot 登录页。默认账号 **admin**，密码 **admin123**。登录后建议立即在「个人资料」或「修改密码」中修改默认密码。

若打不开，可依次检查：

1. 云服务器安全组是否放行 80（和 443）。
2. 服务器本机：`curl -I http://127.0.0.1` 是否有 HTTP 响应。
3. 后端：`curl http://127.0.0.1:8001/api/health` 是否返回 JSON。

---

##### 2.10 可选：配置 HTTPS（推荐生产环境）

使用 Let's Encrypt 免费证书（以 Ubuntu/Debian 为例）：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d 你的域名
```

按提示输入邮箱、同意条款。成功后 Nginx 会自动改为监听 443 并配置证书。以后访问请用 **https://你的域名**。

---

##### 2.11 数据库与备份

- **默认数据库**：SQLite，文件在 **`/opt/testtool/backend/testplatform.db`**（路径随你部署目录变化）。
- **定期备份**：可直接复制该文件，或写定时任务：
  ```bash
  cp /opt/testtool/backend/testplatform.db /backup/testplatform_$(date +%Y%m%d).db
  ```
- 若要用 MySQL/PostgreSQL，需修改 **`backend/app/database.py`** 中的 **`DATABASE_URL`**，并安装对应驱动（如 `aiomysql`、`asyncpg`）。

---

##### 2.12 部署后常用维护（Linux）

| 需求 | 命令或操作 |
|------|------------|
| **重启后端** | `sudo systemctl restart testpilot` |
| **查看后端日志** | `sudo journalctl -u testpilot -f` |
| **忘记管理员密码** | `cd /opt/testtool/backend && source venv/bin/activate && python -m app.scripts.seed_admin`（会重置为 admin / admin123） |
| **更新代码后重启** | 拉取代码或上传新文件后，执行 `sudo systemctl restart testpilot`；若前端有更新，需重新 `npm run build` 并替换 `/var/www/testpilot/dist` |
| **释放 8001 端口** | 先 `sudo systemctl stop testpilot`，再 `sudo systemctl start testpilot`；若被其他进程占用，可用 `sudo lsof -i :8001` 查看后 `kill` 对应进程 |

---

#### Windows 服务器简要说明

若服务器是 **Windows**：

1. 安装 **Python 3.11+**、**Node.js 18+**，在项目目录装好前后端依赖；在 `frontend` 下执行 `npm run build` 得到 `dist`。
2. 后端可用 **NSSM** 或 **Windows 服务** 将 `uvicorn app.main:app --host 0.0.0.0 --port 8001` 注册为服务，或使用 **IIS + wfastcgi** 等方式。
3. 用 **IIS** 或 **Nginx for Windows** 托管 `dist`，并配置反向代理把 `/api`、`/ws` 转到 `http://127.0.0.1:8001`。
4. 维护操作（如重置 admin 密码）：在 backend 目录打开 cmd 执行 `python -m app.scripts.seed_admin`（会重置为 admin / admin123）。

---

#### 数据库（通用）

- 默认 **SQLite**，数据文件在 **`backend/testplatform.db`**，请定期备份。
- 若改用 **MySQL/PostgreSQL**，需修改 **`backend/app/database.py`** 里的 **`DATABASE_URL`**，并安装对应驱动（如 `aiomysql`、`asyncpg`），在 **`requirements.txt`** 中声明。

---

### 三、局域网部署（团队在同一 WiFi/局域网，用一台电脑当「服务器」）

**场景**：大家通过同一局域网内的一台电脑访问，例如 **http://192.168.1.100:3000**。

**要点**：后端和前端都要允许「来自局域网的访问」（监听 0.0.0.0），并在那台电脑上放行 3000、8001 端口。

#### 方式 A：开发模式（临时共享、调试用）

1. **在那台作为「服务器」的电脑上**启动后端（允许局域网访问）：
   ```bash
   cd backend
   python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
   ```

2. **同一台电脑上**再开一个窗口，启动前端（允许局域网访问）：
   ```bash
   cd frontend
   npx vite --port 3000 --host 0.0.0.0
   ```
   终端里会显示类似 **Network: http://192.168.1.100:3000**。同事在浏览器里用这个 **Network 地址**访问即可。

3. **防火墙**：在该电脑上放行 3000 和 8001 端口（Windows：高级防火墙 → 入站规则；Linux：`ufw allow 3000`、`ufw allow 8001`）。

注意：同事必须访问「运行后端的那台电脑」的 IP（如 192.168.1.100），不能只在自己电脑上开前端。

#### 方式 B：生产模式（推荐，更稳定）

在那台作为「服务器」的电脑上，按上面 [二、服务端部署](#二服务端部署) 做一遍：构建前端、部署后端、配置 Nginx。Nginx 的 `server_name` 可填该机局域网 IP（如 `192.168.1.100`）。同事通过 **http://192.168.1.100** 访问即可，无需每人本机都起服务。

---

### 四、Docker 部署（推荐，一键启动）

项目根目录提供了 `Dockerfile` 和 `docker-compose.yml`，可一键构建并启动前后端 + Nginx 反向代理。

**前提**：服务器/本机已安装 [Docker](https://docs.docker.com/get-docker/) 和 Docker Compose。

```bash
# 1. 设置 JWT 密钥（生产必须）
export JWT_SECRET=$(python3 -c "import secrets; print(secrets.token_urlsafe(48))")

# 2. 构建并启动
docker compose up -d --build

# 3. 访问
# http://localhost（Nginx 80 端口）或 http://localhost:8001（直接后端）
```

**常用命令**：

```bash
docker compose logs -f          # 查看日志
docker compose restart testpilot # 重启后端
docker compose down              # 停止并移除
```

数据库与上传文件通过 Docker Volume 持久化。如需备份数据库，可在容器内 `cp testplatform.db` 到挂载目录，或使用 `docker cp`。

---

### 生产部署检查清单

上线生产环境前，请逐条确认：

| # | 检查项 | 操作 |
|---|--------|------|
| 1 | **设置 JWT_SECRET** | `export JWT_SECRET=$(python3 -c "import secrets; print(secrets.token_urlsafe(48))")` — 不设置则使用默认值，任何人可伪造 Token |
| 2 | **限制 CORS 来源** | `export CORS_ORIGINS="https://your-domain.com"` — 不设置则允许所有来源 |
| 3 | **修改默认密码** | 首次登录后立即修改 admin 密码（使用默认密码登录时系统会弹出提醒） |
| 4 | **启用 HTTPS** | 通过 Nginx + Let's Encrypt 或云厂商证书配置 HTTPS |
| 5 | **备份数据库** | 定期备份 `testplatform.db`，或迁移至 MySQL/PostgreSQL |
| 6 | **配置日志级别** | `export LOG_LEVEL=WARNING`（生产减少日志量） |
| 7 | **放行必要端口** | 仅放行 80/443，后端 8001 不对外暴露（通过 Nginx 反代） |
| 8 | **审计日志** | 关键操作（密码修改、重置）已自动记录到 `audit_logs` 表 |

**环境变量一览**（均可选，有合理默认值）：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `JWT_SECRET` | JWT 签名密钥，**生产必须设置** | 内置默认值（不安全） |
| `JWT_EXPIRE_HOURS` | Token 有效期（小时） | `168`（7 天） |
| `CORS_ORIGINS` | 允许的前端域名，逗号分隔 | `*`（全部允许） |
| `DATABASE_URL` | 数据库连接串 | `sqlite+aiosqlite:///./testplatform.db` |
| `LOG_LEVEL` | 日志级别 | `INFO` |
| `FRONTEND_URL` | 前端地址（用于邮件中的链接） | 自动检测 |
| `RATE_LIMIT_EXECUTION` | 每用户每分钟最大执行次数 | `30` |
| `RATE_LIMIT_AI` | 每用户每分钟最大 AI 请求次数 | `20` |
| `LOGIN_MAX_FAILED` | 登录连续失败锁定阈值 | `5` |
| `LOGIN_LOCK_SECONDS` | 锁定时长（秒） | `900`（15 分钟） |

---

## 功能模块说明

| 模块 | 说明 |
|------|------|
| **仪表盘** | 项目/用例/执行统计、通过率、类型与优先级分布、近 7 日趋势、最近执行列表，支持点击跳转 |
| **用例管理** | 接口/Web/App/小程序四类用例；支持**分组**（按分组展开/折叠，从分组内进入编辑后返回列表会保持该分组展开）；类型、优先级、日期、关键词筛选，批量删除；每个分组及未分组均有 **「AI 生成用例」**；编辑页可单条执行。Web 步骤动作仅支持系统预定义动作，AI 或历史非标准动作会自动映射为系统动作 |
| **执行记录** | 历史执行列表，支持状态、所属项目、日期、用例名称关键词筛选；展示**环境**名称；详情含响应/断言/日志及执行环境；失败可 **「AI生成缺陷」**（指派可编辑），可删除 |
| **测试报告** | 按执行范围生成报告（范围可输入多个执行 ID 逗号分隔，留空则汇总最近 100 条）；通过/失败/错误统计；支持报告名称关键词、所属项目、日期筛选；可选 Allure HTML 报告；支持 **AI 分析报告** |
| **缺陷管理** | 新建/编辑/删除缺陷，讨论区、操作日志，指派与权限控制（指派可编辑），支持关键词、日期筛选；可从执行记录或日志查看的失败详情 **「AI生成缺陷」** 并带入关联信息；可选 Jira 推送与同步 |
| **日志查看** | 按执行维度展示请求/响应与断言日志，支持状态、所属项目、关键词、日期筛选，展开、复制、下载；支持 **AI 分析**；失败可 **「AI生成缺陷」**（指派可编辑） |
| **环境配置** | 按项目配置多环境：Base URL、环境变量（每行 key=value，可填地址等）、公共请求头，用例中 `{{变量名}}` 引用；与基础地址可一致或不同。编辑用例时所选「执行环境」可保存，再次打开会回显。支持日期筛选 |
| **项目管理** | 多项目，用例/环境/报告归属项目；**权限**：创建人为负责人，仅负责人或管理员可编辑/删除，负责人与成员可查看；支持日期筛选、编辑、删除 |
| **用户管理** | 管理员可创建用户、分配权限；支持登录账号/姓名/邮箱关键词、日期筛选 |
| **系统设置** | Jira 集成、SMTP 邮件、**AI 模型**（API Key 与模型配置；用于日志/报告分析、**AI生成缺陷**、**AI 生成用例**、**AI 答疑**） |
| **即时通讯** | 私聊、群聊；支持**发送图片/截图**（按钮选择或 Ctrl+V 粘贴）；群聊支持 **@ 提及成员**；**点击头像查看用户资料并发消息**；头像显示**姓氏**；消息通知机器人推送系统通知；用例/执行/报告/缺陷/日志等可**分享**至指定会话；**乐观更新**减少发送延迟 |
| **AI 答疑** | 独立 AI 对话页面，可新建会话、查看历史，与 AI 助手进行测试相关问答；**新回复红点提示**；需在系统设置配置 AI 模型 |
| **使用与部署** | 系统内「使用与部署」说明页，与本文档对应，含快速启动、推荐流程、各功能说明、部署与常见问题 |

---

## 即时通讯与 AI 答疑

### 即时通讯

- **入口**：左侧菜单「即时通讯」。
- **私聊**：点「私聊」搜索用户，选择后发起一对一对话。
- **群聊**：点「群聊」创建群组，填写群名并选择成员。
- **发送图片**：点击输入框旁的图片按钮选择图片文件，或使用 **Ctrl+V** 粘贴截图，自动上传并发送。
- **@ 提及**：在群聊输入框中输入 **@** 会弹出成员列表，可输入关键词筛选，点击成员即可插入 @ 提及，消息中会以标签形式高亮显示。
- **用户资料**：点击消息中的用户头像可查看对方资料（姓名、用户名），并提供「发消息」按钮快速发起私聊。
- **头像**：用户头像默认显示姓氏（中文取首字，英文取姓的首字母）。
- **分享**：用例管理、执行记录、日志查看、测试报告、缺陷管理等页面均有「分享」按钮，可将当前内容分享到即时通讯的指定会话；聊天记录支持分享至其他会话。从即时通讯内分享时使用预加载会话列表，减少延迟。
- **性能**：消息发送采用乐观更新，输入后立即显示，减少等待感。

### AI 答疑

- **入口**：左侧菜单「AI 答疑」。
- **功能**：与 AI 助手进行测试相关问答，会话自动保存，可查看历史会话列表。
- **新回复红点**：当 AI 生成回复成功时，侧边栏「AI 答疑」菜单项会显示红点提示，进入页面后自动清除。
- **配置**：需在「系统设置 → AI 模型」中配置提供商、模型名称、API Key；选「模拟演示」可体验流程但不调用真实接口。

---

## AI 功能说明

平台内置 AI 能力，用于**日志分析、测试报告分析、根据失败执行生成缺陷、根据需求描述生成测试用例与步骤**。**所有 AI 配置都在「系统设置 → AI 模型」里完成，保存后全局生效，全站共用。** 生成用例/步骤/缺陷时，若解析失败会返回兜底结果并提示 warnings，便于人工修改。

---

### 配置步骤（必读）

1. 使用**管理员账号**登录，点击左侧 **「系统设置」**，展开 **「AI 模型」**。
2. **提供商**：从下拉框选一种（见下表）。
3. **模型名称**：必须填写，按所选提供商填对应模型的英文名（见下表）。
4. **API Key（全局）**：除「模拟演示」外，**必须填写**。到对应平台申请 Key 后粘贴到此框；**留空 = 不修改已保存的 Key**（首次配置必须填）。
5. **API 接口地址（Base URL）**：只填**服务端网址**，不是 Key。按提供商决定是否必填（见下表）。
6. 点击 **「保存」**。之后日志分析、报告分析、生成缺陷、生成用例都会用这套配置。

---

### 各提供商填写规则（对照表）

| 提供商 | 模型名称（必填） | API Key（必填） | API 接口地址（Base URL） |
|--------|------------------|-----------------|---------------------------|
| **模拟演示** | 任意（不调用真实接口） | **不填** | **不填** |
| **OpenAI（GPT）** | 如 `gpt-4o-mini`、`gpt-4o` | 在 [OpenAI](https://platform.openai.com) 申请后粘贴 | **不填**（系统用官方地址） |
| **DeepSeek** | 如 `deepseek-chat`、`deepseek-reasoner` | 在 [DeepSeek 开放平台](https://platform.deepseek.com) 申请后粘贴 | **不填**（系统用官方地址） |
| **通义/阿里云** | 如 `qwen-turbo`、`qwen-plus` | 在阿里云控制台申请后粘贴 | **不填**（系统用官方地址） |
| **其他开放兼容接口** | 按该厂商文档填写 | 在该厂商处申请后粘贴 | **必填**，如 `https://api.xxx.com/v1` |

**说明**：

- **API Key** 与 **API 接口地址** 是两回事：Key 是密钥（一串字符），接口地址是网址（如 `https://api.deepseek.com/v1`）。Key 填在「API Key」框，网址填在「API 接口地址」框。
- 只有选「**其他开放兼容接口**」时，才必须在「API 接口地址」里填该厂商提供的完整接口网址；选 OpenAI / DeepSeek / 通义 时，该项**留空**即可。

---

### 环境变量（仅作备用，多数用户可忽略）

**正常使用请直接在「系统设置 → AI 模型」里填 API Key，无需配置环境变量。**

仅在以下情况才需要环境变量：无法在浏览器里保存 Key（例如用脚本/自动化部署、不允许在数据库存密钥的策略）。此时可在运行后端的机器上设置：

- 选 **OpenAI** 时：设置 `OPENAI_API_KEY=你的Key`
- 选 **DeepSeek / 通义 / 其他** 时：设置 `AI_API_KEY=你的Key`

系统会优先使用**系统设置里保存的 Key**；只有界面里没填时，才会读环境变量。

---

### 不想用真实 AI 时

在「提供商」里选 **「模拟演示」**，无需填 API Key 和接口地址。日志分析、报告分析、生成缺陷、生成用例仍可点，但返回的是固定说明文案，用于熟悉流程。

---

### 四个功能的入口（推荐使用顺序）

| 顺序 | 功能 | 操作路径 |
|------|------|----------|
| ① | 日志分析 | **日志查看** → 某条记录点 **「查看」** → 弹窗里点 **「AI 分析」** |
| ② | 报告分析 | **测试报告** → 某条报告点 **「查看」** → 在「平台报告」Tab 里点 **「AI 分析报告」** |
| ③ | AI生成缺陷 | **执行记录** 或 **日志查看** → 状态为「失败」或「错误」的记录点 **「查看」** → 弹窗里点 **「AI生成缺陷」** → 确认/编辑（含指派给）后点 **「保存为缺陷」** |
| ④ | AI 生成用例 | **用例管理** → 在任意分组或未分组上方点 **「AI 生成用例」** → 选择项目、测试类型、填写需求或接口说明 → 点 **「生成」** → 对每条建议点 **「添加」** 保存到用例列表 |

---

## 项目结构

```
testtool/
├── backend/                      # 后端（默认端口 8001）
│   ├── app/
│   │   ├── main.py               # FastAPI 入口、路由注册、健康检查
│   │   ├── config.py             # 集中配置（环境变量读取）
│   │   ├── logging_config.py     # 结构化日志配置
│   │   ├── rate_limiter.py       # 接口限流器
│   │   ├── audit.py              # 操作审计日志
│   │   ├── database.py           # 数据库连接与初始化
│   │   ├── db_utils.py           # 查询辅助（如 LIKE 通配符转义）
│   │   ├── models.py             # SQLAlchemy 模型（含 AuditLog）
│   │   ├── schemas.py            # Pydantic 模型
│   │   ├── routes/               # API 路由
│   │   └── services/             # 执行器、Allure、Jira 等
│   ├── requirements.txt
│   ├── seed.py                   # 示例数据
│   ├── start_backend.bat         # 仅启动后端（8001）
│   ├── 安装Web引擎依赖.bat        # 可选，Web UI 用例需执行一次
│   ├── 释放8001端口.bat           # 端口被占用时释放 8001
│   └── 清除浏览器驱动缓存.bat     # 驱动报错时清除缓存
├── frontend/                     # 前端（默认端口 3000）
│   ├── src/
│   │   ├── api/                  # API 封装（baseURL /api）
│   │   ├── components/           # 布局、通知、ErrorBoundary 等
│   │   ├── pages/                # 各功能页、使用与部署
│   │   └── contexts/             # 认证等
│   ├── vite.config.ts            # 代理 /api、/ws 到 8001
│   └── package.json
├── .github/workflows/ci.yml      # CI 流水线（lint + build + 依赖审计）
├── Dockerfile                    # 多阶段构建（前端 + 后端）
├── docker-compose.yml            # Docker 一键部署
├── docker/nginx.conf             # Nginx 反代配置模板
├── 一键启动.bat                   # 同时启动后端 + 前端（Windows）
└── README.md
```

---

## 后端脚本说明

项目仅保留以下主要脚本，其余操作请用命令行完成。

| 文件 | 作用 |
|------|------|
| **一键启动.bat**（根目录） | 同时启动后端 + 前端，推荐日常使用 |
| **start_backend.bat**（backend 目录） | 只启动后端，监听 8001（一键启动会调用它） |
| **安装Web引擎依赖.bat**（backend 目录） | 安装后端依赖（含 Selenium），需运行 Web UI 用例时执行一次 |
| **释放8001端口.bat**（backend 目录） | 结束占用 8001 端口的进程，端口被占用导致后端无法启动时双击运行 |
| **清除浏览器驱动缓存.bat**（backend 目录） | 清除 Web 驱动缓存，驱动报错或版本不匹配时双击运行后重启后端 |
| **seed.py** | 向后端写入示例项目、环境、用例等（需后端已启动）：`python seed.py` |

**其他常用操作（命令行）：**

- **释放 8001 端口**：可双击 `backend/释放8001端口.bat`；或手动在 backend 目录执行  
  `for /f "tokens=5" %a in ('netstat -ano ^| findstr ":8001" ^| findstr "LISTENING"') do taskkill /PID %a /F`  
  或在 PowerShell：`Get-NetTCPConnection -LocalPort 8001 -ErrorAction SilentlyContinue \| ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`
- **清除浏览器驱动缓存**（驱动版本不匹配时）：可双击 `backend/清除浏览器驱动缓存.bat`；或手动删除 `%USERPROFILE%\.wdm` 和 `%USERPROFILE%\.cache\selenium`，然后重启后端。
- **重置 admin 密码**：在 backend 目录执行 `python -m app.scripts.seed_admin`（会重置为 admin / admin123）。
- **指定 Edge 驱动路径**：先设置环境变量 `EDGE_DRIVER_PATH` 或在本机新建 `backend\.edge_driver_path` 写入驱动完整路径，再运行 `start_backend.bat`。

---

## 常见问题

**Q：双击「一键启动.bat」没反应或窗口一闪就关？**  
A：多半是没装 Python 或 Node.js，或没加入 PATH。请按 [环境准备](#环境准备) 安装 Python 3.11+ 和 Node.js 18+，安装时勾选「Add to PATH」。

**Q：浏览器打开 localhost:3000 打不开？**  
A：确认两个启动窗口（后端、前端）都没关。可试试 http://127.0.0.1:3000 。

**Q：页面里系统设置、仪表盘报「加载失败」或 404？**  
A：一定要用 **http://localhost:3000**（或 127.0.0.1:3000）访问前端，不要直接打开 8001。若仍 404，可在浏览器访问 http://localhost:8001/api/health 看是否有返回；若无，可能是 8001 被旧进程占用，可双击 `backend/释放8001端口.bat` 或按 [后端脚本说明](#后端脚本说明) 用命令行释放端口后再重新启动后端。

**Q：Web 用例报「Unable to obtain driver」或驱动版本不匹配？**  
A：先关掉后端，再双击 `backend/清除浏览器驱动缓存.bat`（或手动删除 **`%USERPROFILE%\.wdm`** 和 **`%USERPROFILE%\.cache\selenium`**），然后重新启动后端再试。若仍失败，可新建 `backend/.chrome_driver_path` 或 `.edge_driver_path`，内容写 chromedriver/msedgedriver 的完整路径，或设置环境变量 `CHROME_DRIVER_PATH` / `EDGE_DRIVER_PATH`。

**Q：怎么确认后端已经加载了最新代码？**  
A：浏览器访问 http://localhost:8001/api/health ，若返回里有 `version` 等字段，说明当前后端已正常加载。若无返回，可先双击 `backend/释放8001端口.bat` 或按 [后端脚本说明](#后端脚本说明) 释放端口后再重启后端。

**Q：怎么关掉 TestPilot？**  
A：关掉「一键启动」弹出的两个黑色窗口即可；若手动启动的，关掉对应两个终端窗口。

**Q：站内通知有延迟？**  
A：前端通过 WebSocket 收实时推送，并每 3 秒轮询未读数。若仍感觉延迟，请确认：1）使用 Nginx 时已配置 `/ws` 转发（见 [服务端部署](#二服务端部署正式环境多人通过域名或-ip-访问)）；2）网络/代理未阻断 WebSocket。

**Q：部署到 Linux 服务器后，用域名或 IP 打不开？**  
A：按顺序检查：1）云服务器**安全组/防火墙**是否放行 **80** 端口（HTTPS 则放行 443）；2）在服务器上执行 `sudo systemctl status nginx` 和 `sudo systemctl status testpilot`，确认均为 **active (running)**；3）在服务器上执行 `curl http://127.0.0.1:8001/api/health` 看是否有 JSON 返回；4）Nginx 配置里 `server_name` 和 `root` 路径是否与你的域名、dist 路径一致。完整步骤见 [Linux 服务器详细部署](#linux-服务器详细部署小白向)。

**Q：点「AI 分析」或「生成缺陷」等提示「未配置 API Key」？**  
A：说明当前未在系统设置里保存有效的 API Key。请用**管理员账号**登录 → **系统设置** → 展开 **AI 模型** → 将「提供商」选为 OpenAI / DeepSeek / 通义 之一 → 在「模型名称」和「API Key」中**按上表填写** → 点「保存」。若暂时不用真实 AI，可将「提供商」选为「模拟演示」，则无需填 Key。

**Q：报错「Model Not Exist」或「AI 调用失败」里含 invalid_request_error？**  
A：说明**模型名称**填错了，当前填的模型在该提供商下不存在。请到「系统设置 → AI 模型」修改「模型名称」为**该提供商官方文档中的模型 ID**，例如：OpenAI 用 `gpt-4o-mini`、DeepSeek 用 `deepseek-chat`、通义用 `qwen-turbo`。名称必须与平台一致，不能自编。

---

## 扩展指南

- **添加新测试类型**：在 `backend/app/models.py` 的 `TestType` 枚举中增加类型；在 `backend/app/services/` 中新增或修改执行器；在 `backend/app/routes/execution.py` 中按类型分发；在 `frontend/src/pages/CaseEditor.tsx` 中增加该类型的配置 UI。
- **切换数据库**：设置环境变量 `DATABASE_URL`（如 `mysql+aiomysql://user:pass@host/db` 或 `postgresql+asyncpg://...`），并安装对应驱动，在 `requirements.txt` 中声明。所有配置项集中在 `backend/app/config.py`。
- **调整限流阈值**：通过环境变量 `RATE_LIMIT_EXECUTION`、`RATE_LIMIT_AI` 调整每用户每分钟的执行/AI 请求上限；限流逻辑在 `backend/app/rate_limiter.py`。
- **扩展审计日志**：在需要记录的路由中调用 `from ..audit import log_audit`，参见 `auth.py` 中密码修改/重置的用法。审计记录存储在 `audit_logs` 表。

---

## CI/CD 流水线

项目在 `.github/workflows/ci.yml` 中提供了完整的 CI/CD 流水线：**检查阶段**每次 push/PR 自动运行，**部署阶段**仅在 push 到 main 且检查通过后执行。

### 整体流程

```
push / PR 到 main
       │
       ▼
  ┌──────────────────────────────────────┐
  │           检查阶段（并行）              │
  │  ┌────────────┐  ┌───────────────┐    │
  │  │ 后端 lint   │  │  前端 build   │    │
  │  │  + 测试    │  │  (tsc+vite)   │    │
  │  └─────┬──────┘  └──────┬────────┘    │
  │        │    ┌────────────┘             │
  │        │    │  ┌──────────────┐        │
  │        │    │  │ 依赖漏洞审计  │        │
  │        │    │  └──────────────┘        │
  └────────┼────┼──────────────────────────┘
           │    │
           ▼    ▼
    全部通过 且 是 push（非 PR）
           │
           ▼
  ┌──────────────────────┐
  │    部署阶段           │
  │  方案 A：SSH 部署     │
  │  方案 B：Docker 部署  │
  └──────────────────────┘
```

### 检查阶段（每次自动运行）

| Job | 做什么 | 何时算失败 |
|-----|--------|------------|
| **backend-lint-test** | Python 3.11 → ruff lint → pytest 测试 | 代码有语法/格式错误，或测试不通过 |
| **frontend-build** | Node 20 → npm install → TypeScript 类型检查 + vite build | 类型错误或构建失败 |
| **dependency-audit** | pip-audit + npm audit 扫描漏洞 | 仅报告，不阻塞 |

### 部署阶段（二选一，默认注释关闭，按需启用）

#### 方案 A：SSH 部署（裸机 / 虚拟机，不用 Docker）

**适用场景**：服务器上直接跑 Python + Nginx，按前面的 [Linux 服务端部署](#linux-服务器详细部署小白向) 搭建好的环境。

**工作原理**：CI 通过后 → SSH 到服务器 → `git pull` 拉最新代码 → 装依赖 → 重启后端服务 → 重新构建前端 → 替换 Nginx 静态文件 → reload Nginx。

**启用步骤**：

1. 在 GitHub 仓库页面 → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**，添加以下 4 个 Secret：

   | Secret 名称 | 填什么 | 示例 |
   |-------------|--------|------|
   | `DEPLOY_HOST` | 服务器公网 IP | `123.45.67.89` |
   | `DEPLOY_USER` | SSH 用户名 | `root` |
   | `DEPLOY_KEY` | SSH 私钥（整段粘贴，含 BEGIN/END 行） | 服务器的 `~/.ssh/id_rsa` 内容 |
   | `DEPLOY_PATH` | 项目在服务器上的路径 | `/opt/testtool` |

2. 编辑 `.github/workflows/ci.yml`，找到 `deploy-ssh` 部分，**去掉所有 `#` 注释符**。

3. 推送到 main 分支，CI 通过后会自动部署到服务器。

> **如何生成 SSH 密钥对**（若服务器还没有）：在服务器上执行 `ssh-keygen -t ed25519 -C "deploy"`，把公钥加到 `~/.ssh/authorized_keys`，私钥粘贴到 GitHub Secret `DEPLOY_KEY` 中。

#### 方案 B：Docker 部署（服务器装了 Docker）

**适用场景**：服务器已安装 Docker，用 `docker compose` 管理服务。

**工作原理**：CI 通过后 → SSH 到服务器 → `git pull` → `docker compose down` → `docker compose up -d --build` → 自动完成前端构建、后端打包、启动。

**启用步骤**：

1. 同方案 A，添加相同的 4 个 Secret（`DEPLOY_HOST`、`DEPLOY_USER`、`DEPLOY_KEY`、`DEPLOY_PATH`）。

2. 编辑 `.github/workflows/ci.yml`，找到 `deploy-docker` 部分，**去掉所有 `#` 注释符**。

3. 确保服务器上 `DEPLOY_PATH` 目录已 `git clone` 过项目，且有 `docker-compose.yml`。

### 如何启用 CI（首次推送到 GitHub）

```bash
# 1. 初始化 git（若尚未初始化）
cd 项目根目录
git init
git add .
git commit -m "initial commit"

# 2. 在 GitHub 新建仓库后关联并推送
git remote add origin https://github.com/你的用户名/testtool.git
git branch -M main
git push -u origin main
```

推送后打开 GitHub 仓库页 → 点顶部 **Actions** 标签 → 即可看到 CI 正在运行。

### 不用 GitHub 时在本地手动检查

```bash
# 后端 lint（需先 pip install ruff）
cd backend
ruff check app/ --select E,W,F --ignore E501

# 后端测试（在 backend/tests/ 下有测试时）
pytest tests/ -v

# 前端构建检查
cd frontend
npm run build

# 依赖漏洞扫描
pip install pip-audit
pip-audit -r backend/requirements.txt

cd frontend
npm audit --audit-level=high
```

### 后续扩展

- **添加后端测试**：在 `backend/tests/` 下新建 `test_*.py` 文件，pytest 会自动识别。CI 中已预置 pytest 步骤，当前无测试时不会报错。
- **添加前端测试**：可在 `frontend/package.json` 中添加 `vitest` 或 `jest`，并在 CI 中增加 `npm test` 步骤。
- **Docker 镜像仓库**：若需要通过镜像仓库（如 Docker Hub / 阿里云 ACR）分发，可在 CI 中增加 `docker build` → `docker push` 步骤，服务器上改为 `docker pull` + `docker compose up`。

---

## 技术栈（供参考）

以下为项目实际使用的技术与版本，便于二次开发或环境排查时对照。版本号以当前 `backend/requirements.txt` 与 `frontend/package.json` 为准，升级依赖后请以实际为准。

### 前端

| 技术 | 用途 | 说明 |
|------|------|------|
| **React 18** | 页面与组件 | 用于构建整站界面，包括用例管理、执行记录、报告、缺陷等页面。 |
| **TypeScript** | 类型与开发体验 | 前端代码使用 TS 编写，提供类型检查和更好 IDE 支持。 |
| **Ant Design 5** | UI 组件库 | 表格、表单、弹窗、导航等均基于 Ant Design；含图标与图表扩展。 |
| **Vite 5** | 构建与开发服务器 | 开发时提供热更新；打包生成静态资源，部署时由 Nginx 等托管。 |
| **React Router 6** | 路由 | 负责前端路由与页面跳转。 |
| **Axios** | HTTP 请求 | 所有与后端 `/api` 的请求均通过 Axios 发起。 |
| **dayjs** | 日期时间 | 日期展示、筛选与格式化。 |

开发时通过 Vite 代理将 `/api`、`/ws` 转发到后端（默认 8001），因此必须通过前端地址（如 http://localhost:3000）访问，不能直接访问后端端口做完整功能测试。

### 后端

| 技术 | 用途 | 说明 |
|------|------|------|
| **Python 3.11+** | 运行环境 | 后端为 Python 项目，需 3.11 或更高版本。 |
| **FastAPI** | Web 框架 | 提供 REST API、依赖注入、请求校验；所有业务接口均基于 FastAPI 编写。 |
| **Uvicorn** | ASGI 服务器 | 运行 FastAPI 应用，默认监听 8001。 |
| **SQLAlchemy 2.0** | ORM | 异步方式操作数据库，定义项目、用例、执行、缺陷等表与关系。 |
| **Pydantic v2** | 请求/响应模型 | 接口入参与出参的校验与序列化。 |
| **aiosqlite** | 数据库驱动 | 默认使用 SQLite 时的异步驱动，数据库文件为 `backend/testplatform.db`。 |
| **httpx** | HTTP 客户端 | **接口测试执行**：在平台内执行「接口类型」用例时，由后端使用 httpx 异步发请求并做断言，非 pytest。 |
| **python-jose + bcrypt** | 认证与密码 | JWT 签发与校验；密码存储使用 bcrypt 哈希。 |
| **WebSockets** | 实时推送 | 站内通知通过 WebSocket（`/ws/notifications`）推送到前端，需 Nginx 等正确转发 `/ws`。 |
| **openpyxl** | Excel 解析 | 数据驱动用例中上传的 Excel 文件由 openpyxl 读取。 |

可选或按需使用：**Allure**（allure-python-commons）用于生成测试报告；**SMTP** 相关由标准库与配置实现邮件通知。

### 数据库

| 技术 | 说明 |
|------|------|
| **SQLite** | 默认数据库，单文件 `testplatform.db`，无需单独安装服务，适合本机与小型部署。 |
| **MySQL / PostgreSQL** | 可通过修改 `backend/app/database.py` 的 `DATABASE_URL` 及安装对应驱动（如 aiomysql、asyncpg）扩展，用于生产或高并发场景。 |

### 测试执行引擎（平台内「执行」时使用）

| 测试类型 | 技术 | 说明 |
|----------|------|------|
| **接口测试** | httpx | 后端根据用例配置（方法、URL、头、体、断言）使用 httpx 发请求并校验状态码、JSON 路径、响应内容等。 |
| **Web UI 测试** | Selenium 4 + webdriver-manager | 使用 Selenium 驱动 Chrome 或 **Edge**（默认 Edge）；webdriver-manager 负责自动匹配与下载浏览器驱动。 |
| **App 测试** | Appium-Python-Client | 调用本机已启动的 Appium Server，与真机或模拟器通信执行步骤。 |
| **小程序测试** | 项目内执行器 | 使用项目自研的小程序自动化逻辑，依赖对应运行时环境。 |

上述执行均在平台内由后端完成，与用例管理、执行记录、报告、缺陷等模块一体；不依赖 pytest 或外部测试框架。

---

## 设计参考

- [MeterSphere](https://metersphere.io/) - 一站式开源持续测试平台  
- [Postman](https://www.postman.com/) - API 开发与协作  
- [Apifox](https://apifox.com/) - API 一体化协作平台  
