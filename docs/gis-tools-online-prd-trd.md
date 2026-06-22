# GIS 在线工具集合 PRD/TRD

## 1. 文档元信息

| 项 | 内容 |
| --- | --- |
| 文档名称 | GIS 在线工具集合产品需求 PRD / 技术需求 TRD |
| 当前版本 | v1.0 |
| 作者 | Codex |
| 创建日期 | 2026-06-18 |
| 输入依据 | `docs/gis-tools-online-requirements-analysis.md`、当前前后端工程、用户补充需求 |
| 需求优先级 | P0：基础闭环；P1：核心专业能力；P2：增强能力 |
| 目标上线节奏 | P0：2-3 周；P1：4-6 周；P2：8-10 周 |
| 目标用户 | GIS 工具使用者，无角色权限区分 |
| 研发约束 | 基于现有 `gis-tools-frontend` 与 `gis-tools-backend` 两个工程演进 |
| 范围边界 | 不做用户体系；不做云端项目存储；后端只提供计算、转换、分析、数据库交互能力 |
| 交付对象 | 前端开发、后端开发、测试、后续 Codex 编码任务 |

## 2. 需求背景与业务目标

### 2.1 项目背景

| 项 | 内容 |
| --- | --- |
| 产品定位 | 浏览器端轻量 GIS 工具集合 |
| 当前基础 | 已具备地图浏览、PostGIS 连接、本地文件读取、Shapefile/GeoJSON 加载、CRS 处理、图层管理、样式面板、测量、截图、Mapshaper 简化处理 |
| 下一阶段问题 | 功能分散，缺少完整“导入-编辑-分析-可视化-导出”闭环 |
| 产品方向 | 提供常用 GIS 能力的 Web 工具台，不替代 QGIS/ArcGIS Pro |
| 核心原则 | 用户打开网页即可处理小中型 GIS 数据；大数据不强行同步处理 |

### 2.2 业务目标

| 目标 ID | 目标 | 量化指标 | 验收口径 |
| --- | --- | --- | --- |
| OBJ-01 | 完成 GIS 基础工作流闭环 | 用户可在 5 分钟内完成一次导入、预览、分析、导出 | 使用样例 Shapefile/GeoJSON 手工验收 |
| OBJ-02 | 提升数据导入覆盖率 | 支持 PostGIS、GeoJSON、Shapefile、CSV 坐标、CAD 首批 5 类入口 | 功能清单 P0/P1 对应项完成 |
| OBJ-03 | 提供轻量编辑能力 | 支持新建图层、绘制点线面、编辑属性、另存为图层 | 编辑用户故事全部通过 |
| OBJ-04 | 提供高频空间分析 | P0/P1 支持 Buffer、Intersect、Spatial Join、Merge、Feature Merge | 单元测试与样例数据验收 |
| OBJ-05 | 保证可快速部署 | 前后端本地一键启动；不依赖用户系统或云存储 | README/启动脚本可启动 |
| OBJ-06 | 降低误用风险 | CRS 缺失、格式错误、超限数据均有明确错误提示 | 错误场景测试全部通过 |

### 2.3 成功指标

| 指标类型 | 指标 | 目标值 |
| --- | --- | --- |
| 导入成功率 | 合法样例数据导入成功率 | >= 95% |
| 接口响应 | 普通 API p95 响应时间 | <= 1s |
| 前端交互 | 点击按钮到 UI 状态反馈时间 | <= 200ms |
| 分析处理 | 1 万点或 5000 面以内轻量分析耗时 | <= 1s，超过则提示使用后端/Mapshaper |
| 稳定性 | P0 功能阻塞级缺陷 | 0 |
| 兼容性 | Chrome/Edge 最新两个稳定版本 | 100% 通过核心用例 |
| 安全性 | 高危漏洞与明显注入风险 | 0 |

## 3. 范围边界

### 3.1 In Scope

| 范围 | 说明 |
| --- | --- |
| 数据导入 | PostGIS、本地 GeoJSON/Shapefile、CSV 坐标、CAD 文件导入 |
| 数据编辑 | 新建图层、绘制点线面、编辑几何、编辑属性、保存/另存为 |
| 空间分析 | Buffer、Spatial Join、Intersect、Clip、Merge、Feature Merge、Dissolve |
| 空间工具 | Fishnet 渔网、简单可达性分析 |
| 数据下载 | OSM 数据下载、高德 POI 下载 |
| 可视化分析 | 热力图、流线、聚合点、3D/Deck.gl 或 L7 可视化层 |
| 外链服务 | 常用在线 GIS 工具门户页面与分类入口 |
| 导出 | GeoJSON、Shapefile、CSV、PNG 截图，后续 KML/FlatGeobuf |
| 后端能力 | 格式转换、空间计算、PostGIS 读写、Mapshaper 处理 |

### 3.2 Out of Scope

