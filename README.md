# GIS Tools Online

Web 端 GIS 工具集合，面向临时、轻量、无账号体系的空间数据处理场景。系统不做用户体系和云端存储，前端负责地图交互、图层管理、可视化和部分空间分析，后端提供格式转换、数据下载、数据库连接和坐标系查询等计算/服务能力。

## 功能概览

| 模块 | 主要能力 |
| --- | --- |
| 数据导入 | 本地 GeoJSON/Shapefile、CSV 坐标/WKT、DXF CAD、PostGIS 数据库图层导入 |
| 数据处理 | 新建点/线/面图层、要素编辑、节点编辑、坐标转换、China Coord Convert、mapshaper |
| 分析工具 | 缓冲区、空间连接、图层求交、图层裁剪、图层合并、要素融合、渔网生成、简化可达性分析 |
| 数据下载 | OSM 多类别下载、高德 POI 下载，支持输出 GeoJSON/Shapefile zip 和结果预览 |
| 可视化 | 热力图、聚合点、流线图、分级点图、面分级图 |
| 外链门户 | GIS 在线编辑、数据下载、坐标工具、可视化、遥感平台、工具合集等外链导航 |
| 图层管理 | 图层顺序、底图切换、图层属性、样式调整、导出、数据库上传 |

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | Vue 3、Vite、Pinia、Vue Router、Mapbox GL JS、Turf.js、proj4、shapefile、jszip |
| 后端 | Node.js、Express、pg、mapshaper、dxf-parser、proj4、shapefile、jszip |
| 可选数据库 | PostgreSQL + PostGIS |
| 开发环境 | Windows / PowerShell / Node.js 20.19+ 或 22.12+ |

## 目录结构

```text
gis-tools-online/
  gis-tools-frontend/        # Vue/Vite 前端工程
  gis-tools-backend/         # Express 后端工程
  docs/                      # PRD/TRD、自测报告等文档
  tmp/                       # 临时测试输出和截图
  start-gis-frontend.cmd     # Windows 前端启动脚本
  start-gis-backend.cmd      # Windows 后端启动脚本
  start-gis-backend.ps1      # 后端后台启动辅助脚本
  PROGRESS.md                # 开发进度和验证记录
```

## 环境要求

| 依赖 | 要求 |
| --- | --- |
| Node.js | 前端 `package.json` 要求 `^20.19.0 || >=22.12.0` |
| npm | 随 Node.js 安装 |
| Chrome | 可选，用于 Chrome DevTools 冒烟测试 |
| PostgreSQL/PostGIS | 可选；仅数据库导入、数据库上传、PostGIS 表读取等能力需要 |

> 基础导入、CSV/CAD 转换、OSM 下载、前端编辑、导出、可视化等功能不强依赖 PostGIS。数据库连接为空时，系统仍可作为本地 GIS 工具使用。

## 本地开发启动

### 1. 安装依赖

```powershell
cd D:\study\gis-tools-online\gis-tools-backend
npm install

cd D:\study\gis-tools-online\gis-tools-frontend
npm install
```

### 2. 配置后端环境变量

后端会读取 `gis-tools-backend/.env`。没有 `.env` 时使用默认值。

```env
PORT=3000
NODE_ENV=development
DB_HOST=localhost
DB_PORT=5432
DB_NAME=gis_tools
DB_USER=postgres
DB_PASSWORD=postgres
```

说明：

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `PORT` | `3000` | 后端服务端口 |
| `NODE_ENV` | `development` | 选择数据库配置分组 |
| `DB_HOST` | `localhost` | PostgreSQL 地址 |
| `DB_PORT` | `5432` | PostgreSQL 端口 |
| `DB_NAME` | `gis_tools` | 数据库名 |
| `DB_USER` | `postgres` | 数据库用户名 |
| `DB_PASSWORD` | `postgres` | 数据库密码 |

当前仓库后端 `package.json` 中保留了 `npm run init-db` 脚本名，但没有提交对应的 `src/config/initDb.js` 文件；不要依赖该脚本初始化数据库。需要数据库能力时，请手动准备 PostgreSQL/PostGIS 数据库和空间扩展。

