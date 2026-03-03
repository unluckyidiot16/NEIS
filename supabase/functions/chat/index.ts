// supabase/functions/chat/index.ts
// Supabase Edge Function (Deno 런타임)
// - 질문에서 키워드 추출 → Supabase DB 검색(RAG) → Gemini REST API 답변 생성

import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// -----------------------------
// Env
// -----------------------------
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
const GEMINI_STREAM_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;

// -----------------------------
// Prompts
// -----------------------------
const SYSTEM_INSTRUCTION = `당신은 경기도 초등학교 교원 및 학교관리자를 위한 나이스(NEIS) 업무 지원 전문 AI 가이드입니다.

아래에 제공되는 "매뉴얼 발췌"(RAG 검색 결과)를 최우선 근거로 답변하세요.

## 답변 규칙
1) 매뉴얼에 명시된 정확한 메뉴 경로(예: [업무분장설정업무]-[학교업무분장]-[학교업무분장관리]-[부서관리])와 처리 절차를 단계별로 안내하세요.
2) 제공된 매뉴얼 발췌에 근거가 부족하면 "제공된 매뉴얼 발췌에서는 확인이 어렵습니다."라고 솔직히 말하고 지어내지 마세요.
3) 동료 교사에게 설명하듯 친절하고 전문적인 톤을 유지하세요.
4) 마지막에 반드시 근거를 "근거: (매뉴얼명 p.xx, p.yy ...)" 형태로 표기하세요.
`;

// -----------------------------
// 한국어 키워드 추출
// -----------------------------
// 조사·어미 패턴 (간이) — 형태소 분석기 없이도 핵심어 추출 가능
const KO_SUFFIX_RE =
    /(은|는|이|가|을|를|에서|에게|으로|로|와|과|의|도|만|부터|까지|에|라고|이라|해야|하는|하나요|인가요|인지|할까요|합니까|합니다|입니다|하세요|해주세요|알려주세요|안내해\s*주세요|설명해\s*주세요|해\s*주세요|어떻게|무엇|언제|어디|하고|되고|되는|되어|해서|하여|대해|대한|위해|위한|있는|없는|있나요|없나요)$/;

const KO_STOP_WORDS = new Set([
    "그", "이", "저", "것", "수", "등", "및", "더", "좀", "잘", "왜",
    "뭐", "어떤", "무슨", "어느", "모든", "나", "저", "우리",
    "방법", "절차", "방법을", "내용", "관련",
    "주세요", "안내해", "설명해", "알려", "부탁", "진행",
]);

// 조사 제거 시 원래 단어를 보존해야 하는 복합어 (뒤 글자가 조사처럼 보이는 경우)
const KO_PRESERVE = new Set([
    "학년도", "신학년도", "연도", "제도", "태도", "속도",
]);

function extractKeywords(question: string): string[] {
    // 1) 특수문자·구두점 제거, 소문자화
    const cleaned = question
        .replace(/[?!.,;:'"()\[\]{}<>~@#$%^&*+=\/\\|`—–·…""'']/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    // 2) 공백 기준 토큰화
    const tokens = cleaned.split(" ").filter(Boolean);

    // 3) 조사·어미 제거 + 불용어 필터
    const keywords: string[] = [];
    const seen = new Set<string>();

    for (const raw of tokens) {
        // 복합어 보존: "학년도" 등은 조사 제거 건너뜀
        let word = raw;
        if (!KO_PRESERVE.has(raw)) {
            word = raw.replace(KO_SUFFIX_RE, "").trim();
            word = word.replace(KO_SUFFIX_RE, "").trim();
        }

        if (word.length < 2) continue;
        if (KO_STOP_WORDS.has(word)) continue;

        const lower = word.toLowerCase();
        if (seen.has(lower)) continue;
        seen.add(lower);
        keywords.push(word);
    }

    return keywords;
}

// -----------------------------
// Types
// -----------------------------
interface ChatMessage {
    role: "user" | "assistant";
    content: string;
}

type ManualChunk = {
    source: string;
    page: number;
    content: string;
    score: number;
};

function pickLatestUserText(messages: ChatMessage[]): string {
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i]?.role === "user")
            return String(messages[i]?.content ?? "").trim();
    }
    return String(messages[messages.length - 1]?.content ?? "").trim();
}