| 范围 | 不做原因 |
| --- | --- |
| 用户注册登录 | 当前定位为无用户体系工具 |
| 云端项目存储 | 当前不做云存储，避免数据安全和运维复杂度 |
| 多人协作 | 需要用户、权限、项目空间，不在当前阶段 |
| 大规模栅格分析 | 超出现有技术栈和轻量 Web 工具定位 |
| 专业制图出版 | 首期只做实用截图和基础图例 |
| 任务队列系统 | P0 不做；如后续大文件处理需要再引入 |
| 任意外部 URL 后端代理 | 有 SSRF 风险；数据源 URL 已移除，外链只跳转 |

## 4. 需求分析

### 4.1 用户角色与核心痛点

| 角色 | 权限 | 核心场景 | 痛点 | 系统解决方式 |
| --- | --- | --- | --- | --- |
| GIS 工具使用者 | 无权限区分 | 快速查看、编辑、分析、导出 GIS 数据 | 桌面 GIS 重；在线工具分散；格式转换麻烦 | 提供浏览器端一站式工具台 |
| GIS 初学者 | 无权限区分 | 打开数据、确认坐标、做简单分析 | CRS 不理解；数据位置错；分析流程不清楚 | 导入向导、CRS 提示、工具参数校验 |
| GIS 数据工程/开发人员 | 无权限区分 | 调试 PostGIS、转换格式、检查字段 | 数据源调试分散；属性和几何质量检查不足 | PostGIS 面板、属性表、检查工具 |
| 业务人员 | 无权限区分 | 叠加图层、专题表达、截图汇报 | 制图能力弱；操作复杂 | 样式面板、可视化分析、高级截图 |

### 4.2 核心问题拆解

| 问题 ID | 问题 | 影响 | 对应功能 |
| --- | --- | --- | --- |
| P-01 | 数据格式入口不完整 | CSV/CAD 等常见数据不能进入工作台 | 数据导入增强 |
| P-02 | 只能查看，不能编辑 | 无法在线制作和修正数据 | 数据编辑 |
| P-03 | 分析能力不足 | 工具集合价值不明显 | 空间分析工具箱 |
| P-04 | 缺少下载型数据源 | 用户还需去其他平台找数据 | OSM/高德 POI 下载 |
| P-05 | 可视化表达弱 | 业务汇报能力不足 | 热力图、流线、聚合点、截图 |
| P-06 | 外部好工具分散 | 用户不知道去哪处理特定任务 | 外链服务门户 |
| P-07 | 性能和错误边界不清 | 大数据卡顿，错误不可定位 | 数据规模限制、明确错误、处理位置标识 |

## 5. 产品信息架构

| 一级模块 | 二级功能 | 入口位置 | 输出 |
| --- | --- | --- | --- |
| 地图工作台 | 图层列表、图层属性、样式、属性表、选择集 | 主页面左侧与浮动面板 | 当前地图状态 |
| 数据导入 | PostGIS、本地文件、CSV、CAD、上传到数据库 | 数据资源面板 | 新图层或数据库表 |
| 数据编辑 | 新建图层、绘制、编辑、保存、另存为 | 图层操作菜单/编辑工具栏 | 新图层或覆盖当前图层 |
| 空间分析 | Buffer、Spatial Join、Intersect、Clip、Merge、Dissolve | 工具箱 | 新结果图层 |
| 空间工具 | Fishnet、可达性分析、坐标转换 | 工具箱 | 新结果图层或报告 |
| 数据下载 | OSM、POI | 工具箱/数据下载页 | 新图层或导出文件 |
| 可视化分析 | 热力图、流线、聚合点、3D 渲染 | 图层样式/可视化页 | 可视化图层 |
| 外链服务 | 在线 GIS 工具分类门户 | 顶部导航/工具目录 | 外部页面打开 |

## 6. 完整用户故事与验收标准

