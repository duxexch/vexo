import { z } from 'zod';

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

export async function generateShareImage(shareData: SharePreview): Promise<string> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  // Set canvas size for social media preview (1200x630 recommended)
  canvas.width = 1200;
  canvas.height = 630;
  
  if (!ctx) return '';
  
  // Background gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#070b14');
  gradient.addColorStop(1, '#1a1f3a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // VEX Logo placeholder (would be replaced with actual logo)
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 48px system-ui';
  ctx.fillText('VEX', 60, 100);
  
  // Title
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px system-ui';
  const title = shareData.type === 'game' ? shareData.titleAr : shareData.title;
  ctx.fillText(title, 60, 200);
  
  // Description
  ctx.font = '24px system-ui';
  const description = shareData.type === 'game' ? shareData.descriptionAr : shareData.description;
  const lines = wrapText(ctx, description, canvas.width - 120);
  lines.forEach((line, index) => {
    ctx.fillText(line, 60, 280 + (index * 30));
  });
  
  // Game-specific info
  if (shareData.type === 'game' && shareData.playerName && shareData.score) {
    ctx.font = '20px system-ui';
    ctx.fillText(`${shareData.playerName}: ${shareData.score}`, 60, 450);
  }
  
  // Call to action
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(60, 530, 200, 60);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px system-ui';
  ctx.fillText(shareData.type === 'game' ? 'العب الآن' : 'Join Now', 110, 570);
  
  return canvas.toDataURL('image/png');
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  
  words.forEach(word => {
    const testLine = currentLine + (currentLine ? ' ' : '') + word;
    const metrics = ctx.measureText(testLine);
    
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  });
  
  if (currentLine) {
    lines.push(currentLine);
  }
  
  return lines;
}
