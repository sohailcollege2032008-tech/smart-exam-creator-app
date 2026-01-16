'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';

export async function getUserSettings() {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.id)
        .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 is "Row not found"
        console.error('Error fetching settings:', error);
        return { success: false, error: error.message };
    }

    return { success: true, settings: data || null };
}

export async function updateUserSettings(settings: { gemini_api_key?: string; theme?: 'light' | 'dark' }) {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const { error } = await supabase
        .from('user_settings')
        .upsert({
            user_id: user.id,
            ...settings,
            updated_at: new Date().toISOString()
        });

    if (error) {
        console.error('Error updating settings:', error);
        return { success: false, error: error.message };
    }

    revalidatePath('/');
    return { success: true };
}
