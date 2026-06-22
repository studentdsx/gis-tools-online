# GIS Tools Online 全量功能自测报告

## 1. 文档信息

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v1.0 |
| 测试时间 | 2026-06-20 13:18；Chrome DevTools 补测 13:39 |
| 测试人员 | Codex |
| 测试类型 | 构建检查、语法检查、接口自测、前端工具函数自测、路由与菜单覆盖检查、Chrome DevTools 浏览器冒烟 |
| 测试环境 | Windows / PowerShell / Node.js v24.11.1 |
| 前端服务 | `http://127.0.0.1:5173/` |
| 后端服务 | `http://127.0.0.1:3000/api/health` |
| 关联文档 | `docs/gis-tools-online-prd-trd.md`、`PROGRESS.md` |

## 2. 测试结论

| 结论项 | 结果 | 说明 |
| --- | --- | --- |
| 构建状态 | 通过 | `gis-tools-frontend` 执行 `npm.cmd run build` 成功 |
| 后端语法检查 | 通过 | `src/index.js` 和 7 个后端路由文件 `node --check` 通过 |
| 前端语法检查 | 通过 | `vite.config.js`、`geoExport.js`、`portalTools.js` `node --check` 通过 |
| 服务可用性 | 通过 | `/`、`/portal`、`/mapshaper`、后端 `/api/health`、前端代理 `/api/health` 均返回 200 |
| 后端 API 自测 | 通过 | 15/15 项通过，覆盖 CSV、CAD、mapshaper、文件、数据库校验、OSM、高德校验 |
| 前端工具函数自测 | 通过 | 7/7 项通过，覆盖 CRS、GBK DBF、Shapefile zip、GeoJSON zip、门户数据 |
| 菜单动作覆盖 | 通过 | 23 个二级菜单动作均有定义或特例处理 |
| 阻断缺陷 | 未发现 | 本轮自动化与脚本化自测未发现阻断功能问题 |
| 浏览器冒烟测试 | 通过 | 使用 Chrome DevTools Protocol 完成真实页面加载、二级菜单点击、弹框打开、门户搜索、控制台错误采集 |

## 3. 测试范围覆盖

| 模块 | 覆盖功能 | 自测方式 | 结果 | 备注 |
| --- | --- | --- | --- | --- |
| 数据导入 | 本地矢量、CSV、CAD、数据库导入入口 | 菜单覆盖、Chrome DevTools 菜单点击、CSV/CAD 后端接口、文件接口校验、数据库列表和连接校验 | 通过 | CSV/CAD 弹框打开正常；真实文件选择和预览联动需人工验收 |
| 数据处理 | 新建图层、坐标转换、China Coord Convert、mapshaper、图层导出 | 构建检查、菜单覆盖、Chrome DevTools 弹框冒烟、mapshaper API、前端导出工具函数 | 通过 | 几何编辑、节点编辑、撤销、退出保存提示需人工验收 |
| 图层管理 | 图层叠加、图层顺序、底图切换、属性面板导出 | 构建检查、导出工具函数、菜单/路由检查 | 部分通过 | 图层拖拽顺序和地图渲染层级需真实浏览器确认 |
| 分析工具 | 缓冲区、空间连接、求交、裁剪、合并、要素融合、渔网、可达性 | 构建检查、菜单动作覆盖、Chrome DevTools 弹框冒烟、输出工具函数 | 通过但需样例回归 | 复杂面叠加/融合仍建议用真实 GIS 样例人工回归 |
| 数据下载 | OSM 下载、高德 POI 下载 | Chrome DevTools 弹框冒烟、OSM 面积限制、OSM zip 下载、AMap 缺 Key 校验 | 通过 | 有效高德 Key 和大范围 OSM 受外部服务限制，未做压力测试 |
| 可视化 | 热力图、流线图、聚合点、分级点、面分级图 | 构建检查、菜单动作覆盖、Chrome DevTools 弹框冒烟 | 通过但需人工验收 | WebGL/Mapbox 图层实际视觉效果需浏览器确认 |
| 外链门户 | 门户页面、分类、搜索数据源 | `/portal` 路由、Chrome DevTools 页面冒烟、`portalTools` 数据质量脚本 | 通过 | 72 个工具、12 个分类、URL 无重复，门户搜索 `deck` 可过滤出 deck.gl |
| 基础服务 | 前后端服务、Vite 代理、坐标系查询 | HTTP 探测、空间参考接口 | 通过 | 首次坐标系查询耗时 1.417s，见风险项 |

