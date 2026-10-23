-- store_extraction was replaced by apply_ops in M3 step 2 (D42) and no deployed code calls it any more.
drop function public.store_extraction(uuid, jsonb);