function buildRagUserPrompt(question: string, chunks: ManualChunk[]) {
    const MAX_CHARS_PER_CHUNK = 1200;

    const excerpt = chunks
        .map((c, idx) => {
            const body = (c.content ?? "").slice(0, MAX_CHARS_PER_CHUNK);
            return `[#${idx + 1}] (${c.source} p.${c.page})\n${body}`;
        })
        .join("\n\n");

    return `질문:\n${question}\n\n매뉴얼 발췌(검색 결과):\n${excerpt}\n\n요청: 위 발췌만 근거로 답변하고, 마지막에 '근거:'로 페이지를 표기해줘.`;
}

function buildGeminiRequest(userPrompt: string) {
    return {
        contents: [
            {
                role: "user",
                parts: [{ text: userPrompt }],
            },
        ],
        systemInstruction: {
            parts: [{ text: SYSTEM_INSTRUCTION }],
        },
        generationConfig: {
            temperature: 0.3,
            topP: 0.8,
            maxOutputTokens: 8192,
        },
    };
}

// ✅ 키워드 배열도 함께 전달
async function searchChunks(
    question: string,
    keywords: string[],
    matchCount = 6
): Promise<ManualChunk[]> {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
        global: { headers: { "X-Client-Info": "neis-rag-edge" } },
    });

    const { data, error } = await supabase.rpc("search_manual_chunks", {
        query_text: question,
        match_count: matchCount,
        keywords,
    });

    if (error) {
        console.error("Supabase RPC error:", error);
        return [];
    }

    return (
        (data as any[] | null)?.map((r) => ({
            source: String(r.source),
            page: Number(r.page),
            content: String(r.content),
            score: Number(r.score ?? 0),
        })) ?? []
    );
}

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const { messages, stream = false } = await req.json();

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return new Response(
                JSON.stringify({ error: "messages 배열이 필요합니다." }),
                {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                }
            );
        }

        const question = pickLatestUserText(messages as ChatMessage[]);
        if (!question) {
            return new Response(
                JSON.stringify({ error: "질문이 비어있습니다." }),
                {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                }
            );
        }

        // ✅ 키워드 추출 후 검색
        const keywords = extractKeywords(question);
        console.log("Keywords:", keywords);

        const chunks = await searchChunks(question, keywords, 6);

        if (!chunks.length) {
            const fallback = `제공된 매뉴얼 발췌(검색 결과)에서 관련 근거를 찾지 못했습니다.\n\n질문: ${question}\n추출 키워드: ${keywords.join(", ")}`;
            return new Response(
                JSON.stringify({ answer: fallback, sources: [], keywords }),
                {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                }
            );
        }

        const userPrompt = buildRagUserPrompt(question, chunks);
        const geminiRequest = buildGeminiRequest(userPrompt);

        if (stream) {
            const response = await fetch(GEMINI_STREAM_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(geminiRequest),
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error("Gemini API Error:", errorText);
                return new Response(
                    JSON.stringify({
                        error: "Gemini API 호출 실패",
                        detail: errorText,
                    }),
                    {
                        status: response.status,
                        headers: { ...corsHeaders, "Content-Type": "application/json" },
                    }
                );
            }

            return new Response(response.body, {
                headers: {
                    ...corsHeaders,
                    "Content-Type": "text/event-stream",
                    "Cache-Control": "no-cache",
                    Connection: "keep-alive",
                },
            });
        }

        const response = await fetch(GEMINI_API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(geminiRequest),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Gemini API Error:", errorText);
            return new Response(
                JSON.stringify({
                    error: "Gemini API 호출 실패",
                    detail: errorText,
                }),
                {
                    status: response.status,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                }
            );
        }

        const data = await response.json();
        const answerText =
            data.candidates?.[0]?.content?.parts?.[0]?.text ||
            "답변을 생성하지 못했습니다.";

        const sources = chunks.map((c) => ({
            source: c.source,
            page: c.page,
            score: c.score,
        }));

        return new Response(JSON.stringify({ answer: answerText, sources }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (error) {
        console.error("Edge Function Error:", error);
        return new Response(
            JSON.stringify({
                error: "서버 오류가 발생했습니다.",
                detail: String(error),
            }),
            {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
        );
    }
});