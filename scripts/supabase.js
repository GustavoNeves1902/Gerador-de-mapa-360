const SUPABASE_URL = "https://nanmaoifoemjpfnsrwds.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5hbm1hb2lmb2VtanBmbnNyd2RzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNjkxMjcsImV4cCI6MjA4MTY0NTEyN30.WgkrkfvE7Yzl6iBO80VBtvbwdGb4261bqM5IaTTGfWo";

window.supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);
