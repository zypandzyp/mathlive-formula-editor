# MathLive 公式编辑器 — 项目合并文档与技术报告


## 1. 项目定位与核心优势

本项目是基于 MathLive 的轻量级“类 MathType”公式编辑器，提供双模式输入、模板库、多格式导出与桌面端打包能力。核心优势如下：

- **双输入模式**：MathLive 所见即所得与 LaTeX 文本同步互通。
- **模板库**：多级分类、搜索、导入/导出、自动保存与文件绑定。
- **高效交互**：快捷键提交、轻量提示与即时预览。
- **性能优化**：虚拟列表、渲染监控、异步渲染与批量 DOM 更新。
- **跨平台桌面**：Tauri + Rust 后端，体积更小、启动更快、内存更低。
- **工程化完善**：TypeScript 全量迁移、清晰模块化与可维护结构。

## 2. 功能清单（最新实现）

- 公式编辑：WYSIWYG + LaTeX 双模式，编辑与渲染即时联动。
- 搜索与过滤：按公式 LaTeX 和备注实时检索。
- 模板库：多级分类、折叠树状结构、计数统计、模板插入与管理。
- 导出能力：LaTeX/Markdown/JSON；桌面端支持系统对话框。
- 复制能力：LaTeX 与 MathML 一键复制。
- 性能监控：FPS、渲染耗时、内存指标叠加层。
- 主题系统：多主题支持（以当前 UI 实现为准）。
- Tauri 命令：文件读写、对话框、导出、系统信息等。

## 3. 技术路线与架构

### 3.1 前端技术栈
- **Vite + TypeScript**：提升构建与类型安全能力。
- **MathLive**：核心公式编辑能力。
- **KaTeX 字体资源**：保障公式渲染一致性。

### 3.2 性能优化路线
- **虚拟列表**：公式数量 ≥ 50 时自动启用，仅渲染可视区域。
- **异步渲染**：Web Worker 渲染与批量渲染 API。
- **性能监控**：性能指标实时观察与渲染耗时预警。

### 3.3 桌面端路线（Tauri）
- **Rust 后端**：文件对话框、读写、导出与系统信息等命令。
- **WebView2**：Windows 原生 WebView 运行时。
- **打包产物**：NSIS 安装包（Windows）。

## 4. 项目结构（关键目录）

- src/：前端业务逻辑与样式
- src-tauri/：Rust 后端与 Tauri 配置
- dist/：生产构建输出
- template-library.sample.json：模板示例

## 5. 关键模块说明

- src/main.ts：主业务逻辑、模板树、导入导出、UI 事件管理
- src/autocomplete.ts：LaTeX 自动补全
- src/virtualList.ts：虚拟列表渲染
- src/performance.ts：性能监控叠加层
- src/worker.ts / src/workerManager.ts：异步渲染与批量渲染
- src/tauriApi.ts：Tauri 调用封装
- src-tauri/src/main.rs：Rust 命令入口
- src-tauri/tauri.conf.json：Tauri 配置与打包参数

## 6. 性能与规模（最新度量）

### 6.1 性能优化结果（基准）
- 公式数量 100：渲染耗时从 ~300ms 降至 ~25ms（约 12x）
- 公式数量 1000：渲染耗时从 ~5000ms 降至 ~35ms（约 142x）
- 虚拟列表内存复杂度：O(1) 级别（仅保留可视区域）

### 6.2 有效代码行数（当前统计）
- 统计范围：仓库内 *.ts、*.css、*.rs、*.html、*.json
- 排除目录：node_modules、dist、src-tauri/target
- 统计口径：**非空行数**
- 统计结果：**10266 行**（共 18 个文件）

> 注：该统计口径适用于“有效代码行数”的可复现衡量，具体明细可按需输出。

## 7. 构建与打包

### 7.1 开发与构建命令
- 开发：npm run dev
- Tauri 开发：npm run tauri:dev
- Tauri 生产构建：npm run tauri:build

### 7.2 Windows 安装包
- 目标：NSIS 安装包（exe）
- 输出目录：src-tauri/target/release/bundle/nsis/

## 8. 测试建议（摘录）

- 主题切换：检查持久化与 UI 一致性。
- 自动补全：\ 触发补全、键盘导航与插入。
- 虚拟列表：添加 ≥ 50 个公式，观察滚动与性能监控。
- 导入导出：JSON/LaTeX/Markdown 的完整流程测试。

## 9. 重要声明

本项目由 GitHub Copilot 协助完成，**约 90% 的工作量由 GitHub Copilot 承担**。若用于对外发布或答辩，请保留此声明。

## 10. 开源协议

本项目采用 MIT License，详情见 LICENSE 文件。

## 11. 代码注释与维护约定

- 关键流程（导入导出、模板树、性能优化）保留必要注释以便维护。
- 对公共 API、复杂算法与性能敏感路径应补充说明性注释。
- 变更应遵循“最小必要注释”原则：准确、简洁、可验证。

## 12. 原创与第三方声明

- 本项目核心业务逻辑与 UI 组织为原创实现。
- 依赖的第三方开源组件包括但不限于 MathLive、Tauri、Vite、KaTeX 等，其版权归原作者所有。
- 若二次分发或对外展示，请保留本项目与第三方依赖的版权与许可信息。
