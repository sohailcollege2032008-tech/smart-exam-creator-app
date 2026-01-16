'use client';

import { createClient } from '@/utils/supabase/client';
import { User } from '@supabase/supabase-js';
import { LogIn, LogOut, User as UserIcon } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export function UserAuthButton() {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();
    const supabase = createClient();

    useEffect(() => {
        const getUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            setUser(user);
            setLoading(false);
        };

        getUser();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
        });

        return () => {
            subscription.unsubscribe();
        };
    }, [supabase]);

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.refresh();
    };

    if (loading) {
        return <div className="h-8 w-8 animate-pulse bg-slate-200 dark:bg-slate-700 rounded-full" />;
    }

    return user ? (
        <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <UserIcon className="w-4 h-4" />
                <span className="hidden sm:inline-block max-w-[150px] truncate">
                    {user.email}
                </span>
            </div>
            <button
                onClick={handleSignOut}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
            >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Sign out</span>
            </button>
        </div>
    ) : (
        <Link
            href="/login"
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors shadow-sm shadow-indigo-500/30"
        >
            <LogIn className="w-4 h-4" />
            <span>Sign in</span>
        </Link>
    );
}
