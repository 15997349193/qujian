# 拍照取件 · 测试页

手机拍照 → 上传到电脑 → 电脑按两位数取件码取走照片。

## 仓库内容

| 文件 | 作用 |
|---|---|
| `test.html` | 前端页面（存照片 / 取照片） |
| `server.js` | 本地同步服务，零依赖，只用 Node 内置模块 |
| `start-server.cmd` | Windows 一键启动脚本（自动查找 node） |
| `index.html` | GitHub Pages 首页，自动跳转到 `test.html` |

## 两种使用方式

### 1) 本地局域网同步（完整功能，推荐）

跨设备同步依赖 `server.js`，纯静态托管做不到。

```bash
node server.js          # 或双击 start-server.cmd
```

- 电脑端：http://localhost:8090/test.html
- 手机端：http://电脑IP:8090/test.html

默认端口 8090，可用环境变量 `PORT` 覆盖。照片保存在同目录 `_data/photos.json`。

> 注意：页面里的提示文案写的是 8788 端口，属于早期版本，实际以 `server.js` 的 8090 为准。

### 2) GitHub Pages 在线预览

https://15997349193.github.io/qujian/

只用于查看界面与演示。该地址没有后端，页面会提示「未检测到 server.js 服务」，
存/取照片不会真正同步——需要完整功能请按方式 1 在本机运行。
