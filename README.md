# 拍照取件 · 测试页

手机拍照 → 上传到电脑 → 电脑按两位数取件码取走照片。

**页面按访问地址自动区分角色：**

| 打开方式 | 显示内容 |
|---|---|
| 电脑端 `http://localhost:8788/test.html` | 只显示「取照片」 |
| 手机端 `http://电脑IP:8788/test.html` | 只显示「存照片」 |

## 仓库内容

| 文件 | 作用 |
|---|---|
| `test.html` | 前端页面（自动判断手机/电脑角色） |
| `server.js` | 本地同步服务，零依赖，只用 Node 内置模块，默认端口 **8788** |
| `start-server.cmd` | 手动启动（带黑色窗口，可看日志） |
| `start-server-hidden.cmd` | 静默启动（已在运行则自动跳过） |
| `server-hidden.vbs` | 无窗口启动入口（配合开机自启使用） |
| `stop-server.cmd` | 停止服务 |
| `index.html` | GitHub Pages 首页，自动跳转到 `test.html` |

## 使用（完整功能需在本机运行 server.js）

```bash
node server.js        # 或双击 start-server.cmd
```

- 电脑端：http://localhost:8788/test.html
- 手机端（连同一 WiFi / 电脑热点）：http://电脑IP:8788/test.html

### 开机自动后台运行（无黑窗口）

1. 把 `server-hidden.vbs` 复制到启动文件夹：
   按 `Win+R` 输入 `shell:startup` 回车，把 vbs 放进去；
2. 开机后服务自动在后台运行，全程无窗口；
3. 想停止：双击 `stop-server.cmd`；想看日志：双击 `start-server.cmd`。

照片保存在同目录 `_data/`（`photos.json` + `uploads/`）。

## GitHub Pages 在线预览

https://15997349193.github.io/qujian/

只用于查看界面。该地址没有后端，会显示「未连接服务」，
存/取照片不会真正同步——完整功能请在本机运行 server.js。
