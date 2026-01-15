'use server';

import { GoogleAIFileManager, FileState } from "@google/generative-ai/server";
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import fs from 'fs';
import dns from 'node:dns';

// FORCE IPv4: Fixes specific Node.js fetch failures with Google APIs
dns.setDefaultResultOrder('ipv4first');
// import mammoth from 'mammoth';

// Helper to save File object to temp disk (needed for GoogleAIFileManager input path)
// Helper to save File object to temp disk (needed for GoogleAIFileManager input path)
async function saveToTemp(file: File): Promise<string> {
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Create a temp path
    const os = require('os');
    const tempDir = os.tmpdir();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const tempPath = join(tempDir, `gemini_upload_${Date.now()}_${sanitizedName}`);

    await writeFile(tempPath, buffer);
    return tempPath;
}

export async function uploadToGeminiServer(formData: FormData, apiKey: string) {
    // Ensure IPv4 is used to prevent Node 18+ IPv6 fetch failures
    try {
        dns.setDefaultResultOrder('ipv4first');
    } catch (e) { /* ignore if not supported */ }

    if (!apiKey) {
        return { success: false, error: "API Key is missing for upload." };
    }

    const file = formData.get('file') as File;
    if (!file) {
        return { success: false, error: "No file provided in FormData." };
    }

    // Connectivity Check
    try {
        await fetch('https://generativelanguage.googleapis.com', { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    } catch (netErr: any) {
        console.error("Connectivity Check Failed:", netErr);
        // We continue anyway, but log it.
    }

    // Server-side initialization of File Manager
    const fileManager = new GoogleAIFileManager(apiKey);
    let tempPath: string | null = null;

    try {
        let finalMimeType = file.type || 'application/octet-stream';
        let displayName = file.name;

        // DOCX Handling: Convert to Text
        if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            return { success: false, error: "DOCX processing is currently disabled." };
        } else {
            // Standard handling
            tempPath = await saveToTemp(file);
        }

        // Check if file exists
        if (!fs.existsSync(tempPath)) {
            throw new Error(`Temp file creation failed at ${tempPath}`);
        }

        console.log(`Starting upload for ${displayName} (${finalMimeType}) from ${tempPath}`);

        // 2. Upload with Retry Logic
        let uploadResult;
        let uploadAttempts = 0;
        const maxUploadRetries = 3;

        while (uploadAttempts < maxUploadRetries) {
            try {
                uploadResult = await fileManager.uploadFile(tempPath, {
                    mimeType: finalMimeType,
                    displayName: displayName,
                });
                break; // Success
            } catch (err: any) {
                console.warn(`Upload attempt ${uploadAttempts + 1} failed: ${err.message}`);
                console.warn(`Cause: ${err.cause}`);

                uploadAttempts++;
                if (uploadAttempts >= maxUploadRetries) {
                    throw new Error(`Upload failed: ${err.message} ${err.cause ? `(Cause: ${(err.cause as any)?.code || err.cause})` : ''}`);
                }
                // Backoff wait
                await new Promise(resolve => setTimeout(resolve, 2000 * uploadAttempts));
            }
        }

        if (!uploadResult) {
            // Fallback: Try RAW REST API Upload if SDK fails (often due to undici/stream issues)
            console.warn("SDK Upload failed. Attempting REST API Fallback...");
            try {
                uploadResult = await uploadFileFallback(apiKey, tempPath, finalMimeType, displayName);
            } catch (fallbackErr: any) {
                console.error("Fallback Upload also failed:", fallbackErr);
                throw new Error(`Upload failed after retries and fallback: ${fallbackErr.message}`);
            }
        }

        const fileUri = uploadResult.file.uri;
        let fileState = uploadResult.file.state;
        let name = uploadResult.file.name;

        console.log(`File uploaded successfully: ${fileUri}, State: ${fileState}`);

        // 3. Poll until Active
        let attempts = 0;
        const maxPollAttempts = 30; // 30 * 2s = 60s

        while (fileState === FileState.PROCESSING && attempts < maxPollAttempts) {
            await new Promise(resolve => setTimeout(resolve, 2000));

            const fileObj = await fileManager.getFile(name);
            fileState = fileObj.state;

            if (fileState === FileState.FAILED) {
                throw new Error("File processing failed by Google (State: FAILED).");
            }
            attempts++;
        }

        return {
            success: true,
            fileUri: fileUri,
            mimeType: finalMimeType,
            name: name
        };

    } catch (e: any) {
        console.error("Upload error details:", e);
        // Serialize error for client
        const errorMessage = e.message || "Unknown Error";
        const errorCause = e.cause ? JSON.stringify(e.cause, Object.getOwnPropertyNames(e.cause)) : '';
        return { success: false, error: `${errorMessage} ${errorCause ? `| Cause: ${errorCause}` : ''}` };
    } finally {
        if (tempPath) {
            try {
                await unlink(tempPath);
            } catch (e) { /* ignore */ }
        }
    }
}

// --- FALLBACK REST UPLOAD IMPLEMENTATION ---
async function uploadFileFallback(apiKey: string, filePath: string, mimeType: string, displayName: string) {
    const fileStats = await fs.promises.stat(filePath);
    const fileSize = fileStats.size;

    // 1. Initiate Resumable Upload (X-Goog-Upload-Command: start)
    const initRes = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`, {
        method: 'POST',
        headers: {
            'X-Goog-Upload-Protocol': 'resumable',
            'X-Goog-Upload-Command': 'start',
            'X-Goog-Upload-Header-Content-Length': fileSize.toString(),
            'X-Goog-Upload-Header-Content-Type': mimeType,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ file: { display_name: displayName } })
    });

    if (!initRes.ok) {
        throw new Error(`Fallback Init failed: ${initRes.status} ${await initRes.text()}`);
    }

    const uploadUrl = initRes.headers.get('x-goog-upload-url');
    if (!uploadUrl) throw new Error("No upload URL returned from init.");

    // 2. Upload Bytes (X-Goog-Upload-Command: upload, finalize)
    const fileBuffer = await fs.promises.readFile(filePath); // Read to memory (assuming < 100MB, acceptable for server action)

    const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
            'Content-Length': fileSize.toString(),
            'X-Goog-Upload-Offset': '0',
            'X-Goog-Upload-Command': 'upload, finalize'
        },
        body: fileBuffer // Send Buffer directly
    });

    if (!uploadRes.ok) {
        throw new Error(`Fallback Data Upload failed: ${uploadRes.status} ${await uploadRes.text()}`);
    }

    const result = await uploadRes.json();
    return result; // contains { file: { uri, state, name ... } }
}
