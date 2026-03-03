// src/hooks/useChat.ts
import { useState, useCallback, useRef } from "react";

export interface Message {
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: Date;
}

// Supabase Edge Function URL (환경변수로 관리)
const CHAT_API_URL = import.meta.env.VITE_SUPABASE_FUNCTION_URL
    ? `${import.meta.env.VITE_SUPABASE_FUNCTION_URL}/chat`
    : "http://localhost:54321/functions/v1/chat";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function useChat() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const inFlightRef = useRef(false);

    // ✅ messages를 ref로도 추적하여 stale closure 방지
    const messagesRef = useRef<Message[]>([]);
    messagesRef.current = messages;

    const sendMessage = useCallback(
        async (userInput: string) => {
            if (!userInput.trim() || inFlightRef.current) return;
            inFlightRef.current = true;

            setError(null);

            const userMessage: Message = {
                id: crypto.randomUUID(),
                role: "user",
                content: userInput.trim(),
                timestamp: new Date(),
            };

            // ✅ 함수형 업데이트로 최신 state 보장
            setMessages((prev) => [...prev, userMessage]);
            setIsLoading(true);

            try {
                abortControllerRef.current = new AbortController();

                // ✅ ref에서 최신 메시지 읽기 + 방금 추가한 userMessage 포함
                const apiMessages = [...messagesRef.current, userMessage].map((m) => ({
                    role: m.role,
                    content: m.content,
                }));

                const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as
                    | string
                    | undefined;
                const headers: Record<string, string> = {
                    "Content-Type": "application/json",
                };
                if (anon) {
                    headers.Authorization = `Bearer ${anon}`;
                    headers.apikey = anon;
                }

                const body = JSON.stringify({ messages: apiMessages, stream: true });
                const doFetch = () =>
                    fetch(CHAT_API_URL, {
                        method: "POST",
                        headers,
                        body,
                        signal: abortControllerRef.current!.signal,
                    });

                // 429/503 짧게 1회 재시도
                let response = await doFetch();
                if (response.status === 429 || response.status === 503) {
                    const ra = response.headers.get("retry-after");
                    const waitMs =
                        ra && !Number.isNaN(Number(ra)) ? Number(ra) * 1000 : 900;
                    await sleep(waitMs);
                    response = await doFetch();
                }

                if (!response.ok) {
                    const errData: any = await response.json().catch(() => ({}));
                    const detail = errData?.detail
                        ? `\n${String(errData.detail).slice(0, 500)}`
                        : "";
                    throw new Error(
                        (errData?.error || `API 오류 (${response.status})`) + detail
                    );
                }

                const contentType = response.headers.get("content-type") || "";

                if (contentType.includes("text/event-stream") && response.body) {
                    // ── SSE 스트리밍 처리 ──
                    const assistantId = crypto.randomUUID();
                    const assistantMessage: Message = {
                        id: assistantId,
                        role: "assistant",
                        content: "",
                        timestamp: new Date(),
                    };
                    setMessages((prev) => [...prev, assistantMessage]);

                    const reader = response.body.getReader();
                    const decoder = new TextDecoder();
                    let buffer = "";

                    const processLines = (lines: string[]) => {
                        for (const line of lines) {
                            if (!line.startsWith("data: ")) continue;
                            const payload = line.slice(6).trim();
                            if (!payload || payload === "[DONE]") continue;

                            try {
                                const json = JSON.parse(payload);
                                const token =
                                    json.candidates?.[0]?.content?.parts?.[0]?.text || "";
                                if (token) {
                                    setMessages((prev) =>
                                        prev.map((m) =>
                                            m.id === assistantId
                                                ? { ...m, content: m.content + token }
                                                : m
                                        )
                                    );
                                }
                            } catch {
                                // 파싱 실패한 줄은 무시
                            }
                        }
                    };

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) {
                            // ✅ 스트림 종료 시 버퍼에 남은 데이터 처리
                            if (buffer.trim()) {
                                processLines(buffer.split("\n"));
                            }
                            break;
                        }

                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split("\n");
                        buffer = lines.pop() || "";
                        processLines(lines);
                    }
                } else {
                    // ── 일반 JSON 응답 (폴백) ──
                    const data = await response.json();
                    const assistantMessage: Message = {
                        id: crypto.randomUUID(),
                        role: "assistant",
                        content: data.answer || "답변을 생성하지 못했습니다.",
                        timestamp: new Date(),
                    };
                    setMessages((prev) => [...prev, assistantMessage]);
                }
            } catch (err: any) {
                if (err.name === "AbortError") return;
                const errorMsg =
                    err.message || "답변을 가져오는 중 오류가 발생했습니다.";
                setError(errorMsg);
                console.error("Chat error:", err);
            } finally {
                setIsLoading(false);
                abortControllerRef.current = null;
                inFlightRef.current = false;
            }
        },
        [] // ✅ 의존성 비움 — messagesRef로 최신 state 접근
    );

    const clearChat = useCallback(() => {
        abortControllerRef.current?.abort();
        setMessages([]);
        setError(null);
        setIsLoading(false);
        inFlightRef.current = false;
    }, []);

    const cancelRequest = useCallback(() => {
        abortControllerRef.current?.abort();
        setIsLoading(false);
        inFlightRef.current = false;
    }, []);

    return {
        messages,
        isLoading,
        error,
        sendMessage,
        clearChat,
        cancelRequest,
    };
}