| Story ID | 用户故事 | Given | When | Then |
| --- | --- | --- | --- | --- |
| US-001 | 作为工具使用者，我要导入 GeoJSON，以便快速查看数据 | 已在地图工作台 | 选择合法 `.geojson/.json` 文件 | 系统生成新图层，显示要素数、字段、BBox、CRS |
| US-002 | 作为工具使用者，我要导入 Shapefile，以便查看常见矢量数据 | 已选择 `.shp/.dbf/.prj` | 点击加载 | 系统按 DBF 编码读取属性，按 PRJ/用户指定 CRS 转成 EPSG:4326 |
| US-003 | 作为工具使用者，我要切换 Shapefile 编码，以便修正乱码 | 图层为 Shapefile | 在属性面板选择 UTF-8 或 GBK | 属性表刷新，不重复弹出 CRS 转换提示 |
| US-004 | 作为工具使用者，我要导入带坐标的 CSV，以便把表格点位变成图层 | CSV 包含经纬度或 X/Y 字段 | 选择 CSV 并指定坐标字段 | 系统生成点图层，无法识别坐标字段时阻止导入并提示 |
| US-005 | 作为工具使用者，我要导入 CAD，以便查看业务 CAD 数据 | 上传 DXF/DWG 文件 | 选择图层和坐标系 | 系统转换为可预览矢量图层；不支持的 CAD 版本给出错误 |
| US-006 | 作为工具使用者，我要连接 PostGIS，以便读取数据库空间表 | 输入连接参数 | 点击测试/保存 | 连接成功后显示空间表列表；失败显示数据库错误信息 |
| US-007 | 作为工具使用者，我要上传本地数据到 PostGIS，以便把成果入库 | 已有数据库连接 | 点击连接卡片的上传按钮并选择文件 | 系统创建/覆盖目标表，写入 `geom` 和 `properties`，刷新表列表 |
| US-008 | 作为工具使用者，我要查看图层属性表，以便检查字段和属性 | 已加载图层 | 打开属性页签 | 系统展示分页属性表，支持搜索、选择要素、导出选中要素 |
| US-009 | 作为工具使用者，我要调整点线面样式，以便区分图层 | 已选择图层 | 打开样式页签修改参数 | 点、线、面显示各自样式控件，地图即时更新 |
| US-010 | 作为工具使用者，我要拖拽图层顺序，以便控制叠加关系 | 图层列表包含底图和业务图层 | 拖拽业务图层 | 业务图层顺序改变，底图始终固定在最底层 |
| US-011 | 作为工具使用者，我要新建空图层，以便在线采集数据 | 打开编辑工具 | 选择点/线/面和字段模板 | 系统创建空图层并进入编辑状态 |
| US-012 | 作为工具使用者，我要绘制点线面，以便制作临时数据 | 图层处于编辑状态 | 在地图上绘制几何 | 系统新增要素，属性表出现新记录 |
| US-013 | 作为工具使用者，我要编辑要素属性，以便修正字段值 | 已选择一个要素 | 修改属性表单并保存 | 图层数据更新，地图不丢失该要素选择状态 |
| US-014 | 作为工具使用者，我要编辑要素几何，以便修正边界或位置 | 已选择一个要素 | 拖动节点或移动几何 | 几何更新，可撤销；无效几何阻止保存 |
| US-015 | 作为工具使用者，我要另存编辑后的图层，以便保留原始数据 | 当前图层存在编辑变更 | 点击另存为 | 系统生成新图层，原图层不变 |
| US-016 | 作为工具使用者，我要生成缓冲区，以便做影响范围分析 | 已选择点/线/面图层 | 输入距离和单位并运行 | 系统生成缓冲区结果图层，参数非法时不运行 |
| US-017 | 作为工具使用者，我要做空间连接，以便把面属性赋给点 | 已有目标图层和连接图层 | 选择连接关系并运行 | 系统生成带合并属性的新图层 |
| US-018 | 作为工具使用者，我要做图层求交，以便获得重叠区域 | 已有两个图层且至少一个为面 | 点击 Intersect | 系统生成交集图层，并保留字段来源前缀 |
| US-019 | 作为工具使用者，我要合并多个图层，以便整理同类型数据 | 已选择多个同类型图层 | 点击图层合并 | 系统生成追加合并图层；字段冲突按规则保留 |
| US-020 | 作为工具使用者，我要合并多个要素，以便得到单个范围 | 已选择多个面要素 | 点击要素合并 | 系统生成单个或少量融合要素，属性按规则聚合 |
| US-021 | 作为工具使用者，我要生成渔网，以便做分区统计 | 已设置范围、行列或网格大小 | 点击生成 | 系统生成面网格图层，每个格网有唯一 ID |
| US-022 | 作为工具使用者，我要做简单可达性分析，以便估算服务范围 | 已有起点和道路/距离参数 | 点击运行 | 系统生成可达范围图层；缺少参数时提示 |
| US-023 | 作为工具使用者，我要下载 OSM 数据，以便获取基础地理数据 | 已设置范围和要素类型 | 点击下载 | 系统请求 OSM 数据并生成图层；超范围时拒绝 |
| US-024 | 作为工具使用者，我要下载高德 POI，以便获取兴趣点 | 已输入关键词、城市或范围、Key | 点击下载 | 系统生成 POI 点图层；API 错误原样提示 |
| US-025 | 作为工具使用者，我要制作热力图，以便观察点密度 | 已选择点图层 | 选择热力图样式 | 地图新增热力渲染层，不改变原始数据 |
| US-026 | 作为工具使用者，我要制作流线图，以便展示 OD 流动 | 已有起终点字段 | 配置起点/终点字段并运行 | 地图显示流线效果，字段缺失时提示 |
| US-027 | 作为工具使用者，我要查看外链工具门户，以便快速进入外部 GIS 工具 | 打开外链服务页 | 点击工具分类或工具卡片 | 系统新窗口打开外部工具，并记录点击指标 |
| US-028 | 作为工具使用者，我要导出结果图层，以便给其他软件使用 | 已有结果图层 | 选择导出格式并确认 | 系统下载文件；不支持格式显示原因 |

