import { MAX_MESSAGE_LENGTH } from "../config/uploadLimits.js";

export function ComposeForm({
  buttonText,
  content,
  isSubmitting,
  onChange,
  onSubmit
}) {
  return (
    <form className="message-form" aria-label="上传文本" onSubmit={onSubmit}>
      <textarea
        aria-label="文本内容"
        maxLength={MAX_MESSAGE_LENGTH}
        onChange={(event) => onChange(event.target.value)}
        placeholder="输入文本"
        value={content}
      />
      <button disabled={isSubmitting} type="submit">
        {buttonText}
      </button>
    </form>
  );
}
