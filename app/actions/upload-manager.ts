'use server';

import { GoogleAIFileManager } from "@google/generative-ai/server";
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import fs from 'fs';
import dns from 'node:dns';

// FORCE IPv4: Fixes specific Node.js fetch failures with Google APIs
dns.setDefaultResultOrder('ipv4first');

// --- CHUNKED UPLOAD ACTIONS ---

// 1. Initialize Resumable Upload
export async function initGeminiUpload(apiKey: string, mimeType: string, displayName: string, totalBytes: number) {
    try {
        dns.setDefaultResultOrder('ipv4first'); // Ensure IPv4

        const res = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'X-Goog-Upload-Protocol': 'resumable',
                'X-Goog-Upload-Command': 'start',
                'X-Goog-Upload-Header-Content-Length': totalBytes.toString(),
                'X-Goog-Upload-Header-Content-Type': mimeType,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ file: { display_name: displayName } })
        });

        if (!res.ok) {
            const txt = await res.text();
            return { success: false, error: `Init failed: ${res.status} ${txt}` };
        }

        const uploadUrl = res.headers.get('x-goog-upload-url');
        if (!uploadUrl) return { success: false, error: "No upload URL returned" };

        return { success: true, uploadUrl };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

// 2. Upload a Chunk
export async function uploadGeminiChunk(uploadUrl: string, formData: FormData, offset: number, isLast: boolean) {
    try {
        const chunk = formData.get('chunk') as File;
        if (!chunk) return { success: false, error: "No chunk data" };

        const chunkBuffer = Buffer.from(await chunk.arrayBuffer());

        const command = isLast ? 'upload, finalize' : 'upload';

        const res = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
                'Content-Length': chunk.size.toString(),
                'X-Goog-Upload-Offset': offset.toString(),
                'X-Goog-Upload-Command': command
            },
            body: chunkBuffer
        });

        if (!res.ok) {
            const txt = await res.text();
            return { success: false, error: `Chunk failed at ${offset}: ${res.status} ${txt}` };
        }

        if (isLast) {
            const result = await res.json();
            // Result contains { file: { uri, state, name ... } }
            return { success: true, file: result.file };
        }

        return { success: true };

    } catch (e: any) {
        console.error("Chunk upload error:", e);
        return { success: false, error: e.message };
    }
}

// 3. (Optional) Legacy Single Upload for small files (kept for compatibility or fallback)
// ... we can remove it or keep a simplified version if needed, but for now we replace the main logic.
// Keeping getFileStatus as it is crucial for polling.

export async function getFileStatus(apiKey: string, name: string) {
    try {
        dns.setDefaultResultOrder('ipv4first');
        const fileManager = new GoogleAIFileManager(apiKey);
        const fileObj = await fileManager.getFile(name);
        return { success: true, state: fileObj.state, name: fileObj.name, uri: fileObj.uri, mimeType: fileObj.mimeType };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

// (Rest of the file replaced by the above new logic)