## 7. 功能清单

| ID | 名称 | 描述 | 优先级 | 归属角色 | 前端入口 | 后端能力 |
| --- | --- | --- | --- | --- | --- | --- |
| F-DI-001 | GeoJSON/Shapefile 导入 | 支持本地文件加载、CRS 识别、属性编码切换 | P0 | 工具使用者 | 数据资源/本地文件夹 | 文件读取、CRS 转换 |
| F-DI-002 | CSV 坐标导入 | 选择经纬度或 X/Y 字段，生成点图层 | P0 | 工具使用者 | 数据导入弹窗 | 可前端实现；大文件可后端解析 |
| F-DI-003 | CAD 导入 | 支持 DXF 首期，DWG 视依赖确认 | P1 | 工具使用者 | 数据导入弹窗 | 文件转换服务 |
| F-DI-004 | PostGIS 连接 | 测试、保存、列出空间表、读取 GeoJSON | P0 | 工具使用者 | 数据库连接 | `pg` + PostGIS |
| F-DI-005 | 上传到 PostGIS | 本地 GeoJSON/Shapefile 上传成数据库空间表 | P0 | 工具使用者 | 连接卡片上传按钮 | 建表、写入 `geom/properties` |
| F-DI-006 | 导入向导 | 展示格式、大小、字段、CRS、BBox、要素数 | P0 | 工具使用者 | 导入流程 | 元数据解析 |
| F-EDIT-001 | 新建图层 | 新建点/线/面空图层，定义字段 | P0 | 工具使用者 | 编辑工具栏 | 无 |
| F-EDIT-002 | 新增要素 | 绘制点线面并录入属性 | P0 | 工具使用者 | 地图编辑模式 | 无 |
| F-EDIT-003 | 几何编辑 | 节点编辑、移动、删除几何 | P1 | 工具使用者 | 地图编辑模式 | 可前端实现 |
| F-EDIT-004 | 属性编辑 | 表单或属性表内编辑字段值 | P0 | 工具使用者 | 属性面板 | 无 |
| F-EDIT-005 | 保存/另存为 | 保存为新图层或导出文件；可上传到 PostGIS | P0 | 工具使用者 | 图层菜单 | PostGIS 写入 |
| F-AN-001 | Buffer 缓冲区 | 点线面缓冲，支持距离、单位、融合 | P0 | 工具使用者 | 空间分析工具箱 | Turf/后端 |
| F-AN-002 | Spatial Join 空间连接 | 按 contains/intersects/within 连接属性 | P1 | 工具使用者 | 空间分析工具箱 | Turf/PostGIS |
| F-AN-003 | Intersect 求交 | 两图层叠加求交，输出新图层 | P1 | 工具使用者 | 空间分析工具箱 | Mapshaper/PostGIS |
| F-AN-004 | Clip 裁剪 | 用面图层裁剪目标图层 | P1 | 工具使用者 | 空间分析工具箱 | Mapshaper/PostGIS |
| F-AN-005 | Merge 图层合并 | 多图层追加合并 | P1 | 工具使用者 | 空间分析工具箱 | 前端/后端 |
| F-AN-006 | Feature Merge 要素合并 | 选择多个要素融合为单个要素 | P1 | 工具使用者 | 选择集工具 | Turf/Mapshaper |
| F-AN-007 | Dissolve 按字段融合 | 按字段分组融合面要素 | P2 | 工具使用者 | 空间分析工具箱 | Mapshaper/PostGIS |
| F-TOOL-001 | Fishnet 渔网 | 按范围、网格大小、行列生成格网 | P1 | 工具使用者 | 空间工具 | Turf/后端 |
| F-TOOL-002 | 可达性分析 | 基于距离/时间阈值生成服务范围 | P2 | 工具使用者 | 空间工具 | 后端计算 |
| F-DL-001 | OSM 数据下载 | 按范围和类型下载 OSM 要素 | P1 | 工具使用者 | 数据下载 | Overpass 请求 |
| F-DL-002 | 高德 POI 下载 | 按关键词、城市、范围下载 POI | P1 | 工具使用者 | 数据下载 | 高德 API 请求 |
| F-VIS-001 | 热力图 | 点图层生成热力渲染 | P1 | 工具使用者 | 可视化面板 | 无 |
| F-VIS-002 | 流线图 | 起终点字段生成流线渲染 | P2 | 工具使用者 | 可视化面板 | 可选后端聚合 |
| F-VIS-003 | 聚合点/蜂窝 | 大量点聚合展示 | P1 | 工具使用者 | 可视化面板 | 可选后端聚合 |
| F-EXT-001 | 外链服务门户 | GIS 工具链接分类、搜索、打开 | P2 | 工具使用者 | 顶部导航 | 静态 JSON |
| F-EXP-001 | 图层导出 | GeoJSON/Shapefile/CSV/PNG 导出 | P0 | 工具使用者 | 图层菜单 | 文件生成 |

