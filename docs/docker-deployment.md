# Docker 部署方案

## 适用范围

本方案用于把 GIS Tools Online 部署为一组本地或服务器容器：

| 容器 | 职责 | 默认端口 |
| --- | --- | --- |
| `gis-tools-frontend` | Nginx 托管前端静态资源，并反向代理 `/api` | `0.0.0.0:8080 -> 80` |
| `gis-tools-backend` | Express API、格式转换、OSM/高德下载、坐标系查询、数据库访问 | `127.0.0.1:3000 -> 3000` |
| `gis-tools-postgis` | PostgreSQL + PostGIS，可用于数据库连接、图层读取和上传 | `127.0.0.1:5432 -> 5432` |

前端默认使用同源 `/api` 访问后端，不需要单独配置跨域地址。

## 前置条件

| 依赖 | 要求 |
| --- | --- |
| Docker Desktop / Docker Engine | 支持 Docker Compose v2 |
| 网络 | 首次构建需要访问 npm registry、Docker Hub；OSM/高德功能运行时需要访问第三方服务 |
| 服务器资源 | 建议 2 CPU、4 GB 内存起步；OSM 下载和 Shapefile 导出会消耗额外内存 |

## 部署流程概览

| 阶段 | 执行位置 | 产物/动作 |
| --- | --- | --- |
| 构建镜像 | 有源码、可联网的构建机 | 构建前端/后端镜像，拉取 PostGIS 镜像 |
| 打包离线包 | 构建机 | 导出 `gis-tools-images.tar` 和运行期文件包 |
| 加载镜像 | 离线部署机 | `docker load` 导入镜像 |
| 配置启动 | 离线部署机 | 复制 `.env`、`config/*.env`，挂载配置文件和数据目录启动容器 |

## Docker Build 说明

构建必须在有源码、可联网、已安装 Docker Compose v2 的构建机执行。离线部署机只加载镜像和挂载配置，不在部署机上执行源码构建。

### 1. 准备构建参数

首次构建先复制 `.env`，后续按需要修改镜像名、tag 和端口绑定：

```powershell
copy .env.docker.example .env
```

Linux/macOS：

```bash
cp .env.docker.example .env
```

`.env` 中和 build 直接相关的变量：

| 变量 | 示例值 | 说明 |
| --- | --- | --- |
| `GIS_TOOLS_IMAGE_TAG` | `latest` | 前端、后端镜像 tag；正式发版建议改成日期或版本号 |
| `FRONTEND_IMAGE` | `gis-tools-frontend` | 前端镜像名 |
| `BACKEND_IMAGE` | `gis-tools-backend` | 后端镜像名 |
| `POSTGIS_IMAGE` | `postgis/postgis:16-3.4` | 需要一起导出的 PostGIS 基础镜像 |

### 2. 一键构建离线包

推荐使用项目脚本一次完成前端镜像、后端镜像、PostGIS 镜像拉取、镜像导出和运行文件打包。

Windows/PowerShell：

```powershell
.\scripts\docker-package-offline.ps1
```

Linux/macOS：

```bash
sh scripts/docker-package-offline.sh
```

脚本输出：

| 文件 | 用途 |
| --- | --- |
| `docker-dist/gis-tools-images.tar` | 前端、后端、PostGIS 镜像离线包 |
| `docker-dist/gis-tools-runtime-files.zip` | Windows 部署运行文件 |
| `docker-dist/gis-tools-runtime-files.tar.gz` | Linux 部署运行文件，PowerShell 和 shell 脚本都会生成 |

### 3. 手动构建镜像

如果只想构建镜像或排查 build 问题，可以手动执行：

```powershell
docker compose -f docker-compose.build.yml build
docker pull postgis/postgis:16-3.4
docker images gis-tools-frontend gis-tools-backend postgis/postgis
```

也可以单独构建某个镜像：

```powershell
docker build -t gis-tools-backend:latest .\gis-tools-backend
docker build -t gis-tools-frontend:latest .\gis-tools-frontend
```

如果 `.env` 修改了镜像名或 tag，手动构建时要保持一致，例如：

```powershell
docker build -t gis-tools-backend:20260623 .\gis-tools-backend
docker build -t gis-tools-frontend:20260623 .\gis-tools-frontend
```

### 4. 手动导出离线镜像

手动构建后可执行导出：

```powershell
New-Item -ItemType Directory -Path docker-dist -Force
docker save --output docker-dist\gis-tools-images.tar gis-tools-frontend:latest gis-tools-backend:latest postgis/postgis:16-3.4
```

Linux/macOS：

```bash
mkdir -p docker-dist
docker save -o docker-dist/gis-tools-images.tar gis-tools-frontend:latest gis-tools-backend:latest postgis/postgis:16-3.4
```

### 5. 构建校验

