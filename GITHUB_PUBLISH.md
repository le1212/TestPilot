# 将 TestPilot 推送到 GitHub 开源

本文档说明如何把本项目推送到 GitHub 并设为开源仓库。

---

## 一、前置准备

### 1. 安装 Git

- **Windows**：从 [Git 官网](https://git-scm.com/download/win) 下载并安装，安装时可选「Use Git from the Windows Command Prompt」以便在命令行使用。
- 安装完成后**重新打开** PowerShell 或 CMD，执行 `git --version` 确认安装成功。

### 2. 注册 GitHub 并登录

- 打开 [GitHub](https://github.com)，注册账号（若已有则直接登录）。
- 建议先配置 SSH 密钥或 Personal Access Token，便于推送（见下方「配置认证」）。

---

## 二、在 GitHub 上创建新仓库

1. 登录 GitHub，点击右上角 **+** → **New repository**。
2. 填写：
   - **Repository name**：例如 `TestPilot` 或 `testtool`。
   - **Description**（可选）：例如「可视化自动化测试平台」。
   - 选择 **Public**（公开 = 开源）。
   - **不要**勾选 "Add a README file"（本地已有项目）。
3. 点击 **Create repository**。创建后会看到仓库地址，例如：
   - HTTPS：`https://github.com/你的用户名/TestPilot.git`
   - SSH：`git@github.com:你的用户名/TestPilot.git`

---

## 三、在本地初始化 Git 并推送

在**项目根目录**（即包含 `README.md`、`backend`、`frontend` 的目录）打开 PowerShell 或 CMD，按顺序执行以下命令。

### 1. 初始化仓库（若尚未初始化）

```bash
git init
```

### 2. 添加所有文件

```bash
git add .
```

### 3. 首次提交

```bash
git commit -m "Initial commit: TestPilot 可视化自动化测试平台"
```

### 4. 设置主分支名称（可选，GitHub 默认主分支为 main）

```bash
git branch -M main
```

### 5. 添加远程仓库并推送

将下面的 `你的用户名/TestPilot` 替换为你实际的 GitHub 用户名和仓库名。

**使用 HTTPS：**

```bash
git remote add origin https://github.com/你的用户名/TestPilot.git
git push -u origin main
```

**使用 SSH：**

```bash
git remote add origin git@github.com:你的用户名/TestPilot.git
git push -u origin main
```

- 若使用 HTTPS，首次推送时可能要求输入 GitHub 用户名和密码；密码处需使用 **Personal Access Token**（见下节）。
- 若使用 SSH，需先在 GitHub 添加本机公钥（Settings → SSH and GPG keys）。

---

## 四、配置认证（推荐）

### 方式 A：Personal Access Token（HTTPS）

1. GitHub → 头像 → **Settings** → 左侧 **Developer settings** → **Personal access tokens** → **Tokens (classic)**。
2. **Generate new token**，勾选权限如 `repo`，生成后复制 token（只显示一次）。
3. 推送时「密码」处粘贴该 token，不要用登录密码。

### 方式 B：SSH 密钥

1. 本机生成密钥：`ssh-keygen -t ed25519 -C "你的邮箱"`（一路回车即可）。
2. 查看公钥：`cat ~/.ssh/id_ed25519.pub`（Windows 可在 `C:\Users\你的用户名\.ssh\` 下查看）。
3. GitHub → **Settings** → **SSH and GPG keys** → **New SSH key**，粘贴公钥并保存。
4. 使用 SSH 地址添加远程：`git remote add origin git@github.com:你的用户名/TestPilot.git`。

---

## 五、推送成功之后

- 在 GitHub 仓库页面可看到代码和 README。
- 可在 **Settings** → **General** 中修改仓库描述、添加 Topics（如 `testing`, `automation`）。
- 本仓库已包含 **LICENSE**（MIT），即已按 MIT 协议开源。

后续修改代码后，推送新内容：

```bash
git add .
git commit -m "描述本次修改"
git push
```

---

## 六、若已存在 .git（例如从别处克隆过）

若项目里已经有 `.git` 目录且想换一个 GitHub 仓库：

```bash
git remote remove origin
git remote add origin https://github.com/你的用户名/新仓库名.git
git push -u origin main
```

如有问题，可查看 [Git 官方文档](https://git-scm.com/doc) 或 [GitHub 帮助](https://docs.github.com)。