## 4. 自动化验证记录

| 编号 | 类型 | 命令/检查项 | 结果 | 关键输出 |
| --- | --- | --- | --- | --- |
| A-01 | 后端语法 | `node --check src/index.js` 及 `cad/csv/download/database/files/mapshaper/spatialReferences` 路由 | 通过 | 无语法错误 |
| A-02 | 前端语法 | `node --check vite.config.js`、`node --check src/utils/geoExport.js`、`node --check src/utils/portalTools.js` | 通过 | 无语法错误 |
| A-03 | 前端构建 | `npm.cmd run build` | 通过 | 674 modules transformed，构建耗时约 40s |
| A-04 | 构建警告 | Vite chunk size warning | 有警告 | JS chunk 约 3067.49 kB，gzip 约 947.89 kB |
| A-05 | 服务探测 | `http://127.0.0.1:5173/` | 通过 | HTTP 200 |
| A-06 | 门户路由 | `http://127.0.0.1:5173/portal` | 通过 | HTTP 200 |
| A-07 | mapshaper 路由 | `http://127.0.0.1:5173/mapshaper` | 通过 | HTTP 200 |
| A-08 | 后端健康 | `http://127.0.0.1:3000/api/health` | 通过 | `{"status":"ok"}` |
| A-09 | 前端代理 | `http://127.0.0.1:5173/api/health` | 通过 | `{"status":"ok"}` |
| A-10 | 坐标系查询 | `/api/spatial-references?keyword=4326&limit=3` | 通过 | 返回 `EPSG:4326` |
| A-11 | 后端 API 脚本 | 15 项接口用例 | 通过 | 15/15 PASS |
| A-12 | 前端工具函数脚本 | 7 项工具函数用例 | 通过 | 7/7 PASS |
| A-13 | 菜单覆盖脚本 | Header 23 个动作 vs MainView 定义/处理 | 通过 | `missingDefinitions: []` |
| A-14 | 浏览器自动化能力 | `require('playwright')` | 未具备 | 当前依赖中未安装 Playwright |
| A-15 | Chrome DevTools 浏览器冒烟 | 可见 Chrome + CDP 远程调试端口 `9225` | 通过 | 11/11 PASS，截图保存到 `tmp/chrome-devtools-selftest-portal.png` |

## 5. 后端 API 自测明细

| 用例 | 覆盖点 | 结果 | 关键断言 |
| --- | --- | --- | --- |
| backend health | 后端健康检查 | 通过 | `status = ok` |
| spatial references query EPSG:4326 | 坐标系搜索 | 通过 | 返回 `EPSG:4326`，来源 `database` |
| database list | 数据库连接列表 | 通过 | 返回数组，当前连接数 0 |
| database test validation | 数据库连接必填校验 | 通过 | 空参数返回 400，`success=false` |
| CSV XY convert valid | CSV X/Y 点转换 | 通过 | 2 个 Point 要素，字段 `name/lon/lat` |
| CSV WKT convert valid | CSV WKT 转换、自定义分隔符 | 通过 | 1 个 Point 要素 |
| CSV invalid geometry validation | CSV 无效几何校验 | 通过 | 返回 400，跳过第 2 行 |
| CAD DXF convert split layers | DXF 转换和按几何类型拆层 | 通过 | 1 个线要素，返回 `线:LINESTRING:1` |
| CAD DWG unsupported validation | DWG 不支持提示 | 通过 | 返回 400 |
| Mapshaper process valid GeoJSON | mapshaper 简化处理 | 通过 | 返回 1 个要素和 commands |
| Files list validation | 文件列表路径校验 | 通过 | 缺少路径返回错误 |
| Files GeoJSON read validation | 非 GeoJSON 文件校验 | 通过 | `package.json` 被拒绝 |
| OSM area limit validation | OSM 最大范围限制 | 通过 | 超大 BBox 返回 400 |
| OSM tiny zip download | OSM 小范围 zip 下载 | 通过 | zip 包含 `POI.geojson`、`_metadata.json`、`_preview.json` |
| AMap missing key validation | 高德 Key 校验 | 通过 | 缺 Key 返回 400 |

