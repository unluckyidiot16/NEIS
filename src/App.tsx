// src/App.tsx
import { useEffect, useRef } from "react";
import { useChat } from "./hooks/useChat";
import MessageBubble from "./components/MessageBubble";
import ChatInput from "./components/ChatInput";
import FaqButtons from "./components/FaqButtons";
import "./styles/app.css";

export default function App() {
  const { messages, isLoading, error, sendMessage, clearChat, cancelRequest } =
    useChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 새 메시지 시 자동 스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const isEmpty = messages.length === 0;

  return (
    <div className="app">
      {/* 헤더 */}
      <header className="header">
        <div className="header-inner">
          <div className="header-left">
            <div className="logo">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
            </div>
            <div>
              <h1>나이스 가이드</h1>
              <p className="subtitle">NEIS 업무 AI 도우미</p>
            </div>
          </div>
          {!isEmpty && (
            <button className="btn-clear" onClick={clearChat}>
              새 대화
            </button>
          )}
        </div>
      </header>

      {/* 채팅 영역 */}
      <main className="chat-area">
        {isEmpty ? (
          <div className="welcome">
            <div className="welcome-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
            </div>
            <h2>나이스(NEIS) 업무,<br />무엇이든 물어보세요</h2>
            <p className="welcome-desc">
              교무업무 매뉴얼과 학교관리자 매뉴얼을 기반으로<br />
              정확한 메뉴 경로와 처리 절차를 안내해 드립니다.
            </p>
            <FaqButtons onSelect={sendMessage} disabled={isLoading} />
          </div>
        ) : (
          <div className="messages">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}

            {/* 로딩 인디케이터 */}
            {isLoading && (
              <div className="message-bubble assistant">
                <div className="avatar">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                  </svg>
                </div>
                <div className="bubble-content">
                  <div className="typing-indicator">
                    <span></span><span></span><span></span>
                  </div>
                </div>
              </div>
            )}

            {/* 에러 메시지 */}
            {error && (
              <div className="error-message">
                <p>⚠️ {error}</p>
                <button onClick={() => window.location.reload()}>
                  새로고침
                </button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      {/* 입력창 */}
      <ChatInput
        onSend={sendMessage}
        isLoading={isLoading}
        onCancel={cancelRequest}
      />
    </div>
  );
}