构建完成后至少确认以下内容：

```powershell
docker images gis-tools-frontend gis-tools-backend postgis/postgis
Test-Path docker-dist\gis-tools-images.tar
Test-Path docker-dist\gis-tools-runtime-files.tar.gz
```

Linux/macOS：

```bash
docker images gis-tools-frontend gis-tools-backend postgis/postgis
test -f docker-dist/gis-tools-images.tar
test -f docker-dist/gis-tools-runtime-files.tar.gz
```

常见 build 问题：

| 问题 | 处理方式 |
| --- | --- |
| `docker compose` 不存在 | 升级 Docker，确认使用 Compose v2；老版本 `docker-compose` 不作为推荐方式 |
| npm install 失败 | 检查构建机能否访问 npm registry，必要时配置企业代理或 npm 镜像 |
| 拉取 `postgis/postgis` 失败 | 检查 Docker Hub 网络；如使用内网镜像仓库，先拉取并 tag 成 `.env` 中的 `POSTGIS_IMAGE` |
| 部署机提示镜像不存在 | 确认 `docker save` 导出的镜像名/tag 与部署机 `.env` 中的 `FRONTEND_IMAGE`、`BACKEND_IMAGE`、`GIS_TOOLS_IMAGE_TAG` 一致 |

## 离线部署机启动

把镜像包和运行文件包上传到部署机后执行：

```bash
docker load -i gis-tools-images.tar
tar -xzf gis-tools-runtime-files.tar.gz -C /usr/local/deploys/gis-tools-online
cd /usr/local/deploys/gis-tools-online
cp .env.docker.example .env
cp config/frontend.env.example config/frontend.env
cp config/backend.env.example config/backend.env
cp config/postgis.env.example config/postgis.env
```

Windows 部署机可解压 `gis-tools-runtime-files.zip` 后执行同等复制命令。

方式一：使用运行期 Compose 启动。部署机不会构建镜像，只引用已加载镜像：

```bash
docker compose up -d
```

方式二：使用单容器启动脚本，适合前端、后端、数据库分别部署或单独重启：

```bash
chmod +x deploy/*.sh
./deploy/run-postgis.sh
./deploy/run-backend.sh
./deploy/run-frontend.sh
```

如果数据库使用外部服务器，不需要执行 `run-postgis.sh`，只需要在 `config/backend.env` 中配置外部数据库地址。

访问地址：

```text
http://localhost:8080/
```

健康检查：

```powershell
docker compose ps
Invoke-WebRequest -UseBasicParsing http://localhost:8080/api/health
Invoke-WebRequest -UseBasicParsing http://localhost:3000/api/health
```

停止服务：

```powershell
docker compose down
```

停止并删除数据库卷：

```powershell
docker compose down -v
```

## 配置文件与挂载目录

Docker 部署时需要外置以下配置文件和数据目录。`*.example` 文件进入 Git，复制后的实际配置文件不进入 Git。

| 宿主机路径 | 容器内路径/用途 | 是否需要用户配置 | 是否持久化 | 说明 |
| --- | --- | --- | --- | --- |
| `.env` | Docker Compose 变量文件 | 是 | 是 | 镜像名、镜像 tag、宿主机端口绑定 |
| `config/frontend.env` | `/etc/gis-tools/frontend.env` | 是 | 是 | 前端运行时配置，启动时生成 `runtime-config.js` |
| `config/backend.env` | `backend` 服务 `env_file` | 是 | 是 | 后端运行时配置、数据库连接配置 |
| `config/postgis.env` | `postgis` 服务 `env_file` | 是 | 是 | PostGIS 初始化数据库、账号、密码 |
| `config/nginx.conf` | `/etc/nginx/conf.d/default.conf` | 可选 | 是 | 前端 Nginx 配置，默认已可用 |
| `docker-data/` | `/data` | 按需 | 是 | 后端可访问的本地矢量数据目录 |
| `postgis-data` Docker volume | `/var/lib/postgresql/data` | 否 | 是 | PostGIS 数据库文件 |

`.env` 只用于 Docker Compose 插值，不会作为后端运行时配置注入容器。复制 `.env.docker.example` 为 `.env` 后按需修改：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `GIS_TOOLS_IMAGE_TAG` | `latest` | 前端/后端镜像 tag |
| `FRONTEND_IMAGE` | `gis-tools-frontend` | 前端镜像名 |
| `BACKEND_IMAGE` | `gis-tools-backend` | 后端镜像名 |
| `POSTGIS_IMAGE` | `postgis/postgis:16-3.4` | PostGIS 镜像名和 tag |
| `FRONTEND_BIND` | `0.0.0.0` | 前端绑定地址，默认允许外部访问 |
| `FRONTEND_PORT` | `8080` | 对外访问前端的宿主机端口 |
| `BACKEND_BIND` | `127.0.0.1` | 后端直连端口绑定地址，默认仅服务器本机可访问 |
| `BACKEND_PORT` | `3000` | 后端 API 直连端口；正常使用可只访问前端 `/api` |
| `POSTGRES_BIND` | `127.0.0.1` | PostGIS 直连端口绑定地址，默认仅服务器本机可访问 |
| `POSTGRES_PORT` | `5432` | PostGIS 对宿主机暴露端口 |