## 6. 前端工具函数自测明细

| 用例 | 覆盖点 | 结果 | 关键断言 |
| --- | --- | --- | --- |
| CRS normalize and WGS84 detection | 坐标系标准化 | 通过 | `4326 -> EPSG:4326`，识别 WGS84 |
| transform EPSG:4326 to EPSG:3857 | GeoJSON 坐标转换 | 通过 | 北京附近点转 Web Mercator 成功 |
| create DBF buffer with GBK text | DBF GBK 编码 | 通过 | 生成 ArrayBuffer，中文 GBK 2 字为 4 字节 |
| create shapefile zip blob | Shapefile zip 导出 | 通过 | 包含 `.shp/.shx/.dbf/.prj/.cpg` |
| create multi GeoJSON zip blob | 多图层 GeoJSON zip | 通过 | 包含 `points.geojson`、`lines.geojson` |
| output filename and picker helpers | 输出文件名/保存类型 | 通过 | 非法字符替换，Shapefile 输出 `.zip` |
| portal tools data quality | 外链门户数据 | 通过 | 72 个工具、12 个分类、URL 无重复 |

## 7. Chrome DevTools 浏览器冒烟明细

| 用例 | 覆盖点 | 结果 | 关键断言 |
| --- | --- | --- | --- |
| Chrome DevTools session | 浏览器调试会话 | 通过 | Chrome `149.0.7827.103`，Protocol `1.3` |
| workbench route loads | 工作台首页加载 | 通过 | `/` 页面显示全局头部和一级菜单 |
| CSV import dialog opens | 数据导入二级菜单 | 通过 | 点击“数据导入 > CSV 导入”后弹框出现，包含编码和预览信息 |
| CAD import dialog opens | CAD 导入弹框 | 通过 | 点击“数据导入 > CAD 导入”后弹框出现，包含坐标系信息 |
| CRS transform dialog opens | 数据处理坐标转换 | 通过 | 点击“数据处理 > 坐标转换”后弹框出现，包含输入/输出配置 |
| analysis dialog opens | 分析工具弹框 | 通过 | 点击“分析工具 > 空间连接”后弹框出现，包含输入图层/连接图层配置 |
| download dialog opens | 数据下载弹框 | 通过 | 点击“数据下载 > OSM 数据下载”后弹框出现，包含框选/BBox 范围配置 |
| visualization dialog opens | 可视化弹框 | 通过 | 点击“可视化 > 热力图”后弹框出现，包含图层/权重配置 |
| portal route preserves header | 外链门户 layout | 通过 | 点击“外链门户”进入 `/portal`，全局头部保留，无“返回工作台”按钮 |
| portal search filters content | 外链门户搜索 | 通过 | 搜索 `deck` 后页面包含 `deck.gl` |
| console has no blocking runtime errors | 控制台错误 | 通过 | 未采集到 `uncaught`、`ReferenceError`、`TypeError` 等阻断错误 |

## 8. 发现的问题与风险

