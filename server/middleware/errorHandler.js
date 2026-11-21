export function errorHandler(error, _req, res, _next) {
  console.error(error);
  res.status(500).json({ error: "服务器内部错误。" });
}
