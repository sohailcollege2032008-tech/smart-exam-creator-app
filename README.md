This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

### Deployment Steps

1. **Install Vercel CLI** (if not already installed):
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Deploy to Vercel**:
   ```bash
   vercel
   ```
   Follow the prompts to link your project.

4. **Set Environment Variables**:
   In your Vercel project dashboard, go to Settings → Environment Variables and add:
   - `YOUTUBE_DATA_API_KEY`: Your YouTube Data API key
   - (Optional) `GEMINI_API_KEY`: If you want to set a default API key (users can still override via UI)

5. **Deploy to Production**:
   ```bash
   vercel --prod
   ```

### Important Notes

⚠️ **File System Storage**: The app currently uses file system storage (`data/jobs/`) which is **read-only on Vercel** except for `/tmp`. The saved jobs feature may not work correctly in production. Consider migrating to:
- Vercel KV (Redis) for job storage
- Vercel Blob Storage for file storage
- A database like PostgreSQL, MongoDB, or Supabase

⚠️ **yt-dlp Binary**: The YouTube processing uses `yt-dlp-exec` which includes a Windows binary (`yt-dlp.exe`). This may not work on Vercel's Linux-based serverless functions. You may need to:
- Use a different approach for YouTube processing
- Use a serverless-compatible yt-dlp solution
- Consider using an external API service

### Environment Variables

Create a `.env.local` file for local development:
```
YOUTUBE_DATA_API_KEY=your_youtube_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
```

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
