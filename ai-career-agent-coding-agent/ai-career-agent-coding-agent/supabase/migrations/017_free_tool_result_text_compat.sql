-- 017_free_tool_result_text_compat.sql
-- Compatibility for early Free Tools 2.0 table shape where saved output text
-- was named output_text. The application uses result_text going forward.

alter table public.free_tool_results add column if not exists result_text text;

update public.free_tool_results
set result_text = coalesce(result_text, output_text, '')
where result_text is null;

alter table public.free_tool_results alter column result_text set default '';
alter table public.free_tool_results alter column result_text set not null;

comment on column public.free_tool_results.result_text is 'Plain text representation used for copy/download/save unlock actions.';