## 8. 技术需求 TRD

### 8.1 现有技术栈

| 层 | 技术 | 当前用途 |
| --- | --- | --- |
| 前端 | Vue 3 + Vite | 单页应用 |
| 地图 | Mapbox GL JS | 地图渲染、图层展示、交互 |
| 空间计算 | Turf.js | 面积、长度、轻量空间分析 |
| CRS | proj4 | 坐标转换 |
| 文件 | shapefile | 浏览器/后端 Shapefile 读取 |
| 后端 | Node.js + Express | API 服务 |
| 数据库 | PostgreSQL/PostGIS + pg | 空间表读取、上传入库 |
| 数据处理 | mapshaper | 简化、格式转换、拓扑处理 |

### 8.2 目标架构

| 模块 | 前端职责 | 后端职责 | 输出 |
| --- | --- | --- | --- |
| 图层中心 | 统一管理图层、样式、选择集、编辑状态 | 无 | 图层状态 |
| 数据导入 | 文件选择、参数表单、预览、CRS 提示 | 文件解析、格式转换、PostGIS 写入 | 新图层/新表 |
| 编辑器 | 绘制、节点编辑、属性编辑、撤销重做 | 可选保存入库 | 新图层/更新图层 |
| 分析工具箱 | 参数校验、工具 UI、结果上图 | 复杂分析、Mapshaper/PostGIS 处理 | 结果图层 |
| 数据下载 | 参数输入、范围选择、进度展示 | 调外部 API、格式转换 | 新图层/文件 |
| 可视化 | Deck.gl/L7/Mapbox 图层配置 | 可选聚合 | 可视化图层 |
| 外链门户 | 分类、搜索、跳转、点击统计 | 静态配置接口 | 外部链接 |

### 8.3 统一图层数据模型

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | string | 是 | 前端图层唯一 ID |
| sourceKey | string | 是 | 数据来源去重 Key |
| name | string | 是 | 图层名称 |
| kind | `geojson/basemap/visual` | 是 | 图层类型 |
| sourceKind | string | 是 | `file/postgis/upload/edit/analysis/download/visual/basemap` |
| visible | boolean | 是 | 是否可见 |
| crs | string | 是 | 当前地图 CRS，默认 `EPSG:4326` |
| sourceCrs | string | 否 | 原始 CRS |
| needsTransform | boolean | 否 | 是否发生坐标转换 |
| geometryType | string | 是 | `POINT/LINE/POLYGON/MIXED/GEOMETRY` |
| featureCount | number | 是 | 要素数量 |
| fields | array | 否 | 字段元数据 |
| bbox | array | 否 | `[minX,minY,maxX,maxY]` |
| geojson | FeatureCollection | 条件 | 矢量数据 |
| style | object | 是 | 点线面样式配置 |
| editState | object | 否 | 编辑状态、脏标记 |
| notices | array | 否 | CRS、截断、转换提示 |

### 8.4 后端接口需求

| API ID | Method | Path | 描述 | 请求 | 响应 | 性能 |
| --- | --- | --- | --- | --- | --- | --- |
| API-DB-001 | POST | `/api/database/test` | 测试 PostGIS 连接 | host/port/database/username/password | success/message | p95 <= 1s |
| API-DB-002 | POST | `/api/database` | 保存运行态连接 | 连接参数 | connection | p95 <= 1s |
| API-DB-003 | GET | `/api/database/:id/tables` | 列出空间表 | connectionId | table[] | p95 <= 1s |
| API-DB-004 | GET | `/api/database/:id/tables/:schema/:table/geojson` | 读取空间表 | geometryColumn | GeoJSON + notices | p95 <= 1s 或限制返回 |
| API-DB-005 | POST | `/api/database/:id/upload` | 上传 GeoJSON 入库 | schema/tableName/replace/geojson | inserted/fullName | p95 <= 1s；超限拒绝 |
| API-FILE-001 | GET | `/api/files` | 读取服务器目录文件 | path | file[] | p95 <= 1s |
| API-FILE-002 | GET | `/api/files/geojson` | 文件转 GeoJSON | path/sourceCrs/encoding | GeoJSON + notices | p95 <= 1s；超限拒绝 |
| API-AN-001 | POST | `/api/analysis/buffer` | 缓冲区 | layer/distance/unit/dissolve | GeoJSON | p95 <= 1s |
| API-AN-002 | POST | `/api/analysis/intersect` | 求交 | inputLayer/overlayLayer | GeoJSON | p95 <= 1s 或 413 |
| API-AN-003 | POST | `/api/analysis/spatial-join` | 空间连接 | target/join/predicate | GeoJSON | p95 <= 1s 或 413 |
| API-AN-004 | POST | `/api/analysis/merge` | 图层合并 | layers[] | GeoJSON | p95 <= 1s |
| API-AN-005 | POST | `/api/analysis/fishnet` | 生成渔网 | bbox/cellSize/rows/cols | GeoJSON | p95 <= 1s |
| API-DL-001 | POST | `/api/download/osm` | OSM 下载 | bbox/tags | GeoJSON | p95 <= 1s 返回结果或错误 |
| API-DL-002 | POST | `/api/download/amap-poi` | 高德 POI 下载 | key/keyword/city/bbox/page | GeoJSON | p95 <= 1s |
| API-EXT-001 | GET | `/api/portal-tools` | 外链工具列表 | 无 | category[] | p95 <= 1s |

