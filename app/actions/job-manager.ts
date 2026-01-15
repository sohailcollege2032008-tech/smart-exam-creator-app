'use server';

import { writeFile, readFile, readdir, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { Job } from '@/lib/types';

const DATA_DIR = join(process.cwd(), 'data', 'jobs');

// Ensure data directory exists
async function ensureDir() {
    try {
        await mkdir(DATA_DIR, { recursive: true });
    } catch (e) {
        // Ignore if exists
    }
}

export async function saveJob(job: Omit<Job, 'id' | 'createdAt'>): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
        await ensureDir();
        const id = crypto.randomUUID();
        const newJob: Job = {
            ...job,
            id,
            createdAt: new Date().toISOString()
        };

        const filePath = join(DATA_DIR, `${id}.json`);
        await writeFile(filePath, JSON.stringify(newJob, null, 2));

        return { success: true, id };
    } catch (error: any) {
        console.error('Failed to save job:', error);
        return { success: false, error: error.message };
    }
}

export async function getJobs(): Promise<{ success: boolean; jobs: Job[]; error?: string }> {
    try {
        await ensureDir();
        const files = await readdir(DATA_DIR);
        const jobs: Job[] = [];

        for (const file of files) {
            if (file.endsWith('.json')) {
                try {
                    const content = await readFile(join(DATA_DIR, file), 'utf-8');
                    const job = JSON.parse(content);
                    jobs.push(job);
                } catch (e) {
                    console.warn(`Skipping invalid job file: ${file}`, e);
                }
            }
        }

        // Sort by date desc
        jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        return { success: true, jobs };
    } catch (error: any) {
        console.error('Failed to get jobs:', error);
        return { success: false, jobs: [], error: error.message };
    }
}

export async function deleteJob(id: string): Promise<{ success: boolean; error?: string }> {
    try {
        const filePath = join(DATA_DIR, `${id}.json`);
        await unlink(filePath);
        return { success: true };
    } catch (error: any) {
        console.error('Failed to delete job:', error);
        return { success: false, error: error.message };
    }
}

export async function getJobById(id: string): Promise<{ success: boolean; job?: Job; error?: string }> {
    try {
        const filePath = join(DATA_DIR, `${id}.json`);
        const content = await readFile(filePath, 'utf-8');
        const job = JSON.parse(content);
        return { success: true, job };
    } catch (error: any) {
        console.error('Failed to get job:', error);
        return { success: false, error: error.message };
    }
}

export async function updateJob(id: string, updates: Partial<Job>): Promise<{ success: boolean; error?: string }> {
    try {
        const filePath = join(DATA_DIR, `${id}.json`);
        const content = await readFile(filePath, 'utf-8');
        const existingJob = JSON.parse(content);

        const updatedJob = { ...existingJob, ...updates };
        await writeFile(filePath, JSON.stringify(updatedJob, null, 2));
        return { success: true };
    } catch (error: any) {
        console.error('Failed to update job:', error);
        return { success: false, error: error.message };
    }
}

export async function duplicateJob(id: string): Promise<{ success: boolean; newJob?: Job; error?: string }> {
    try {
        const filePath = join(DATA_DIR, `${id}.json`);
        const content = await readFile(filePath, 'utf-8');
        const existingJob = JSON.parse(content);

        const newId = crypto.randomUUID();
        const newJob: Job = {
            ...existingJob,
            id: newId,
            name: `${existingJob.name} (Copy)`,
            createdAt: new Date().toISOString()
        };

        const newFilePath = join(DATA_DIR, `${newId}.json`);
        await writeFile(newFilePath, JSON.stringify(newJob, null, 2));

        return { success: true, newJob };
    } catch (error: any) {
        console.error('Failed to duplicate job:', error);
        return { success: false, error: error.message };
    }
}
