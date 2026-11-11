import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
export const C={URL:'https://gbeurqibcfvquacasofq.supabase.co',KEY:'sb_publishable_nsSCuh8LeO3ug4CjHbeZuw_O-d4IMCM'};
export const sb=createClient(C.URL,C.KEY,{auth:{detectSessionInUrl:true,persistSession:true}});
