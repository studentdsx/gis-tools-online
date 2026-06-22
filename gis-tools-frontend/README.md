# GIS Tools Frontend

GIS Tools Frontend 是一个基于 Vue 3、Vite、Mapbox GL JS 的在线 GIS 工具前端。项目提供地图浏览、坐标定位、底图切换、数据资源管理、GeoJSON/Shapefile 图层加载、距离/面积测量、地图截图以及类 mapshaper 的数据简化与导出界面。

## 功能概览

- 地图浏览：基于 Mapbox GL JS 展示卫星、街道等底图。
- 坐标搜索：输入经纬度后自动定位并标记到地图。
- 数据资源：管理 PostGIS 连接、自定义底图、服务器文件夹或浏览器本地文件夹。
- 图层管理：双击或拖拽资源添加图层，支持显示/隐藏、移除和拖拽调整顺序。
- 文件加载：支持 `.geojson`、`.json`、`.shp` 等空间数据，Shapefile 可读取同名 `.dbf` 与 `.prj`。
- 投影转换：读取 GeoJSON CRS 或 Shapefile PRJ 后转换到 `EPSG:4326`。
- 测量工具：支持距离测量和面积测量。
- 地图截图：导出当前地图视图为 PNG。
- Mapshaper：上传 GeoJSON、Shapefile、KML、CSV、GeoPackage、FlatGeobuf、GeoParquet、GeoTIFF 等文件，进行简化预览并导出结果。

## 技术栈

- Vue 3
- Vite
- Vue Router
- Pinia
- Mapbox GL JS
- Turf.js
- proj4
- shapefile
- Axios

## 环境要求

- Node.js `^20.19.0` 或 `>=22.12.0`
- npm
- Mapbox Access Token
- 可选：后端服务，用于 PostGIS、服务器文件目录和 Mapshaper 处理接口

## 快速开始

安装依赖：

```sh
npm install
```

复制环境变量示例：

```sh
copy .env.example .env
```

编辑 `.env`，至少填写 Mapbox token：

```env
VITE_MAPBOX_ACCESS_TOKEN=your_mapbox_access_token
```

启动开发服务：

```sh
npm run dev
```

浏览器打开 Vite 输出的地址，通常是：

```txt
http://localhost:5173
```

## 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `VITE_MAPBOX_ACCESS_TOKEN` | 是 | Mapbox GL JS 访问令牌，用于加载地图底图。 |
| `VITE_API_BASE_URL` | 否 | 后端根地址。留空时请求同源 `/api/*`，开发和预览时由 Vite 代理。 |
| `VITE_DEV_API_PROXY` | 否 | Vite 开发/预览代理目标，默认 `http://localhost:3000`。 |

注意：`.env` 已加入 `.gitignore`，不要提交真实 token、数据库密码或其他本地密钥。

## 如何使用

### 1. 地图浏览与坐标定位

进入首页后会显示主地图。页面顶部右侧输入经度和纬度，点击“搜索”即可定位到目标坐标。点击地图时，当前点击位置会回填到顶部的经纬度输入框，便于复制或再次搜索。

### 2. 添加底图

左侧“数据资源”面板包含默认底图。双击底图，或将底图拖到图层区域/地图上，即可切换当前底图。也可以添加自定义底图地址，用于接入自己的 Mapbox style、XYZ 瓦片或栅格服务。

### 3. 添加 PostGIS 数据

点击数据库连接区域的添加入口，填写连接名称、主机、端口、数据库、用户名和密码。可以先测试连接，再保存连接。保存后展开连接，会列出可用空间表；双击表或拖拽表到地图，即可加载为 GeoJSON 图层。

这部分依赖后端接口：

- `POST /api/database/test`
- `POST /api/database`
- `GET /api/database/:connectionId/tables`
- `GET /api/database/:connectionId/tables/:schema/:table/geojson`

### 4. 添加本地或服务器文件

可以添加文件夹资源，展开后会显示支持的空间文件。浏览器本地文件夹能力依赖 File System Access API，建议使用 Chrome 或 Edge。服务器文件夹模式需要后端提供文件列表和 GeoJSON 转换接口。

支持的主要格式：

- GeoJSON：`.geojson`、`.json`
- Shapefile：`.shp`，建议同目录包含 `.dbf` 和 `.prj`

添加方式：

- 双击文件资源。
- 将文件资源拖到“Map Layers”区域。
- 将文件资源拖到地图区域。

### 5. 管理图层

添加到地图的资源会出现在左侧“Map Layers”列表中。

- 点击圆点按钮显示或隐藏图层。
- 点击 `x` 移除图层。
- 拖拽图层项调整叠放顺序。
- 底图始终显示，不支持隐藏。

### 6. 测量与截图

地图右上工具区提供测量入口。选择距离测量后，在地图上连续点击生成折线并显示长度；选择面积测量后，点击至少三个点生成面并显示面积。可使用清除按钮重置测量结果。

截图功能会导出当前地图画布为 PNG，文件名包含地图中心点、缩放级别和时间戳。

### 7. 使用 Mapshaper

顶部菜单进入 `mapshaper` 页面，或直接访问：

```txt
/mapshaper
```

使用流程：

1. 将文件拖入页面，或点击导入入口选择文件。
2. 调整 Simplify 百分比和算法。
3. 选择输出格式，例如 GeoJSON 或 Shapefile。
4. 查看左右预览和处理日志。
5. 点击 Export 下载处理结果。

Mapshaper 页面依赖后端接口：

```txt
POST /api/mapshaper/process-files
```

## 常用命令

开发：

```sh
npm run dev
```

生产构建：

```sh
npm run build
```

本地预览构建产物：

```sh
npm run preview
```

如果在 Windows PowerShell 中遇到 `npm.ps1` 执行策略限制，可以改用：

```sh
npm.cmd run dev
npm.cmd run build
```

## 项目结构

```txt
gis-tools-frontend/
├─ public/                 静态资源
├─ src/
│  ├─ api/                 Axios 客户端
│  ├─ assets/              全局样式与资源
│  ├─ components/          头部、地图、资源面板、弹窗等组件
│  ├─ router/              路由配置
│  ├─ stores/              Pinia 状态
│  └─ views/               页面视图
├─ .env.example            环境变量示例
├─ vite.config.js          Vite 配置和 /api 代理
└─ package.json            脚本与依赖
```

## 部署说明

构建生产产物：

```sh
npm run build
```

构建结果位于 `dist/`。部署到 Nginx、静态托管平台或对象存储时，需要确保：

- 前端运行环境能读取到正确的 `VITE_MAPBOX_ACCESS_TOKEN`。
- 如果后端不与前端同源，设置 `VITE_API_BASE_URL` 指向后端根地址。
- 如果使用 Vue Router history 模式，服务器需要把未知路径回退到 `index.html`。

## 常见问题

### 地图空白或底图加载失败

检查 `.env` 中是否填写了有效的 `VITE_MAPBOX_ACCESS_TOKEN`，并确认当前域名在 Mapbox token 限制范围内。

### PostGIS、服务器文件或 Mapshaper 功能失败

检查后端服务是否已启动，并确认 `VITE_API_BASE_URL` 或 `VITE_DEV_API_PROXY` 指向正确地址。

### 本地文件夹无法选择

本地文件夹选择依赖浏览器支持。建议使用最新版 Chrome 或 Edge；不支持该 API 的浏览器可改用服务器文件夹模式。

### Shapefile 坐标位置不正确

确认 `.shp` 同目录下存在匹配的 `.prj` 文件。没有投影信息时，系统会按原始坐标读取，可能导致位置偏移。