### 3. 启动后端

方式一：使用根目录脚本。

```powershell
.\start-gis-backend.cmd
```

看到以下输出后保持窗口打开：

```text
Server is running on port 3000
API available at http://localhost:3000/api
```

方式二：手动启动。

```powershell
cd D:\study\gis-tools-online\gis-tools-backend
npm start
```

健康检查：

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3000/api/health
```

### 4. 配置前端环境变量

前端可选配置 `gis-tools-frontend/.env.development`：

```env
VITE_DEV_API_PROXY=http://localhost:3000
VITE_API_BASE_URL=
VITE_MAPBOX_ACCESS_TOKEN=
```

说明：

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `VITE_DEV_API_PROXY` | `http://localhost:3000` | Vite 开发/预览时 `/api` 代理目标 |
| `VITE_API_BASE_URL` | 空 | Axios 基础地址；空值表示请求当前域名下的 `/api` |
| `VITE_MAPBOX_ACCESS_TOKEN` | 空 | Mapbox token；当前底图主要使用栅格瓦片，通常可为空 |

### 5. 启动前端

方式一：使用根目录脚本。

```powershell
.\start-gis-frontend.cmd
```

方式二：手动启动。

```powershell
cd D:\study\gis-tools-online\gis-tools-frontend
npm run dev -- --host 127.0.0.1
```

默认访问：

```text
http://127.0.0.1:5173/
```

外链门户：

```text
http://127.0.0.1:5173/portal
```

## 生产构建

### 1. 构建前端

推荐生产环境使用同域部署：Nginx 托管前端静态文件，并把 `/api` 反代到后端。此时前端构建时 `VITE_API_BASE_URL` 保持空即可。

```powershell
cd D:\study\gis-tools-online\gis-tools-frontend
npm run build
```

构建产物在：

```text
gis-tools-frontend/dist/
```

当前构建已知会出现 Vite chunk size warning，主要来自 GIS、导出和空间分析依赖，功能可用。后续可用动态 import 拆包优化。

### 2. 启动后端

```powershell
cd D:\study\gis-tools-online\gis-tools-backend
npm install --omit=dev
$env:NODE_ENV='production'
$env:PORT='3000'
npm start
```

生产环境建议使用进程管理器守护后端，例如 Windows 服务、NSSM、PM2 或容器编排。示例 PM2：

```powershell
npm install -g pm2
cd D:\study\gis-tools-online\gis-tools-backend
pm2 start src/index.js --name gis-tools-backend
pm2 save
```

### 3. Nginx 部署示例

以下示例使用同域名部署前端和 API：

```nginx
server {
    listen 80;
    server_name gis-tools.example.com;

    root D:/study/gis-tools-online/gis-tools-frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 100m;
        proxy_read_timeout 120s;
    }
}
```

如果前后端跨域部署，也可以在前端构建时指定后端完整地址：

```powershell
cd D:\study\gis-tools-online\gis-tools-frontend
$env:VITE_API_BASE_URL='https://api.example.com'
npm run build
```

跨域部署时后端当前启用了 `cors()`，但生产环境建议收敛允许来源。

## PostGIS 数据库准备

数据库能力包括连接管理、表读取、GeoJSON/Shapefile 上传入库等。准备步骤示例：

```sql
CREATE DATABASE gis_tools;
\c gis_tools
CREATE EXTENSION IF NOT EXISTS postgis;
```

然后在 `gis-tools-backend/.env` 中配置数据库连接。启动系统后，在左侧资源面板添加 PostGIS 连接。

注意：

- 坐标系搜索接口会优先使用后端内置常用 EPSG 和本地坐标系表，数据库不可用时有 fallback。
- 上传 Shapefile 时前端需要选择同一组 `.shp/.dbf/.prj` 文件。
- GBK/UTF-8 编码切换主要用于 CSV、Shapefile DBF 读取与导出。

## 后端 API 概览

