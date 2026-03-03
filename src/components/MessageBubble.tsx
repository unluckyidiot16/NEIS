// src/components/MessageBubble.tsx
import { ReactNode } from "react";
import { Message } from "../hooks/useChat";

interface Props {
    message: Message;
}

// PDF URL (Supabase Storage public bucket)
const MANUAL_PDF_URL = import.meta.env.VITE_MANUAL_PDF_URL || "";

// 매뉴얼 소스명 → PDF URL 매핑 (복수 매뉴얼 대응)
function getPdfUrl(_source: string): string {
    // 현재는 단일 매뉴얼이므로 기본 URL 사용
    // 추후 매뉴얼이 늘어나면 여기서 분기
    return MANUAL_PDF_URL;
}

/**
 * "근거:" 줄에서 페이지 번호를 파싱하여 클릭 가능한 링크로 변환
 * 패턴: "근거: 교무업무_매뉴얼 p.13, p.135, p.213, p.323"
 * 패턴: "근거: (교무업무_매뉴얼 p.13, p.135)"
 */
function parseSourceLine(text: string): ReactNode | null {
    // "근거:" 또는 "근거 :" 로 시작하는지 확인
    const sourceMatch = text.match(/^근거\s*[:：]\s*(.+)$/);
    if (!sourceMatch) return null;

    const body = sourceMatch[1];

    // 매뉴얼명 추출 (괄호 안이든 밖이든)
    const manualMatch = body.match(/\(?([가-힣_]+매뉴얼[가-힣_]*)/);
    const source = manualMatch ? manualMatch[1] : "";
    const pdfUrl = getPdfUrl(source);

    // 페이지 번호 추출: p.숫자 또는 p숫자
    const pageRe = /p\.?\s*(\d+)/g;
    const nodes: ReactNode[] = [];
    let lastIdx = 0;
    let pageMatch: RegExpExecArray | null;
    let keyIdx = 0;

    // "근거: " 라벨
    nodes.push(
        <span key="label" className="source-label">📄 근거: </span>
    );

    // 매뉴얼명 (페이지 앞부분)
    if (source) {
        nodes.push(
            <span key="manual" className="source-manual">{source} </span>
        );
    }

    // 본문에서 페이지 번호를 링크로 변환
    const bodyAfterManual = source
        ? body.slice(body.indexOf(source) + source.length)
        : body;

    while ((pageMatch = pageRe.exec(bodyAfterManual)) !== null) {
        // 페이지 매치 전 텍스트 (쉼표, 공백 등)
        if (pageMatch.index > lastIdx) {
            const between = bodyAfterManual.slice(lastIdx, pageMatch.index);
            // 구분자 텍스트에서 괄호 등 제거
            const cleaned = between.replace(/[()]/g, "").trim();
            if (cleaned) {
                nodes.push(<span key={`sep-${keyIdx}`}>{cleaned} </span>);
            }
        }

        const pageNum = pageMatch[1];

        if (pdfUrl) {
            nodes.push(
                <a
                    key={`page-${keyIdx}`}
                    className="source-page-link"
                    href={`${pdfUrl}#page=${pageNum}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`매뉴얼 ${pageNum}페이지 열기`}
                >
                    p.{pageNum}
                </a>
            );
        } else {
            nodes.push(
                <span key={`page-${keyIdx}`} className="source-page">
          p.{pageNum}
        </span>
            );
        }

        lastIdx = pageMatch.index + pageMatch[0].length;
        keyIdx++;
    }

    // 남은 텍스트
    if (lastIdx < bodyAfterManual.length) {
        const remaining = bodyAfterManual.slice(lastIdx).replace(/[()]/g, "").trim();
        if (remaining) {
            nodes.push(<span key="tail">{remaining}</span>);
        }
    }

    return <div className="source-references">{nodes}</div>;
}

/**
 * 텍스트 인라인 마크업을 React 엘리먼트로 변환 (XSS-safe)
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
        // 근거 줄은 특별 렌더링
        const sourceLine = parseSourceLine(line.trim());
        if (sourceLine) return <div key={i}>{sourceLine}</div>;

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