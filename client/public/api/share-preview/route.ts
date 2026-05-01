import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generateShareImage } from '../share-preview';

const SharePreviewSchema = z.object({
  type: z.enum(['game', 'tournament', 'profile']),
  title: z.string(),
  titleAr: z.string(),
  description: z.string(),
  descriptionAr: z.string(),
  imageUrl: z.string().url(),
  url: z.string().url(),
  gameKey?: z.string(),
  playerName?: z.string(),
  score?: z.number(),
  achievement?: z.string(),
});

export type SharePreview = z.infer<typeof SharePreviewSchema>;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  try {
    const shareData = SharePreviewSchema.parse({
      type: searchParams.get('type') || 'game',
      title: searchParams.get('title') || 'VEX Game',
      titleAr: searchParams.get('titleAr') || 'لعبة VEX',
      description: searchParams.get('description') || 'Play exciting games on VEX',
      descriptionAr: searchParams.get('descriptionAr') || 'العب ألعاب مثيرة على VEX',
      imageUrl: searchParams.get('imageUrl') || '',
      url: searchParams.get('url') || 'https://vixo.click',
      gameKey: searchParams.get('gameKey') || undefined,
      playerName: searchParams.get('playerName') || undefined,
      score: searchParams.get('score') ? parseInt(searchParams.get('score')!) : undefined,
      achievement: searchParams.get('achievement') || undefined,
    });

    const imageData = await generateShareImage(shareData);

    return new NextResponse(imageData, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000', // 1 year
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    return new NextResponse('Invalid share parameters', { status: 400 });
  }
}
