'use server';

import { YoutubeTranscript } from 'youtube-transcript';
import { join } from 'path';
import { unlink, stat, readFile, readdir } from 'fs/promises';
import { spawn } from 'child_process';
import os from 'os';
import fs from 'fs';

// YouTube Data API Key from environment variable
const YOUTUBE_DATA_API_KEY = process.env.YOUTUBE_DATA_API_KEY || '';



export type YoutubeProcessResult =
    | { success: false; error: string }
    | { success: true; type: 'text'; content: string; title?: string }
    | { success: true; type: 'audio'; fileUri: string; mimeType: string; title?: string };

function extractVideoId(url: string): string | null {
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[7].length == 11) ? match[7] : null;
}

// Helper: Try to fetch transcript using yt-dlp (The "Deep Search" method)
async function fetchTranscriptWithYtDlp(url: string): Promise<string | null> {
    console.log("Attempting Deep Transcript Fetch with yt-dlp...");
    const projectRoot = process.cwd();
    const binaryPath = join(projectRoot, 'node_modules', 'yt-dlp-exec', 'bin', 'yt-dlp.exe');

    if (!fs.existsSync(binaryPath)) return null;

    const tempDir = os.tmpdir();
    const timestamp = Date.now();
    const baseName = `sub_${timestamp}`;
    const outputTemplate = join(tempDir, `${baseName}`); // yt-dlp adds extension

    try {
        await new Promise<void>((resolve, reject) => {
            const args = [
                url,
                '--skip-download',      // Don't download video/audio
                '--write-sub',          // Write subtitles
                '--write-auto-sub',     // Write auto-generated subs (Critical!)
                '--sub-lang', 'en,ar',  // Prefer English or Arabic
                '--sub-format', 'vtt',  // VTT is easier to parse
                '--output', outputTemplate
            ];
            const child = spawn(binaryPath, args);
            child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`Exit code ${code}`)));
        });

        // Find the generated file (it might contain lang code like .en.vtt)
        const files = await readdir(tempDir);
        const subFile = files.find(f => f.startsWith(baseName) && f.endsWith('.vtt'));

        if (subFile) {
            const content = await readFile(join(tempDir, subFile), 'utf-8');
            // Basic VTT cleaning: Remove formatting tags, timestamps, headers
            const cleanText = content
                .replace(/WEBVTT/g, '')
                .replace(/\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}/g, '') // remove timestamps
                .replace(/<[^>]*>/g, '') // remove tags
                .replace(/\n+/g, ' ') // join lines
                .trim();

            // Clean up
            await unlink(join(tempDir, subFile));
            return cleanText;
        }
    } catch (e) {
        console.warn("yt-dlp transcript fetch failed:", e);
    }
    return null;
}

// Helper for retrying uploads
async function retryUpload(fileManager: any, path: string, options: any, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            console.log(`Upload attempt ${i + 1}/${retries}...`);
            return await fileManager.uploadFile(path, options);
        } catch (error: any) {
            console.error(`Upload attempt ${i + 1} failed:`, error.message);
            if (i === retries - 1) throw error;
            await new Promise(res => setTimeout(res, 2000));
        }
    }
}

