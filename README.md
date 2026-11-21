# React 文本上传

一个极简 React 全栈项目。功能只有一个：前端填写文本并上传，后端把文本保存到 SQLite。

## 运行

```bash
npm install
npm run dev
```

打开：

```text
http://localhost:8100
```

服务监听地址为 `0.0.0.0:8100`。

## 接口

- `POST /api/messages`：写入文本，请求体为 `{ "content": "..." }`
- 单条文本上限为 `100000` 个字符

SQLite 数据库文件会自动创建在 `data/messages.sqlite`。

## 目录结构

```text
server/
  app.js                         Express 应用组装
  config.js                      端口和路径配置
  db/sqlite.js                   SQLite 初始化
  middleware/errorHandler.js     统一错误响应
  repositories/messagesRepository.js
                                 文本写入数据库
  routes/messagesRoutes.js       上传接口
  staticAssets.js                前端资源挂载

src/
  api/messagesApi.js             前端上传请求
  components/ComposeForm.jsx     文本表单
  components/StatusMessage.jsx   上传状态
  hooks/useUploadMessage.js      上传状态逻辑
  styles/                        页面样式分层
```
