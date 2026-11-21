import { ComposeForm } from "./components/ComposeForm.jsx";
import { useUploadMessage } from "./hooks/useUploadMessage.js";

export default function App() {
  const { buttonText, content, isSubmitting, setContent, submitMessage } =
    useUploadMessage();

  return (
    <ComposeForm
      buttonText={buttonText}
      content={content}
      isSubmitting={isSubmitting}
      onChange={setContent}
      onSubmit={submitMessage}
    />
  );
}