| 路径 | 方法 | 用途 |
| --- | --- | --- |
| `/api/health` | GET | 健康检查 |
| `/api/database` | GET/POST/DELETE | 数据库连接列表、新增、删除 |
| `/api/database/test` | POST | 测试 PostGIS 连接 |
| `/api/database/:id/upload` | POST | 上传 GeoJSON/Shapefile 到数据库 |
| `/api/database/:id/tables` | GET | 数据库空间表列表 |
| `/api/files` | GET | 读取本地目录下支持的矢量文件列表 |
| `/api/files/geojson` | GET | 读取本地 GeoJSON/Shapefile 并转换为 GeoJSON |
| `/api/mapshaper/process` | POST | 处理前端传入的 GeoJSON |
| `/api/mapshaper/process-files` | POST | 处理上传文件组 |
| `/api/spatial-references` | GET | 搜索坐标系 |
| `/api/csv/convert` | POST | CSV 转 GeoJSON |
| `/api/cad/convert` | POST | DXF 转 GeoJSON，并按点/线/面拆层 |
| `/api/download/osm` | POST | OSM Overpass 下载，返回 zip |
| `/api/download/amap-poi` | POST | 高德 POI 下载 |

## 验证和自测

### 语法检查

```powershell
cd D:\study\gis-tools-online\gis-tools-backend
node --check src/index.js
node --check src/routes/cad.js
node --check src/routes/csv.js
node --check src/routes/download.js
node --check src/routes/database.js
node --check src/routes/files.js
node --check src/routes/mapshaper.js
node --check src/routes/spatialReferences.js

cd D:\study\gis-tools-online\gis-tools-frontend
node --check vite.config.js
node --check src/utils/geoExport.js
node --check src/utils/portalTools.js
```

### 前端构建

```powershell
cd D:\study\gis-tools-online\gis-tools-frontend
npm run build
```

### 服务探测

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:5173/
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:5173/portal
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3000/api/health
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:5173/api/health
```

完整自测报告见：

```text
docs/gis-tools-online-self-test-report.md
```

## 常见问题

| 问题 | 处理方式 |
| --- | --- |
| 前端提示后端服务不可用 | 确认 `start-gis-backend.cmd` 窗口保持打开，且 `http://127.0.0.1:3000/api/health` 返回 `ok` |
| 3000 端口被占用 | 关闭旧后端进程，或设置后端 `PORT` 并同步修改 `VITE_DEV_API_PROXY` |
| 访问 `/health` 返回 404 | 正确健康检查路径是 `/api/health` |
| CSV/Shapefile 中文乱码 | 在导入或导出弹框中切换 `GBK` / `UTF-8` |
| CAD DWG 转换失败 | 当前后端只支持 DXF；DWG 需要后续接 ODA/LibreDWG 等转换器 |
| OSM 下载慢或失败 | Overpass 公共服务可能限流或超时；缩小范围到 2000 平方公里以内，稍后重试 |
| 高德 POI 无法下载 | 需要用户自己的高德 Web 服务 Key；Key 保存在浏览器 localStorage |
| Shapefile 坐标系缺失 | 选择同名 `.prj`，或在弹框中手动选择源坐标系 |
| 生产部署刷新 `/portal` 404 | Nginx 需要 `try_files $uri $uri/ /index.html;` 支持 SPA 路由 |

## 安全和部署注意事项

- 系统不做用户体系，默认所有访问者都能使用前端暴露的功能；部署到公网前建议加反向代理认证、VPN 或内网访问控制。
- 后端可读取服务器本地文件路径和连接数据库；公网部署时要限制访问来源和运行账号权限。
- 高德 Key 只保存在浏览器本地，不由本系统后端保存。
- OSM、地图瓦片、高德 POI 等依赖第三方服务，生产环境需要考虑配额、限流和失败提示。
- 当前后端 `bodyParser` 限制为 `50mb`，Nginx 示例中 `client_max_body_size` 设置为 `100m`，大文件上传需同步调整前后端和代理限制。

## 维护文档

| 文档 | 用途 |
| --- | --- |
| `docs/gis-tools-online-prd-trd.md` | 产品/技术需求说明 |
| `docs/gis-tools-online-requirements-analysis.md` | 早期需求分析 |
| `docs/gis-tools-online-self-test-report.md` | 全量自测报告 |
| `PROGRESS.md` | 开发进度、验证记录和风险 |
