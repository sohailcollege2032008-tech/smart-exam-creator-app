
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
    const cookieStore = await cookies()

    return createServerClient(
        "https://elsandgluvhrleryqlpv.supabase.co",
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsc2FuZGdsdXZocmxlcnlxbHB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY1MDM3OTgsImV4cCI6MjA4MjA3OTc5OH0.CUpzJengruufA0WCBsxv4xz2ppeyK8eDnABoJaHzGw0",
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll()
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options)
                        )
                    } catch {
                        // The `setAll` method was called from a Server Component.
                        // This can be ignored if you have middleware refreshing
                        // user sessions.
                    }
                },
            },
        }
    )
}