### 8.5 数据表/存储设计

| 存储对象 | 位置 | 表/Key | 字段 | 说明 |
| --- | --- | --- | --- | --- |
| PostGIS 连接 | 浏览器 localStorage | `gis-tools.postgisConnections.v1` | name/host/port/database/username/password | 当前已存在；提示本机保存风险 |
| 自定义底图 | 浏览器 localStorage | `gis-tools.customBasemaps.v1` | name/basemapType/url | 当前已存在 |
| 本地文件夹 | 浏览器 localStorage + IndexedDB | `gis-tools.localFolders.v1` / handles | name/path/mode/handle | 当前已存在 |
| 高德 POI Key | 浏览器 localStorage | `gis-tools.amapPoiKey.v1` | key | 用户本地保存；下次打开自动读取；读取不到才要求输入 |
| 上传入库表 | 用户 PostGIS | `public.<tableName>` | `id BIGSERIAL`, `properties JSONB`, `geom geometry(Geometry,4326)` | 已有接口基础，可继续优化字段展开 |
| 编辑图层 | 前端内存 | layer model | geojson/editState/style | 不云存储 |
| 项目配置 | 本地 JSON 文件 | 无固定表 | view/layers/styles/sources | P2 支持导入导出 |
| 外链工具 | 静态 JSON | `portal-tools.json` | id/category/name/url/description/tags | 不需要数据库 |
| 埋点事件 | 可选本地日志/后端轻量接口 | `analytics_event` | eventName/module/duration/status/featureCount | 不记录几何和属性 |

### 8.6 前端交互要求

| 交互 | 要求 |
| --- | --- |
| 工具运行 | 点击后 200ms 内显示 loading；完成后自动新增结果图层 |
| 参数校验 | 必填图层、距离、字段、格式、CRS 在运行前校验 |
| 输出命名 | 默认 `{输入图层名}_{工具名}_{时间}`，允许用户修改 |
| 错误提示 | 显示错误原因和修复建议；不得只显示 `Error` |
| CRS 提示 | 缺失 CRS 时必须让用户指定；切编码等刷新操作不得重复弹转换提示 |
| 图层排序 | 底图固定最底层；业务图层可自由拖拽 |
| 大数据 | 超过限制时显示“数据过大，建议使用 Mapshaper/后端处理” |
| 弹窗 | 可 Esc/关闭按钮关闭；运行中禁止关闭或明确确认 |

## 9. 非功能性需求

| 类别 | ID | 需求 | 验收标准 |
| --- | --- | --- | --- |
| 性能 | NFR-PERF-001 | 普通接口响应 1s 内 | `/health`、列表、元数据、参数校验接口 p95 <= 1s |
| 性能 | NFR-PERF-002 | 前端不阻塞 | 运行超过 500ms 的前端分析进入 Web Worker 或显示进度 |
| 性能 | NFR-PERF-003 | 数据规模限制 | 单次同步处理默认 <= 10MB 或 <= 50000 要素，超限拒绝 |
| 稳定性 | NFR-STAB-001 | API 错误结构统一 | `{ error, code?, detail? }` |
| 稳定性 | NFR-STAB-002 | 工具失败不破坏已有图层 | 失败后原图层、选择集、样式保持不变 |
| 安全 | NFR-SEC-001 | SQL 注入防护 | 表名/字段名 quoteIdent，值使用参数化查询 |
| 安全 | NFR-SEC-002 | 文件访问限制 | 服务器路径读取需限制白名单目录或明确部署配置 |
| 安全 | NFR-SEC-003 | 外部 API 防护 | 不做任意 URL 后端代理；OSM/高德接口限制目标域 |
| 安全 | NFR-SEC-004 | 敏感信息 | 埋点、导出项目 JSON 不包含数据库密码；高德 POI Key 仅允许保存在用户浏览器 localStorage，不上传到后端持久化 |
| 兼容性 | NFR-COMP-001 | 浏览器 | Chrome/Edge 最新两个稳定版本 |
| 兼容性 | NFR-COMP-002 | 数据格式 | GeoJSON、Shapefile、CSV 坐标、DXF 首期样例通过 |
| 部署 | NFR-DEP-001 | 快速启动 | 前端 `npm run dev`，后端 `npm run start` 可启动 |
| 可测试 | NFR-TEST-001 | 单元测试覆盖 | P0 工具核心函数覆盖率 >= 70% |
| 埋点 | NFR-MET-001 | 工具使用指标 | 记录工具 ID、耗时、状态、输入要素数、输出要素数 |
| 埋点 | NFR-MET-002 | 隐私保护 | 不记录坐标、属性字段值、数据库密码、本地文件路径明文 |

