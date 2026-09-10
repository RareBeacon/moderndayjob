-- 018_free_tool_output_text_default.sql
-- Some early Free Tools 2.0 environments have output_text as a NOT NULL
-- compatibility column. Keep it harmless so inserts using result_text work.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'free_tool_results'
      and column_name = 'output_text'
  ) then
    alter table public.free_tool_results alter column output_text set default '';
    update public.free_tool_results set output_text = coalesce(output_text, result_text, '') where output_text is null;
  end if;
end $$;
