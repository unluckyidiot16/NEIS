// src/components/ChatInput.tsx
import { useState, useRef, useEffect } from "react";

interface Props {
  onSend: (message: string) => void;
  isLoading: boolean;
  onCancel: () => void;
}

export default function ChatInput({ onSend, isLoading, onCancel }: Props) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 자동 높이 조절
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
    }
  }, [input]);

  const handleSubmit = () => {
    if (!input.trim() || isLoading) return;
    onSend(input);
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="chat-input-container">
      <div className="chat-input-wrapper">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="나이스(NEIS) 업무에 대해 질문해 보세요..."
          disabled={isLoading}
          rows={1}
        />
        {isLoading ? (
          <button className="btn-cancel" onClick={onCancel} title="취소">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </button>
        ) : (
          <button
            className="btn-send"
            onClick={handleSubmit}
            disabled={!input.trim()}
            title="전송"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        )}
      </div>
      <p className="input-hint">
        Shift+Enter로 줄바꿈 · 매뉴얼 기반 답변이므로 실제 NEIS 화면과 다를 수 있습니다
      </p>
    </div>
  );
}