| 编号 | 严重级别 | 类型 | 问题/风险 | 建议 |
| --- | --- | --- | --- | --- |
| R-01 | P2 | 性能 | 首次坐标系查询本轮耗时约 1.417s，超过“接口 1s 内”目标 | 后端启动时预热坐标系列表；前端常用 EPSG 本地缓存；数据库查询加索引/限制初始化范围 |
| R-02 | P2 | 性能/包体 | 前端构建成功但 Vite 提示 chunk 超 500 kB，主 JS 约 3.0 MB | 后续按功能弹框动态 import，重点拆分 mapbox、turf、shapefile、mapshaper/export 相关依赖 |
| R-03 | P2 | 外部依赖 | OSM 下载依赖 Overpass 公共服务，小范围测试耗时约 4.458s，可能受限流/网络影响 | 保留范围限制；增加可配置 Overpass 镜像；长查询增加用户进度提示和重试 |
| R-04 | P2 | 测试覆盖 | 已用 Chrome DevTools 覆盖真实菜单点击、弹框打开和门户搜索；仍未覆盖拖拽、地图框选、文件保存弹框、图层渲染像素级验证 | 后续可引入 Playwright 或继续扩展 CDP 脚本，补充地图交互和文件选择/保存链路 |
| R-05 | P2 | 环境依赖 | 当前数据库连接列表为空，未连接真实 PostGIS 验证上传/表读取 | 准备本地 PostGIS 测试库，补充连接、上传 Shapefile/GeoJSON、表读取用例 |
| R-06 | P2 | 第三方 Key | 高德 POI 只验证了缺 Key 校验，未使用真实 Key 拉取数据 | 用测试 Key 验证城市检索、BBox 下载、GCJ02/WGS84 输出、配额错误提示 |
| R-07 | P3 | 分析精度 | 可达性分析当前是距离/时间阈值换算缓冲区的简化实现 | 后续如要求真实路网可达性，需要接入路网引擎或后端图算法 |
| R-08 | P3 | 几何稳健性 | Turf 对复杂面求交/融合存在失败概率 | 复杂面建议转后端 Mapshaper/PostGIS 处理，前端保留失败提示和跳过策略 |

## 9. 需人工验收清单

| 场景 | 操作步骤 | 预期结果 |
| --- | --- | --- |
| 顶部二级菜单 | 逐个点击数据导入、数据处理、分析工具、数据下载、可视化下的二级菜单 | 一级菜单不跳独立空页面；二级菜单打开对应弹框或特殊页面 |
| 弹框交互 | 拖拽弹框、收起/展开、关闭弹框 | 弹框位置稳定；收起后标题栏保留；关闭后不残留地图状态 |
| CSV 导入预览 | 切换编码、分隔符、起始行、首行字段名、字段类型识别 | 表格预览随配置实时更新；加载后生成正确图层 |
| CAD 导入 | 上传真实 DXF，选择源坐标系 | 点、线、面按几何类型拆成多个图层；坐标转换后正常叠加 |
| 图层编辑 | 新建点/线/面图层，新增要素、编辑节点、删除、Ctrl+Z、保存/退出 | 编辑态工具栏出现；选中要素橙黄色高亮；未保存退出有保存确认 |
| 图层顺序和底图 | 切换 OSM、ArcGIS 卫星、高德卫星、白板背景；拖拽业务图层顺序 | 底图始终在最底层；白板只清空瓦片，不删除业务图层 |
| 图层导出 | 在图层属性面板选择坐标系、格式、编码、输出路径 | GeoJSON/Shapefile 正确保存；GBK/UTF-8 编码可被 GIS 软件识别 |
| 空间分析 | 用真实点/线/面样例执行缓冲区、空间连接、求交、裁剪、合并、融合、渔网、可达性 | 输出文件保存成功；可选是否叠加预览；结果属性和几何符合预期 |
| OSM 下载框选 | 选择地图框选范围，框选后点击下载 | BBox 回填；范围面积提示正确；zip 下载成功；预览图层按类别叠加 |
| 高德 POI 下载 | 输入测试 Key 后按城市/BBox 下载 | Key 本地保存；下次默认读取；输出点图层正常 |
| 可视化 | 分别生成热力图、聚合点、流线图、分级点、面分级图 | 视觉图层叠加和移除正常；不污染业务图层列表 |
| 外链门户 | 打开 `/portal`，搜索和切换分类，点击外链 | 页面头部 layout 不变化；内容区切换；外链新窗口打开 |

## 10. 总体评价

本轮自测覆盖了工程构建、主要后端接口、前端核心导出工具、菜单动作、基础路由和 Chrome DevTools 真实浏览器冒烟，未发现阻断缺陷。当前最需要补齐的是深度地图交互自动化和真实业务样例数据回归，尤其是地图框选/拖拽、文件保存弹框、图层渲染顺序、复杂空间分析和第三方服务下载。
