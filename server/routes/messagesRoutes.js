import { Router } from "express";
import { MAX_MESSAGE_LENGTH } from "../config/uploadLimits.js";
import { createMessage } from "../repositories/messagesRepository.js";

export const messagesRoutes = Router();

messagesRoutes.post("/messages", (req, res, next) => {
  try {
    const content = String(req.body?.content ?? "").trim();

    if (!content) {
      return res.status(400).json({ error: "请输入要上传的文本。" });
    }

    if (content.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ error: "文本过长。" });
    }

    res.status(201).json({ message: createMessage(content) });
  } catch (error) {
    next(error);
  }
});
