'use client';

import { createClient } from '@/utils/supabase/client';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function LoginPage() {
    const supabase = createClient();
    const router = useRouter();
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((event) => {
            if (event === 'SIGNED_IN') {
                router.refresh();
                router.push('/');
            }
        });

        return () => subscription.unsubscribe();
    }, [supabase, router]);

    if (!isClient) return null;

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-4">
            <div className="w-full max-w-md bg-white dark:bg-slate-800 p-8 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700">
                <div className="mb-6 text-center">
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Welcome Back</h1>
                    <p className="text-slate-500 dark:text-slate-400">Sign in to Smart Exam Creator</p>
                </div>

                <Auth
                    supabaseClient={supabase}
                    appearance={{
                        theme: ThemeSupa,
                        variables: {
                            default: {
                                colors: {
                                    brand: '#4f46e5',
                                    brandAccent: '#4338ca',
                                },
                            },
                        },
                        className: {
                            container: 'w-full',
                            button: 'w-full px-4 py-2 rounded-lg font-medium',
                            input: 'w-full px-4 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600',
                        }
                    }}
                    providers={['google', 'github']}
                    redirectTo={`${location.origin}/auth/callback`}
                    theme="dark" // Or dynamic based on system
                />
            </div>
        </div>
    );
}