`config/frontend.env` 是前端容器运行时配置。容器启动时会读取该文件并生成浏览器可访问的 `/runtime-config.js`：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `VITE_API_BASE_URL` | 空 | 浏览器访问后端 API 的根地址；空值表示请求同源 `/api` 并走 `config/nginx.conf` 代理 |
| `VITE_MAPBOX_ACCESS_TOKEN` | 空 | 可选 Mapbox token |

前后端分离部署时，`VITE_API_BASE_URL` 必须填写用户浏览器能访问到的后端地址，例如：

```env
VITE_API_BASE_URL=http://10.10.201.118:3000
```

如果采用这种直连方式，需要确保后端 API 对用户浏览器可访问，例如把 `.env` 中的 `BACKEND_BIND` 改为后端服务器内网地址或 `0.0.0.0`，或在后端服务器前放置反向代理；同时需要配置防火墙白名单。

如果希望继续让浏览器访问同源 `/api`，则保持 `VITE_API_BASE_URL` 为空，并把 `config/nginx.conf` 中的 `proxy_pass` 改成后端 API 地址，例如 `http://10.10.201.118:3000/api/`。

修改 `config/frontend.env` 后不需要重建镜像，重启前端容器即可重新生成运行时配置：

```powershell
docker compose restart frontend
```

`config/backend.env` 是后端容器运行时配置：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 后端容器内监听端口，通常不要修改 |
| `NODE_ENV` | `production` | 后端运行环境 |
| `DB_HOST` | `postgis` | 后端容器访问数据库的地址；内置 PostGIS 用 `postgis`，宿主机数据库可用 `host.docker.internal`，其它服务器用内网 IP 或 DNS |
| `DB_PORT` | `5432` | 数据库端口 |
| `DB_NAME` | `gis_tools` | 后端连接数据库名 |
| `DB_USER` | `postgres` | 后端连接数据库用户名 |
| `DB_PASSWORD` | `postgres` | 后端连接数据库密码，需与 `config/postgis.env` 保持一致 |

`config/postgis.env` 是 PostGIS 初始化配置：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `POSTGRES_DB` | `gis_tools` | 首次创建数据库卷时初始化的数据库名 |
| `POSTGRES_USER` | `postgres` | 首次创建数据库卷时初始化的用户名 |
| `POSTGRES_PASSWORD` | `postgres` | 首次创建数据库卷时初始化的密码，生产环境必须修改 |
| `TZ` | `Asia/Shanghai` | 容器系统时区；按宿主机实际时区调整 |
| `PGTZ` | `Asia/Shanghai` | PostgreSQL 会话默认时区；按宿主机实际时区调整 |

`config/postgis.env` 只在 `postgis-data` 卷首次创建时完整生效。数据库卷已经存在后再修改数据库名、用户名或密码，不会自动改写已有数据库，需要手动执行数据库变更或删除卷后重建。

PostGIS 容器默认按以下方式保持与 Linux 宿主机时区一致：

| 方式 | 说明 |
| --- | --- |
| `TZ` / `PGTZ` | 在 `config/postgis.env` 中配置时区，适用于 Compose 和单容器脚本 |
| `/etc/localtime` | Compose 和 `deploy/run-postgis.sh` 会只读挂载宿主机 `/etc/localtime` |
| `/etc/timezone` | `deploy/run-postgis.sh` 会在宿主机存在该文件时只读挂载；CentOS 等系统通常没有该文件 |

如果 `postgis-data` 卷已经存在，修改时区后建议重启 PostGIS 容器并验证：

```bash
docker exec gis-tools-postgis date
docker exec gis-tools-postgis psql -U postgres -d gis_tools -c "SHOW timezone; SELECT now();"
```

如果 `SHOW timezone` 仍不是期望值，可手动设置数据库参数后重启：

```bash
docker exec gis-tools-postgis psql -U postgres -d gis_tools -c "ALTER SYSTEM SET timezone = 'Asia/Shanghai';"
docker restart gis-tools-postgis
```

## 数据目录

| 路径 | 用途 |
| --- | --- |
| `postgis-data` Docker volume | PostGIS 数据持久化 |
| `./docker-data:/data` | 挂载给后端容器的本地数据目录 |
| `./config/nginx.conf:/etc/nginx/conf.d/default.conf:ro` | 挂载给前端容器的 Nginx 配置 |
| `./config/frontend.env:/etc/gis-tools/frontend.env:ro` | 挂载给前端容器的运行时配置 |

