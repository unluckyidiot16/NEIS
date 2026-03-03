-- supabase/migrations/20260303_manual_rag.sql
-- Minimal RAG schema (manual chunks + keyword-based search RPC)

-- 1) Extensions
create extension if not exists pg_trgm;

-- 2) Table
create table if not exists public.manual_chunks (
                                                    id bigserial primary key,
                                                    source text not null,                 -- e.g. '교무업무_매뉴얼', '학교관리자_매뉴얼'
                                                    page int not null,                    -- 1-based page number
                                                    chunk_index int not null,             -- chunk within the page
                                                    content text not null,
                                                    created_at timestamptz not null default now(),
    unique (source, page, chunk_index)
    );

-- 3) Indexes
create index if not exists manual_chunks_source_page_idx
    on public.manual_chunks (source, page);

create index if not exists manual_chunks_content_trgm_idx
    on public.manual_chunks using gin (content gin_trgm_ops);

-- 4) RLS
alter table public.manual_chunks enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'manual_chunks' and policyname = 'public_read'
  ) then
    create policy public_read
      on public.manual_chunks
      for select
                              using (true);
end if;
end$$;

-- 5) Search RPC v2 — 키워드 배열 기반 (한국어 긴 문장 대응)
--    Edge Function에서 질문을 핵심 키워드로 분리한 뒤 keywords 파라미터로 전달
--    query_text는 원문 그대로 (word_similarity 랭킹용)
drop function if exists public.search_manual_chunks(text, int);

create or replace function public.search_manual_chunks(
  query_text text,
  match_count int default 6,
  keywords text[] default '{}'::text[]
)
returns table(source text, page int, content text, score real)
language plpgsql
stable
as $$
declare
kw_len int := coalesce(array_length(keywords, 1), 0);
  min_hits int;
begin
  -- 키워드 중 최소 몇 개가 매칭되어야 하는지 (최소 1, 키워드의 1/3)
  min_hits := greatest(1, kw_len / 3);

  perform set_limit(0.05);

return query
select
    mc.source,
    mc.page,
    mc.content,
    -- 랭킹: 키워드 히트 수 + word_similarity 가중 합산
    (
        coalesce(
                (select count(*)::real from unnest(keywords) kw where mc.content ilike '%' || kw || '%'),
        0
      ) / greatest(kw_len, 1)::real * 0.6
      +
      greatest(
        word_similarity(query_text, mc.content),
        similarity(mc.content, query_text)
      ) * 0.4
        )::real as score
from public.manual_chunks mc
where
    -- 조건 A: 키워드 N개 이상 포함
    (kw_len > 0 and (
        select count(*) from unnest(keywords) kw
        where mc.content ilike '%' || kw || '%'
        ) >= min_hits)
    or
    -- 조건 B: trigram word_similarity (짧은 질문 폴백)
    query_text %> mc.content
    or
    -- 조건 C: 전체 쿼리 부분 문자열 매칭 (정확한 용어 검색)
    mc.content ilike '%' || query_text || '%'
order by score desc
    limit match_count;
end;
$$;

grant execute on function public.search_manual_chunks(text, int, text[]) to anon, authenticated;