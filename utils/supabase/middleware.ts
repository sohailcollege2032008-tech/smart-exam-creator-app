
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
    let response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    })

    const supabase = createServerClient(
        "https://elsandgluvhrleryqlpv.supabase.co",
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsc2FuZGdsdXZocmxlcnlxbHB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY1MDM3OTgsImV4cCI6MjA4MjA3OTc5OH0.CUpzJengruufA0WCBsxv4xz2ppeyK8eDnABoJaHzGw0",
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) => {
                        request.cookies.set(name, value)
                        response.cookies.set(name, value, options)
                    })
                },
            },
        }
    )

    await supabase.auth.getUser()

    return response
}
