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
            is_batch: newJob.isBatch || false,
            data: newJob.data,
            metadata: newJob.metadata,
            batch_items: newJob.batchItems || []
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
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        const jobs: Job[] = data.map((row: any) => ({
            id: row.id,
            name: row.name,
            type: row.type,
            createdAt: row.created_at,
            isBatch: row.is_batch,
            data: row.data,
            metadata: row.metadata,
            batchItems: row.batch_items
        }));
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
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        if (!data) throw new Error('Job not found');

        const job: Job = {
            id: data.id,
            name: data.name,
            type: data.type,
            createdAt: data.created_at,
            isBatch: data.is_batch,
            data: data.data,
            metadata: data.metadata,
            batchItems: data.batch_items
        };

        return { success: true, job };
    } catch (error: any) {
        console.error('Failed to get job:', error);
        return { success: false, error: error.message };
    }
}

export async function updateJob(id: string, updates: Partial<Job>): Promise<{ success: boolean; error?: string }> {
    try {
        const supabase = await createClient();

        // Prepare updates mapping
        const dbUpdates: any = {};
        if (updates.name !== undefined) dbUpdates.name = updates.name;
        if (updates.type !== undefined) dbUpdates.type = updates.type;
        if (updates.isBatch !== undefined) dbUpdates.is_batch = updates.isBatch;
        if (updates.data !== undefined) dbUpdates.data = updates.data;
        if (updates.metadata !== undefined) dbUpdates.metadata = updates.metadata;
        if (updates.batchItems !== undefined) dbUpdates.batch_items = updates.batchItems;
        dbUpdates.updated_at = new Date().toISOString();

        const { error } = await supabase
            .from('jobs')
            .update(dbUpdates)
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
        const res = await getJobById(id);
        if (!res.success || !res.job) throw new Error(res.error || "Job not found");

        const existingJob = res.job;
        const newJobName = `${existingJob.name} (Copy)`;

        return saveJob({
            ...existingJob,
            name: newJobName
        });
    } catch (error: any) {
        console.error('Failed to duplicate job:', error);
        return { success: false, error: error.message };
    }
}


