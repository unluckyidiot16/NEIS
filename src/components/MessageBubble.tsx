// src/components/MessageBubble.tsx
import { ReactNode } from "react";
import { Message } from "../hooks/useChat";

interface Props {
    message: Message;
}

/**
 * 텍스트 인라인 마크업을 React 엘리먼트로 변환 (XSS-safe)
 * - **bold** → <strong>
 * - [메뉴경로] → <span class="menu-path">
 */
function parseInline(text: string): ReactNode[] {
    const TOKEN_RE = /(\*\*(.+?)\*\*)|(\[([^\]]+)\])/g;
    const nodes: ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = TOKEN_RE.exec(text)) !== null) {
        if (match.index > lastIndex) {
            nodes.push(text.slice(lastIndex, match.index));
        }

        if (match[1]) {
            nodes.push(<strong key={match.index}>{match[2]}</strong>);
        } else if (match[3]) {
            nodes.push(
                <span key={match.index} className="menu-path">
          [{match[4]}]
        </span>
            );
        }

        lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
        nodes.push(text.slice(lastIndex));
    }

    return nodes.length > 0 ? nodes : [text];
}

function renderContent(text: string) {
    return text.split("\n").map((line, i) => {
        const isListItem = /^\d+[.)]\s/.test(line);

        return (
            <p key={i} className={isListItem ? "list-item" : ""}>
                {parseInline(line)}
            </p>
        );
    });
}

export default function MessageBubble({ message }: Props) {
    const isUser = message.role === "user";

    return (
        <div className={`message-bubble ${isUser ? "user" : "assistant"}`}>
            {!isUser && (
                <div className="avatar">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                    </svg>
                </div>
            )}
            <div className="bubble-content">
                {isUser ? <p>{message.content}</p> : renderContent(message.content)}
            </div>
        </div>
    );
}