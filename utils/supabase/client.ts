
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
    return createBrowserClient(
        "https://elsandgluvhrleryqlpv.supabase.co",
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsc2FuZGdsdXZocmxlcnlxbHB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY1MDM3OTgsImV4cCI6MjA4MjA3OTc5OH0.CUpzJengruufA0WCBsxv4xz2ppeyK8eDnABoJaHzGw0"
    )
}