## 10. 埋点指标

| 事件名 | 触发时机 | 属性 | 不允许记录 |
| --- | --- | --- | --- |
| `data_import_started` | 用户开始导入 | sourceKind/fileType/fileSizeBucket | 文件路径、文件内容 |
| `data_import_succeeded` | 导入成功 | featureCount/geometryType/durationMs | 属性值、坐标 |
| `data_import_failed` | 导入失败 | code/fileType/durationMs | 文件内容 |
| `analysis_started` | 工具运行 | toolId/inputLayerCount/inputFeatureBucket | 几何内容 |
| `analysis_succeeded` | 工具成功 | toolId/outputFeatureCount/durationMs | 属性值 |
| `analysis_failed` | 工具失败 | toolId/errorCode/durationMs | 原始错误堆栈中的敏感信息 |
| `edit_saved` | 保存编辑 | geometryType/featureCount/changeCount | 属性值 |
| `download_started` | 下载数据 | provider/queryType/bboxSizeBucket/hasLocalKey | API Key 明文 |
| `visualization_created` | 创建可视化 | visType/layerFeatureBucket | 坐标和属性 |
| `portal_link_clicked` | 点击外链 | toolId/category | 用户来源 URL |

## 11. 测试需求

### 11.1 单元测试矩阵

| 测试 ID | 模块 | 测试对象 | 输入 | 期望 |
| --- | --- | --- | --- | --- |
| UT-001 | CRS | `normalizeCrs` | `4326/EPSG:3857/空值` | 输出规范 CRS 或 null |
| UT-002 | 导入 | GeoJSON 解析 | 合法/非法 FeatureCollection | 合法成功，非法报错 |
| UT-003 | 导入 | Shapefile 编码 | UTF-8/GBK 样例 | 属性不乱码 |
| UT-004 | CSV | 坐标字段识别 | lng/lat、x/y、中文字段 | 正确识别或要求用户指定 |
| UT-005 | 编辑 | 新增要素 | 点线面绘制结果 | GeoJSON 要素合法 |
| UT-006 | 分析 | Buffer | 点/线/面 + 距离 | 输出 Polygon/MultiPolygon |
| UT-007 | 分析 | Spatial Join | 点层 + 面层 | 点属性包含面字段 |
| UT-008 | 分析 | Intersect | 两个面 | 输出交集区域 |
| UT-009 | 数据库 | `normalizeIdent` | 特殊字符表名 | 输出安全表名 |
| UT-010 | 数据库 | 上传入库 | FeatureCollection | 插入数量正确 |
| UT-011 | 样式 | 点线面控件 | geometryType 不同 | 展示对应控件 |
| UT-012 | 图层 | 拖拽排序 | 底图 + 多业务图层 | 底图始终最后 |

### 11.2 接口测试矩阵

| 测试 ID | API | 场景 | 期望 |
| --- | --- | --- | --- |
| API-T-001 | `/api/database/test` | 正确连接 | `success=true` |
| API-T-002 | `/api/database/test` | 错误密码 | `success=false` 且有 message |
| API-T-003 | `/api/database/:id/tables` | 有空间表 | 返回表数组 |
| API-T-004 | `/api/database/:id/upload` | 合法 GeoJSON | 返回 inserted > 0 |
| API-T-005 | `/api/database/:id/upload` | 同名表且 replace=false | 409 |
| API-T-006 | `/api/files/geojson` | CRS 缺失且未传 sourceCrs | 409 `CRS_MISSING` |
| API-T-007 | `/api/analysis/buffer` | 距离 <= 0 | 400 |
| API-T-008 | `/api/download/amap-poi` | 缺少 Key | 400 |

### 11.3 端到端测试矩阵

| 测试 ID | 流程 | 步骤 | 期望 |
| --- | --- | --- | --- |
| E2E-001 | 本地文件闭环 | 导入 Shapefile -> 查看属性 -> 修改样式 -> 导出 GeoJSON | 文件下载成功 |
| E2E-002 | 数据库闭环 | 连接 PostGIS -> 上传 GeoJSON -> 刷新表 -> 加载表图层 | 地图显示上传图层 |
| E2E-003 | 编辑闭环 | 新建面图层 -> 绘制要素 -> 编辑属性 -> 另存为 | 新图层生成 |
| E2E-004 | 分析闭环 | 导入点 -> Buffer -> 输出图层 -> 导出 | 输出为面图层 |
| E2E-005 | 下载闭环 | 设置范围 -> 下载 POI -> 热力图 | 地图显示热力图 |
| E2E-006 | 外链门户 | 打开外链服务 -> 搜索 Mapshaper -> 点击 | 新窗口打开 |

