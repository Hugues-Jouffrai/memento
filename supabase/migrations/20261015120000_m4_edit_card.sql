-- M4: edit a card while reviewing. The question and answer change, the version goes up, and the scheduling
-- state and the review log stay as they are (the log keeps the version each review was graded on, R-SCH-02).
-- Runs as the signed-in user: ownership is checked with auth.uid() (R-SEC-01).
create function public.edit_card(p_card_id uuid, p_question text, p_answer text) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_version integer;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if btrim(coalesce(p_question, '')) = '' or btrim(coalesce(p_answer, '')) = ''
     or length(p_question) > 1000 or length(p_answer) > 1000 then
    raise exception 'question and answer must be 1 to 1000 characters' using errcode = '22023';
  end if;
  update public.card
     set question = btrim(p_question), answer = btrim(p_answer), version = version + 1
   where id = p_card_id and user_id = auth.uid() and status in ('proposed', 'active', 'suspended')
  returning version into v_version;
  return v_version; -- null when the card is not the user's or is discarded or retired
end $$;

revoke all on function public.edit_card(uuid, text, text) from public, anon;
grant execute on function public.edit_card(uuid, text, text) to authenticated;
