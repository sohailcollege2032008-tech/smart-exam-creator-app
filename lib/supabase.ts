
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://elsandgluvhrleryqlpv.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsc2FuZGdsdXZocmxlcnlxbHB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY1MDM3OTgsImV4cCI6MjA4MjA3OTc5OH0.CUpzJengruufA0WCBsxv4xz2ppeyK8eDnABoJaHzGw0";

if (!supabaseUrl || !supabaseKey) {
    console.warn('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseKey);
