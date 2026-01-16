'use server';

import { createClient } from '@/utils/supabase/server';
import { Job } from '@/lib/types';

export async function saveJob(job: Omit<Job, 'id' | 'createdAt'>): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
        const supabase = await createClient();

        // Check if user is authenticated
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return { success: false, error: 'Unauthorized: You must be logged in to save jobs.' };
        }

        const id = crypto.randomUUID();
        const newJob: Job = {
            ...job,
            id,
            createdAt: new Date().toISOString()
        };

        const { error } = await supabase.from('jobs').insert({
            id,
            created_at: newJob.createdAt,
            name: newJob.name,
            type: newJob.type,
            user_id: user.id,
            payload: newJob
        });

        if (error) throw error;

        return { success: true, id };
    } catch (error: any) {
        console.error('Failed to save job:', error);
        return { success: false, error: error.message };
    }
}

export async function getJobs(): Promise<{ success: boolean; jobs: Job[]; error?: string }> {
    try {
        const supabase = await createClient();

        const { data, error } = await supabase
            .from('jobs')
            .select('payload, created_at')
            .order('created_at', { ascending: false });

        if (error) throw error;

        const jobs = data.map((row: any) => row.payload as Job);
        return { success: true, jobs };
    } catch (error: any) {
        console.error('Failed to get jobs:', error);
        return { success: false, jobs: [], error: error.message };
    }
}

export async function deleteJob(id: string): Promise<{ success: boolean; error?: string }> {
    try {
        const supabase = await createClient();
        const { error } = await supabase.from('jobs').delete().eq('id', id);
        if (error) throw error;
        return { success: true };
    } catch (error: any) {
        console.error('Failed to delete job:', error);
        return { success: false, error: error.message };
    }
}

export async function getJobById(id: string): Promise<{ success: boolean; job?: Job; error?: string }> {
    try {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('jobs')
            .select('payload')
            .eq('id', id)
            .single();

        if (error) throw error;
        if (!data) throw new Error('Job not found');

        return { success: true, job: data.payload };
    } catch (error: any) {
        console.error('Failed to get job:', error);
        return { success: false, error: error.message };
    }
}

export async function updateJob(id: string, updates: Partial<Job>): Promise<{ success: boolean; error?: string }> {
    try {
        const supabase = await createClient();
        // Fetch existing to merge (since we store full payload)
        const { data: existing, error: fetchError } = await supabase
            .from('jobs')
            .select('payload')
            .eq('id', id)
            .single();

        if (fetchError) throw fetchError;

        const updatedJob = { ...existing.payload, ...updates };

        const { error } = await supabase
            .from('jobs')
            .update({
                name: updatedJob.name, // update columns if name changed
                payload: updatedJob
            })
            .eq('id', id);

        if (error) throw error;

        return { success: true };
    } catch (error: any) {
        console.error('Failed to update job:', error);
        return { success: false, error: error.message };
    }
}

export async function duplicateJob(id: string): Promise<{ success: boolean; newJob?: Job; error?: string }> {
    try {
        const supabase = await createClient();
        const { data: existing, error: fetchError } = await supabase
            .from('jobs')
            .select('payload')
            .eq('id', id)
            .single();

        if (fetchError) throw fetchError;

        const existingJob = existing.payload;
        const newId = crypto.randomUUID();
        const newJob: Job = {
            ...existingJob,
            id: newId,
            name: `${existingJob.name} (Copy)`,
            createdAt: new Date().toISOString()
        };

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("User not found");

        const { error } = await supabase.from('jobs').insert({
            id: newId,
            created_at: newJob.createdAt,
            name: newJob.name,
            type: newJob.type,
            user_id: user.id,
            payload: newJob
        });

        if (error) throw error;

        return { success: true, newJob };
    } catch (error: any) {
        console.error('Failed to duplicate job:', error);
        return { success: false, error: error.message };
    }
}


