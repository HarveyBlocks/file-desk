import { useEffect, useRef, useState } from "react";
import { uploadMessage } from "../api/messagesApi.js";
import { MAX_MESSAGE_LENGTH } from "../config/uploadLimits.js";

export function useUploadMessage() {
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [buttonText, setButtonText] = useState("提交");
  const resetTimerRef = useRef();

  useEffect(() => {
    return () => {
      clearTimeout(resetTimerRef.current);
    };
  }, []);

  function flashButton(text) {
    clearTimeout(resetTimerRef.current);
    setButtonText(text);
    resetTimerRef.current = setTimeout(() => {
      setButtonText("提交");
    }, 1200);
  }

  async function submitMessage(event) {
    event.preventDefault();

    const trimmedContent = content.trim();

    if (!trimmedContent) {
      flashButton("请输入文本");
      return;
    }

    if (trimmedContent.length > MAX_MESSAGE_LENGTH) {
      flashButton("文本过长");
      return;
    }

    setIsSubmitting(true);
    setButtonText("提交中");

    try {
      await uploadMessage(trimmedContent);
      setContent("");
      flashButton("已提交");
    } catch {
      flashButton("提交失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  return {
    buttonText,
    content,
    isSubmitting,
    setContent,
    submitMessage
  };
}