如果通过后端读取服务器本地 GeoJSON/Shapefile，路径需要使用容器内路径，例如：

```text
/data/example.geojson
/data/shp/county.shp
```

不要在 Docker 部署中填写宿主机的 Windows 路径，例如 `D:\data\county.shp`，容器无法直接识别。

## 数据库初始化

`postgis/postgis` 镜像会自动创建 PostGIS 扩展。服务启动后可验证：

```powershell
docker compose exec postgis psql -U postgres -d gis_tools -c "SELECT PostGIS_Version();"
```

前端数据库连接配置示例：

| 字段 | 值 |
| --- | --- |
| Host | 内置 PostGIS 使用 `postgis`；外部数据库使用后端容器可访问的 IP 或域名 |
| Port | `5432` |
| Database | `config/backend.env` 中的 `DB_NAME` |
| User | `config/backend.env` 中的 `DB_USER` |
| Password | `config/backend.env` 中的 `DB_PASSWORD` |

数据库地址要按“后端容器访问数据库”的视角填写，不要默认写 `localhost`。常见场景：

| 场景 | Host 填写 |
| --- | --- |
| 使用本 Compose 内置 PostGIS | `postgis` |
| 数据库在 Docker 宿主机 | `host.docker.internal` 或宿主机内网 IP |
| 数据库在另一台服务器 | 该服务器内网 IP 或 DNS |

如果从宿主机数据库客户端连接内置 PostGIS，Host 使用 `127.0.0.1`，端口使用 `.env` 中的 `POSTGRES_PORT`。如果确实需要从其他机器直连内置 PostGIS，需要把 `.env` 中的 `POSTGRES_BIND` 改成明确的内网地址或 `0.0.0.0`，并同时配置防火墙白名单。

## 更新部署

代码更新后在构建机重新打包镜像，在部署机加载新镜像并重启：

```bash
docker load -i gis-tools-images.tar
docker compose up -d
```

查看日志：

```powershell
docker compose logs -f frontend
docker compose logs -f backend
docker compose logs -f postgis
```

## 生产部署建议

| 项 | 建议 |
| --- | --- |
| 访问控制 | 系统无用户体系，公网部署前应放在 VPN、内网或带认证的反向代理后面 |
| 端口暴露 | 默认只对外暴露前端 `FRONTEND_PORT`；后端和 PostGIS 仅绑定 `127.0.0.1` |
| 后端 API 地址 | 前后端分离时，`config/frontend.env` 的 `VITE_API_BASE_URL` 必须填写浏览器可访问的后端地址；如果使用同源代理，则改 `config/nginx.conf` 的 `proxy_pass` |
| 数据库密码 | 必须修改 `config/postgis.env` 的 `POSTGRES_PASSWORD` 和 `config/backend.env` 的 `DB_PASSWORD`，两者保持一致 |
| 上传大小 | 当前 `config/nginx.conf` 的 `client_max_body_size` 为 `100m`，后端 body limit 为 `50mb`，大文件场景需同步调整 |
| 第三方服务 | OSM Overpass、高德 POI、地图瓦片都可能限流，应在生产环境做失败提示和重试策略 |
| 数据路径 | 后端只能访问容器内路径，需通过 volume 显式挂载本地数据目录 |
| 备份 | 定期备份 `postgis-data` 卷或使用 `pg_dump` 导出数据库 |

## 常见问题

| 问题 | 处理方式 |
| --- | --- |
| `localhost:8080` 打不开 | 执行 `docker compose ps`，确认 `frontend` 状态为 healthy；检查 `FRONTEND_PORT` 是否被占用 |
| 启动时报 `env file ... not found` | 先复制 `config/frontend.env.example`、`config/backend.env.example` 和 `config/postgis.env.example` 为对应 `.env` 文件 |
| 启动时报 `pull access denied` 或找不到镜像 | 先在部署机执行 `docker load -i gis-tools-images.tar`，确认 `docker images` 能看到 `.env` 中配置的镜像名和 tag |
| 部署机执行时触发构建 | 确认使用的是运行期 `docker-compose.yml`；构建只在构建机用 `docker-compose.build.yml` |
| `/api/health` 不通 | 查看 `docker compose logs backend`；确认 backend healthy |
| 数据库连接失败 | 确认 Host 是后端容器可访问的地址；容器内的 `localhost` 指向容器自身，不是宿主机或其它服务器 |
| 重新配置 `VITE_API_BASE_URL` 不生效 | 确认修改的是 `config/frontend.env`，然后执行 `docker compose restart frontend` |
| 读取本地文件失败 | 把文件放到 `docker-data` 目录，使用 `/data/...` 路径访问 |