## 12. 风险与依赖

| 风险 ID | 风险 | 影响 | 缓解策略 | 优先级 |
| --- | --- | --- | --- | --- |
| RISK-001 | Turf 对复杂面叠加不稳定 | Intersect/Union 结果异常 | 复杂叠加优先后端 Mapshaper/PostGIS | P0 |
| RISK-002 | CAD/DWG 解析依赖不确定 | CAD 导入延期 | P1 首期只支持 DXF，DWG 后续按依赖可用性评估 | P1 |
| RISK-003 | 大文件导致浏览器卡顿 | 用户体验差 | 限制大小、Web Worker、后端处理 | P0 |
| RISK-004 | PostGIS 写入表结构过于简单 | 属性查询不方便 | P0 用 JSONB；P1 支持字段展开 |
| RISK-005 | 高德 POI Key 管理 | Key 泄露或额度问题 | Key 仅存用户浏览器 localStorage；默认自动读取；后端不持久化、不记录、不进埋点 | P1 |
| RISK-006 | OSM Overpass 限流 | 下载失败 | 限制 bbox 和要素类型；错误透传 | P1 |
| RISK-007 | CRS 识别不全 | 数据位置错误 | CRS 缺失必须用户确认；保留 notices | P0 |
| RISK-008 | 无用户体系下连接安全 | 本地密码泄露风险 | 明确提示，仅本机使用；后续可加会话连接 | P0 |

## 13. 已确认产品/技术决策

| ID | 决策项 | 已确认方案 | 影响 |
| --- | --- | --- | --- |
| D-001 | CAD 首期是否必须支持 DWG | 首期只支持 DXF，DWG 后续按依赖可用性评估 | 控制 CAD 导入复杂度 |
| D-002 | CSV 坐标是否支持投影坐标 | 支持，经用户指定 CRS 后转 EPSG:4326 | 导入向导必须包含 CRS 输入/解析 |
| D-003 | 上传 PostGIS 是否展开属性字段 | P0 仅 `properties JSONB`，P1 支持字段展开 | P0 入库快，P1 再提升查询体验 |
| D-004 | OSM 下载是否通过后端代理 | 是，限制 Overpass 域名、bbox 面积和要素类型 | 降低 SSRF 与滥用风险 |
| D-005 | 高德 POI Key 是否保存 | 保存到用户浏览器 localStorage；下次打开默认读取；读取不到才要求输入；后端不持久化、不记录 | 减少重复输入，同时控制泄露面 |
| D-006 | 可达性分析算法范围 | P2 先做距离缓冲/简化网络，不做完整路网引擎 | 控制算法和数据依赖复杂度 |
| D-007 | 是否引入统一图层 store | P0 重构为 Pinia 图层 store | 降低工具箱、编辑、样式、导出之间的状态耦合 |
| D-008 | P0 是否恢复独立 Buffer 面板 | 是，放入空间分析模块，不放图层属性面板 | 保持图层属性面板聚焦查看和样式 |

## 14. 迭代计划

| 阶段 | 周期 | 范围 | 退出标准 |
| --- | --- | --- | --- |
| Phase 0 | 0.5 周 | 梳理图层模型、工具箱入口、样例数据、测试基线 | 文档、样例、任务拆分完成 |
| Phase 1 / P0 | 2-3 周 | 数据导入、上传入库、属性表、编辑基础、Buffer、导出 | E2E-001 到 E2E-004 通过 |
| Phase 2 / P1 | 4-6 周 | CSV/CAD、Spatial Join、Intersect、Clip、Fishnet、POI/OSM、热力图 | P1 功能测试通过 |
| Phase 3 / P2 | 8-10 周 | 可达性、流线、Dissolve、外链门户、高级截图、项目 JSON | P2 可演示且无阻塞缺陷 |

## 15. 开发拆分建议

| Epic | 子任务 | 产出 |
| --- | --- | --- |
| E-01 图层模型 | Pinia 图层 store、图层 metadata、样式 schema、选择集 | 可复用状态层 |
| E-02 数据导入 | CSV 导入、DXF 导入、导入向导、CRS 校验 | 导入闭环 |
| E-03 编辑器 | Mapbox GL Draw 接入、属性编辑、撤销重做、另存为 | 编辑闭环 |
| E-04 分析工具箱 | ToolDefinition、Buffer、Intersect、Spatial Join、Merge | 分析闭环 |
| E-05 数据下载 | OSM、高德 POI、范围选择、下载限制 | 数据获取能力 |
| E-06 可视化 | 热力图、聚合点、流线、Deck.gl/L7 评估 | 表达能力 |
| E-07 外链门户 | 静态工具配置、分类、搜索、跳转 | 工具导航 |
| E-08 测试与安全 | 单元测试、接口测试、E2E、输入限制、错误结构 | 可交付质量 |