export async function processYoutubeVideo(url: string, geminiApiKey: string): Promise<YoutubeProcessResult> {
    if (!url) return { success: false, error: "URL is required." };

    const videoId = extractVideoId(url);
    if (!videoId) return { success: false, error: "Invalid YouTube URL" };

    console.log(`Processing YouTube Video ID: ${videoId}`);

    let title = "";
    let description = "";
    let channelTitle = "";

    // 1. Fetch Metadata (API / oEmbed)
    try {
        const metadataUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${YOUTUBE_DATA_API_KEY}`;
        const metadataResponse = await fetch(metadataUrl);
        if (metadataResponse.ok) {
            const data = await metadataResponse.json();
            if (data.items && data.items.length > 0) {
                const snippet = data.items[0].snippet;
                title = snippet.title;
                description = snippet.description;
                channelTitle = snippet.channelTitle;
                console.log(`[API] Metadata: ${title}`);
            }
        }
    } catch (e) {
        console.warn("[API] Metadata fetch failed", e);
    }

    // Fallback oEmbed
    if (!title) {
        try {
            const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
            const oembedRes = await fetch(oembedUrl);
            if (oembedRes.ok) {
                const data = await oembedRes.json();
                title = data.title;
                channelTitle = data.author_name;
                console.log(`[oEmbed] Metadata: ${title}`);
            }
        } catch (e) {/* ignore */ }
    }

    // 2. Try Standard Transcript (npm)
    try {
        console.log("Attempting Standard Transcript fetch...");
        const transcriptItems = await YoutubeTranscript.fetchTranscript(url);
        if (transcriptItems && transcriptItems.length > 0) {
            const transcriptText = transcriptItems.map(item => item.text).join(' ');
            console.log(`Standard Transcript found (${transcriptItems.length} lines). Using Text Mode.`);

            const fullContent = `
            VIDEO CONTEXT:
            Title: ${title}
            Channel: ${channelTitle}
            DESCRIPTION: ${description}
            TRANSCRIPT: ${transcriptText}
            `;
            return { success: true, type: 'text', content: fullContent, title };
        }
    } catch (e) {
        console.warn("Standard Transcript failed/missing.");
    }

    // 3. Try Deep Transcript (yt-dlp) - NEW STRATEGY
    const deepTranscript = await fetchTranscriptWithYtDlp(url);
    if (deepTranscript && deepTranscript.length > 50) {
        console.log("Deep Transcript (yt-dlp) found! Using Text Mode.");
        const fullContent = `
        VIDEO CONTEXT:
        Title: ${title}
        Channel: ${channelTitle}
        DESCRIPTION: ${description}
        TRANSCRIPT (Auto-Generated): ${deepTranscript}
        `;
        return { success: true, type: 'text', content: fullContent, title };
    }


    // 4. Audio Fallback (AUDIO STRATEGY)
    console.log("Fallback: Downloading optimized audio...");

    let tempFilePath: string | null = null;
    try {
        // Locate Binary
        const projectRoot = process.cwd();
        const binaryPath = join(projectRoot, 'node_modules', 'yt-dlp-exec', 'bin', 'yt-dlp.exe');
        if (!fs.existsSync(binaryPath)) return { success: false, error: "Server Error: yt-dlp binary missing." };

        const tempDir = os.tmpdir();
        const timestamp = Date.now();
        const baseName = `yt_${timestamp}`;
        const outputTemplate = join(tempDir, `${baseName}.%(ext)s`);
        tempFilePath = join(tempDir, `${baseName}.m4a`);

        await new Promise<void>((resolve, reject) => {
            const args = [
                url,
                '--no-check-certificates',
                '--no-warnings',
                '--prefer-free-formats',
                '--format', 'worstaudio[ext=m4a]/worstaudio', // Optimized size
                '--output', outputTemplate
            ];
            const spawnOpts = { stdio: 'ignore' }; // Mute stdout/stderr for cleaner logs
            const child = spawn(binaryPath, args);
            child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`Exit code ${code}`)));
            child.on('error', reject);
        });

        await stat(tempFilePath); // Verify

        console.log("Uploading Audio to Gemini...");
        const { GoogleAIFileManager, FileState } = require("@google/generative-ai/server");
        const fileManager = new GoogleAIFileManager(geminiApiKey);

        const uploadResult = await retryUpload(fileManager, tempFilePath, {
            mimeType: 'audio/mp4',
            displayName: `YouTube Audio ${timestamp}`,
        }, 3);

        const fileUri = uploadResult.file.uri;
        let fileState = uploadResult.file.state;
        let name = uploadResult.file.name;

        // Poll
        let attempts = 0;
        while (fileState === FileState.PROCESSING && attempts < 60) {
            await new Promise(r => setTimeout(r, 5000));
            try {
                const f = await fileManager.getFile(name);
                fileState = f.state;
            } catch (e) { }
            if (fileState === FileState.FAILED) throw new Error("Gemini processing failed.");
        }

        return {
            success: true,
            type: 'audio',
            fileUri: fileUri,
            mimeType: 'audio/mp4',
            title: title
        };

    } catch (e: any) {
        console.error("Audio Strategy Failed:", e);
        return { success: false, error: e.message || "Failed to process video (Audio Strategy)" };
    } finally {
        if (tempFilePath) try { await unlink(tempFilePath); } catch (e) { }
    }
}
