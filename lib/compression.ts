import { PDFDocument } from 'pdf-lib';

/**
 * Compresses an image file by resizing and reducing quality via HTML Canvas.
 * Target: Max dimension 1500px, JPEG Quality 0.6
 */
export async function compressImage(file: File): Promise<File> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // 1. Resize logic (Max dimension 1500px)
                const MAX_DIMENSION = 1500;
                if (width > height) {
                    if (width > MAX_DIMENSION) {
                        height *= MAX_DIMENSION / width;
                        width = MAX_DIMENSION;
                    }
                } else {
                    if (height > MAX_DIMENSION) {
                        width *= MAX_DIMENSION / height;
                        height = MAX_DIMENSION;
                    }
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error("Failed to get canvas context"));
                    return;
                }
                ctx.drawImage(img, 0, 0, width, height);

                // 2. Compress to JPEG at 60% quality
                canvas.toBlob((blob) => {
                    if (!blob) {
                        reject(new Error("Compression failed"));
                        return;
                    }
                    // Create new File
                    const compressedFile = new File([blob], file.name, {
                        type: 'image/jpeg',
                        lastModified: Date.now(),
                    });
                    resolve(compressedFile);
                }, 'image/jpeg', 0.6);
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
}

/**
 * Compresses a PDF by rasterizing each page to a JPEG and rebuilding the PDF.
 * This effectively "flattens" the PDF and reduces quality significantly for scanned docs.
 */
export async function compressPDF(file: File, onProgress?: (idx: number, total: number) => void): Promise<File> {
    try {
        // Dynamically import pdfjs-dist
        const pdfjsLib = await import('pdfjs-dist');

        // Configure worker
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
            // Use unpkg for reliable version matching, and .mjs for v4+
            pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
        }

        const arrayBuffer = await file.arrayBuffer();

        // 1. Load PDF with PDF.js to render pages
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        const totalPages = pdf.numPages;

        // 2. Create a new PDF with pdf-lib to write the images into
        // standard PDFDocument from 'pdf-lib' is fine as static import
        const newPdfDoc = await PDFDocument.create();

        for (let i = 1; i <= totalPages; i++) {
            if (onProgress) onProgress(i, totalPages);

            const page = await pdf.getPage(i);

            // Render to Canvas
            // Scale: 1.5 usually gives ~1200px width for standard A4, good enough for AI.
            // Adjust based on typical viewport.
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error("Canvas context failed");

            await page.render({ canvasContext: ctx, viewport: viewport }).promise;

            // Compress to JPEG
            // Note: toBlob is async in theory but callback based in DOM. 
            // We wrapper it in promise below
            const jpegBlob = await new Promise<Blob | null>((resolve) =>
                canvas.toBlob(resolve, 'image/jpeg', 0.6)
            );

            if (!jpegBlob) throw new Error(`Failed to compress page ${i}`);

            const jpegImageBytes = await jpegBlob.arrayBuffer();
            const jpegImage = await newPdfDoc.embedJpg(jpegImageBytes);

            // Add page to new PDF
            const newPage = newPdfDoc.addPage([viewport.width, viewport.height]);
            newPage.drawImage(jpegImage, {
                x: 0,
                y: 0,
                width: viewport.width,
                height: viewport.height,
            });

            // Clean up to save memory
            page.cleanup();
        }

        const pdfBytes = await newPdfDoc.save();
        return new File([pdfBytes as any], file.name as string, { type: 'application/pdf', lastModified: Date.now() });

    } catch (error) {
        console.error("PDF Compression failed:", error);
        throw error;
    }
}
